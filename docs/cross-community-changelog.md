# Cross-Community Changelog

> Append-only log of every change touching cross-community schema, RPCs, RLS, helper functions, AuthContext fields, or screens described in `cross-community.md`.
>
> **Format:** newest entries on top. Each entry includes the date, the change in one line, the migration file (if any), the touched docs, and any backfill / coordination notes.

## 2026-09-02 — Provider write guards, moderation RPC, report resolution, and contact deduplication

**Migrations (Unapplied per Decision D1):** `20260902000000_provider_write_and_visibility_guards.sql` (M1), `20260902000100_rating_scope_and_fraud_visibility.sql` (M2), `20260902000200_report_and_text_bounds.sql` (M3), `20260902000300_platform_admin_provider_moderation.sql` (M4), `20260902000400_dedupe_provider_contacts.sql` (M5).

**Objects touched:** `service_providers` (column-level UPDATE permissions, `fraud_status` RLS visibility filter, `is_verified` locked to RPC), `ratings` (community RLS scope, delete policy, fraud status filter), `provider_reports` (text length & enum CHECK constraints), `provider_hires` (generated `contact_date` column, unique index `provider_hires_user_provider_day_uniq`), `set_provider_moderation_state` (new SECURITY DEFINER RPC), `platform_get_provider_details` & `platform_get_all_providers` (extended with fraud status, verification, report counts, and review text).

**Edge function & client changes:** `fraud-check` Edge Function source updated (R-R6 severity downgraded to FLAG; profanity, contact info, and creation velocity rules added to `evaluateProviderRules`). Client fraud handler updated to fail open to `QUEUE_LOW_PRIORITY` with `unavailable: true`. Provider detail screen updated with Overview & Details section (Decision D6), contact requirement notice before review submission (Decision D4), public report banner threshold of 2 (Decision D3), report resolution controls for leads/admins, and report button hidden on foreign providers. Admin console updated with HTML escaping helper `esc()`, event listeners, moderation toggles, report resolution controls, and review text rendering.

---

## 2026-08-31 — Visit RPCs became federation-aware while closing an anonymous read leak

**Migrations:** `supabase/migrations/20260831000100_secure_visit_rpcs.sql`, `supabase/migrations/20260831000200_visit_capacity_and_lifecycle.sql`

**Federation objects touched:** `get_community_visits` and `get_visit_joiners` RPCs, capability key list.

`get_community_visits` and `get_visit_joiners` were `SECURITY DEFINER` with no authorization and were `EXECUTE`-able by `anon`, so any caller holding the public anon key could read every visit and joiner in any community. Both are now pinned with `SET search_path = public`, revoked from `PUBLIC`/`anon`, and granted to `authenticated` only.

The new authorization is deliberately built from the canonical federation helpers rather than a direct `community_id` comparison: `get_community_visits` gates its `p_community_id` argument on `get_user_partner_community_ids('visits', auth.uid())` and filters rows with `can_user_see_visit(sv.id, auth.uid())`; `get_visit_joiners` gates entirely on `can_user_see_visit(p_visit_id, auth.uid())`. `p_user_id` is now ignored and `has_user_joined` always answers for `auth.uid()`.

**No federation object was removed or narrowed.** `service_visits_select_cross_community`, `service_providers_select_cross_community`, `can_user_see_visit`, `can_user_see_provider`, `get_user_partner_community_ids`, `service_visit_communities`, `provider_shares`, and `service_visits.is_cross_community` are all unchanged. The `service_visits` `UPDATE`/`DELETE` policies were widened to community leads and platform admins and the `UPDATE WITH CHECK` now pins `community_id`; both are single-community policies with no federation counterpart, and the pin constrains ownership, not sharing.

**New capability key: `visits`.** It appears in no `community_partnerships.scope` JSONB yet, so partner reads of visits are inert and current behaviour is identical to the single-community policies. Adding `{"visits": true}` to an active partnership scope enables partner visit reads with no code change.

---

## 2026-08-22 — `request_community_partnership` notified nobody (dead role literal)

**Migrations:** `supabase/migrations/20260822000000_repoint_dead_community_lead_checks.sql`, `supabase/migrations/20260822000200_drop_legacy_app_role_enum_values.sql`

**Federation object touched:** `request_community_partnership` RPC.

**Bug:** the RPC's closing `INSERT INTO notifications … SELECT … WHERE p.app_role = 'community_lead'::app_role_type` still targeted the legacy role value. Since `20260616000001` migrated every such row to `president`, that predicate matched zero rows — so **`partnership_request` notifications were silently delivered to nobody**. The RPC's own entry guard (`is_community_lead(auth.uid())`) was already correct, so callers saw success and a partnership row was created; only the notification fan-out was dead.

**Fix:** recipient selection now targets `president` / `vice_president` and additionally filters `removed_at IS NULL` (the old predicate did not, so a removed lead could have been notified). No signature, argument, or return change; no schema change to any federation table.

**Enum change:** `community_lead` and `community_admin` were physically removed from `app_role_type` (type swap — Postgres has no `ALTER TYPE … DROP VALUE`). The enum is now exactly `admin · resident · president · vice_president`. Federation objects referencing the type in function bodies re-resolve at runtime and were unaffected; no federation table has a column of this type.

**Backfill / coordination:** none required. Zero rows held either legacy value at migration time. `partnership_request` notifications missed while the predicate was dead are not recoverable, but no UI calls this RPC yet (federation remains backend-only), so no user-visible notification was actually lost.

**Docs touched:** `docs/architecture.md` (role enum, helper list, uniform MCN rule), `docs/CLAUDE.md` (non-negotiable #2, MCN delete rule, traps table), `docs/platform-admin.md` (role table), `docs/disabled-features.md` (residue note), root `CLAUDE.md`, this changelog.

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
