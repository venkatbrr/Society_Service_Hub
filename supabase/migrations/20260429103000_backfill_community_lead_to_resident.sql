-- Backfill legacy first-user roles.
-- Older approvals set first community users to community_lead. Product rule now requires resident.

UPDATE public.profiles
SET app_role = 'resident'::public.app_role_type
WHERE app_role = 'community_lead'::public.app_role_type;

NOTIFY pgrst, 'reload schema';
