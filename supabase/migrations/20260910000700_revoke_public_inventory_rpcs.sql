-- Migration: actually remove anon's EXECUTE on the community inventory readers.
--
-- 20260910000600 revoked EXECUTE from `anon` and it made no difference:
-- `anon` was reaching these functions through the default grant to `PUBLIC`,
-- and revoking a privilege from a role does not remove a privilege held by
-- PUBLIC. The revoke has to name PUBLIC.

REVOKE ALL ON FUNCTION public.list_community_blocks(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_community_flats(UUID, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_community_blocks(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_community_flats(UUID, UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
