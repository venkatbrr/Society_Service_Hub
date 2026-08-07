# Agent Operating Manual

> **Rules you must follow while editing this repo.** Product detail lives in [`features.md`](features.md); technical detail in [`architecture.md`](architecture.md); design tokens in [`verandah.md`](verandah.md). Doc routing: [`README.md`](README.md).

Society Service Hub — a multi-tenant community app for gated residential societies. **Expo (React Native) + TypeScript + Supabase + expo-router**, targeting iOS, Android, and an installable PWA, plus a separate vanilla-JS admin console.

---

## 1. Commands

```bash
npm start              # Expo dev server
npm run web            # Web/PWA — fastest loop for layout work
npm run android        # Native Android build (required to test Google Sign-In)
npm run ios            # Native iOS build
npm run build          # expo export --platform web + node build-admin.js (deploy artifact)
npm run preview        # Serve ./dist

npx tsc --noEmit       # Type check — THE validation gate. No test framework is configured.

npm run db:login       # Authenticate Supabase CLI
npm run db:link        # Link to project mbzvcaoulawdugfearmj
npm run db:push        # Apply migrations
npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj   # Regenerate lib/database.types.ts
```

There is no lint script and no test suite. `npx tsc --noEmit` must pass before you call any change done.

---

## 2. Non-negotiables

1. **Scope every community query by `communityId`** from `useAuth()`. RLS enforces it server-side too, but a missing client filter still leaks nothing and breaks everything — it silently returns empty sets under RLS.
   *Exceptions (user-scoped, never pass `communityId`)*: `user_services`, `user_service_history`, `hire_feedback`, `provider_public_rating_nudges`, `provider_personal_notes`, `favorites`.
2. **Never compare `app_role` to a role literal.** The only community roles are `president` and `vice_president`, and they have identical powers. Use `isCommunityLead` from `useAuth()`, or `public.is_community_lead(auth.uid())` in SQL. (`community_lead`/`community_admin` were removed from the enum entirely on 2026-08-22.) For the platform-admin override use `public.is_platform_admin()` — **not** `is_admin()`, which is only an alias for `is_community_lead()`.
3. **Never hand-edit `lib/database.types.ts`.** Regenerate it.
4. **Use `.maybeSingle()`, not `.single()`**, for single-row reads. `.single()` throws when zero rows match.
5. **Deploy migrations in the same change set** — see §6.
6. **Update docs in the same change set** — see §7.
7. **Verandah tokens only.** No raw hex, no ad-hoc font sizes, no shadows or elevation. See §4.

---

## 3. Code conventions

### Data & queries

- **Debounced search** — any text input driving a Supabase list query must debounce 300 ms into a separate `debouncedSearchQuery` state, and *that* state goes in the fetch dependency array. Never the raw input.
- **Focus refresh** — list screens use `useFocusEffect` with a `useCallback`-wrapped loader so records created in a sub-screen appear on return.
- **Batch reads** with `Promise.all` rather than sequential awaits.
- **Scope joins tightly** — e.g. `visit_joiners` is fetched for the current page's visit IDs only, never the whole table.
- **Phone numbers** — normalize with `lib/phone.ts` (`normalizeIndianMobile`, `isValidIndianMobile`). When searching providers by phone, strip non-digits from *both* sides (`replace(/\D/g, '')`) and use the placeholder `"Search by name or phone number..."`.
- **Flat / house numbers** — uppercase and strip spaces and hyphens on blur. Use placeholders like `A101`, never hyphenated examples.
- **Dates** — store visit dates as local calendar dates (`YYYY-MM-DD`) so they cannot roll back a day across timezones. Always use `@react-native-community/datetimepicker`, never a raw `TextInput`.

### UI

- **Icons**: `Ionicons` from `@expo/vector-icons` for every interactive control. `APP_EMOJIS` is decorative only; emojis are otherwise reserved for dynamic category tags.
- **Toasts**: `react-native-toast-message` for all user-facing success and failure feedback.
- **Confirmations are platform-split** — `window.confirm` on web, `Alert.alert` on native. React Native's `Alert` does not render on web, so a web-only path that relies on it silently does nothing.
- **Information architecture**: community-level content belongs in the Community tab; the Profile tab is account-level only.
- **Compact density on the Help tab** — single-row provider tiles, 36 px search bars, 30 px avatars, 10 px card padding. New cards on that screen must match.

### Categories — single sources of truth

| Domain | Source | Notes |
|--------|--------|-------|
| Provider & visit categories | `constants/categories.ts` | `CATEGORIES` plus `CATEGORY_GROUPS` for the two-level picker. **Never define a local category array in a screen.** |
| Category-specific provider fields | `constants/providerDetails.ts` | Drives the JSONB `service_providers.details` |
| Personal reminder categories | `lib/serviceCategories.ts` | Labels, emoji, icons, default frequencies, provider-category mapping |
| School review aspects | `constants/schoolReviewAspects.ts` | 8 aspects, emoji scale, grade options |
| SOS vocabulary | `constants/sos.ts` | Blood groups, emergency categories |

### Navigation

`lib/navigation.ts` owns back behavior for `/mcn/*` and `/services/*`. Full model: [`architecture.md`](architecture.md) §9.

- **Forward navigation is always `router.push()`.** Each screen must own exactly one browser history entry.
- **Never use `router.replace()` for back navigation.** Replace overwrites the current entry rather than popping it, which makes browser-back skip a level and kills the forward button. Header back buttons call `goBackSmart(router, path)`, which pops with `router.back()` when it can and only replaces on a cross-branch jump or deep-link entry.
- **Do use `router.replace()`** for post-save redirects, redirect bridges (`/mcn/drops?id=…`, `/mcn/drops/manage`), and sibling-tab toggles (drops ⇄ business). A bridge that uses `push()` creates an infinite back loop.
- **Never intercept `popstate`.** expo-router already rebuilds state from the URL; racing it with a manual `router.replace()` is what previously corrupted browser back.
- **Never let two route files resolve to the same URL.** React Navigation forbids it and expo-router fails silently, corrupting browser history at the boundary. The MCN hub tab owns `/network`, so its sub-routes live at `app/mcn/` → `/mcn/*`. A tab screen and a route directory cannot share a name. See [`architecture.md`](architecture.md) §9.
- **When you add a route under `app/mcn/`, add its parent mapping to `getImmediateParentRoute()`** — otherwise the header arrow falls through to the MCN hub.
- MCN stack headers come from `buildMcnHeaderOptions()` in `lib/mcnHeader.tsx`.

### Platform quirks

- **Web viewport** — `html`, `body`, `#root` are `height: 100%` and `#root` is `display: flex` in `app/+html.tsx`. Changing this pushes the tab bar off-screen.
- **Web focus outlines** — reset via `input:focus, textarea:focus, select:focus { outline: none; }` in `app/+html.tsx`.
- **Web pull-to-refresh** — `RefreshControl` is a native no-op, so scrollable lists use `useWebPullToRefresh` + `WebPullIndicator`. Nested scroll containers mean the browser's own native pull-to-refresh never fires, so the hook also has a second, longer-pull tier (`HARD_RELOAD_THRESHOLD`) that runs a real `window.location.reload()` — the only way a web user gets a true browser refresh (e.g. to pick up a new deployed build) rather than just an in-app data refetch.
- **Global bottom nav** — the visible tab bar is `components/GlobalBottomNav.tsx`, rendered once in `app/_layout.tsx`, not `(tabs)/_layout.tsx`'s own `Tabs` bar (hidden via `tabBarStyle: { display: 'none' }`). This is what makes the bar show up on non-tab routes like `/funds/*` and `/mcn/*`. Add new tab-adjacent routes to its `TABS[].isActive` matcher so the right tab highlights.
- **Vercel serverless functions** (`api/*.ts`) — excluded from `tsconfig.json` like `supabase/functions`, since they run in a separate Node runtime Vercel builds independently. Used for things a client-rendered SPA can't do itself, e.g. `api/share-drop.ts` serves per-drop Open Graph tags to link-preview crawlers (WhatsApp, etc.) since the app's static `index.html` has no per-page meta tags.
- **Service worker** — registration checks `document.readyState` for `complete`/`interactive` so it still runs when the bundle loads late.
- **Platform-specific components** — add a `.web.tsx` sibling rather than branching on `Platform.OS` inside a render tree.
- **Android dev networking** — keep `android.usesCleartextTraffic = true` so dev builds can load Metro over HTTP.
- **Bundled image assets** — import extensions must match the real file. The funds background is `assets/images/funds_bg.jpg`; importing it as `.png` breaks Android release resource compilation.

### TypeScript

Strict mode. Path alias `@/*` → project root. Prefer generated `Tables<'x'>` types over hand-written interfaces; declare screen-local enriched types next to their screen.

---

## 4. Verandah UI rules

Full reference: [`verandah.md`](verandah.md).

**Token sources — the only allowed origin for visual values**
- `constants/Colors.ts` → `Verandah`
- `constants/Verandah.ts` → `VerandahType`, `VerandahSpace`, `VerandahRadius`, `VerandahLayout`

**Forbidden in feature UI**
- Raw hex colors (bind to `Verandah` instead)
- Ad-hoc font sizes when a `VerandahType` token fits
- `shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius`/`elevation` on any surface
- `LinearGradient` on cards, chrome, or button fills
- Glassmorphism aliases (`colors.glass`, `colors.glassBorder`) — use `colors.card` and `colors.border`
- `textTransform: 'uppercase'` on body or title text — only `sectionLabel` is uppercase
- Font weights of 600 or above
- Decorative emojis in navigation or settings chrome

**Reuse instead of re-implementing**: `BaseCard` (card shells) · `Avatar` (people) · `Rupees` (currency) · `EmptyState` (empty lists) · `SearchBar` · `CategoryFilter` · `HeaderBackButton` · `ImageUploader`.

Keep all user-facing copy in **sentence case**. Reserve serif/display type for the single largest title anchor on a screen.

Anything that genuinely cannot conform must be logged in the out-of-register appendix of [`verandah.md`](verandah.md) with path, reason, and follow-up.

---

## 5. Database work

Schema, RPC index, triggers, and RLS: [`architecture.md`](architecture.md) §4–§7.

- Migrations are ordered files in `supabase/migrations/` named `YYYYMMDDHHMMSS_description.sql`.
- Write idempotent SQL: `CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`, `ADD COLUMN IF NOT EXISTS`.
- End schema-changing migrations with `NOTIFY pgrst, 'reload schema';` so PostgREST picks up the change.
- Every new table needs `ALTER TABLE … ENABLE ROW LEVEL SECURITY` plus explicit select/insert/update/delete policies. Community-scoped tables compare against `get_user_community_id()`.
- New MCN tables should follow the uniform delete rule: `owner = auth.uid() OR public.is_community_lead(auth.uid()) OR public.is_platform_admin(auth.uid())`. Use `is_platform_admin()`, never `is_admin()` — the latter is only an alias for `is_community_lead()` and grants the platform admin nothing.
- Enforce real invariants (capacity caps, role caps, block scoping) with triggers, not UI checks alone.
- **A platform admin has no RLS grant on community-scoped tables.** `is_platform_admin()` requires `community_id IS NULL`, so any policy keyed on `get_user_community_id()` matches nothing for them. Anything the admin console needs must go through a `platform_*` `SECURITY DEFINER` RPC — a direct table read returns `[]` with no error.
- **Editing an already-applied migration file does nothing.** `supabase db push` tracks migrations by **filename**, not content, and reports "up to date". Either add a new migration, or apply the corrected SQL directly with `npx supabase db query --linked -f <file>` (safe for `CREATE OR REPLACE FUNCTION`, which is idempotent).
- **Check the migration timestamp isn't already taken** before naming a file — concurrent sessions collide. `npx supabase migration list --linked` shows local-vs-remote; a row with an empty `remote` is unapplied.
- **`RETURNS TABLE` OUT parameters shadow column names.** A function declaring `RETURNS TABLE(listing_id UUID, …)` cannot use a bare `listing_id` in its body — Postgres cannot tell the OUT param from the column and raises *"column reference … is ambiguous"* at call time, not creation time. Always alias the table and qualify (`mp.listing_id = l.id`).
- **Dropping an enum value requires a type swap** — Postgres has no `ALTER TYPE … DROP VALUE`. Rename the old type, create the new one, recast the column with `USING col::TEXT::newtype`, then drop the old. Every hard dependency must be cleared first: column defaults, function **signatures** (`RETURNS TABLE(... enum ...)`), RLS policies referencing the column, and **triggers whose `WHEN` clause names the column**. Function *bodies* are re-resolved at runtime and need no change. Worked example: `20260822000200`.

### Cross-community conventions

- RPC naming: `list_visible_*`, `can_user_see_*`, `set_*_visibility`, `*_community_partnership`.
- **Never modify `get_user_community_id()` for federation behavior** — use `get_user_partner_community_ids()`.
- Federation RLS must be **additive**: add permissive `SELECT` policies that union with existing ones; never rewrite a single-community policy.
- Any federation change requires an entry in [`cross-community-changelog.md`](cross-community-changelog.md) **in the same change set**.
- Canonical reference: [`cross-community.md`](cross-community.md). Rationale: [`decisions/0001-additive-rls-for-cross-community.md`](decisions/0001-additive-rls-for-cross-community.md).

---

## 6. Deploying database changes

When you create or modify a file in `supabase/migrations/`, complete the loop yourself:

1. `npm run db:push`
2. `npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj`
3. **Re-add the hand-maintained enriched types block** (`ProviderWithInteraction`, `VisitWithJoinerData`, `VisitJoinerWithProfile`) at the bottom of `lib/database.types.ts` — step 2 overwrites the whole file, wiping it. See §11 and the comment above that block.
4. `npx tsc --noEmit`

Do not leave a migration unapplied or types unregenerated. Deployment is part of the implementation, not a follow-up.

---

## 7. Keeping docs in sync

Docs are part of the change set. Route each update to exactly one home — duplicating facts across files is what caused the last drift.

| What changed | Update |
|--------------|--------|
| User-visible screen behavior | [`features.md`](features.md) |
| Table, RLS, RPC, trigger, route, context, or type | [`architecture.md`](architecture.md) |
| Command, convention, dependency, or gotcha | this file |
| Design token or shared component | [`verandah.md`](verandah.md) |
| Admin console | [`platform-admin.md`](platform-admin.md) |
| A whole new module, tab, or role | also add a line to [`.github/app-summary.md`](../.github/app-summary.md) |
| Feature disabled, removed, or re-enabled | [`disabled-features.md`](disabled-features.md) |
| Anything touching federation | [`cross-community-changelog.md`](cross-community-changelog.md) (mandatory) |

Do not restate schema columns in `features.md` — name the table and let `architecture.md` own the columns.

---

## 8. Intentionally disabled

- **Email verification** — off in Supabase for lower-friction pilot onboarding.
- **Password strength validation** — removed for a simpler signup flow.

Details and re-enablement notes: [`disabled-features.md`](disabled-features.md).

---

## 9. Known traps

| Trap | Reality |
|------|---------|
| `app_role === 'community_lead'` | Value no longer exists — removed from the enum on 2026-08-22. Use `isCommunityLead`. |
| `public.is_admin()` granting platform-admin access in RLS | It is only an alias for `is_community_lead()`. Use `is_platform_admin()` for the platform-admin override. |
| Assuming `fundsEnabled` is correct on first render | `AuthContext` loads it in a second, non-blocking phase. |
| `Alert.alert` for a web confirmation | No-op on web. Split on `Platform.OS`. |
| `.single()` on a possibly-absent row | Throws. Use `.maybeSingle()`. |
| Adding an `app/mcn/*` or `app/funds/*` route without a parent mapping, or using plain `router.back()` in its header | Falls through to the MCN hub, or silently does nothing on a deep-linked/fresh-loaded screen with no history to pop. Add the mapping to `getImmediateParentRoute()` and call `goBackSmart()`. |
| Treating a food drop item's `max_quantity` as per-order | It is a total shared across every buyer's orders combined — enforced server-side, not just capped in the quantity stepper. |
| Two routes resolving to one URL (e.g. a tab screen and a same-named directory) | expo-router does not error; browser history silently breaks at that boundary. Keep `/network` (tab) and `/mcn/*` (stack) distinct. |
| Using `router.replace()` to go back | Overwrites the history entry instead of popping it — browser-back then skips a level and forward breaks. Use `goBackSmart()`. |
| Intercepting `popstate` to "fix" browser back | Races expo-router's own handler. Don't. |
| `router.push()` on a redirect bridge (`?id=` style) | Browser-back lands on the bridge, which forwards again — infinite loop. Use `replace()`. |
| Enforcing capacity only in the UI | Drop item capacity and fund role caps are trigger-enforced; UI-only checks will be bypassed. |
| Writing a constraint-enforcing trigger without `SECURITY DEFINER` | Its own `SELECT`s run under the *caller's* RLS, so any aggregate over other users' rows silently under-counts and the constraint never fires. Cost the food-drop caps their cross-buyer enforcement — see `20260823000000`. |
| A table with only SELECT/INSERT policies that the app also deletes from | RLS makes the delete match zero rows and **return success**. A delete-then-insert edit flow then duplicates rows instead of replacing them. Check the `error` *and* give the table a DELETE policy. |
| Writing a parent row and its children in two client round trips when a trigger can reject the children | The parent is already committed, so the rejection leaves an orphan — a "confirmed" pre-order with a total and no items. Anything a constraint can veto must be written in one transaction, i.e. a `SECURITY DEFINER` RPC. Pre-orders go through `place_mcn_preorder()`. |
| Writing to the `community-uploads` bucket | Unused. Images go to Cloudinary via `lib/cloudinary.ts`. |
| Expecting `notifications` rows for hire feedback | It is a purely local `expo-notifications` schedule, not a table row. |
| Testing Google Sign-In in Expo Go | Requires a dev build. |
| Reading a community table directly from the admin console | A platform admin has no RLS grant there — returns `[]` with **no error**, so the page renders plausible zeroes. Use a `platform_*` `SECURITY DEFINER` RPC. |
| Destructuring only `data` from a Supabase call | A silent failure then looks like real empty data. Always check `error` too. |
| Editing `admin-dashboard/js/*` and expecting the change to show | It is source only. `node build-admin.js` copies it to `dist/admin/` and the **committed, actually-served** `public/admin/`. Rebuild and hard-refresh. |
| Editing an already-applied migration file | `db push` tracks by filename, not content — it reports "up to date" and your fix never lands. Add a new migration or apply directly with `db query -f`. |
| A bare column name inside a `RETURNS TABLE` function whose OUT param shares that name | Raises *"column reference is ambiguous"* at **call** time, not creation time. Alias the table and qualify the column. |
| Expecting `npx supabase gen types` to preserve the file | It overwrites everything, wiping the hand-maintained `ProviderWithInteraction` / `VisitWithJoinerData` / `VisitJoinerWithProfile` block at the bottom. Re-append it every time — see §6. |
| Calling an `is_platform_admin()`-gated RPC via `supabase db query --linked` | That connection is not an authenticated admin user, so the function raises. Replicate its inner query to test instead. |
| Assuming a fund's treasurer/collectors are community-wide | They are **per-fund** rows in `fund_roles`. A community with three funds has three independent treasurers. |
