# Platform Admin Console

> The web-only console at `admin-dashboard/`. Covers the role model, every page, the RPCs each page calls, setup, and a verification checklist.
> Consolidates the former `platform-admin-setup.md`.

---

## 1. What it is

A standalone **vanilla HTML/CSS/JS single-page app** — no build step, no framework. Supabase JS and Chart.js load from CDNs. It is deployed alongside the Expo web export: `npm run build` runs `node build-admin.js`, which copies `admin-dashboard/` into `dist/admin` and `public/admin`, and `vercel.json` rewrites `/admin*` to it.

```
admin-dashboard/
  index.html            # shell + sidebar nav
  css/styles.css
  js/
    supabase-config.js  # client init
    auth.js             # sign-in gate; verifies via is_platform_admin() RPC
    router.js           # hash router
    dashboard.js        # #dashboard
    approvals.js        # #approvals
    communities.js      # #communities
    providers.js        # #providers
    funds-requests.js   # #funds-requests
```

**Platform admins cannot use the mobile app.** On web the root layout hard-redirects them to `/admin/index.html`; on native they land on `/admin-redirect`, which explains the console is web-only.

> ### ⚠️ `admin-dashboard/` is source, not what gets served
>
> `node build-admin.js` copies it to **`dist/admin/`** *and* **`public/admin/`**. `dist/` is gitignored, but **`public/admin/` is committed and is what actually ships**. Editing `admin-dashboard/js/*.js` alone changes nothing a user sees — you must run `node build-admin.js` (or `npm run build`) and commit the `public/admin/` copy in the same change set.
>
> A local static server pointed at the repo root serves the *built* copy too, so a source-only edit will look like "my fix didn't work" even on localhost. Hard-refresh after rebuilding — the console is plain `<script src>` with no cache busting.

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
| **RPCs** | `platform_get_community_dashboard_v2` with a fallback to `platform_get_community_dashboard`; `platform_get_providers_by_category` |
| **Behavior** | Admin picks a community from a dropdown. Eight metric cards: Residents, Service Providers, Scheduled Visits (upcoming), Completed Visits, Past Visits (last 30 days), Hires/Contacts (total + monthly), Orders Placed (with pending/fulfilled split), and Funds Health (collected vs spent). A horizontal bar chart breaks providers down by category, and collapsible cards list the top 3 rated providers per category. |

### `#approvals` — community creation requests

| Aspect | Details |
|--------|---------|
| **Tables / RPCs** | Reads `community_requests`, `profiles`; writes via `platform_approve_community_request`, `platform_reject_community_request`; audit via `set_audit_actor` |
| **Behavior** | Approval creates the community, generates its join code, sets requester as community lead (`president`), and matches requester flat against seeded inventory. The admin can pre-fill or customize blocks and seed flat inventories automatically via `p_flats` payload. Rejection accepts an optional reason. Reviewer cards show requester name, phone, email, flat number, and submitted location/block details. |

### `#communities` — directory and detail

| Aspect | Details |
|--------|---------|
| **Direct table reads** | `communities`, `profiles` only |
| **RPCs** | `list_community_blocks`, `platform_get_community_funds`, `platform_get_community_preorders`, `platform_get_community_businesses`, `platform_get_resident_details`, `platform_soft_remove_resident`, `platform_remove_resident_from_community`, `platform_delete_user`, `platform_set_community_lead`, `platform_remove_community_lead`, `platform_set_fund_treasurer`, `platform_set_blocks_enabled`, `platform_set_block_label`, `platform_add_community_block`, `platform_archive_community_block`, `platform_remove_block_in_charge`, `platform_revoke_funds_access`, `set_audit_actor` |
| **Behavior** | Lists communities with membership and lead counts. Detail view is described panel-by-panel below. Supports clean removal from community (`platform_remove_resident_from_community`) and permanent account deletion (`platform_delete_user`), both preserving last-lead protection. |

**Detail view panels**

| Panel | What it shows / does |
|-------|----------------------|
| Community info | Name, join code, type, area, pincode, created date |
| Community Leads | Active `president` / `vice_president` with a **Demote** action. Blocked from demoting the last remaining lead. |
| Funds Activation | Status, per-fund balance cards (click → fund modal with financial summary, treasurer, collectors, contributions), and **Revoke Funds Access** |
| Community Lead Management | Appoint any active plain resident as **President** or **VP**. `platform_set_community_lead` auto-demotes the current holder of that role first, so appointing is also how you *replace*. Shown only when funds are enabled. |
| Blocks / Towers | Enable toggle, Block/Tower label switch, add/archive blocks |
| **Flats Inventory** | Canonical list of units grouped by block, total flat counts, bulk add flat numbers, and individual flat archival |
| **Fund Roles** | **One card per fund**, each listing that fund's **Treasurer** and its **Block Collectors** (name, flat, block scope). Collectors have a Remove action; the treasurer has an **Assign / Replace** picker. Grouped per fund because both roles are fund-scoped, not community-scoped — a community with three funds has three independent treasurers. |
| Pre-Order Food Drops & Statistics | Per-drop table (title, host, fulfillment date/time, status, orders, revenue) with totals and a ₹ sales badge |
| Businesses Available in Community | Per-listing table (name, owner, category, phone with WhatsApp link, product count, rating, active status) |
| Residents Directory | Searchable table; row opens a resident modal with activity counts and a remove action |

**Treasurer management.** `platform_set_fund_treasurer(p_event_id, p_target_user_id)` assigns or replaces a fund's treasurer in one transaction — it deletes the existing treasurer row before inserting the new one, which is what keeps the "at most 1 treasurer per fund" trigger (`validate_fund_role_change`) satisfied mid-statement. It rejects a target who is removed, belongs to another community, or is an `admin`/`president`/`vice_president`, mirroring the eligibility rule the mobile fund-creation screen already applies.

Community leads can manage their own funds' treasurers directly through `fund_roles` RLS, but those policies key on `get_user_community_id()` and therefore never apply to a platform admin — hence the dedicated RPC.

### `#providers` — provider moderation

| Aspect | Details |
|--------|---------|
| **RPCs** | `platform_get_all_providers`, `platform_get_provider_details`, `platform_delete_service_provider` |
| **Behavior** | Cross-community provider list with a community filter. Detail view shows the provider profile alongside its reports and reviews so an admin can judge an abuse report before deleting. |

### `#funds-requests` — funds activation

| Aspect | Details |
|--------|---------|
| **Tables / RPCs** | Reads `funds_access_requests`, `communities`, `profiles`; writes via `platform_approve_funds_access_request`, `platform_reject_funds_access_request` |
| **Behavior** | Approval requires designating an **active resident** as community lead — it defaults to the requester and, in one transaction, sets `funds_enabled = true` and promotes that resident to `president`. The RPC rejects a designee who is not an active `resident` of the request's community. Rejection supports a 280-character reason. Lists update inline after a decision. |

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

---

## 6. Validation commands

```bash
npm run db:push
npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj
npx tsc --noEmit
```

Note that `npx tsc --noEmit` does **not** cover `admin-dashboard/` — it is plain JavaScript with no type checking. Console changes must be verified by running the console. `node --check admin-dashboard/js/<file>.js` catches syntax errors but nothing semantic.

After any console edit:

```bash
node --check admin-dashboard/js/communities.js   # syntax only
node build-admin.js                              # REQUIRED — see §1
diff admin-dashboard/js/communities.js public/admin/js/communities.js   # must be identical
```

To confirm an RPC returns what you expect without going through the browser, query it directly — but note a `SECURITY DEFINER` function gated on `is_platform_admin()` will **raise** under `supabase db query --linked` (that connection is not an authenticated admin user). Replicate the function's inner query instead:

```bash
npx supabase db query --linked "select ..."   # replicate the body, not the RPC call
```

---

## 7. Scope boundaries

- No admin UI exists for cross-community partnerships, groups, or announcement moderation, even though those objects are live in the database. Building one requires updating [`features.md`](features.md), [`architecture.md`](architecture.md), and [`cross-community.md`](cross-community.md) together, plus an entry in [`cross-community-changelog.md`](cross-community-changelog.md).
- The console is **not** multi-tenant-scoped: platform admins see across all communities by design.
