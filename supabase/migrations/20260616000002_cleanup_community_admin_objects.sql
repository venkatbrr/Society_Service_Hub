-- Migration: Clean up obsolete community_admin database objects
DROP FUNCTION IF EXISTS public.create_community_admin_request(uuid);
