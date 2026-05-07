# Cross-Community Federation

> **Status: backend active, UI deferred.**
>
> The schema, RLS policies, helper functions, and RPCs described below
> are live in the database. **No UI in the current app consumes them.**
> Existing screens behave exactly as they did before this foundation
> landed. The new objects exist so future UI work has a runway.
>
> Any code change that touches a table, RPC, RLS policy, or helper
> listed in this document must update this file and append an entry to
> `docs/cross-community-changelog.md` in the same change. Do not split
> documentation into a follow-up task.

---

## 1. Goals & Non-Goals

### Goals

- Allow a community lead to establish a partnership with another community so that selected content (providers, visits, funds, announcements) can be made mutually visible.
- Allow communities to cluster into named groups that share content among all members.
- Allow an individual provider, visit, or announcement to opt into a wider audience (`partners`, `group`, or `public`) independently of partnerships.
- Keep the default user experience identical: a user with no partnerships and no group memberships sees exactly the same screens, the same data, and the same RLS behaviour as before this foundation landed.

### Non-Goals (today)

- We are **not** shipping any UI for cross-community features. There is no partnerships screen, no segmented control on the Help tab, no cross-community badges. Those land when a future task explicitly takes them on.
- We are **not** rebuilding the dropped marketplace tables. Discovery uses the existing `service_providers` model.
- We are **not** redefining `get_user_community_id()`. That helper still resolves to a single home community everywhere it is used today.
- We are **not** widening any write path implicitly. Cross-community writes only happen via dedicated `SECURITY DEFINER` RPCs that validate authorization in code.

---

## 2. Why is this in the database if no UI uses it?

1. **Schema migrations are easier in calm weather.** Adding columns and tables when the system is otherwise quiet is much cheaper than doing it under the pressure of "we want partnerships shipping tomorrow." Defaults backfill cleanly, RLS policies have nothing to collide with, and the change is reviewable in a single PR.
2. **Future UI tasks become small.** When a future task ships the partnerships screen or the cross-community providers segmented control, it does not also have to design schema, write RPCs, or defend additive-RLS choices. It calls existing RPCs and renders.
3. **The new objects are inert until someone uses them.** New tables are empty. New columns default to values that match today's single-community behaviour. The new RLS policies are permissive `SELECT` policies that union with existing ones — they only widen access for callers who satisfy the new helpers, and no caller does yet.

---

## 3. Visibility Model

Every shareable row (`service_providers`, `community_announcements`, and later `service_visits`, `events`) carries a `visibility` enum:

| Value | Meaning |
|-------|---------|
| `community` | Only the row's home community can see it. **(Default. Matches today's behaviour.)** |
| `partners` | The home community and any community in an `active` partnership where `scope -> capability = true`. |
| `group` | The home community and every co-member of any group the home community belongs to. |
| `public` | Any authenticated user, regardless of partnership. |

Independently, an explicit row in `provider_shares` / `announcement_audiences` can grant access to a specific `community`, `group`, or `partnership` even if `visibility = 'community'`. Explicit shares only widen access; they never narrow it.

### Truth Table — Provider visibility

Caller is from community **C**. Provider is from community **P** with visibility **V**.

| V → / Caller relationship to P ↓ | `community` | `partners` | `group` | `public` |
|----------------------------------|:-----------:|:----------:|:-------:|:--------:|
| C = P (own community)            | ✅          | ✅         | ✅      | ✅       |
| Active partnership C↔P with `scope.providers = true` | ❌ unless explicit share | ✅ | ✅ | ✅ |
| C and P share a group            | ❌ unless explicit share | ❌ | ✅ | ✅ |
| No relationship                  | ❌ unless explicit share | ❌ | ❌ | ✅ |

The same matrix applies to announcements with the `scope.announcements` capability.

---

## 4. Schema Reference

### New tables

| Table | Purpose |
|-------|---------|
| `community_partnerships` | Pairwise relationship between two communities. Stored once with canonical ordering `community_a_id < community_b_id`. |
| `community_groups` | Named clusters of 2+ communities. |
| `community_group_members` | Which communities belong to which groups. |
| `provider_shares` | Explicit per-target shares for a provider. Overlay on the `visibility` enum. |
| `service_visit_communities` | Which communities can see / RSVP to a cross-community visit. |
| `community_announcements` | Announcement feed with cross-community visibility. |
| `announcement_audiences` | Explicit per-target shares for announcements. |

### New columns

| Table | Column | Default | Notes |
|-------|--------|---------|-------|
| `service_providers` | `visibility` | `'community'` | Existing rows look identical to the rest of the app. |
| `service_providers` | `shared_by_community_id` | backfilled = `community_id` | Reserved for future re-shares. |
| `service_providers` | `is_verified` | `false` | Community-lead-attested badge (no UI today). |
| `service_visits` | `is_cross_community` | `false` | Existing visits stay single-community. |
| `service_visits` | `host_community_id` | backfilled = `community_id` | |
| `events` | `fund_scope` | `'community'` | Existing funds keep their RLS unchanged. |
| `events` | `partnership_id`, `group_id` | `NULL` | Mutually exclusive FKs validated by check constraint. |

### Partnership `scope` JSON shape

```json
{
  "providers":     true,
  "visits":        false,
  "funds":         false,
  "announcements": true
}
```

Capabilities default to `false` if missing. Adding a new capability is backwards-compatible: existing rows lack the new key and the helper treats it as `false`.

---

## 5. Helper Functions

> All new helpers are `SECURITY DEFINER`, `STABLE`, with `SET search_path = public`, and granted to `authenticated`.

| Function | Returns | Purpose |
|----------|---------|---------|
| `get_user_partner_community_ids(p_capability text, p_user_id uuid)` | `setof uuid` | Caller's home community plus partner and group-co-member communities, gated by the named capability flag in `partnerships.scope`. **Always includes the home community.** |
| `can_user_see_provider(p_provider_id uuid, p_user_id uuid)` | `boolean` | Visibility predicate combining `visibility` enum, partner/group set, and `provider_shares`. |
| `can_user_see_visit(p_visit_id uuid, p_user_id uuid)` | `boolean` | Predicate using `service_visit_communities` for explicit cross-community visits. |
| `can_user_see_announcement(p_announcement_id uuid, p_user_id uuid)` | `boolean` | Predicate combining `visibility` enum and `announcement_audiences`. |

### Why these are *new* helpers, not redefinitions

The existing `get_user_community_id()` is referenced by RLS on roughly every table: `events`, `event_transactions`, `ratings`, `provider_hires`, `fund_roles`, and more. Redefining it to return a set would silently widen access on tables that should remain strictly siloed (notably `event_transactions` — a community's ledger must not leak across the federation). Introducing parallel helpers preserves the meaning of the old one while letting new policies opt into the wider set explicitly. See ADR `docs/decisions/0001-additive-rls-for-cross-community.md`.

---

## 6. RLS Strategy

PostgreSQL evaluates multiple **permissive** RLS policies for the same command with `OR`. A row is visible if any policy grants access.

The existing community-scoped `SELECT` policies on `service_providers`, `service_visits`, etc. are left untouched. New policies are added with distinct names (e.g., `service_providers_select_cross_community`) that grant access via `can_user_see_*` helpers. The result is a strict superset of the previous behaviour: anyone who could see a row before this migration still can, and some callers can now see additional rows — but only if a partnership / group / non-default visibility / explicit share applies, which today is no one.

### Writes are not widened

`INSERT` / `UPDATE` / `DELETE` policies remain creator-and-community scoped. Cross-community writes (sharing a provider with a partner, co-hosting a visit) flow through `SECURITY DEFINER` RPCs that perform their own authorization checks. This keeps the write surface auditable in one place.

---

## 7. Partnership Lifecycle

```
       request_community_partnership                accept_community_partnership
   ┌────────────────────────────┐               ┌────────────────────────────┐
   │                            │   accepted_by │                            │
   ▼                            │               ▼                            │
(absent) ──────────►  pending  ─┴──────────►  active  ◄──┐                  │
                       │                         │       │                  │
                       │ revoked                 │ paused│ unpause          │
                       ▼                         ▼       │                  │
                   revoked                    paused  ───┘                  │
                                                                            │
                                                       revoked ◄────────────┘
```

- Only `community_lead` users can call lifecycle RPCs.
- The accepting lead must be on the *opposite* community from the initiator.
- `paused` blocks new cross-community access immediately; previously-visible rows become invisible until the partnership is reactivated.
- `revoked` is terminal for the row but a fresh request can be filed (the RPC uses `ON CONFLICT … DO UPDATE` to reset).

These RPCs already exist in the database. They are simply not called by any current screen.

---

## 8. RPC Surface (live in DB, no UI today)

| RPC | Caller | Purpose |
|-----|--------|---------|
| `request_community_partnership(p_target_community_id, p_scope)` | community_lead | Create or reset a `pending` partnership and notify target leads. |
| `accept_community_partnership(p_partnership_id)` | community_lead on target side | Move to `active` and notify the initiator. |
| `set_partnership_status(p_partnership_id, p_status)` | community_lead on either side | Pause / unpause / revoke. |
| `set_provider_visibility(p_provider_id, p_visibility, p_targets)` | provider creator OR community_lead of provider's community | Change `visibility` and replace `provider_shares` rows. |
| `list_visible_providers(p_search, p_category, p_communities)` | any authenticated user | Read RPC for the future segmented control. Each row is tagged with `origin_community_id`, `origin_community_name`, `is_own_community`. Today returns only own-community providers because no other visibility has been set. |
| `list_partner_communities()` | any authenticated user with a community | Returns active and pending partner communities. Today returns zero rows for everyone. |

### Notification types reserved (not emitted today by the active app)

`partnership_request`, `partnership_accepted`. These are emitted only when the corresponding RPCs are called. Until UI ships that calls those RPCs, no user receives such a notification. The `NotificationContext` in the app does not need to handle them today (unknown types fall through gracefully on the notifications screen).

---

## 9. App-Layer Surface (intentionally none)

This document does not yet describe any `AuthContext` field, hook, screen, or component. The app code is unchanged. When future tasks ship UI, this section will be populated and the changelog will record each addition.

What the next UI task will likely add (for context, not commitment):

- A `AuthContext.partnerCommunityIds` field populated via `list_partner_communities()`.
- A `lib/crossCommunity.ts` module of typed RPC wrappers.
- A `app/community/partners.tsx` screen for community leads.
- A segmented control inside the Help tab Providers segment.

None of those exist today. Implementing any of them is a separate task.

---

## 10. Phase Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 0 — Backend foundation** | Schema, helpers, RLS, RPCs. | **Done (this document).** |
| **Phase 1 — Provider discovery UI** | Partnerships screen, segmented control on Help tab, "Shared from <Community>" badge on provider detail. | Not started. |
| **Phase 2 — Cross-community visits UI** | Audience picker on visit creation, cross-community RSVP, notification fan-out across `service_visit_communities`. | Not started. |
| **Phase 3 — Cross-community funds UI** | Partnership-scoped or group-scoped fund creation and ledger views, cross-community role gating. | Not started. |
| **Phase 4 — Announcements UI** | Author screen, audience picker, announcements feed. | Not started. |
| **Phase 5 — Discovery** | Searchable directory of `discoverable` groups, "request to join" flow. | Not started. |

---

## 11. Migration & Rollback Notes

### Forward migration

`supabase/migrations/20260507000000_cross_community_foundation.sql` is purely additive:

- New tables, new columns with safe defaults, new RLS policies, new RPCs.
- Existing rows are backfilled (`shared_by_community_id`, `host_community_id`) so all FKs remain consistent.
- No data is rewritten in a destructive way.

### Rollback

Because no existing object is modified, rollback is the inverse set of `DROP` statements applied in reverse order. A rollback script can be authored on demand if needed; it is not pre-shipped because in the backend-foundation state there is nothing observable to roll back — no UI calls these objects, no data has been written to the new tables, and rollback would simply reduce the surface area.

If rollback ever becomes necessary in production:

- Any provider whose `visibility` was widened beyond `'community'` will silently fall back to `'community'` after rollback. That is the safe direction.
- Any data in the new tables (partnerships, groups, shares, announcements) is lost on rollback. Coordinate with stakeholders before running rollback in any non-dev environment.

---

## 12. Open Questions (future-phase decisions)

- Should ratings and `provider_hires` accumulate across communities for a provider whose `visibility = 'public'`, or stay siloed per home community? Today they remain siloed because no UI sets visibility above `community`.
- Should `community_lead_remove_resident` cascade into removing that resident from cross-community visit RSVPs? Defer to Phase 2.
- Do platform admins need a moderation surface for `public`-visibility providers and announcements? Likely yes by Phase 4.
- How does `notify_due_services` behave when a user's `user_services.provider_id` references a provider in a partner community that later revokes the partnership? `user_services` itself is user-scoped so the reminder still works, but the linked provider card may become invisible. Decide in Phase 1.

---

## 13. Working Conventions

- New cross-community RPCs follow the naming convention `list_visible_*`, `can_user_see_*`, `set_*_visibility`, `*_community_partnership`.
- When adding a new shareable resource, add it to the visibility enum table in Section 3 and add a `can_user_see_*` helper in Section 5.
- When adding a new partnership capability, add it to the `scope` JSON shape in Section 4 and update the truth table.
- When the first UI lands, add an "App-Layer Surface" subsection in Section 9 listing the screens, hooks, and `AuthContext` fields.
- Append an entry to `docs/cross-community-changelog.md` for every PR that lands a change covered by this document.
