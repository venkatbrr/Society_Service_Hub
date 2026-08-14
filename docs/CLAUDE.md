# Agent Operating Manual

> **Rules you must follow while editing this repo.** Product detail lives in [`features.md`](features.md); technical detail in [`architecture.md`](architecture.md); design tokens in [`verandah.md`](verandah.md). Doc routing: [`README.md`](README.md).

Wooru — a multi-tenant community app for gated residential societies. **Expo (React Native) + TypeScript + Supabase + expo-router**, targeting iOS, Android, and an installable PWA, plus a separate vanilla-JS admin console.

---

## 1. Commands

```bash
npm start              # Expo dev server
npm run web            # Web/PWA — fastest loop for layout work
npm run android        # Native Android build (required to test Google Sign-In)
npm run ios            # Native iOS build
npm run build          # expo export --platform web + node build-admin.js (deploy artifact)
npm run preview        # Serve ./dist
npm run legal:html     # Regenerate public/terms.html & public/privacy.html from data/legal.ts

npx tsc --noEmit       # Type check — THE validation gate. No test framework is configured.

npm run db:login          # Authenticate Supabase CLI

# Every DB command is environment-suffixed. There is deliberately no
# unsuffixed `db:push` — an unqualified push is how preprod work reaches prod.
npm run db:push:preprod   # Apply migrations to preprod
npm run db:push:prod      # Apply migrations to prod
npm run types:preprod     # Regenerate lib/database.types.ts from preprod
npm run types:prod        # Regenerate lib/database.types.ts from prod
npm run fn:deploy:preprod # Deploy edge functions to preprod
npm run fn:deploy:prod    # Deploy edge functions to prod
```

The `:preprod` scripts contain a literal `PREPROD_REF_TODO` placeholder until the preprod project exists — they fail loudly rather than silently hitting prod. See [new_features_to_implement/two-environment-setup-plan.md](new_features_to_implement/two-environment-setup-plan.md).

There is no lint script and no test suite. `npx tsc --noEmit` must pass before you call any change done.

A **Supabase MCP server** is also configured (read-write, pinned to `mbzvcaoulawdugfearmj`). Setup and per-client config: [`supabase-mcp.md`](supabase-mcp.md).

**Choosing CLI vs MCP — route by output size, not by preference:**

| Task | Use | Why |
|------|-----|-----|
| Apply a schema change | CLI: `npm run db:push:preprod` / `:prod` | MCP `apply_migration` writes to the remote DB with no local file, desyncing `supabase/migrations/` from deployed schema. Git stays the source of truth. |
| Regenerate types | CLI: `npx supabase gen types ...` | Writes to disk. MCP `generate_typescript_types` returns all of `lib/database.types.ts` into context — by far the most expensive call available. |
| Bulk output of any kind | CLI, redirected to a file | Then read only the slice you need. |
| Inspect live schema / RLS policies | MCP `list_tables` | Short answer, no script to write. |
| Ad-hoc `SELECT` | MCP `execute_sql` | Cheaper than authoring and running a script. |
| Read logs, run security/perf lint | MCP `get_logs`, `get_advisors` | No cheap CLI equivalent. |

Rule of thumb: **if the result belongs in a file, use the CLI; if the result is a short answer, use MCP.** The MCP server supplements the migration workflow in §6 — it never replaces it.

---

## 2. Non-negotiables

1. **Scope every community query by `communityId`** from `useAuth()`. RLS enforces it server-side too, but a missing client filter still leaks nothing and breaks everything — it silently returns empty sets under RLS.
   *Exceptions (user-scoped, never pass `communityId`)*: `user_services`, `user_service_history`, `hire_feedback`, `provider_public_rating_nudges`, `provider_personal_notes`, `favorites`.
2. **Never compare `app_role` to a role literal.** The only community roles are `president` and `vice_president`, and they have identical powers. Use `isCommunityLead` from `useAuth()`, or `public.is_community_lead(auth.uid())` in SQL. (`community_lead`/`community_admin` were removed from the enum entirely on 2026-08-22.) For the platform-admin override use `public.is_platform_admin()` — **not** `is_admin()`, which is only an alias for `is_community_lead()`.
3. **Never hand-edit `lib/database.types.ts`.** Regenerate it.
4. **Use `.maybeSingle()`, not `.single()`**, for single-row reads. `.single()` throws when zero rows match.
5. **Deploy migrations in the same change set** — see §6.
6. **Update docs in the same change set** — see §7.
7. **Verandah tokens only.** No raw hex, no ad-hoc font sizes, no hand-written shadow/elevation values (spread `Verandah.shadowCard` / `shadowRaised` instead). See §4.

---

## 3. Code conventions

### Data & queries

- **Debounced search** — any text input driving a Supabase list query must debounce 300 ms into a separate `debouncedSearchQuery` state, and *that* state goes in the fetch dependency array. Never the raw input.
- **Focus refresh** — list screens use `useFocusEffect` with a `useCallback`-wrapped loader so records created in a sub-screen appear on return.
- **Batch reads** with `Promise.all` rather than sequential awaits.
- **Scope joins tightly** — e.g. `visit_joiners` is fetched for the current page's visit IDs only, never the whole table.
- **Phone numbers** — normalize with `lib/phone.ts` (`normalizeIndianMobile`, `isValidIndianMobile`). When searching providers by phone, strip non-digits from *both* sides (`replace(/\D/g, '')`) and use the placeholder `"Search by name or phone number..."`.
- **Flat / house numbers & inventory** — Residents **never type** flat numbers in onboarding or profile edit. They pick from verified inventory dropdowns backed by `community_flats` via `FlatPicker` (which groups by floor and supports fast unit search). `profiles.flat_id` is the primary foreign key; `sync_profile_flat_denorm` triggers auto-sync for `profiles.flat_number` and `profiles.block_id`. Downstream transactional forms (pre-orders, rides, parent corner, visits) display read-only flat numbers from `profile.flat_number` and prompt users who haven't set their flat yet to pick one in profile edit. If a unit is missing from inventory, users trigger the escape hatch modal which files a `flat_addition_requests` record for lead/admin approval.
- **Dates** — store visit dates as local calendar dates (`YYYY-MM-DD`) so they cannot roll back a day across timezones. Always use `@react-native-community/datetimepicker`, never a raw `TextInput`.

### UI

- **Icons**: `@untitledui/icons` for every interactive control and status indicator. Zero emojis or Unicode character stand-ins across UI text, buttons, and navigation.
- **Theme**: Verandah design direction (`#0F3732` deep teal, `#FAF8F4` paper canvas, `#F0EDE3` cream surface, `#DDA94A` gold accent, `#1F2A28` ink text).
- **Toasts**: `react-native-toast-message` for all user-facing success and failure feedback.
- **Confirmations are platform-split** — `window.confirm` on web, `Alert.alert` on native. React Native's `Alert` does not render on web, so a web-only path that relies on it silently does nothing.
- **Information architecture**: community-level content belongs in the Community tab; the Profile tab is account-level only.
- **Compact density on the Help tab** — single-row provider tiles, 36 px search bars, 30 px avatars, 10 px card padding. New cards on that screen must match.

### Categories — single sources of truth

| Domain | Source | Notes |
|--------|--------|-------|
| Provider & visit categories | `constants/categories.ts` | `CATEGORIES` plus `CATEGORY_GROUPS` for the two-level picker. **Never define a local category array in a screen.** |
| Category-specific provider fields | `constants/providerDetails.ts` | Drives the JSONB `service_providers.details`. Maid/Cook additionally carry `freeSlots`/`weeklyOff` — see `lib/availability.ts` |
| Personal reminder categories | `lib/serviceCategories.ts` | Labels, emoji, icons, default frequencies, provider-category mapping |
| School review aspects | `constants/schoolReviewAspects.ts` | 8 aspects, emoji scale, grade options |
| West Hyderabad schools catalog | `data/westHyderabadSchools.ts` | 81 curated schools; feeds the Schools module and `components/SchoolPicker.tsx` (Parent Corner) |
| SOS vocabulary | `constants/sos.ts` | Blood groups, emergency categories |
| Legal copy & policies | `data/legal.ts` | Single source for in-app `/legal` and public `public/*.html`. Run `npm run legal:html` after editing. |

### Navigation

`lib/navigation.ts` owns back behavior for `/mcn/*` and `/services/*`. Full model: [`architecture.md`](architecture.md) §9.

- **Forward navigation is always `router.push()`.** Each screen must own exactly one browser history entry.
- **Never use `router.replace()` for back navigation.** Replace overwrites the current entry rather than popping it, which makes browser-back skip a level and kills the forward button. Header back buttons call `goBackSmart(router, path)`, which pops with `router.back()` when it can and only replaces on a cross-branch jump or deep-link entry.
- **Replacing is right** for post-save redirects, redirect bridges (`/mcn/drops?id=…`, `/mcn/drops/manage`), and sibling-tab toggles (drops ⇄ business). A bridge that uses `push()` creates an infinite back loop. **But call `replaceTracked(router, route)`, never `router.replace()` directly** — the stack reducer is intent-driven and cannot detect an undeclared replace. See the trap below.
- **Never intercept `popstate`.** expo-router already rebuilds state from the URL; racing it with a manual `router.replace()` is what previously corrupted browser back.
- **Never let two route files resolve to the same URL.** React Navigation forbids it and expo-router fails silently, corrupting browser history at the boundary. The MCN hub tab owns `/network`, so its sub-routes live at `app/mcn/` → `/mcn/*`. A tab screen and a route directory cannot share a name. See [`architecture.md`](architecture.md) §9.
- **When you add a route under `app/mcn/`, add its parent mapping to `getImmediateParentRoute()`** — otherwise the header arrow falls through to the MCN hub.
- MCN stack headers come from `buildMcnHeaderOptions()` in `lib/mcnHeader.tsx`.

### Platform quirks

- **Web viewport** — `html`, `body`, `#root` are `height: 100%` and `#root` is `display: flex` in `app/+html.tsx`. Changing this pushes the tab bar off-screen.
- **Web focus outlines** — reset via `input:focus, textarea:focus, select:focus { outline: none; }` in `app/+html.tsx`.
- **Web pull-to-refresh** — `RefreshControl` is a native no-op, so scrollable lists use `useWebPullToRefresh` + `WebPullIndicator`. Nested scroll containers mean the browser's own native pull-to-refresh never fires, so the hook also has a second, longer-pull tier (`HARD_RELOAD_THRESHOLD`) that runs a real `window.location.reload()` — the only way a web user gets a true browser refresh (e.g. to pick up a new deployed build) rather than just an in-app data refetch.
- **Global bottom nav** — the visible tab bar is `components/GlobalBottomNav.tsx`, rendered once in `app/_layout.tsx`, not `(tabs)/_layout.tsx`'s own `Tabs` bar (hidden via `tabBarStyle: { display: 'none' }`). This is what makes the bar show up on non-tab routes like `/funds/*` and `/mcn/*`. Add new tab-adjacent routes to its `TABS[].isActive` matcher so the right tab highlights. Its glyphs come from `components/NavIcons.tsx`, not `@untitledui/icons` — see `docs/verandah.md` for the rail's geometry and motion spec.
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
- Hand-written `shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius`/`elevation` values — spread `Verandah.shadowCard` / `shadowRaised` instead, and only on **big tiles** (feed cards, hub tiles, banners). Small tiles (provider name rows, chips, badges) stay flat. Never cancel a token with `shadowColor: 'transparent'`. See [`verandah.md`](verandah.md) §Elevation.
- `LinearGradient` on cards, chrome, or button fills
- Glassmorphism aliases (`colors.glass`, `colors.glassBorder`) — use `colors.card` and `colors.border`
- `textTransform: 'uppercase'` on body or title text — only `sectionLabel` is uppercase
- Font weights of 600 or above
- Decorative emojis in navigation or settings chrome

**Reuse instead of re-implementing**: `BaseCard` (card shells) · `Avatar` (people) · `Rupees` (currency) · `EmptyState` (empty lists) · `SearchBar` · `CategoryFilter` · `HeaderBackButton` · `ImageUploader` · `ImageViewer` (full-screen photo viewer — pair it with every cropped cover image) · `SchoolPicker` (searchable catalog picker with an "Other" free-text escape hatch — model any future searchable-catalog field on this, not `FlatPicker`'s inline panel).

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

1. `npm run db:push:preprod` — **preprod always first**
2. `npm run types:preprod`
3. **Re-add the hand-maintained enriched types block** (`ProviderWithInteraction`, `VisitWithJoinerData`, `VisitJoinerWithProfile`) at the bottom of `lib/database.types.ts` — step 2 overwrites the whole file, wiping it. See §11 and the comment above that block. The `types:*` npm scripts redirect straight over the file, so this is easier to forget now, not harder.
4. `npx tsc --noEmit`
5. After the change merges to `main`: `npm run db:push:prod`, then `npm run types:prod` to confirm prod agrees.

Migrations are **not** applied by CI — merging to `main` deploys code, not schema. Step 5 is manual and skipping it breaks prod.

Both environments run the same files from `supabase/migrations/`. Never edit an already-applied migration; write a new one.

To confirm the two environments have not drifted, run [`supabase/checks/schema-fingerprint.sql`](../supabase/checks/schema-fingerprint.sql) against each and compare against [`supabase/checks/baseline-prod.md`](../supabase/checks/baseline-prod.md). (`supabase db diff` is the usual tool but needs Docker, which isn't installed here.) Recapture the baseline after every push to prod.

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
| Feature **hidden** behind a flag (built, coming back) | a doc in [`hidden-features/`](hidden-features/README.md) **plus** a pointer line in `disabled-features.md` |
| Anything touching federation | [`cross-community-changelog.md`](cross-community-changelog.md) (mandatory) |

Do not restate schema columns in `features.md` — name the table and let `architecture.md` own the columns.

---

## 8. Intentionally disabled

**Hidden MCN sections (2026-08-13).** [`constants/featureFlags.ts`](../constants/featureFlags.ts) gates two fully-built features that are coming back: `SCHOOLS_CATALOG_ENABLED` (schools catalog & compare) and `BORROW_SHARE_ENABLED` (borrow & share posts, including the My Submissions borrow tab). Nothing was deleted and no migration was written. Before touching anything under `app/mcn/schools/`, `app/mcn/add.tsx`, or `data/westHyderabadSchools.ts`, read [`hidden-features/mcn-schools-and-borrow.md`](hidden-features/mcn-schools-and-borrow.md) — the curated schools dataset in particular is **still live**, because Parent Corner's `SchoolPicker` reads it.

- **Email verification** — intended off, for lower-friction pilot onboarding. **Verified 2026-08-13 that it is currently ON in the Supabase project**: a fresh `/auth/v1/signup` account got `email_not_confirmed` on login until `auth.users.email_confirmed_at` was set directly. Either the Supabase Auth setting drifted from what this doc assumes, or it was never actually turned off — check the dashboard before trusting this line, and update it once confirmed either way.
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
| `@react-native-community/datetimepicker` on web | Renders `null` on web. Every date field must branch on `Platform.OS === 'web'` or use `components/DateField.tsx`. |
| Adding a column to a `RETURNS TABLE` function signature | Changing the return signature fails with type mismatch; you must `DROP FUNCTION` before `CREATE FUNCTION`. |
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
| Calling `router.replace()` directly instead of `replaceTracked(router, route)` | The stack reducer is **intent-driven** — it cannot tell a replace from a push by looking at the pathname, and an undeclared replace desynchronises tracked from real history for the rest of the session. All 35 raw calls in `app/` were converted on 2026-08-09; keep it at zero (`grep -rn "router\.replace(" app/`). Raw `router.back()` is fine — popstate covers it on web, and on native the reducer recognises a landing on the entry directly beneath. |
| Assuming the tracked stack can infer what happened from the new pathname | It cannot, and this was the root cause of every back-navigation bug through 2026-08-09. "Navigate to a route already in the stack" and "go back to it" are identical observations with opposite effects on history. The old truncate-or-push rule guessed *back* for both, so a post-delete `replace('/mcn/business')` left tracked at depth 2 against a real depth of 4 — and the header arrow then popped the user into the listing they had just deleted. Never reintroduce inference; declare the intent. |
| A redirect-only screen that navigates away on mount | Fine going forward, a trap going backward: browser-back lands on it and it throws the user forward again, so back appears to skip screens or bounce to the redirect target. Guards in `app/_layout.tsx` must call `consumeHistoryPop()` from `lib/navigation.ts` and step *further back* instead. This is why `app/index.tsx` was deleted — see [`architecture.md`](architecture.md) §9. |
| Adding a second route file that resolves to an existing URL | Not theoretical: `app/index.tsx` and `app/(tabs)/index.tsx` both claimed `/`, and the redirect screen won — sending signed-in users on the Home tab to `/landing.html` on browser-back. Remember `(group)` segments do **not** appear in URLs, so `app/(tabs)/foo.tsx` is `/foo`. |
| Writing to the `community-uploads` bucket | Unused. Images go to Cloudinary via `lib/cloudinary.ts`. |
| Leaving `android.adaptiveIcon.backgroundColor` at `#ffffff` | The adaptive foreground is a **cream** arch on transparent — on white it is invisible. It must be `#0F3732`, the same green as the full-bleed `icon.png`. |
| Pointing `expo-notifications.icon` at `icon.png` | Android masks the notification icon to a silhouette by its alpha channel, so an opaque square renders as a solid white block. Use `adaptive-icon.png` — it has the transparency Android needs. |
| Depending on RPC guards to protect table UPDATE | A `SECURITY DEFINER` RPC's guard does not protect the underlying table. `join_community_by_code()` refuses a second join, but the `profiles` UPDATE policy let a resident set `community_id` directly. Column immutability under RLS needs a `BEFORE UPDATE` trigger — `WITH CHECK` cannot see `OLD`. |
| Treating any `supabase.auth.getUser()` error as account deletion | `getUser()` returns `AuthRetryableFetchError` for a network timeout/offline state, not just a deleted user. Treating any error as signed-out logs users out whenever they lose signal. |
| Calling `signOut({ scope: 'local' })` before global `signOut()` | Local signout clears storage tokens first, making the subsequent global call a silent no-op because no access token remains. Revoke server-side first, clear locally second. |
| Static `app.json` for env-dependent native config | `app.config.js` (not `app.json`) is required for dynamic native config dependent on env vars — config plugin options in `app.json` are frozen at build time. |
| Swapping a web icon without bumping `CACHE_NAME` in `public/service-worker.js` | The fetch handler is cache-first for images, so installed PWAs keep serving the old icon indefinitely. |
| Pre-caching with `cache.addAll()` in the service worker | It is atomic — a single 404 rejects the whole install and the worker **never activates**, silently disabling offline support for everyone. Cache each entry with its own `cache.add().catch()`. |
| Assuming the service worker's hostname skip-list covers our API | It only tests `url.hostname`, so same-origin `/api/*` (e.g. `/api/share-drop`) fell through to the cache-first branch and was replayed forever — nothing evicts an entry until `CACHE_NAME` changes. There is now an explicit same-origin `/api/` bail-out. |
| Using `/landing.html` as the service worker's offline navigation fallback | That is the marketing page. An offline back/reload inside the app dropped users onto it. The SPA shell is the correct fallback for app routes; `/landing.html` only for the root. |
| Expecting a `vercel.json` rewrite of `/` to serve the landing page | Vercel resolves the filesystem **before** rewrites, so the exported `dist/index.html` always won and `wooru.in` served an empty SPA shell — which failed Google's OAuth brand review, since the reviewer reads the page without JavaScript. `build-admin.js` now renames the Expo shell to `dist/app.html` and copies `public/landing.html` over `dist/index.html`; the catch-all rewrite targets `/app.html`. The shell path is duplicated in `public/service-worker.js` (`APP_SHELL`) — changing one without the other, or without bumping `CACHE_NAME`, serves the marketing page for every app route. |
| Expecting `goBackSmart(router, path)` to take the *destination* | The second argument is the **current** route — `goBackSmart` derives the parent from it. Passing the destination resolves one level too high (`/mcn/carpools` yielded `/network`) and, because previous ≠ parent, takes the `replace()` fallback and burns a history entry. Three screens had this bug; fixed 2026-08-09. |
| Expecting `notifications` rows for hire feedback | It is a purely local `expo-notifications` schedule, not a table row. |
| Testing Google Sign-In in Expo Go | Requires a dev build. |
| Reading a community table directly from the admin console | A platform admin has no RLS grant there — returns `[]` with **no error**, so the page renders plausible zeroes. Use a `platform_*` `SECURITY DEFINER` RPC. |
| Destructuring only `data` from a Supabase call | A silent failure then looks like real empty data. Always check `error` too. |
| Editing `admin-dashboard/js/*` and expecting the change to show | It is source only. `node build-admin.js` copies it to `dist/admin/`. (`public/admin/` was a second copy — it is now untracked and gitignored.) Rebuild and hard-refresh. |
| Editing an already-applied migration file | `db push` tracks by filename, not content — it reports "up to date" and your fix never lands. Add a new migration or apply directly with `db query -f`. |
| Passing `--project-ref` to `supabase db push` | **Not a valid flag for that subcommand** — it fails with `UnrecognizedOption`. `link` and `functions deploy` accept `--project-ref`; `gen types` accepts `--project-id`; but `db push` only takes `--linked`, `--db-url`, or `--local`. The `db:push:*` scripts therefore `link` to the target ref first, then `push --linked` — which also removes any chance of pushing to a stale link. |
| A bare column name inside a `RETURNS TABLE` function whose OUT param shares that name | Raises *"column reference is ambiguous"* at **call** time, not creation time. Alias the table and qualify the column. |
| Expecting `npx supabase gen types` to preserve the file | It overwrites everything, wiping the hand-maintained `ProviderWithInteraction` / `VisitWithJoinerData` / `VisitJoinerWithProfile` block at the bottom. Re-append it every time — see §6. |
| Committing `.env` | It is now gitignored and untracked. Environment selection lives in Vercel env vars and `eas.json` build profiles, never in a committed file. Copy `.env.example` to `.env` for local work. |
| Hardcoding an absolute app URL | Use `siteUrl('/path')` from [`lib/siteUrl.ts`](../lib/siteUrl.ts). On web it reads `window.location.origin`, so preprod links stay on preprod; on native it reads `EXPO_PUBLIC_SITE_URL`. Eight hand-written URLs pointing at a dead domain were removed on 2026-08-08. |
| Adding config to the admin console expecting `process.env` | `admin-dashboard/` has no bundler — files are copied verbatim. Config must be a `__PLACEHOLDER__` registered in `ADMIN_SUBSTITUTIONS` in `build-admin.js`, which exits 1 if any mapped env var is missing. Currently `__SUPABASE_URL__`, `__SUPABASE_ANON_KEY__`, `__GOOGLE_WEB_CLIENT_ID__`. Only publishable values belong there — never a service role key. |
| Hardcoding an app URL, brand name, or OAuth client ID | All three were rebranded on 2026-08-08. URLs go through `siteUrl()`; the deep-link scheme is `wooru://`; the admin console's Google client ID is a build-time placeholder. |
| Making a platform admin also a resident | `is_platform_admin()` requires `community_id IS NULL`, and trigger `profile_block_guard` rejects a `block_id` whose community no longer matches. Promoting a resident account clears its community, block, and flat number — it cannot hold both roles. |
| Editing `public/admin/` | It is generated output, now untracked and gitignored. Edit `admin-dashboard/` — the real source. |
| Calling an `is_platform_admin()`-gated RPC via `supabase db query --linked` | That connection is not an authenticated admin user, so the function raises. Replicate its inner query to test instead. |
| Assuming a fund's treasurer/collectors are community-wide | They are **per-fund** rows in `fund_roles`. A community with three funds has three independent treasurers. |
| Mutating `mcn_carpools.available_seats` from the client | Capacity is fixed at publish time and trigger-enforced. Live seat availability is derived from `get_mcn_carpool_seats(UUID)` RPC. |
| Cascading ride cancellation firing request-transition triggers | Trigger `enforce_mcn_carpool_request_transition` must permit lead and admin actions and legal `accepted -> cancelled` cascades. |
| Calling `Alert.alert` for confirmation on web | `Alert.alert` is a no-op on web. Always use `confirmAction` from `lib/confirm.ts`. |
| Using `whatsapp://` URL scheme directly | `whatsapp://` fails on web/PWA. Always use `buildWhatsAppUrl` from `lib/phone.ts`. |
| Placing or updating pre-orders via direct table writes | Mutating money or ownership outside the atomic RPC trips `enforce_mcn_preorder_order_immutable_fields`. Always call `place_mcn_preorder()`. The business-order equivalent, `place_mcn_order()`, still exists but has **no caller** — in-app business ordering was hidden on 2026-08-09 ([`disabled-features.md`](disabled-features.md) §2b). Don't wire up a new direct write to `mcn_orders`; if ordering returns, go back through the RPC. |
| An RLS `UPDATE` policy with `USING` but no `WITH CHECK` | Postgres reuses `USING` for the new row. If `USING` does not mention `community_id`, a resident can move their own row into another community. Always write both, and always pin the tenant column. |
| `public.is_community_lead()` in a policy without a `community_id` predicate | It only asks "is this person a lead *anywhere*". A president of another society then matches every row on the platform. Pair it with `community_id = get_user_community_id()`. |
| A `SECURITY DEFINER` RPC taking `community_id` or `user_id` parameter | It is an RLS bypass with caller-controlled scope. Derive scope from `auth.uid()`, `REVOKE FROM PUBLIC, anon`, and `SET search_path = public`. |
| Interpolating user text into a PostgREST `.or()` filter | `,` is the delimiter and `%` is a wildcard. Strip `,()%\.` before interpolating to avoid `PGRST100` 400 errors or wildcard injection. |
| Assuming a `.delete()` matching zero rows throws an error | It does not. `supabase-js` returns `{ error: null }`. Chain `.select('id')` and assert `data?.length === 1`. |
| `wa.me` / `whatsapp://` URL built from bare 10-digit mobile | Stored numbers are 10 digits. `wa.me` requires international country code — prefix `91` at link time. |
| `Share.share` on desktop web | Rejects when `navigator.share` is absent. Never call `Share.share` directly — use `shareOrCopy({ title, message })` from `lib/share.ts`, which branches on `Platform.OS === 'web' && navigator.share` and falls back to a clipboard copy + toast. Fixed at all 11 call sites 2026-08-13; keep new ones at zero raw `Share.share` calls (`grep -rn "Share\.share(" app/ components/`). |
| A link-preview crawler reading a community/business table directly | `mcn_listings` and `communities` both scope `SELECT` to `get_user_community_id()`, which resolves to nothing for an unauthenticated crawler — a direct `.from(...)` read from a Vercel share endpoint (no session) returns `[]`, not an error, so the OG tags silently fall back to defaults. Route through `get_listing_og_card(p_id)` / `get_community_og_card(p_id)`, `SECURITY DEFINER` and granted to `anon`. `mcn_preorder_drops` is the exception — it already has a deliberate anon-readable policy for pre-signup browsing, so `api/share-drop.ts` reads it directly. |
| `mcn_preorder_drops_select_public` (`USING (true)`) looking like an oversight | It's deliberate — `20260802010000_allow_public_food_drop_read.sql`, "Allow anonymous users to browse food drops and item menus" (so a shared drop link works logged-out). Don't narrow it without checking whether that pre-signup browse flow is still wanted. |
| `flex: 1` + `height: N` on a button used outside a `flexDirection: 'row'` sibling pair | The `flex` shorthand sets `flexBasis: 0` on the main axis. Inside a `row` (e.g. two buttons split by `flex: 1` in a modal footer), that's fine — `height` independently sets the cross-axis size. Reuse the same style for a lone button in a plain `column` `View` and the main-axis `height` gets ignored in favor of flex-grow against whatever free space the parent happens to have — the button collapses to content height instead of 52px. Give a standalone button its own style with `height` and no `flex`. Hit this on the business-listing "Save details" button (`app/mcn/listing/manage/[id].tsx`) reusing `modalPrimaryBtn`, which was designed for the two-button modal footer. |
| Assuming `pg_cron` is available for scheduled database tasks | `pg_cron` is not installed on this project. Do not write migrations assuming scheduled background database jobs. |
| Hand-rolling new tab animations or painting highlights behind chips with opaque fill | Use `SegmentedSlider` for contained controls (Family A) and `ChipRowSlider` for variable-width chip rows (Family B). Painting a highlight behind chips with opaque card fill hides the pill during transit. |
| Assuming `public.events` is the community-events table | It is a **fund** (§5 Database work → `architecture.md` §4.4). The community-events module (cultural/sports/festival posts, added 2026-09-07) is deliberately named `community_events` / `community_event_contacts` / `community_event_organizers` throughout — never shorten to `events` in new code near this feature. |
| Writing a cap-checking trigger without `SECURITY DEFINER` | Same failure mode as the food-drop caps (`20260823000000`): an invoker-rights `COUNT`/`SUM` runs under the caller's own RLS and can under-count rows owned by other users. The community-events contact cap and creator cap triggers are `SECURITY DEFINER` for this reason even though, in this particular case, the SELECT policies happen to be community-scoped rather than owner-scoped — make it a habit for any new cap trigger rather than re-deriving the RLS interaction each time. |
| Treating `data/westHyderabadSchools.ts` or `app/mcn/schools/*` as dead code because the hub card is gone | The schools catalog is **hidden behind a flag, not removed** (`SCHOOLS_CATALOG_ENABLED`, 2026-08-13). The curated dataset is additionally a live dependency of Parent Corner's `SchoolPicker`, which is visible and shipping. Same for `mcn_posts` / `app/mcn/add.tsx` under `BORROW_SHARE_ENABLED`. See [`hidden-features/`](hidden-features/README.md). |
| Hiding a feature by removing only its hub card | Entry points come in pairs. Borrow had two — the MCN hub card *and* the My Submissions borrow tab — so hiding just the card left the feature fully reachable. Grep the route (`grep -rn "/mcn/<route>" app/`) and gate every hit, deep-link params included. |
| Hardcoding `/landing.html` for a signed-out redirect | In a deployed build the landing page **is** the origin (`build-admin.js` copies it to `dist/index.html` and moves the Expo shell to `dist/app.html`), so `/landing.html` shows a second, uglier URL for the same page. Use `goToLanding()` from [`lib/siteUrl.ts`](../lib/siteUrl.ts), which returns `/` in production and `/landing.html` under `__DEV__` — the dev server has no such swap, so redirecting to `/` there loads the SPA, which finds no session and redirects to `/` again, forever. |
| Calling `add_community_block()` / `set_community_blocks_enabled()` / `archive_community_block()` from the app | `EXECUTE` was revoked from `authenticated` on 2026-08-14 (`20260908000200`). Block inventory is platform-admin-only; the admin console's `platform_add_community_block` / `platform_set_blocks_enabled` / `platform_archive_community_block` are the only path. `rename_community_block()` is still granted — it is cosmetic and reversible. |
| Assuming `communityHasLead` is correct on first render | Like `fundsEnabled`, it loads in `AuthContext`'s second, non-blocking phase. `false` on the first frame means "not known yet", not "no president". Its lookup deliberately **fails open** (`true` on error) so a transient failure cannot hide an established community's funds behind a "no president" notice. |
| Reading `getNetworkTileImageHeight()` with no argument inside a component | It falls back to `Dimensions.get('window')`, captured once. Pass the live height from `useWindowDimensions()` so the cover re-measures on rotation and browser resize. Two tokens, don't mix them: `getNetworkTileImageHeight()` = ~11.5% (clamp 84–130) for a **feed tile**, `getMediaHeroHeight()` = 30% (clamp 150–280) for a **detail-screen hero**. The tile's 9% looks arbitrarily small in isolation — it is derived from a hard "at least three tiles on the fold" requirement, so raising it silently pushes the third tile off screen. Read the comment above the token before retuning it. |
| Putting a `ChipRowSlider` straight into a `flex: 1` column | Its root is a horizontal `ScrollView`, which has **no intrinsic height** — in a flex column it stretches to whatever space is going, and because `contentRow` centres its chips the measured chip boxes and the animated pill end up at different vertical offsets, so the row visibly jumps as you change selection. Always give it a bounded slot: a wrapper `View` with a fixed `height` (see `chipsSlot` in `app/events/index.tsx`) or `maxHeight` on `containerStyle` (see `app/mcn/business.tsx`). |
| A `contentFit="cover"` image with no `contentPosition` | Cover centre-crops, which beheads people and cuts the top off food. Cover photos use `contentPosition="top"` and are paired with `ImageViewer` so the full photo is still reachable. |
| `ChipRowSlider` for an optional single-select field (nullable value) | It always renders its animated pill on some chip — `resolvedValue = value ?? chips[0].key` — so a `null` value still shows the first chip as "selected". Fine for tabs/segments that always have a real value; wrong for an optional field like an event's start/end time. Use a plain chip row (`TouchableOpacity` + local styles, see `TimeChipRow` in `app/events/add.tsx`) when "nothing selected" must be a real, visible state. |
