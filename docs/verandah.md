# Verandah Design Reference

This document is the canonical reference for the Verandah UI system used in Wooru.

## Principles

1. **Warm over cold**: Embrace soft, warm neutral surfaces (`#FAF8F4` / `surface`) over sterile white or harsh grays to create an inviting, human environment.
2. **Restraint over decoration**: Prioritize calm utility and content structure. Eliminate unnecessary design fluff like drop shadows, complex gradients, or decorative emojis.
3. **Numbers with respect**: Format currency (e.g., using `<Rupees>`), counts, dates, and times with meticulous attention. Never prepend signs like `+` unless explicitly representing transaction ledgers.
4. **Serif moments sans body**: Reserve serif/display typography (Georgia/display) for the single largest, most prominent title anchor on the screen. All other titles, secondary headings, and body copy must remain sans-serif.
5. **Sentence case everywhere**: Write all user-facing strings, actions, headers, and form labels in clean sentence case (e.g., "Email address" instead of "EMAIL ADDRESS" or "Email Address").

## Token Sources

- Color tokens: `constants/Colors.ts` (`Verandah`)
- Type, spacing, radius, layout tokens: `constants/Verandah.ts` (`VerandahType`, `VerandahSpace`, `VerandahRadius`, `VerandahLayout`)

No production UI should define parallel visual token sets.

## Brand Mark

The logo is an arch resting on a rounded baseline bar, both in `Verandah.primaryFg` (`#F0EDE3`) on `Verandah.primary` (`#0F3732`) — the icon set is drawn from the palette, so never introduce a separate "brand green". The bar is wider than the arch, so the mark's bounding box is set by the bar, not the arch legs.

| File | Canvas | Composition | Used by |
|------|--------|-------------|---------|
| `assets/images/icon.png` | 1024² | Full-bleed green, opaque | App icon (iOS + store), login header |
| `assets/images/adaptive-icon.png` | 1024² | Cream mark on **transparent**, safe-zone inset | Android adaptive foreground, Android notification icon |
| `assets/images/splash-icon.png` | 1024² | Rounded green tile on transparent | Splash (`resizeMode: contain` over `#FAF8F4`) |
| `assets/images/favicon.png` | 48² | Rounded green tile on **transparent** | Web favicon (Expo `web.favicon`) |
| `public/images/icon-512.png` | 512² | Full-bleed green | PWA `any`, landing + desktop-panel lockups |
| `public/images/icon-192.png` | 192² | Full-bleed green | PWA `any` |
| `public/images/icon-512-maskable.png` | 512² | Full-bleed green, mark inset to the maskable safe zone | PWA `maskable` |
| `public/images/icon.png` | 1024² | Full-bleed green | PWA `any`, Open Graph image (`api/share-drop.ts`, `landing.html`) |
| `public/images/apple-touch-180.png` | 180² | Full-bleed green, opaque | `apple-touch-icon` (app, landing, admin console) |
| `public/images/favicon.png` / `favicon-32.png` / `favicon-16.png` | 48² / 32² / 16² | Rounded green tile on **transparent** | Browser tab icons everywhere |
| `public/images/adaptive-icon.png` | 1024² | Cream mark on **transparent**, safe-zone inset | Web mirror of the Android foreground |

Two rules decide which composition a slot gets:

- **The platform masks it** (app icon, `apple-touch-icon`, PWA `any`/`maskable`, splash) → **opaque full-bleed green**. Pre-rounded art with transparent corners gets rounded a second time, and iOS composites alpha against *black*, not the brand green.
- **The icon stands free** (browser tab favicons) → the **rounded tile on transparent**, which is what the design set ships.

The same applies to in-app lockups: `.logo-icon` / `.brand-logo-icon` are `overflow: hidden` rounded containers filled by `icon-512.png`, so they need the full-bleed file — see the note below.

The two inset renders (`adaptive-icon`, `icon-512-maskable`) place the mark inside the **inner 66%** of the canvas and centre its *bounding box*, rather than reusing the full-bleed composition — which sits low, so that the arch reads as grounded on the bar. Reusing it verbatim pushes the bar toward the crop edge on round Android masks.

`public/images/` is a hand-maintained mirror for the web build — it is not generated from `assets/images/`. Replacing a logo means updating **both** trees, then bumping `CACHE_NAME` in `public/service-worker.js`.

Render the mark as an image, never as a substitute glyph. Where a lockup needs a rounded container, give the container `overflow: 'hidden'` and let `icon.png` fill it rather than compositing a small arch over a green square — the two read differently at small sizes.

## Full Palette

From `Verandah`:

- `surface`: `#FAF8F4`
- `card`: `#FFFFFF`
- `cardMuted`: `#F1EFE8`
- `primary`: `#0F3732`
- `primaryFg`: `#F0EDE3`
- `accent`: `#0F6E56`
- `accentSoft`: `#E1F5EE`
- `caution`: `#854F0B`
- `cautionSoft`: `#FAEEDA`
- `danger`: `#A32D2D`
- `dangerSoft`: `#FCEBEB`
- `textPrimary`: `#1F2A28`
- `textSecondary`: `#6B6F6D`
- `textTertiary`: `#888780`
- `textMuted`: `#B4B2A9`
- `border`: `rgba(15, 55, 50, 0.08)`
- `borderStrong`: `rgba(15, 55, 50, 0.15)`

Avatar tint families:

- teal: bg `#E1F5EE`, fg `#0F6E56`
- amber: bg `#FAEEDA`, fg `#854F0B`
- purple: bg `#EEEDFE`, fg `#3C3489`
- pink: bg `#FBEAF0`, fg `#993556`
- blue: bg `#E6F1FB`, fg `#185FA5`

## Typography Scale

From `VerandahType`:

- `display`: 26/30, weight 500
- `title`: 20/26, weight 500
- `body`: 14/20, weight 400
- `bodyBold`: 14/20, weight 500
- `caption`: 12/16, weight 400
- `captionBold`: 12/16, weight 500
- `micro`: 11/14, weight 400
- `sectionLabel`: 12, weight 500, uppercase, letter spacing 0.4

Weight policy:

- Allowed: `400`, `500`
- Not allowed: `600+`

## Spacing Scale

From `VerandahSpace`:

- `xs`: 4
- `sm`: 8
- `md`: 12
- `lg`: 16
- `xl`: 20
- `xxl`: 24
- `xxxl`: 32

## Radius Scale

From `VerandahRadius`:

- `sm`: 8
- `md`: 12
- `lg`: 16
- `xl`: 20
- `pill`: 999
- `frame`: 32

## Layout Tokens

From `VerandahLayout` — these differ by platform because web has no status bar:

- `screenPaddingTop`: 16 on web, 60 on native
- `mcnHeaderToContentGap`: 4

Also exported from `constants/Verandah.ts`:

- `getNetworkTileImageHeight()` → 108. Shared image height for network tiles (Pre-order Food, Community Business).
- `format12HourTime(timeStr)` → converts `"13:00"` to `"01:00 pm"`. Use this rather than hand-rolling AM/PM formatting; it passes through strings that already carry am/pm.

## Component Rules

Reuse these instead of building local variants:

| Component | Use for |
|-----------|---------|
| `BaseCard` | Default wrapper for cards and grouped informational sections |
| `Avatar` | All person entities — creators, residents, joiners, contributors |
| `Rupees` | Rupee amounts; avoid manual `Rs`/`₹` string formatting |
| `EmptyState` | Standard empty / list-zero rendering |
| `SearchBar` | Any list search input (36 px tall on the Help tab) |
| `CategoryFilter` | The two-level provider/visit category picker |
| `HeaderBackButton` | Stack header back affordance |
| `ImageUploader` | Any Cloudinary image upload |
| `DateField` | Cross-platform date picker (`input[type=date]` on web, `DateTimePicker` modal on native) |
| `RatingStars` / `EmojiRating` | Provider star ratings / school aspect emoji scale |

### Bottom navigation — "Threshold Rail"

`GlobalBottomNav` is a light rail on `Verandah.paper` (`#FAF8F4`), **60px** tall, with the home-indicator inset padded *below* the bar rather than inside it. Each tab is a 48px column of two fixed-height rows — a 24px icon row and a 12px label row, 2px apart — so revealing the active label can never push the icons off their shared baseline. The bottom safe-area inset is **capped at 5px** (and 5px flat when the reported inset is 0): the raw inset is 34px+ on gesture-bar devices and left a visibly dead strip under the rail. This is a deliberate override of the system inset — the rail sits closer to the gesture bar than the safe area asks for.

| Element | Spec |
|---------|------|
| Active icon / label | `Verandah.primary` `#0F3732`, stroke 2.2, icon scaled 1.1 in place |
| Inactive icon | `Verandah.textDisabled` `#9A988F`, stroke 1.9, scale 1 |
| Label | 10px / 700 (800 on MCN), letter-spacing 0.3 — **opacity 1 on the active tab only**, but always occupying its row |
| Active highlight | Arch-topped slab behind the active tab: fill `rgba(15,55,50,.07)`, border `rgba(15,55,50,.08)`, radius `18 18 14 14`, inset 6px vertically and 12px within the tab slot |
| Centre MCN tab | 38×38 teal disc, radius 13, holding `assets/images/adaptive-icon.png` in a 44px box (`resizeMode: contain`) |

Motion uses React Native's built-in `Animated` (**not** Reanimated — it is a dependency but unused, and unconfigured for web). The shared springy curve is `Easing.bezier(0.34, 1.5, 0.5, 1)`: highlight slide 460ms, icon scale 400ms, label opacity 300ms. While MCN is active its disc breathes between `translateY` −3 and −6 on a 3s loop; on deactivation it settles to 0. All animations run with `useNativeDriver: false` because the highlight animates layout-adjacent values and the web target cannot use the native driver at all.

The disc's drop shadow is the one sanctioned exception to the "no `shadow*` on surfaces" rule below — it is a brand affordance, not a card.

Four of the five glyphs live in `components/NavIcons.tsx` rather than `@untitledui/icons`, because two are bespoke: the house carries a heart, and the buildings pair is Wooru-specific. They keep Untitled UI geometry (24×24, round caps, `currentColor`) and render as DOM SVG, exactly as `@untitledui/icons` does.

**The MCN mark is not a glyph** — it is `assets/images/adaptive-icon.png` rendered as an `Image`, per the "render the mark as an image, never as a substitute glyph" rule above. Do not re-draw it in SVG "to match the icon set": a traced arch silently drifts from the brand every time the logo is revised, and the disc then keeps showing a stale mark after the assets are updated. The asset is cream on transparent, so it needs no tint on the teal disc; it is inset to the safe zone, so its 44px box deliberately overhangs the 38px disc to bring the visible arch up to ~65% of it.

### Platform-specific variants

Some components ship a `.web.tsx` sibling because their native rendering does not translate to the browser: `AppIcon`, `EmojiRating`, `HeaderBackButton`, `NetworkTileIcon`, `SchoolAspectIcon`, `SchoolRadarChart`, `ScoreSentimentIcon`, `MotionWrapper`.

**Prefer adding a `.web.tsx` sibling over branching on `Platform.OS` inside a render tree.** Metro resolves the variant automatically.

General constraints:

- Avoid `LinearGradient` for card/chrome/button surfaces.
- Avoid `shadow*` and `elevation` on cards.
- Keep copy in sentence case.
- Prefer tokenized semantic color meanings over ad-hoc visual accents.

## Avatar Tint Algorithm Rationale

The app intentionally uses deterministic initials avatars rather than mixed photo + fallback rendering.

Rationale:

1. Consistency: avoids mixed-quality user photo presentation.
2. Recognition: same person always maps to the same tint family.
3. Performance: no image fetch dependency for identity rendering.
4. Privacy: no pressure to upload photos for core app use.

`getAvatarTint(name)` creates a stable mapping so each name consistently resolves to one tint pair.

## Rupees Rules

Use `Rupees` for monetary presentation:

- Applies Indian digit grouping (`en-IN`)
- Formats symbol, integer, decimal parts consistently
- Supports tone:
  - `in`: positive contribution style
  - `out`: outgoing/default
  - `neutral`: default neutral style

Do not hand-build currency strings in UI when `Rupees` can be used.

## Common Mistakes to Avoid

To maintain strict conformance to the Verandah design language, be vigilant against these frequent design anti-patterns:

- **Ad-hoc uppercase styling**: Do not define custom uppercase form labels (e.g., `<Text>NAME</Text>`) or use `textTransform: 'uppercase'` on regular body/title texts. Let the design system's `sectionLabel` token handle uppercase transformations under precise hierarchy.
- **Shadow and elevation overrides**: Never manually configure `shadowColor`, `shadowOffset`, `shadowOpacity`, `shadowRadius`, or `elevation` on cards, panels, or buttons. All surfaces should leverage flat hairline outlines (`0.5px` border width with `Verandah.border`) or standard `BaseCard` components.
- **Custom color mappings**: Avoid hardcoding hex color values (e.g., `#FAF8F4` or `#0F3732`) directly inside stylesheets. Always map colors through the local `colors` object bound to `Verandah` tokens, or read from `Verandah` directly to guarantee visual consistency and theme compliance.
- **Legacy glassmorphism variables**: Do not declare or use legacy aliases like `colors.glass` or `colors.glassBorder` inside component local color maps. Replace all glassmorphism references with canonical tokens: use `colors.card` (`Verandah.card`) for background panels and `colors.border` (`Verandah.border`) for hairline frames.
- **Decorative emojis in core UI chrome**: Do not use random emojis as decorative bullets in profile screens, list items, or navigation bars (e.g., "⚙️ Settings"). Rely on elegant outline icon packages (such as `Ionicons` 18px in `Verandah.textTertiary`) for consistent and restrained chrome illustration. Emojis are reserved only for dynamic category tags (like AC or Pest Control category icons).

## Out-of-Register Appendix

Out-of-register means any active UI that does not fully match Verandah constraints.

Each entry should list:

- File path
- Deviation summary
- Why it is currently required
- Follow-up action and owner

Current entries:

- None recorded in this revision.
