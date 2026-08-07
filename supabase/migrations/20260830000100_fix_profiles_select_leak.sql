-- Close the profiles read leak by removing the broad "OR community_id IS NOT NULL" clause.
-- Retain public/community host visibility for food drops, business listings, and carpools
-- so shared cards and rosters show creator full_name and flat_number without leaking
-- private phone numbers and emails of every resident in the community.

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
    OR EXISTS (
      SELECT 1 FROM public.mcn_carpools c
      WHERE c.created_by = profiles.id
    )
  );

NOTIFY pgrst, 'reload schema';
