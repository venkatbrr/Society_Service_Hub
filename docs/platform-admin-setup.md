# Platform Admin Setup

This guide documents the current platform-admin workflow and the related verification points in Supabase.

## Role Model

- `admin`: platform admin only. This user must have `profiles.community_id = null`.
- `community_lead`: the lead role inside a community. This role is not auto-assigned by community-request approval.
- `resident`: default member role.

Notes:

- The active product no longer uses a `community_admin` promotion workflow.
- Some fund-related code paths still accept legacy `community_admin` strings for compatibility, but that is not part of the intended role model.
- Client-side auth routing also treats `societyservicehub@gmail.com` as the canonical platform-admin identity to avoid onboarding-route misclassification when profile hydration is delayed.
- Client-side routing gives `app_role = 'admin'` precedence and routes to platform screens even if `profiles.community_id` is stale; database data should still be corrected to `NULL` for platform admins.
- Database migrations now also enforce canonical admin restoration for `societyservicehub@gmail.com` (auto-assigns `app_role = 'admin'` on profile creation and repairs role/community linkage if profiles were reset).

## Platform Admin Responsibilities

Platform admins can:

- review pending community creation requests
- approve or reject community requests
- inspect created communities
- soft-remove residents from a community when needed
- review profile audit data through the database when necessary

## Current Tables and RPCs

### Tables

- `community_requests`
- `communities`
- `profiles`
- `profile_audit_log`

### Key RPCs

- `platform_approve_community_request(p_request_id)`
- `platform_reject_community_request(p_request_id, p_rejection_reason)`
- `platform_soft_remove_resident(p_target_profile_id, p_reason)`
- `set_audit_actor(p_actor_id)`
- `set_audit_context(p_actor_id, p_reason)`

### Removed promotion flow

The old `community_admin_requests` flow and related approval RPCs are not part of the current app surface.

## UI Routes

Platform admin console:

- `/platform/approvals`
- `/platform/communities`
- `/platform/community/[id]`

Root routing redirects platform admins into `/platform/approvals`.

## Verification Checklist

1. Verify the platform admin identity:
   - `profiles.app_role = 'admin'`
   - `profiles.community_id IS NULL`
2. Verify approval flow:
   - approving a pending `community_requests` row creates a `communities` row
   - the requester is assigned to the new community with `app_role = 'resident'`
   - the created community receives a join code
3. Verify rejection flow:
   - rejecting a request updates status and stores the optional rejection reason
4. Verify community inspection:
   - `/platform/communities` loads communities and member counts
   - `/platform/community/[id]` loads residents for the selected community
5. Verify resident removal:
   - platform removal sets `removed_at` and `removed_by`
   - the user's role is reset as expected by the database workflow
6. Verify audit support:
   - profile changes that should be audited create rows in `profile_audit_log`

## Validation Commands

- `npm run db:push`
- `npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj`
- `npx tsc --noEmit`