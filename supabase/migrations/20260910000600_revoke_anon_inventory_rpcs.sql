-- Migration: drop the `anon` EXECUTE grant on the community inventory readers.
--
-- 20260910000400 added an authorisation guard inside both functions, so an
-- anonymous caller now raises rather than enumerating a society's blocks and
-- flats. This removes the reachable entry point as well, clearing the
-- `anon_security_definer_function_executable` advisory for both.
--
-- Both are called only by signed-in users: the app's own community screens and
-- the platform admin console.

REVOKE EXECUTE ON FUNCTION public.list_community_blocks(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_community_flats(UUID, UUID) FROM anon;

GRANT EXECUTE ON FUNCTION public.list_community_blocks(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_community_flats(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
