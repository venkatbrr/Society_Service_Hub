-- Allow public/community SELECT for host basic profile info (food drops & business listings)
-- so shared drop cards and public menu views show actual creator name and flat number.

DROP POLICY IF EXISTS profiles_select_public_hosts ON public.profiles;
CREATE POLICY profiles_select_public_hosts
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.mcn_preorder_drops d
      WHERE d.created_by = profiles.id
    )
    OR EXISTS (
      SELECT 1 FROM public.mcn_listings l
      WHERE l.owner_id = profiles.id
    )
    OR community_id IS NOT NULL
  );

NOTIFY pgrst, 'reload schema';
