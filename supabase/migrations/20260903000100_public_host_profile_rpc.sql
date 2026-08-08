-- supabase/migrations/20260903000100_public_host_profile_rpc.sql

-- Narrow replacement for the anon-readable profiles_select_public_hosts policy.
-- Returns only what a public share card renders. Phone is deliberately absent.
CREATE OR REPLACE FUNCTION public.get_public_host_profiles(p_user_ids uuid[])
RETURNS TABLE (
  id          uuid,
  full_name   text,
  avatar_url  text,
  flat_number text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pr.id, pr.full_name, pr.avatar_url, pr.flat_number
  FROM public.profiles pr
  WHERE pr.id = ANY(p_user_ids)
    AND (
      EXISTS (SELECT 1 FROM public.mcn_preorder_drops d WHERE d.created_by = pr.id)
      OR EXISTS (SELECT 1 FROM public.mcn_listings   l WHERE l.owner_id    = pr.id)
      OR EXISTS (SELECT 1 FROM public.mcn_carpools   c WHERE c.created_by  = pr.id)
    );
$$;

REVOKE ALL ON FUNCTION public.get_public_host_profiles(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_host_profiles(uuid[]) TO anon, authenticated;

-- Take the blanket policy off anon. Signed-in residents keep the existing
-- behaviour, including phone, via the community-scoped policy that already exists.
DROP POLICY IF EXISTS profiles_select_public_hosts ON public.profiles;
CREATE POLICY profiles_select_public_hosts
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.mcn_preorder_drops d WHERE d.created_by = profiles.id)
    OR EXISTS (SELECT 1 FROM public.mcn_listings   l WHERE l.owner_id    = profiles.id)
    OR EXISTS (SELECT 1 FROM public.mcn_carpools   c WHERE c.created_by  = profiles.id)
  );

NOTIFY pgrst, 'reload schema';
