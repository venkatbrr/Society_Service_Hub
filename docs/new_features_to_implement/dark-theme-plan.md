# Dark theme — feasibility & implementation plan

**Status**: proposed, not started
**Verdict**: feasible. Large mechanical refactor (~2–3 focused weeks), gated on a design decision that has to happen first.
**Author**: feasibility survey run 2026-08-16 against `main` @ `63b950e`

---

## 1. Feasibility summary

Wooru has exactly one color system — `Verandah` in [`constants/Colors.ts`](../../constants/Colors.ts) — and 110 of 131 `.tsx` files in `app/` + `components/` import it. There is no competing palette to reconcile and no third-party theme provider in the tree. That is the single biggest reason this is tractable.

The measured surface area:

| Metric | Count |
|---|---|
| `.tsx` files in `app/` + `components/` | 131 |
| Route files (screens) | 63 |
| Files referencing `Verandah` | 110 |
| Total `Verandah.*` / `colors.*` references | **3,890** |
| … of which **inline in render** (converts for free) | **2,698** (69%) |
| … of which inside module-level `StyleSheet.create` | **1,192** (31%) |
| Module-level `StyleSheet.create` blocks | 109 |
| Files doing `const colors = Verandah;` (1-line fix) | 31 |
| Files building a local `colors = {…}` map from `Verandah` | 10 |
| Raw 6-digit hex literals | **251** across 31 files |
| Literal `'white'` / `'#fff'` / `'#FFFFFF'` | 34 |
| `rgba(255,255,255,…)` | 30 |
| `rgba(0,0,0,…)` | 20 |

### What already helps

- **Dead scaffolding is available.** `Colors.light` / `Colors.dark` (the pre-Verandah "Fresh Green" palette) and [`components/useColorScheme.ts`](../../components/useColorScheme.ts) / `.web.ts` have **zero consumers** anywhere in `app/`, `components/`, or `lib/`. They are Expo-template leftovers — repurpose or delete, but do not assume anything reads them.
- **`app.config.js` is already `userInterfaceStyle: 'automatic'`**, so the OS will hand us the system preference on native without a native config change.
- **69% of refs are inline.** A file that does `const colors = Verandah;` at the top of its component and then `style={{ color: colors.textPrimary }}` in JSX needs *one* line changed to `const colors = useTheme();` and every inline ref in it follows the active theme.
- **`@react-native-async-storage/async-storage` is already a dependency** (used by [`lib/supabase.ts`](../../lib/supabase.ts) for the native session adapter), so persisting the user's choice needs no new package.

### What makes it expensive

1. **`StyleSheet.create` is evaluated once at import.** All 109 sheets are at module scope (verified: zero are declared inside a component). The 1,192 color references inside them are frozen at first bundle evaluation and **will not react to a runtime theme switch**. Mutating the `Verandah` object afterwards does not work — RN registers the sheet and hands out an opaque ID. Every one of those 1,192 refs has to move into a per-render code path.

2. **251 raw hex literals, all light-mode-only.** Concentrated brutally in the MCN food-drops module:

   | File | Raw hex count |
   |---|---|
   | [`app/mcn/drops/manage/[id].tsx`](../../app/mcn/drops/manage/%5Bid%5D.tsx) | 49 |
   | [`app/mcn/drops/[id].tsx`](../../app/mcn/drops/%5Bid%5D.tsx) | 35 |
   | [`app/mcn/drops/add.tsx`](../../app/mcn/drops/add.tsx) | 29 |
   | [`app/+html.tsx`](../../app/+html.tsx) | 18 *(inert — `output: 'single'`; see `docs/CLAUDE.md` §9)* |
   | [`app/mcn/drops/index.tsx`](../../app/mcn/drops/index.tsx) | 13 |
   | 26 further files | 1–11 each |

   These are not stray one-offs — they are a complete parallel status-badge palette (`#EEF2FF`/`#C7D2FE` indigo, `#FEF3C7`/`#F59E0B` amber, `#D1FAE5`/`#10B981` green, `#F3F4F6`/`#6B7280` grey) that already violates §4 of [`CLAUDE.md`](../CLAUDE.md) and is unreadable on any dark ground. **This debt has to be paid regardless of dark mode** — dark mode just makes it non-optional.

3. **Elevation does not survive the transition.** All three tokens (`shadowCard`, `shadowRaised`, `shadowDevice`) are `shadowColor: '#0F3732'` at 8–28% opacity. A dark shadow on a dark surface is invisible. Dark mode must express the [Elevation](../verandah.md#elevation) hierarchy as *surface lightness steps plus borders* instead — which means the elevation tokens become theme-dependent, not just the colors.

4. **The design language actively resists it.** [`verandah.md`](../verandah.md) principle #1 is *"Warm over cold: embrace soft, warm neutral surfaces (`#FAF8F4`) over sterile white or harsh grays."* A correct dark Verandah is warm-dark — deep bark, moss, ember — not an inversion to neutral black. **This is the real blocker and it is design work, not engineering work.** Nothing below can start until the palette exists.

5. **Chrome outside the React Native tree.** Each of these is a separate, easy-to-miss surface:

   | Surface | Where | Note |
   |---|---|---|
   | Native status bar | `<StatusBar style="dark" />`, [`app/_layout.tsx:303`](../../app/_layout.tsx#L303) | Hardcoded |
   | Web `theme-color` | `APP_SHELL_HEAD` in [`build-admin.js`](../../build-admin.js) | `#0F3732` |
   | Web `theme-color` (2nd copy) | [`public/landing.html`](../../public/landing.html) | Static file, deliberately duplicated |
   | PWA manifest | [`public/manifest.json`](../../public/manifest.json) | `background_color: #FAF8F4`, `theme_color: #0F3732` — **editing forces a `CACHE_NAME` bump in `public/service-worker.js`** (known trap) |
   | Splash screen | `splash.backgroundColor: '#FAF8F4'`, [`app.config.js`](../../app.config.js) | Expo supports a `dark` splash variant |
   | Desktop web frame | [`components/WebDesktopFrame.tsx`](../../components/WebDesktopFrame.tsx) | `phoneBezel` + `paper` |
   | Toasts | `react-native-toast-message` default config, [`app/_layout.tsx`](../../app/_layout.tsx) | Ships a white card; needs a custom config |
   | Web date inputs | `APP_SHELL_HEAD` CSS | Needs `color-scheme: dark` or the native picker stays light |

   The vanilla-JS admin console (`admin-dashboard/`) is **out of scope** — separate audience, separate stylesheet, no shared tokens.

6. **No automated verification exists.** `npx tsc --noEmit` is the only gate ([`CLAUDE.md`](../CLAUDE.md) §1) and it passes happily on a screen rendering black text on a black card. Verification is a manual pass over 63 route files × 2 themes.

---

## 2. Approach

**Chosen: theme object delivered through a React context + hook, with a `useThemedStyles` factory for stylesheets.** This is the only approach that works in React Native — CSS custom properties are web-only, and mutating the token module in place cannot invalidate a registered `StyleSheet`.

### 2.1 Token layer

`constants/Colors.ts` gains a mode dimension. `Verandah` stays exported as the **light** palette so nothing breaks mid-migration:

```ts
export type ThemeMode = 'light' | 'dark';

const light = { /* today's Verandah, verbatim */ };
const dark  = { /* new warm-dark palette, same key set */ };

export const VerandahThemes = { light, dark } as const;
export type VerandahTheme = typeof light;

/** @deprecated Use `useTheme()`. Kept so unmigrated files keep compiling. */
export const Verandah = light;
```

Two hard rules:

- **`dark` must have exactly the same key set as `light`.** Enforce with `const dark: VerandahTheme = {…}` so a missing key is a compile error, not a transparent surface at runtime.
- **The elevation tokens move into the theme.** `shadowCard` / `shadowRaised` / `shadowDevice` are theme members, and the dark variants trade shadow opacity for a lighter surface step plus a `borderHair` bump. Spreading `...theme.shadowCard` at the call site is unchanged.

### 2.2 Runtime layer — `context/ThemeContext.tsx`

```
ThemeProvider
  ├── preference: 'system' | 'light' | 'dark'   (persisted)
  ├── resolved:   'light' | 'dark'              (preference === 'system' ? Appearance : preference)
  └── theme:      VerandahTheme
```

- Reads/writes `wooru.themePreference` via `AsyncStorage` on native, `localStorage` on web — mirror the platform split already in [`lib/supabase.ts`](../../lib/supabase.ts). Wrap web reads in try/catch: iOS private mode throws, exactly as [`components/IosInstallBanner.tsx`](../../components/IosInstallBanner.tsx) already handles.
- Subscribes to `Appearance.addChangeListener` so `'system'` tracks live OS changes.
- Mounted in [`app/_layout.tsx`](../../app/_layout.tsx) **outside** `AuthProvider` — theme is a device preference, not an account one, and must apply on `/login` before any session exists.
- Exports `useTheme(): VerandahTheme` and `useThemePreference(): { preference, resolved, setPreference }`.

### 2.3 Stylesheet layer — `hooks/useThemedStyles.ts`

```ts
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (t: VerandahTheme) => T
): T {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(factory(theme)), [theme]);
}
```

Migration per file is mechanical:

```diff
-const styles = StyleSheet.create({ card: { backgroundColor: Verandah.card } });
+const makeStyles = (t: VerandahTheme) => StyleSheet.create({ card: { backgroundColor: t.card } });
 export default function Screen() {
-  const colors = Verandah;
+  const colors = useTheme();
+  const styles = useThemedStyles(makeStyles);
```

Two sheets are memoized per theme object identity, so the cost is one `StyleSheet.create` per screen per theme switch — negligible, and the theme object identity is stable between switches.

**Sheets containing no color at all stay at module scope.** Do not churn a pure-geometry stylesheet; it is free re-render cost for zero benefit.

### 2.4 Rejected alternatives

| Alternative | Why not |
|---|---|
| Mutate the `Verandah` object and force a re-render | `StyleSheet.create` snapshots values and returns an opaque registry ID. Mutation is invisible to already-created sheets. Silently half-works, which is worse than not working. |
| CSS custom properties + `prefers-color-scheme` | Web-only. Leaves native with no dark mode at all, and Wooru ships Android + iOS. |
| Web-only dark mode via a CSS `filter: invert()` shim | Wrecks photos, the brand mark, and the diet dots. Not shippable. |
| `react-native-unistyles` / `restyle` | A new dependency and a full rewrite of 109 stylesheets into a foreign API — strictly more work than the hook above, for a codebase with exactly one design system. |

---

## 3. Phases

Each phase is independently mergeable. Phases 1–3 ship **no user-visible change** — the toggle stays behind a flag, so a half-migrated app is never in front of a resident.

### Phase 0 — Design the dark palette *(blocking, design-led)*

Deliverable: a `dark` object with the same key set as today's `Verandah`, plus dark elevation tokens.

Decisions that must be made here, not discovered later:

- **Warm-dark ground, not neutral black.** Verandah's identity is warmth; `#000`/`#111` neutral greys read as a different product. Start from the brand teal's dark neighbourhood.
- **`primary` (`#0F3732`) cannot stay the primary surface on dark** — it *is* nearly a dark background. Dark mode needs `primary` to become a lighter teal so filled buttons remain legible, and `primaryFg` to flip to a dark ink.
- **The five `avatarTints` need dark pairs.** All ten current values (5 bg + 5 fg) are light-mode tints; `getAvatarTint()` must resolve from the active theme, not the module constant.
- **`DIET_META` colours** ([`constants/diet.ts`](../../constants/diet.ts)) — veg green / egg amber / non-veg red must hold their contrast against a dark card. These are a legally-loaded signal in India; do not let them wash out.
- **Elevation strategy**: define the dark surface ladder (`paper` → `card` → raised) as lightness steps, and specify what `shadowCard` degrades to.
- **Contrast targets**: every text token against every surface it legitimately sits on, at WCAG AA (4.5:1 body, 3:1 large). Record the matrix — this is what makes Phase 5 QA objective instead of a taste argument.

Do not start Phase 1 before this lands. Every later phase encodes these values.

### Phase 1 — Infrastructure *(no visible change)*

1. Restructure `constants/Colors.ts` per §2.1. Keep `export const Verandah = light` so the tree still compiles untouched.
2. Delete the dead `Colors.light` / `Colors.dark` blocks and `components/useColorScheme.ts` + `.web.ts` — confirmed zero consumers.
3. Add `context/ThemeContext.tsx` (§2.2) and `hooks/useThemedStyles.ts` (§2.3). Note: `hooks/` does not exist yet; create it.
4. Mount `ThemeProvider` in `app/_layout.tsx`, outermost.
5. Add `DARK_THEME_ENABLED = false` to [`constants/featureFlags.ts`](../../constants/featureFlags.ts), following the documented convention there. While false, `ThemeProvider` resolves to `'light'` unconditionally.
6. `npx tsc --noEmit`.

### Phase 2 — Shared components

Convert everything in `components/` (~50 files). Order matters — these are the primitives every screen composes from, and converting them first means each screen in Phase 3 gets partially themed for free:

`BaseCard` → `Avatar` → `EmptyState` → `SearchBar` → `Rupees` → `DietDot` → `RatingStars` / `EmojiRating` → `CategoryFilter` → `SegmentedSlider` / `ChipRowSlider` → `GlobalBottomNav` → `HeaderBackButton` (+ `.web.tsx`) → `DangerZone` → `ImageUploader` / `ImageViewer` → `ComingSoonTile` / `AnimatedTileGlyph` → the card family (`PreorderDropCard`, `McnListingCard`, `EventCard`, `FundCard`, `ProviderCard`, `McnPostCard`, `SchoolReviewCard`) → the rest.

Every `.web.tsx` sibling must be converted alongside its native twin in the same commit — they are separate files and Metro picks one per platform, so converting only one produces a platform-specific bug that `tsc` cannot see.

While in each file, kill its raw hex.

### Phase 3 — Screens, module by module

63 route files. Each module is its own commit so a regression is bisectable:

| Order | Module | Notes |
|---|---|---|
| 1 | Auth & onboarding (`login`, `community-select`, `community-join-block`, `community-request`) | Smallest, and validates that theme resolves before a session exists |
| 2 | `(tabs)/*` — Help, Community, Network, Profile | Highest traffic; **Profile is where the toggle lands** |
| 3 | `profile/edit`, `legal`, `sos/*` | Low complexity |
| 4 | `funds/*`, `funds-access/*` | 3 files with heavy local `colors` maps |
| 5 | `services/*`, `provider/*`, `visits/*`, `hire-feedback/*` | 8 files, all using the local-`colors`-map pattern — cheapest per line |
| 6 | `events/*`, `mcn/parents/*`, `mcn/carpools/*` | `carpools/add.tsx` and `carpools/[id].tsx` are 154 refs each but ~99% inline — cheap despite the count |
| 7 | `mcn/listing*`, `mcn/business`, `mcn/my-*` | Moderate |
| 8 | **`mcn/drops/*`** | **Do last.** 126 raw hex literals across 4 files and the entire ad-hoc status-badge palette. Budget a full day; the badge palette needs tokenizing into `Verandah` first (`statusInfo`/`statusPending`/`statusSuccess`/`statusNeutral` + `*Soft` pairs), not per-file hex substitution. |
| 9 | Flag-hidden screens (`mcn/schools/*`, `mcn/add.tsx`) | **Do not skip.** They are hidden, not deleted ([`hidden-features/`](../hidden-features/README.md)) and will come back. Skipping them plants a dark-mode bug that surfaces the day a flag flips. |
| 10 | `admin/*` | Platform-admin screens |

### Phase 4 — Chrome & platform surfaces

1. `app/_layout.tsx` — `<StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />`.
2. `build-admin.js` `APP_SHELL_HEAD` — swap the static `theme-color` for the `media="(prefers-color-scheme: …)"` pair, and add `:root { color-scheme: light dark; }` so web `input[type=date]` (used by [`components/DateField.tsx`](../../components/DateField.tsx)) picks up the right native picker.
3. `public/landing.html` — mirror the `theme-color` change. It carries its own head copy on purpose; keeping them in sync is a documented rule.
4. `public/manifest.json` — decide whether `theme_color` becomes dark. **Then bump `CACHE_NAME` in `public/service-worker.js`** — the manifest is in `STATIC_ASSETS` and installed clients otherwise keep the old one indefinitely (documented trap).
5. `app.config.js` — add the `splash.dark` variant.
6. `components/WebDesktopFrame.tsx` — bezel + inner paper from the theme.
7. Toast config in `app/_layout.tsx` — `react-native-toast-message` renders a white card by default; supply a themed custom config.
8. `components/PwaInstallBanner.tsx` / `IosInstallBanner.tsx` — themed.

### Phase 5 — Toggle, QA, enable

1. Add the control to the Profile tab: a three-way `SegmentedSlider` (System / Light / Dark), rendered only when `DARK_THEME_ENABLED`. Use the existing component — do not hand-roll a switch (§4 of `CLAUDE.md`).
2. **Enforcement guard.** Add an npm script that fails on new raw hex, and wire it into the definition of done alongside `tsc`:
   ```
   grep -rnE "#[0-9A-Fa-f]{6}\b|'white'|rgba\(255, *255, *255" app/ components/ --include=*.tsx
   ```
   Whitelist only `constants/Colors.ts`. Without this, the 251 hexes come straight back.
3. **Manual QA: 63 routes × 2 themes.** `tsc` cannot see a contrast failure. Check specifically:
   - Every modal/overlay scrim (20 `rgba(0,0,0,…)` sites) — several assume a light page beneath.
   - Every filled button (`primary` + `primaryFg` pair inverts between themes).
   - Photo-bearing cards — cover images do not change with the theme and need their overlay text re-checked.
   - The bottom nav's active highlight, `rgba(15,55,50,.07)`, is invisible on dark.
   - `ImageViewer`'s full-screen backdrop.
   - The brand mark — cream-on-teal, verified legible on both grounds, but confirm the MCN nav disc.
   - Live theme switch mid-session on both platforms, and `'system'` following an OS change with the app foregrounded.
4. Flip `DARK_THEME_ENABLED = true`.

---

## 4. Effort

| Phase | Estimate |
|---|---|
| 0 — Palette design | 1–2 days *(design, blocking)* |
| 1 — Infrastructure | 0.5 day |
| 2 — Shared components (~50 files) | 2–3 days |
| 3 — Screens (63 files) | 5–7 days *(drops module alone is ~1)* |
| 4 — Chrome & platform | 0.5 day |
| 5 — Toggle, guard, QA | 2–3 days |
| **Total** | **~11–16 working days** |

The dominant cost is Phase 3, and within it the raw-hex debt rather than the token migration.

---

## 5. Scope boundaries

**In scope**: the Expo app on all three targets (Android, iOS, PWA), including flag-hidden screens.

**Out of scope**:

- `admin-dashboard/` — separate vanilla-JS console, no shared tokens, different audience. Track separately if wanted.
- `public/landing.html` beyond its `theme-color` meta — the marketing page stays light; a dark marketing page is a brand decision, not a follow-on.
- Per-account theme sync. Theme is a device preference in `AsyncStorage`/`localStorage`. Storing it on `profiles` would mean a schema migration and a round trip before first paint — not worth it.

---

## 6. Docs to update on completion

Per [`CLAUDE.md`](../CLAUDE.md) §7, routed to exactly one owner each:

| Change | File |
|---|---|
| Dark palette, dark elevation ladder, `useTheme` / `useThemedStyles` as the mandated pattern | [`verandah.md`](../verandah.md) |
| `ThemeContext` (new context), `hooks/useThemedStyles` | [`architecture.md`](../architecture.md) |
| The no-raw-hex guard script; "never put a color in a module-level `StyleSheet.create`" as a §9 trap | [`CLAUDE.md`](../CLAUDE.md) |
| The Profile-tab theme control | [`features.md`](../features.md) |
| `DARK_THEME_ENABLED` while it is still `false` | [`disabled-features.md`](../disabled-features.md) + a doc in [`hidden-features/`](../hidden-features/README.md) |

No database change is involved, so no migration and no type regeneration.
