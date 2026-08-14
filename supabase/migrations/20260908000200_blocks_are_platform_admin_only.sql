-- Block inventory becomes a platform-admin-only concern.
--
-- Presidents could previously flip blocks_enabled on and off and add blocks
-- from /community/blocks. Both are structural: resident flats, fund collection
-- scopes, and the per-block collector cap all key off block rows, and turning
-- blocks off unscopes every resident and in-charge in one tap. That belongs in
-- the admin console, which already has platform_set_blocks_enabled() and
-- platform_add_community_block().
--
-- The functions are kept (other migrations CREATE OR REPLACE them) but the
-- grant is withdrawn, so a president calling them directly from a client gets
-- a permission error rather than succeeding behind a hidden UI.

REVOKE EXECUTE ON FUNCTION public.set_community_blocks_enabled(BOOLEAN) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_community_blocks_enabled(BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_community_blocks_enabled(BOOLEAN) FROM anon;

REVOKE EXECUTE ON FUNCTION public.add_community_block(TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.add_community_block(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_community_block(TEXT) FROM anon;

-- Archiving is the same one-way door as adding: with add_community_block()
-- revoked, a president who archives a block cannot restore it (restoring is
-- what add_community_block() does for an archived name). Withdraw it too.
REVOKE EXECUTE ON FUNCTION public.archive_community_block(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.archive_community_block(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.archive_community_block(UUID) FROM anon;

-- rename_community_block() stays with community leads: it is cosmetic and
-- reversible, and it is the one correction a president legitimately needs.

NOTIFY pgrst, 'reload schema';
