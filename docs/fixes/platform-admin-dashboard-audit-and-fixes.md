# Platform Admin Console — Bug Fixes, Stats Rebuild, and UI Rework

## Context

The platform admin console at `/admin` is the artefact investors will be shown, but it currently
reports **zeros for everything** on the "All Communities (Platform Overview)" view while the
database holds 6 residents, 2 providers, 7 drops, 7 orders, 2 funds and ₹49,500 of collected
money. It also has no surface at all for two shipped features (community events and the events
coordinator grant), and its per-community stats stop at flat lists — there is no rollup by
resident, by owner, or by category, which is exactly what a funding conversation needs.

Three independent defects stack to produce the empty dashboard. All three were confirmed
against the live database, not inferred from docs:

1. **`dashboard.js:19-21` sends the literal string `'ALL'` as a UUID.** The `'ALL' → null`
   normalisation exists only inside the dropdown's `change` handler (`dashboard.js:53`), so on
   first paint `selectedCommunityId` becomes `'ALL'` and every RPC gets an invalid UUID.
2. **`platform_get_community_dashboard_v2` raises on every single call.** Its DAU/MAU subqueries
   read `profiles.updated_at` (migration `20260817000000…sql:96,98`), and that column **does not
   exist** — `public.profiles` has only `created_at`. Verified: `ERROR 42703: column "updated_at"
   does not exist`. So the console has silently been running on the v1 fallback for its entire life.
3. **Every failure is swallowed.** `dashboard.js:79-81`, `:85-86` and `:108-118` destructure only
   `data`/`count` and never `error`. v1 returns zeros for a NULL community (it uses strict
   `community_id = p_community_id`), the direct-table fallback at `:96-127` is blocked by RLS
   (a platform admin has `community_id IS NULL` and matches no community-scoped policy), and the
   page renders a perfectly healthy-looking wall of zeros.

Fixing those three is necessary but not sufficient — the plan below also closes the functional
gaps and rebuilds the stats layer.

**Decisions taken with the user:** DAU/MAU gets a real `last_active_at` heartbeat *plus* a derived
backfill so the numbers are not empty on day one; this change set stays inside
`admin-dashboard/` + `supabase/migrations/` (the one-line app-side heartbeat call is carved out as
a separate follow-up); the console gets **full grant/revoke** control over events coordinators; and
the community detail page becomes **tabbed**.

---

## Phase 1 — Correctness (P0)

These are all confirmed-broken, not speculative.

### 1.1 Dashboard data path — `admin-dashboard/js/dashboard.js`

| Fix | Detail |
|---|---|
| `'ALL'` as UUID | Normalise in one place. Add `normalizeCommunityId(v)` returning `v === 'ALL' \|\| !v ? null : v` and use it in `load()` (`:16-24`), the `change` handler (`:53`) and `onCardClick()` (`:233-253`, which today emits `#communities?id=ALL`). |
| Delete the direct-query fallback | Remove `:88-127` wholesale. It queries `mcn_preorder_drops`/`mcn_preorder_orders`/`mcn_listings`/`mcn_products` directly, which RLS blocks for a platform admin — it **overwrites correct RPC values with zeros** whenever `total_food_drops` is 0, and `prodQuery` is never community-filtered so the product count is platform-wide even for a single community. This is the exact anti-pattern `docs/platform-admin.md` §1a forbids. |
| Check every `error` | `const { data, error } = …` on all three RPC calls; on failure render an inline error banner in `#dashboard-content` instead of zeros. Never let a failed read look like an empty community. |
| Remove the v1 fallback | Once v3 is deployed (§2.1), drop the `platform_get_community_dashboard` fallback — it has no NULL branch and returns a different, incompatible column set. |
| Kill the fabricated DAU | `:129-130` currently does `summary.dau_today \|\| summary.total_residents` — falling back to headcount and labelling it "active users". Delete the `\|\|` chain; show the real number or `—`. |
| Dead card clicks | `index.html:154` and `:163` wire `onCardClick('food')` and `('business')`; `dashboard.js:233-253` handles only `residents`/`providers`/`funds`. Add the two missing branches (deep-link into the community's Commerce tab). |

### 1.2 Community detail — `admin-dashboard/js/communities.js`

| Fix | Detail |
|---|---|
| **Adding flats is 100% broken** | `:884-887` calls `platform_add_community_flats({p_block_id, p_flat_numbers})`, but the deployed signature is `(p_community_id uuid, p_block_id uuid, p_flat_numbers text[])` with **no default** on the first argument. PostgREST cannot resolve it. Pass `p_community_id: this.selectedCommunityId`. |
| Lead appointment is unreachable without funds | The "Community Lead Management" panel is rendered only inside `${community.funds_enabled ? … }` (`:603-619`). A community that has not requested funds can never be given a president from the console. Ungate it — `platform_set_community_lead` has no funds precondition. |
| Search rebuilds the whole page | `:789-794` re-runs `renderCommunityDetailView()` on every keystroke, re-creating the entire detail DOM and losing the caret. Re-render only the residents `<tbody>`. |
| No way to *add* a collector | Only Remove exists (`:362`). `platform_assign_block_in_charge(p_event_id, p_user_id, p_block_id)` is deployed and granted but never called. Add a resident + block picker per fund. |
| WhatsApp links are wrong | `:473-474` strips non-digits and builds `https://wa.me/<10 digits>` with no `91` country prefix — the repo rule (`docs/CLAUDE.md` §9) requires adding it at link time. |
| Sequential waterfall | `:133-228` does six awaits in series on every open. Wrap the five independent reads in `Promise.all`. |
| Not deep-linkable | `:120-121` mutates `selectedCommunityId` and calls `load()` without touching the hash, so the detail view has no URL and browser-back does not exit it. Set `window.location.hash = '#communities?id=…'` and let the router drive, matching `ProvidersPage.viewDetails()` (`providers.js:139-142`). |
| Dead code | `getCommunityCounts()` (`:12-16`) is never called. Delete. |

### 1.3 Providers — `admin-dashboard/js/providers.js`, `index.html`

| Fix | Detail |
|---|---|
| **Report resolution can never succeed** | `:361-369` does a direct `provider_reports` UPDATE. The UPDATE policy requires `is_user_approved(auth.uid())`, which requires `community_id IS NOT NULL` — the exact opposite of what `is_platform_admin()` requires. The `.select('id')` round-trip is then blocked by the SELECT policy too, so the `data.length !== 1` guard throws "Update failed". Needs the new `platform_resolve_provider_report` RPC (§2.6). |
| Misaligned table | `index.html:383-390` declares 6 `<th>` but `providers.js:102-113` renders 7 `<td>` (the fraud-status badge has no header). This is why the table runs off the right edge in the current screenshot. Add the `Status` header. |
| Dead search box | `#providers-search` has no listener anywhere — typing does nothing. Add a debounced `input` handler calling `loadProvidersList()`. |

### 1.4 Security — new migration

`list_community_blocks(p_community_id)` and `list_community_flats(p_community_id, p_block_id)` are
`SECURITY DEFINER`, take a caller-supplied community id, and have **no authorisation check** — any
authenticated user can enumerate any society's block and flat inventory. This is the trap listed in
`docs/CLAUDE.md` §9 ("A `SECURITY DEFINER` RPC taking `community_id`…"). Add a guard:
`p_community_id = public.get_user_community_id() OR public.is_platform_admin(auth.uid())`.

### 1.5 Auth gate — `admin-dashboard/js/auth.js`

`:98` checks `profile.app_role !== 'admin'` only. The server-side `is_platform_admin()` *also*
requires `community_id IS NULL`. An `admin` profile that still carries a community passes the client
gate and then hits an authorisation error on every `platform_*` RPC. Call
`supabase.rpc('is_platform_admin')` on the happy path too, check its `error`, and use
`.maybeSingle()` instead of `.single()` per repo convention.

### 1.6 Shared hardening

- **Escaping.** `esc()` exists only at `providers.js:2-10`. `communities.js`, `approvals.js`,
  `funds-requests.js` and `dashboard.js` interpolate raw user text into `innerHTML`, including
  inside single-quoted inline handlers (`communities.js:521`, `:1188`) — a resident named `O'Brien`
  breaks the handler outright. Move `esc()` into a new `admin-dashboard/js/utils.js` (loaded first),
  apply it everywhere, and replace inline `onclick="…('${value}')"` with `data-*` attributes +
  delegated listeners, as `providers.js:115-128` already does correctly.
- **Formatters.** Move the repeated `₹${n.toLocaleString('en-IN')}`, date and badge helpers into
  `utils.js` — they are currently copy-pasted a dozen times.
- `styles.css:73` has the invalid value `flex-direction: flex-column` on `aside`.

---

## Phase 2 — Stats layer (new / replaced `platform_*` RPCs)

All new functions follow the house rules: `SECURITY DEFINER`, `SET search_path = public`, gated on
`public.is_platform_admin(auth.uid())`, `p_community_id uuid DEFAULT NULL` meaning *all communities*
(pattern already correct in `20260817000000…sql:92-118`), idempotent SQL, and
`NOTIFY pgrst, 'reload schema';` at the end.

Suggested files (must sort after the current head, `20260909000100`):

| Migration | Contents |
|---|---|
| `20260910000000_platform_activity_tracking.sql` | `profiles.last_active_at` + `touch_last_active()` + `mark_activity` |
| `20260910000100_platform_dashboard_v3.sql` | `platform_get_community_dashboard_v3`, NULL-safe `platform_get_providers_by_category` |
| `20260910000200_platform_rollup_stats.sql` | per-host, per-owner, per-category, communities overview, fund ledger |
| `20260910000300_platform_events_admin.sql` | events + coordinator read/grant/revoke |
| `20260910000400_platform_report_moderation.sql` | `platform_resolve_provider_report`, `list_community_*` guards (§1.4) |

### 2.1 Real DAU/MAU

**a. Heartbeat (DB side, this change set).** Add `profiles.last_active_at TIMESTAMPTZ` (index on
`(community_id, last_active_at)`) and a tiny `public.touch_last_active()` RPC — no arguments,
writes `last_active_at = now()` for `auth.uid()` only, granted to `authenticated`. Taking no
`user_id` parameter is deliberate: a definer function with caller-supplied scope is an RLS bypass.

**b. Derived backfill (so the numbers are not empty today).** A `public.v_user_activity` view
UNIONing `user_id, created_at` from `mcn_preorder_orders(buyer_id)`, `ratings(user_id)`,
`provider_hires(user_id)`, `service_visits(created_by)`, `community_events(created_by)`,
`event_transactions(created_by)`, `mcn_preorder_drops(created_by)`, `mcn_listings(owner_id)`.
DAU/MAU = `COUNT(DISTINCT user_id)` over `GREATEST(last_active_at, max(activity))` within the window.

**c. Follow-up, not in this change set (per scope decision):** one call to
`supabase.rpc('touch_last_active')` on app foreground in `context/AuthContext.tsx`. Until that lands,
the derived signal carries the metric. I will flag this explicitly rather than let it be forgotten.

### 2.2 `platform_get_community_dashboard_v3(p_community_id uuid DEFAULT NULL)`

Supersedes v2. Same 19 columns (with the `updated_at` bug fixed per §2.1), plus:
`new_residents_30d`, `total_events`, `upcoming_events`, `cancelled_events`, `total_event_organizers`,
`total_ratings`, `avg_provider_rating`, `contributing_residents`, `active_funds`, `total_communities`
(so the Platform Overview can state its own denominator). Keep v2 in place until the console is
rebuilt, then it can be dropped.

### 2.3 NULL-safe `platform_get_providers_by_category`

The deployed body uses `WHERE sp.community_id = p_community_id` in **both** CTEs — this is why the
Platform Overview chart says "No service providers registered in this community" while two providers
exist. `CREATE OR REPLACE` with `(p_community_id IS NULL OR sp.community_id = p_community_id)` and
`DEFAULT NULL` on the parameter.

### 2.4 Per-resident and per-category rollups (the funding ask)

- **`platform_get_preorder_hosts(p_community_id uuid DEFAULT NULL)`** — group `mcn_preorder_drops`
  by `created_by`: host name, flat, community, `drops_total`, `drops_open`, `orders_total`
  (excluding `status = 'cancelled'`, matching the app's own definition per `20260817000000`),
  `revenue_total`, `avg_order_value`, `distinct_buyers`, `first_drop_at`, `last_drop_at`.
- **`platform_get_business_owners(p_community_id uuid DEFAULT NULL)`** — group `mcn_listings` by
  `owner_id`: owner, flat, `listings_total`, `listings_active`, `products_total`, `avg_rating`,
  `rating_count`, `flagged_count` (`flagged_for_review_at IS NOT NULL`).
- **`platform_get_business_categories(p_community_id uuid DEFAULT NULL)`** — group by
  `mcn_business_categories`: name, emoji, `listing_count`, `active_count`, `owner_count`,
  `product_count`, `avg_rating`.
- **`platform_get_communities_overview()`** — one row per community with member/lead counts, drops,
  revenue, listings, funds, balance, events, coordinators, `last_activity_at`. This replaces
  `communities.js:52-55`, which today pulls **every profile row on the platform** into the browser
  just to compute two counters per card — the read most likely to be silently truncated by
  PostgREST's row cap as the platform grows, with no error surfaced.

### 2.5 Funds detail

Reuse `platform_get_community_funds` — it already returns `income`, `expense`, `balance`,
`treasurers[]`, `collectors[]`, `contributions[]`; the console just never displays most of it
(`communities.js:397-407` shows only Balance). Two additions:

- **`platform_get_fund_ledger(p_event_id uuid)`** — full `event_transactions` ledger with
  contributor name/flat/block, category, sponsor fields, receipt `image_url`, and running balance.
  Note `contributions` in the existing RPC lumps sponsor income in with resident contributions and
  renders it as "Resident" with a null name (`communities.js:1288`) — the ledger must separate
  `contributor_user_id` income, sponsor income, and expense.
- **`platform_get_fund_collection_coverage(p_event_id uuid)`** — contributed vs not-contributed
  resident counts per block, using the `unique_income_contribution_per_member` partial index
  semantics (one income row per resident per fund). This is the "how much of the society has
  actually paid" number.

### 2.6 Events, coordinators, and provider reports

- `platform_get_community_events(p_community_id uuid DEFAULT NULL)` — event rows joined to poster
  name/flat and contact count, plus category and published/cancelled status.
- `platform_get_event_organizers(p_community_id uuid DEFAULT NULL)` — current grant holders from
  `community_event_organizers`, joined to `profiles`, with each one's `events_posted` count.
- `platform_set_event_organizer(p_community_id, p_target_user_id)` /
  `platform_remove_event_organizer(p_community_id, p_target_user_id)` — grant/revoke. Mirror the
  guards in `platform_set_fund_treasurer` (`20260820000000`): reject a target who is removed,
  belongs to another community, or is a platform `admin`. Leads may hold the grant (they can post
  regardless, but an explicit grant is harmless and keeps the list honest). Idempotent insert via
  the existing `UNIQUE (community_id, user_id)`.
- `platform_resolve_provider_report(p_report_id uuid, p_status text)` — fixes §1.3; sets
  `status`/`reviewed_by`/`reviewed_at`, validates `p_status IN ('reviewed','dismissed')`.

---

## Phase 3 — Console rework

### 3.1 Community detail becomes tabbed — `admin-dashboard/js/communities.js`

`renderCommunityDetailView()` is currently one 570-line template literal (`:241-814`). Split it into
one render function per tab, with a persistent header and an always-visible at-a-glance strip:

```
IRA Aspiration                            CODE: B4UVX8      [Export CSV]
┌ 6 residents · 2 leads · 7 drops · ₹3,300 sales · 2 funds · ₹49,500 ┐
 Overview │ People & Roles │ Commerce │ Funds │ Events
─────────────────────────────────────────────────────────────────────
```

| Tab | Panels |
|---|---|
| **Overview** | Community info; at-a-glance metric grid; activity sparkline (new signups / orders / contributions over 90d); funds activation status |
| **People & Roles** | Community Leads (+ appoint/demote, **ungated** per §1.2); **Events Coordinators (new)** — list, appoint, revoke; Fund Roles per fund with treasurer replace **and collector add** (§1.2); Residents Directory with server-side-friendly search |
| **Commerce** | Pre-Order Food Drops with a **By host** / **By drop** toggle (`platform_get_preorder_hosts` / `…_preorders`); Businesses with **By owner** / **By category** / **By listing** toggle; provider summary linking into `#providers?communityId=…` |
| **Funds** | Per-fund cards showing Collected / Spent / Balance (not balance alone); fund modal gains the full ledger and collection-coverage bar (§2.5) |
| **Events** | Community events list with category chips, poster, status, contact count; upcoming vs past counts |

Blocks / Towers and Flats Inventory move under **People & Roles** (they define collection scopes).
Tab state lives in the hash — `#communities?id=…&tab=commerce` — so a tab is linkable and the
existing router query parsing (`router.js:58-70`) already supports it.

### 3.2 Dashboard becomes the platform pitch view — `dashboard.js`, `index.html`

- Metric cards fed by v3, with the Platform Overview genuinely aggregating (it will, once §1.1 and
  §2.2 land).
- A **Communities table** below the cards driven by `platform_get_communities_overview()` —
  members, leads, drops, revenue, listings, funds balance, events, last activity — sortable, each
  row linking into that community's detail. This is the single most useful screen for a funding
  conversation and does not exist today.
- Keep the providers-by-category chart; it starts working on Platform Overview after §2.3.
- Trend chart: signups / orders / contributions over the last 90 days, from the same activity view.

### 3.3 Approvals and Funds Requests

- **Approvals** (`approvals.js:17-21`) shows only `status = 'pending'`. Add a status filter
  (Pending / Approved / Rejected / All) so decision history is visible.
- **Funds Requests** (`funds-requests.js:32-35`) fetches every request ever filed with no status
  filter and no limit, and the detail view renders nothing about a decided request — the current
  screen shows "Approved"/"Rejected" with no who, when, or why. Surface `decided_by`, `decided_at`,
  `rejection_reason`, and the current `funds_enabled` state; add a status filter.

### 3.4 CSV export

One `exportCsv(rows, filename)` helper in `utils.js` (Blob + `URL.createObjectURL`), wired to the
communities table, the per-host and per-owner rollups, the residents directory, and the fund ledger.
Investor diligence asks for a spreadsheet, not a screenshot.

### 3.5 Visual polish — `admin-dashboard/css/styles.css`

Scoped, not a redesign: tab bar, sortable table headers, the at-a-glance stat strip, a proper
inline error banner (replacing `alert()` for read failures — keep `confirm()` for destructive
writes), skeleton loaders instead of the full-page spinner, and an empty state that distinguishes
"no data" from "failed to load". Pull the hardcoded colours back onto the existing `:root` tokens
(`styles.css:144, 314, 323, 333, 342`; `charts.js:32, 47, 61, 73`; `communities.js:536`;
`index.html:30`) so the chart and the console cannot drift apart.

---

## Files touched

**New:** `admin-dashboard/js/utils.js`; five migrations under `supabase/migrations/`
(`20260910000000` … `20260910000400`).

**Modified:** `admin-dashboard/index.html`, `css/styles.css`, and all six page controllers under
`admin-dashboard/js/` — `dashboard.js`, `communities.js`, `providers.js`, `funds-requests.js`,
`approvals.js`, `auth.js`.

**Not touched:** everything under `app/`, `components/`, `lib/` (per the scope decision). The
`AuthContext` heartbeat call from §2.1c is the one carve-out and will be raised separately.

---

## Docs (part of the change set, not a follow-up)

- `docs/platform-admin.md` — owns all of this. Rewrite the page inventory, add the tabbed detail
  structure, the new RPC list, and the DAU/MAU provenance. Also fix two stale claims already found:
  §1/§6 say `public/admin/` "is committed and is what actually ships" and tell you to `diff` against
  it, but it is gitignored (`.gitignore:38`) and stale; §6 references `npm run db:push`, which
  deliberately does not exist.
- `docs/architecture.md` — new tables/columns (`profiles.last_active_at`), the activity view, and
  every new `platform_*` RPC in the RPC index.
- `docs/CLAUDE.md` §9 — add the traps this audit uncovered: *"`profiles` has no `updated_at` — do
  not write activity queries against it"*, and *"a `SECURITY DEFINER` RPC that returns zeros rather
  than raising will look like an empty community; always check `error`."*
- `.github/app-summary.md` — one line for the events-coordinator admin surface.

---

## Verification

There is no test framework, and `npx tsc --noEmit` does **not** cover `admin-dashboard/` (plain JS).
So verification is: syntax check → deploy → drive the console.

1. `node --check admin-dashboard/js/<each file>.js`
2. `npm run db:push:prod` → `npm run types:prod` → `npx tsc --noEmit`
   (the `:preprod` variants still carry the `PREPROD_REF_TODO` placeholder and fail by design)
3. `node build-admin.js`, then hard-refresh — the console is plain `<script src>` with no cache busting.
4. **Do not** test the new RPCs with `supabase db query --linked`: that connection is not an
   authenticated admin, so an `is_platform_admin()`-gated function raises. Replicate the inner query
   via MCP `execute_sql`, or exercise it through the signed-in console.
5. Manual pass, checking against the known live values (6 residents · 2 providers · 7 drops ·
   7 orders · 1 listing · 2 funds · ₹50,000 income · ₹500 expense · 2 community events ·
   0 coordinators):
   - Dashboard on **All Communities** shows non-zero everything and a populated category chart.
   - Switching to IRA Aspiration and back changes the numbers coherently.
   - Communities table totals reconcile with the per-community detail.
   - Adding a flat succeeds (it cannot today).
   - Appointing a president works on a community with funds disabled.
   - Appointing and revoking an events coordinator round-trips; the count moves 0 → 1 → 0.
   - Resolving a provider report succeeds (it cannot today).
   - Food drops **By host** totals equal the **By drop** totals.
   - Fund Collected − Spent equals Balance and equals ₹49,500.
   - Provider search filters; providers table columns line up.
   - A resident named `O'Brien "Test"` renders correctly and their row actions still fire.
6. **Silent-zero check** (`docs/platform-admin.md` §5, item 10): with a community that genuinely has
   data, confirm no panel reads zero. Three panels reading zero simultaneously is the RLS symptom,
   not an empty community.

---

## Sequencing

**1** Phase 1 correctness → the console tells the truth (visible fix, smallest diff).
**2** Phase 2 migrations → the data exists to display.
**3** Phase 3 rework → the console presents it.
**4** Docs.

Phase 1 is independently shippable and worth landing first.
