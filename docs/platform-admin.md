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

---

## 2. Role model

| Role | Rule |
|------|------|
| `admin` | Platform admin. **Must have `profiles.community_id = NULL`.** Ultimate powers across every community — everything a president/VP can do and more. |
| `president` / `vice_president` | Community leads. Identical powers; the distinction is presentational. |
| `resident` | Default member |

These four are the complete enum. `community_lead` and `community_admin` were physically dropped from `app_role_type` on 2026-08-22 (`20260822000200`); the console no longer renders them.

Notes:

- `societyservicehub@gmail.com` is the canonical platform-admin identity. Client routing treats it as `admin` even before profile hydration completes, and migrations restore `app_role = 'admin'` with a null community if the profile is ever reset.
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
| **Behavior** | Approval creates the community, generates its join code, and assigns the requester as `resident`. The admin can optionally seed blocks/towers at approval time by entering block names and choosing the label — supplying blocks sets `blocks_enabled = true` and the matching `block_label`. Rejection accepts an optional reason. Reviewer cards show requester name, phone, email, flat number, and submitted location details. |

### `#communities` — directory and detail

| Aspect | Details |
|--------|---------|
| **RPCs** | `list_community_blocks`, `platform_get_community_funds`, `platform_get_resident_details`, `platform_soft_remove_resident`, `platform_set_community_lead`, `platform_remove_community_lead`, `platform_set_blocks_enabled`, `platform_set_block_label`, `platform_add_community_block`, `platform_archive_community_block`, `platform_remove_block_in_charge`, `platform_revoke_funds_access`, `set_audit_actor` |
| **Behavior** | Lists communities with membership and lead counts. Detail view covers funds status with a revoke action, appointing or removing a lead as **President or VP**, block list management including the Block/Tower label toggle, block in-charge removal across funds, and resident inspection. Removals are **soft deletes**: they set `removed_at`/`removed_by`, reset the role to `resident`, and preserve last-lead protection. |

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

---

## 6. Validation commands

```bash
npm run db:push
npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj
npx tsc --noEmit
```

Note that `npx tsc --noEmit` does **not** cover `admin-dashboard/` — it is plain JavaScript with no type checking. Console changes must be verified by running the console.

---

## 7. Scope boundaries

- No admin UI exists for cross-community partnerships, groups, or announcement moderation, even though those objects are live in the database. Building one requires updating [`features.md`](features.md), [`architecture.md`](architecture.md), and [`cross-community.md`](cross-community.md) together, plus an entry in [`cross-community-changelog.md`](cross-community-changelog.md).
- The console is **not** multi-tenant-scoped: platform admins see across all communities by design.
