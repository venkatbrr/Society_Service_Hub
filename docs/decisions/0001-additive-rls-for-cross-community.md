# ADR 0001: Additive RLS for Cross-Community Federation

- **Status:** Accepted
- **Date:** 2026-05-07
- **Phase:** Cross-Community Federation, Phase 0 (Backend Foundation)

## Context

Society Service Hub enforces multi-tenant isolation via Supabase Row Level Security. The central helper is `get_user_community_id()` which returns the JWT/profile-derived home community of the caller. It is referenced by RLS policies on roughly every domain table:

- `service_providers`, `service_visits`, `visit_joiners`, `ratings`, `provider_hires`, `events`, `event_transactions`, `fund_roles`, `community_requests`, plus several derived RPCs.

Phase 0 of the federation work needs some of these tables (`service_providers`, `service_visits`, and the new `community_announcements`) to become *capable of* being visible across an opt-in set of partner / group communities, while others (`event_transactions`, `fund_roles`, `community_requests`) must remain strictly community-scoped — even after future phases ship.

The Phase 0 deliverable is backend-only: schema and RLS land but no UI calls them yet. Whatever pattern Phase 0 picks will be the pattern every future cross-community feature inherits.

## Decision

We **add new permissive `SELECT` policies** named distinctly (e.g., `service_providers_select_cross_community`) using **new helper functions** (`get_user_partner_community_ids`, `can_user_see_provider`, `can_user_see_visit`, `can_user_see_announcement`). The existing `get_user_community_id()` keeps its current single-community meaning. The existing community-scoped policies are not modified, dropped, or renamed.

## Alternatives Considered

### A. Redefine `get_user_community_id()` to return `setof uuid`

Rejected. A returns-set redefinition would silently widen access on every table whose RLS uses `community_id = get_user_community_id()`, including tables that must remain strictly siloed (`event_transactions`, `fund_roles`, `community_requests`). Even with a careful audit, the blast radius is large, the change is hard to review, and there is no per-table opt-out.

### B. Drop and recreate existing policies with a wider predicate

Rejected. Policy recreation cascades through dependent grants and is visible to every reviewer as "the policies on every domain table changed." Reverting requires the same cascade. The semantics are also no longer additive — a bug in the new predicate could remove the previous guarantee.

### C. View-based abstraction (e.g., `provider_visible_v`)

Considered. Useful for future read RPCs, but does not address writes and forces every screen and RPC to switch off the base tables — a much larger change than Phase 0 warrants. We may layer views on top later if needed.

## Consequences

### Positive

- **Strict superset behaviour.** Any caller who could read a row before this change can still read it. The only change is that some callers can now read additional rows — and in Phase 0 nobody does, because nobody has set non-default visibility.
- **Surgical blast radius.** No existing table's existing policies are touched. Reviewers can confirm by `git diff`-ing the migrations directory.
- **Per-resource opt-in.** Each shareable resource gets its own `can_user_see_*` helper, so visibility logic is co-located with the resource and easy to extend.
- **Writes stay narrow.** All cross-community mutations flow through `SECURITY DEFINER` RPCs with explicit authorization checks. There is one place to audit for cross-community write policy.
- **Phase 0 lands inertly.** Because the new tables are empty and the new columns default to single-community values, the new permissive policies match zero additional rows. The system is observably unchanged until someone explicitly opts in via a future UI or admin SQL.

### Negative

- **Two helpers to keep in sync.** `get_user_community_id()` and `get_user_partner_community_ids()` must agree on what "home" means. Mitigation: the partner helper always includes the home community as its first row, so any caller using only the partner helper still behaves correctly for the home community.
- **Policy explosion risk.** Adding multiple permissive `SELECT` policies makes it easier to lose track of why a row is visible. Mitigation: every new policy has the suffix `_cross_community` or `_visible`, and `cross-community.md` Section 6 is the index.
- **Performance.** `can_user_see_*` helpers run per row. If a hot path shows perf issues we will move that path onto a precomputed view or materialized join. Phase 0 sticks with the per-row helper for clarity.

## Compliance

- The Phase 0 migration `20260507000000_cross_community_foundation.sql` adheres to this ADR.
- Reviewers should reject any future change that modifies `get_user_community_id()` unless a follow-up ADR supersedes this one.
- New shareable resources should follow the same pattern: introduce a dedicated `can_user_see_*` helper plus a permissive `SELECT` policy alongside (not in place of) any existing policies.
