-- place_mcn_preorder is a write path and must not be callable by anon.
--
-- REVOKE ALL ... FROM PUBLIC in 20260824000000 only dropped the PUBLIC
-- pseudo-role grant. Supabase's default privileges on the public schema had
-- already granted EXECUTE to anon directly, and that grant survived, so an
-- unauthenticated request reached the function body (it was still refused
-- there by the auth.uid() IS NULL check, but the grant overstated the intent).

REVOKE EXECUTE ON FUNCTION public.place_mcn_preorder(uuid, jsonb, text, text, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.place_mcn_preorder(uuid, jsonb, text, text, text, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
