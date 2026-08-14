# Platform Admin Console

> The web-only console at `admin-dashboard/`. Covers the role model, every page, the RPCs each page calls, setup, and a verification checklist.
> Consolidates the former `platform-admin-setup.md`.

---

## 1. What it is

A standalone **vanilla HTML/CSS/JS single-page app** — no build step, no framework. Supabase JS and Chart.js load from CDNs. It is deployed alongside the Expo web export: `npm run build` runs `node build-admin.js`, which copies `admin-dashboard/` into `dist/admin`, and `vercel.json` rewrites `/admin*` to it.

```
admin-dashboard/
  index.html            # shell + sidebar nav
  css/styles.css
  js/
    utils.js            # esc/format/CSV/error helpers — MUST load first
    supabase-config.js  # client init
    auth.js             # sign-in gate; verifies via is_platform_admin() RPC
    router.js           # hash router
    charts.js           # Chart.js wrappers (category bar, activity trend)
    dashboard.js        # #dashboard
    approvals.js        # #approvals
    communities.js      # #communities
    providers.js        # #providers
    funds-requests.js   # #funds-requests
```

`utils.js` is loaded before every controller and owns the shared helpers: `esc`/`escAttr`, the `fmt*` formatters, `badge`/`statusBadge`/`roleLabel`, `buildWhatsAppUrl`, `errorBanner`/`emptyState`/`emptyRow`, `unwrap`, `exportCsv`, `debounce`, `sortRows`, and `normalizeCommunityId`. Do not redeclare any of them in a page controller — a top-level `const` in a second file collides with the global and throws a `SyntaxError` that blanks the whole console.

**Platform admins cannot use the mobile app.** On web the root layout hard-redirects them to `/admin/index.html`; on native they land on `/admin-redirect`, which explains the console is web-only.

> ### ⚠️ `admin-dashboard/` is source, not what gets served
>
> `node build-admin.js` copies it to **`dist/admin/`**, which is gitignored and rebuilt on deploy. Editing `admin-dashboard/js/*.js` alone changes nothing a user sees — run `node build-admin.js` (or `npm run build`) and hard-refresh, since the console is plain `<script src>` with no cache busting.
>
> `public/admin/` was once a second, committed copy. It is now untracked and gitignored — never edit it, and never diff against it.

---

## 1a. Data access rules — the console's single biggest trap

**A platform admin has no RLS grant on community-scoped tables.** `is_platform_admin()` is `app_role = 'admin' AND community_id IS NULL`, so every policy keyed on `get_user_community_id()` evaluates against `NULL` and matches nothing. Tables like `fund_roles`, `mcn_preorder_orders`, and `mcn_listings` are additionally scoped to the owner/buyer/host.

The failure mode is silent: PostgREST returns `[]` with **no error**, so the console renders a perfectly healthy-looking page full of zeroes.

> **Rule: the console must read community data through a `platform_*` `SECURITY DEFINER` RPC — never a direct `supabase.from('<table>')` query.** Those RPCs bypass RLS and gate on `is_platform_admin()` internally.

This exact bug produced three simultaneous wrong readings on `#communities` (empty Block In-Charges, ₹0 sales despite completed orders, 0 businesses despite live listings), all fixed on 2026-08-06 by routing through `platform_get_community_funds`, `platform_get_community_preorders`, and `platform_get_community_businesses`.

Corollary: **always check `error` on an RPC call.** The original code destructured only `data`, so when a query did fail the console degraded to zeroes instead of surfacing the problem.

Direct `supabase.from(...)` reads are still fine for tables a platform admin genuinely owns policies on — `communities`, `profiles`, `community_requests`, `funds_access_requests`.

---

## 2. Role model

| Role | Rule |
|------|------|
| `admin` | Platform admin. **Must have `profiles.community_id = NULL`.** Ultimate powers across every community — everything a president/VP can do and more. |
| `president` / `vice_president` | Community leads. Identical powers; the distinction is presentational. |
| `resident` | Default member |

These four are the complete enum. `community_lead` and `community_admin` were physically dropped from `app_role_type` on 2026-08-22 (`20260822000200`); the console no longer renders them.

Notes:

- There are **two** platform admins: `thewooru@gmail.com` and `societyservicehub@gmail.com` (retained from before the Wooru rebrand). Both hold the role through their profile row — `app_role = 'admin'` with `community_id IS NULL`.
- `thewooru@gmail.com` is additionally the **canonical** identity: it is the one address hardcoded in `is_platform_admin()` and `handle_new_user()`, and the one client routing treats as `admin` before profile hydration completes. It is the break-glass path if a profile row is ever reset.
- A platform admin **cannot also be a resident**: `is_platform_admin()` requires `community_id IS NULL`, and `profile_block_guard` rejects a `block_id` that outlives its community. Promoting an existing resident account clears its community, block, and flat number.
- Client routing gives `app_role = 'admin'` precedence even when `profiles.community_id` is stale — but the database value should still be corrected to `NULL`.
- Approving a **community request** assigns the requester as `resident`. Approving a **funds-access request** is what promotes someone to `president`.
- There is no `community_admin` promotion workflow, and no admin UI for cross-community federation.

---

## 3. Pages

### `#dashboard` — metrics and provider analytics

| Aspect | Details |
|--------|---------|
| **RPCs** | `platform_get_community_dashboard_v3`, `platform_get_providers_by_category`, `platform_get_activity_trend`, `platform_get_communities_overview` |
| **Behavior** | Admin picks a community, or the **All Communities** option, which passes `NULL` and aggregates platform-wide. Ten metric cards: Residents & Activity (DAU/WAU/MAU), Growth (new residents 30d), Pre-Order Food, Local Businesses, Providers, Community Events, Visits Planned, Visits Done, Hires/Contacts, Funds Health. Below: a 90-day activity trend line chart, a providers-by-category bar chart with collapsible top-3-rated cards, and a sortable **All Communities** table (members, MAU, providers, drops, food revenue, listings, fund balance, events, last active) with CSV export. Every card except Growth and the visit/hire cards deep-links into the relevant community tab. |

> **`ALL` is a UI sentinel, not a value.** The dropdown's first option has `value="ALL"`; `normalizeCommunityId()` in `utils.js` translates it to `NULL` exactly once. Passing the literal string `'ALL'` as a `uuid` is what made every dashboard RPC fail — and because the failures were swallowed, the page rendered a full grid of zeroes instead of an error.

**DAU / WAU / MAU provenance.** `platform_get_community_dashboard_v2` computed these from `profiles.updated_at`, **a column that has never existed** — so v2 raised on every call and the console silently ran on the v1 fallback for its entire life. v3 reads `public.user_last_seen`, which merges two signals (`20260910000000`):

- `profiles.last_active_at` — an explicit heartbeat, written only by `touch_last_active()` (no arguments, stamps `auth.uid()` only).
- `public.v_user_activity` — a derived view UNIONing the timestamps of deliberate user writes (pre-orders, drops, listings, ratings, hires, visits, events, fund transactions), so the metric has history predating the heartbeat.

> **Open follow-up:** nothing calls `touch_last_active()` yet. The mobile app needs a `supabase.rpc('touch_last_active')` on foreground in `context/AuthContext.tsx`. Until that ships, DAU/WAU/MAU are carried entirely by the derived signal, which counts users who *wrote* something and therefore undercounts passive browsing.

### `#approvals` — community creation requests

| Aspect | Details |
|--------|---------|
| **Tables / RPCs** | Reads `community_requests`, `profiles`; writes via `platform_approve_community_request`, `platform_reject_community_request`; audit via `set_audit_actor` |
| **Behavior** | A status filter (Pending / Approved / Rejected / All, default Pending) makes decision history browsable — the page used to show only `pending`, so there was no way to see what had already been decided. Approval creates the community, generates its join code, sets requester as community lead (`president`), and matches requester flat against seeded inventory. The admin can pre-fill or customize blocks and seed flat inventories automatically via `p_flats` payload. Rejection accepts an optional reason. Decided cards render read-only, showing the outcome, decision date, rejection reason, and a link into the resulting community. |

### `#communities` — directory and detail

| Aspect | Details |
|--------|---------|
| **Direct table reads** | `communities`, `profiles` only |
| **RPCs** | `platform_get_communities_overview`, `list_community_blocks`, `list_community_flats`, `platform_get_community_funds`, `platform_get_fund_ledger`, `platform_get_fund_collection_coverage`, `platform_get_community_preorders`, `platform_get_preorder_hosts`, `platform_get_community_businesses`, `platform_get_business_owners`, `platform_get_business_categories`, `platform_get_community_events`, `platform_get_event_organizers`, `platform_set_event_organizer`, `platform_remove_event_organizer`, `platform_get_resident_details`, `platform_remove_resident_from_community`, `platform_delete_user`, `platform_set_community_lead`, `platform_remove_community_lead`, `platform_set_fund_treasurer`, `platform_assign_block_in_charge`, `platform_remove_block_in_charge`, `platform_set_blocks_enabled`, `platform_set_block_label`, `platform_add_community_block`, `platform_archive_community_block`, `platform_add_community_flats`, `platform_archive_community_flat`, `platform_revoke_funds_access`, `set_audit_actor` |
| **Behavior** | The list is one card per community from `platform_get_communities_overview` — members, leads, drops, listings, events, fund balance and last-active. Detail is a **tabbed** view; both are driven by the hash so they are linkable. |

**The list no longer reads `profiles` in bulk.** It used to fetch every profile row on the platform into the browser just to count members per card — the read most likely to be silently truncated by PostgREST's row cap as the platform grows, with no error surfaced. One RPC replaces it.

**Detail view — hash-driven tabs**

The URL is `#communities?id=<uuid>&tab=<key>`. A persistent header carries the community name, join code, a **Export CSV** button, and an always-visible stat strip (residents · leads · food drops · food sales · active businesses · funds · fund balance · upcoming events).

| Tab | Panels |
|-----|--------|
| **Overview** | Community information; feature status (funds, blocks, flats on record, coordinators) with **Revoke Funds Access**; at-a-glance mini-metrics; **Top Contributors** — the residents actually driving activity, drawn from the host / owner / coordinator rollups |
| **People & Roles** | Community Leads · **Events Coordinators** · Blocks/Towers · Flats Inventory · Fund Roles · Residents Directory |
| **Commerce** | Pre-Order Food Drops (**By drop** / **By host**) · Resident Businesses (**By listing** / **By owner** / **By category**) · a link into `#providers` filtered to this community |
| **Funds** | Per-fund cards showing **Collected / Spent / Balance** with a spend progress bar; opening one gives the full ledger and collection coverage |
| **Events** | Community events table (title, category, when, poster + why they could post, contact count, status) and the coordinators panel |

**Panel notes**

| Panel | What it shows / does |
|-------|----------------------|
| Community Leads | Active `president` / `vice_president` with a **Demote** action, plus the appointment picker. `platform_set_community_lead` auto-demotes the current holder of that role first, so appointing is also how you *replace*. Blocked from demoting the last remaining lead. **Not gated on funds** — a community that has never requested funds still needs a president, and the RPC has no funds precondition. |
| **Events Coordinators** | The `community_event_organizers` grant — list, appoint, revoke, with each holder's posted-event count. See §3a. |
| Blocks / Towers | Enable toggle, Block/Tower label switch, add/archive. **This is the only path** — as of 2026-08-14 (`20260908000200`) the president's in-app screen is read-plus-rename, and `set_community_blocks_enabled` / `add_community_block` / `archive_community_block` are revoked from `authenticated`. See [`features.md`](features.md) §Blocks / towers. |
| Flats Inventory | Canonical list of units grouped by block, totals, bulk add, individual archival. `platform_add_community_flats` takes **three** arguments — `p_community_id` has no default, and omitting it made PostgREST fail to resolve the function, so adding flats never worked at all until 2026-09-10. |
| **Fund Roles** | **One card per fund**, each with that fund's Treasurer (Assign/Replace picker) and Block Collectors (**Add** with an optional block scope, and Remove). Grouped per fund because both roles are fund-scoped, not community-scoped. |
| Pre-Order Food Drops | **By drop**: title, host, fulfillment, status, cutoff, orders, revenue. **By host** (`platform_get_preorder_hosts`): drops, open drops, orders, distinct buyers, average order value, revenue. The two views' totals must agree. |
| Resident Businesses | **By listing**, **By owner** (`platform_get_business_owners`), **By category** (`platform_get_business_categories`). WhatsApp links go through `buildWhatsAppUrl`, which adds the `91` prefix at link time — stored numbers are 10 digits. |
| Residents Directory | Searchable; typing re-renders only the `<tbody>`, so the caret stays put. Rows show the events-coordinator grant alongside the app role. Opening a resident gives real per-resident activity (drops hosted and revenue, businesses listed, events posted, visits created). |
| Fund modal | Collected / Spent / Balance / **Coverage %**, per-block collection coverage bars, treasurer, collectors, and the **full ledger** (`platform_get_fund_ledger`) with a running balance and CSV export. The ledger separates `resident_contribution`, `sponsor_contribution`, `other_income` and `expense` — `platform_get_community_funds`'s `contributions` array lumps sponsor income in with resident contributions and renders it as a nameless "Resident". |

**Treasurer management.** `platform_set_fund_treasurer(p_event_id, p_target_user_id)` assigns or replaces a fund's treasurer in one transaction — it deletes the existing treasurer row before inserting the new one, which is what keeps the "at most 1 treasurer per fund" trigger (`validate_fund_role_change`) satisfied mid-statement. It rejects a target who is removed, belongs to another community, or is an `admin`/`president`/`vice_president`, mirroring the eligibility rule the mobile fund-creation screen already applies.

Community leads can manage their own funds' treasurers directly through `fund_roles` RLS, but those policies key on `get_user_community_id()` and therefore never apply to a platform admin — hence the dedicated RPC.

### 3a. Events coordinators — the third role the console manages

The **events coordinator** is the grant that lets a resident post community events. It is deliberately *not* an `app_role_type` value: `profiles.app_role` is single-valued, so an enum entry would force a choice between "president" and "events coordinator" for the same person. It is a grant row in `community_event_organizers (community_id, user_id, granted_by)`, unique per `(community_id, user_id)`, mirroring `fund_roles`.

Who can post an event: **a resident holding the grant, or a president / vice president.** Leads can always post without holding it, so an empty coordinator list does not mean nobody can post.

In the app, leads manage this at `/events/coordinators`. The console needs its own path because `community_event_organizers` policies key on `get_user_community_id()`, which is `NULL` for a platform admin — a direct read returns `[]` with no error. Hence `platform_get_event_organizers`, `platform_set_event_organizer`, and `platform_remove_event_organizer` (`20260910000300`).

Guards on the write RPCs mirror `platform_set_fund_treasurer`: the target must exist, not be removed, belong to *this* community, and not be a platform `admin`. Granting is idempotent (`ON CONFLICT DO NOTHING`); revoking raises if the resident does not hold the grant, rather than reporting a success it did not achieve. **Revoking never touches events the person already posted** — they stay published and attributed, exactly as when a lead revokes in the app.

### `#providers` — provider moderation

| Aspect | Details |
|--------|---------|
| **RPCs** | `platform_get_all_providers`, `platform_get_provider_details`, `platform_delete_service_provider`, `platform_resolve_provider_report`, `set_provider_moderation_state` |
| **Behavior** | Cross-community provider list with a community filter and a working search box (it had no listener at all before 2026-09-10). Detail view shows the provider profile alongside its reports and reviews so an admin can judge an abuse report before deleting. |

**Resolving a report needs the RPC.** The console used to `UPDATE provider_reports` directly, which could never succeed: that table's UPDATE policy requires `is_user_approved(auth.uid())`, which requires `community_id IS NOT NULL` — the exact opposite of what `is_platform_admin()` requires. The follow-up `.select('id')` was blocked by the SELECT policy too, so every attempt reported "Update failed". Use `platform_resolve_provider_report(p_report_id, p_status)`; `p_status` must be `reviewed` or `dismissed`.

### `#funds-requests` — funds activation

| Aspect | Details |
|--------|---------|
| **Tables / RPCs** | Reads `funds_access_requests`, `communities`, `profiles`; writes via `platform_approve_funds_access_request`, `platform_reject_funds_access_request` |
| **Behavior** | A status filter (Pending / Approved / Rejected / All, default Pending) replaces the old unfiltered, unbounded list. Approval requires designating an **active resident** as community lead — it defaults to the requester and, in one transaction, sets `funds_enabled = true` and promotes that resident to `president`. The RPC rejects a designee who is not an active `resident` of the request's community. Rejection supports a 280-character reason. A decided request shows its outcome, decision date, rejection reason, and current `funds_enabled` state, with a link into the community. |

Unknown hashes fall back to `#dashboard`.

---

## 4. Running it locally

```bash
npx serve admin-dashboard      # any static server works
```

Then open the served URL and sign in with the platform-admin account. `auth.js` gates access by calling the `is_platform_admin()` RPC — a non-admin session is rejected even if it reaches the page.

For the full deployed path: `npm run build` then `npm run preview`, and visit `/admin`.

---

## 5. Verification checklist

1. **Identity** — `profiles.app_role = 'admin'` and `profiles.community_id IS NULL` for the admin account.
2. **Approval flow** — approving on `#approvals` creates a `communities` row, assigns the requester as `resident`, and generates a join code.
3. **Rejection flow** — status updates and the optional reason is stored.
4. **Community inspection** — `#communities` loads the list with member and lead counts; opening one loads residents, block settings, and active leads.
5. **Lead management** — appointing a lead sets `president` or `vice_president`; removal resets to `resident` and last-lead protection holds.
6. **Funds activation** — approving on `#funds-requests` sets `funds_enabled = true` and promotes the designated resident to `president`; revoking disables funds and blocks, demotes the lead, and **leaves `events`/`event_transactions` intact**.
7. **Resident removal** — sets `removed_at` and `removed_by` and resets the role.
8. **Provider moderation** — `#providers` loads reports and reviews; deletion removes the provider.
9. **Audit** — audited profile changes create `profile_audit_log` rows.
10. **No silent zeroes** — on a community with real activity, `#communities` detail shows non-zero Block In-Charges, pre-order sales, and business listings. All three reading zero at once is the RLS symptom described in §1a, not an empty community.
11. **Fund Roles grouping** — a community with more than one fund renders one card per fund, each with its own treasurer and collectors.
12. **Treasurer replace** — picking a resident and clicking Replace swaps the treasurer without tripping the one-treasurer-per-fund trigger.
13. **Platform Overview aggregates** — selecting *All Communities* shows non-zero metrics and a populated providers-by-category chart. Both used to read zero: the `'ALL'` sentinel was passed through as a `uuid`, and `platform_get_providers_by_category` had no `NULL` branch.
14. **Rollup totals reconcile** — Commerce → *By host* totals equal *By drop* totals; the dashboard's All Communities table sums to the per-community detail.
15. **Coordinator round trip** — appointing an events coordinator then revoking moves the count 0 → 1 → 0, and events the person posted stay published.
16. **Flats add succeeds** — adding a flat number returns a count, not a PostgREST function-resolution error.
17. **Report resolution succeeds** — Mark reviewed / Dismiss on a provider report persists.
18. **Apostrophe safety** — a resident named `O'Brien "Test"` renders correctly and their row actions still fire. All values go through `esc()`; there are no inline `onclick="…('${value}')"` handlers left.

---

## 6. Validation commands

```bash
npm run db:push:prod     # there is deliberately no unsuffixed db:push
npm run types:prod       # then re-append the hand-maintained types block — CLAUDE.md §6 step 3
npx tsc --noEmit
```

Note that `npx tsc --noEmit` does **not** cover `admin-dashboard/` — it is plain JavaScript with no type checking. Console changes must be verified by running the console. `node --check admin-dashboard/js/<file>.js` catches syntax errors but nothing semantic.

After any console edit:

```bash
# syntax check every file, not just the one you edited — utils.js is shared
for f in admin-dashboard/js/*.js; do node --check "$f" || echo "FAILED $f"; done
node build-admin.js      # REQUIRED — see §1. Needs a prior `expo export --platform web`.
```

Two static checks worth running by hand, since nothing else catches them:

- **Every `supabase.rpc('name')` in `admin-dashboard/js/` must exist.** Extract the names and compare against `pg_proc` via MCP `execute_sql`. A typo'd RPC name is a runtime-only 404.
- **Every `getElementById('id')` must resolve** — either to an `id="…"` in `index.html` or to one a JS template creates. A renamed id fails silently as `null`.

To confirm an RPC returns what you expect without going through the browser, query it directly — but note a `SECURITY DEFINER` function gated on `is_platform_admin()` will **raise** under `supabase db query --linked` (that connection is not an authenticated admin user). Replicate the function's inner query instead:

```bash
npx supabase db query --linked "select ..."   # replicate the body, not the RPC call
```

---

## 7. Scope boundaries

- No admin UI exists for cross-community partnerships, groups, or announcement moderation, even though those objects are live in the database. Building one requires updating [`features.md`](features.md), [`architecture.md`](architecture.md), and [`cross-community.md`](cross-community.md) together, plus an entry in [`cross-community-changelog.md`](cross-community-changelog.md).
- The console is **not** multi-tenant-scoped: platform admins see across all communities by design.
