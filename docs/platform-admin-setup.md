# Platform Admin Setup

This guide documents how the platform-admin workflow is configured and how to verify it in Supabase.

## Role Model

- `admin`: platform admin only. Must have `profiles.community_id = null`.
- `community_admin`: community-scoped admin for resident approvals, funds, and promotion requests.
- `resident`: default member role.

The migration `20260418230000_platform_admin_and_promotions.sql` performs role normalization:

- Keeps `societyservicehub@gmail.com` as platform admin (`admin`, no community).
- Converts existing community-scoped admins to `community_admin`.

## New Tables

- `community_admin_requests`: promotion workflow from resident to community admin.
- `profile_audit_log`: audit entries for tracked profile field updates.

## Key RPCs

Community admin actions:

- `create_community_admin_request(p_target_user_id)`
- `cancel_community_admin_request(p_request_id)`

Platform admin actions:

- `platform_approve_community_request(p_request_id)`
- `platform_reject_community_request(p_request_id, p_rejection_reason)`
- `platform_approve_community_admin_request(p_request_id)`
- `platform_reject_community_admin_request(p_request_id, p_rejection_reason)`
- `platform_soft_remove_resident(p_target_profile_id, p_reason)`

Audit helpers:

- `set_audit_actor(p_actor_id)`
- `set_audit_context(p_actor_id, p_reason)`

## UI Routes

Platform admin console:

- `/platform/approvals`
- `/platform/promotions`
- `/platform/communities`
- `/platform/community/[id]`

Community directory:

- `/residents`

Root routing redirects platform admins into `/platform/approvals`.

## Limits

- `MAX_COMMUNITY_ADMINS = 5` in `lib/limits.ts`.
- Enforced in database trigger/RPC logic; UI only mirrors the rule.

## Verification Checklist (Supabase)

1. Verify platform admin identity:
   - `profiles.email = societyservicehub@gmail.com` has `app_role = 'admin'`.
   - `community_id IS NULL` for that row.
2. Verify migration role split:
   - Previous community-scoped admins are now `community_admin`.
3. Verify cap enforcement:
   - Attempt to approve/insert a 6th `community_admin` in one community and confirm failure.
4. Verify audit logging:
   - Update tracked `profiles` fields and confirm `profile_audit_log` rows are inserted.
5. Verify resident removal:
   - Use platform remove flow and confirm `removed_at`, `removed_by`, and role reset behavior.

## Validation Commands

- `npm run db:push`
- `npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj | Out-File lib/database.types.ts -Encoding utf8`
- `npx tsc --noEmit`
