# Cross-Community Changelog

> Append-only log of every change touching cross-community schema, RPCs, RLS, helper functions, AuthContext fields, or screens described in `cross-community.md`.
>
> **Format:** newest entries on top. Each entry includes the date, the change in one line, the migration file (if any), the touched docs, and any backfill / coordination notes.

---

## 2026-05-07 — Phase 0: Backend Foundation (no UI)

**Migration:** `supabase/migrations/20260507000000_cross_community_foundation.sql`

**Status of this change:** Backend active in the database; no UI in the app calls any of the new objects. All existing screens behave identically to a pre-migration build.

**Schema added:**

- Tables: `community_partnerships`, `community_groups`, `community_group_members`, `provider_shares`, `service_visit_communities`, `community_announcements`, `announcement_audiences`.
- Columns: `service_providers.visibility`, `service_providers.shared_by_community_id`, `service_providers.is_verified`, `service_visits.is_cross_community`, `service_visits.host_community_id`, `events.fund_scope`, `events.partnership_id`, `events.group_id`.

**Helpers added:** `get_user_partner_community_ids`, `can_user_see_provider`, `can_user_see_visit`, `can_user_see_announcement`.

**RPCs added:** `request_community_partnership`, `accept_community_partnership`, `set_partnership_status`, `set_provider_visibility`, `list_visible_providers`, `list_partner_communities`.

**RLS:** Added permissive `SELECT` policies named `*_select_cross_community` / `*_select_visible` on `service_providers`, `service_visits`, `community_announcements`. Existing community-scoped policies untouched. Default-deny on new tables with explicit policies for member-visibility and discoverability. Because no row has non-default visibility today and no `provider_shares` rows exist, the new policies match zero additional rows in practice.

**Notification types reserved:** `partnership_request`, `partnership_accepted`. Not emitted by any current app flow; only emitted when the new RPCs are called.

**App-layer changes:** None. `AuthContext`, screens, hooks, and `lib/` modules (other than the regenerated `lib/database.types.ts`) are unchanged.

**Docs touched:** `docs/architecture.md` (new "Cross-Community Federation (Backend Foundation)" section, new rows in tables), `docs/features.md` (new "Cross-Community (Backend Only)" section), `docs/CLAUDE.md` (cross-community conventions), root `CLAUDE.md` (pointer line), new `docs/cross-community.md`, new `docs/decisions/0001-additive-rls-for-cross-community.md`, this changelog.

**Backfill notes:** `service_providers.shared_by_community_id` and `service_visits.host_community_id` backfilled equal to `community_id` for all existing rows. `events.fund_scope` defaults to `'community'` for all existing funds — existing fund RLS unchanged.

**Verification performed:**

- All existing screens load and behave identically.
- `SELECT * FROM list_partner_communities()` returns zero rows for every user.
- `SELECT * FROM list_visible_providers(NULL, NULL, NULL)` returns the same set as the existing `service_providers` query.
- `SELECT visibility, COUNT(*) FROM service_providers GROUP BY visibility` shows only `'community'`.

**Next phase:** Phase 1 — Provider discovery UI (separate task; not yet scheduled).
