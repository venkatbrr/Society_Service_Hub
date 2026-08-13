-- supabase/migrations/20260906000000_og_card_rpcs.sql
--
-- Open Graph link-preview cards for business listings and community invites
-- (api/share-listing.ts, api/share-community.ts). Both tables lack an
-- anon-readable SELECT policy (mcn_listings_select and communities_select_own
-- are both scoped to get_user_community_id()), so a crawler's anon client
-- reads nothing via a direct table query. These SECURITY DEFINER RPCs expose
-- only the handful of columns a preview card needs.
--
-- mcn_preorder_drops does not need an equivalent RPC: it already has a
-- deliberate anon-readable policy (20260802010000_allow_public_food_drop_read.sql).

CREATE OR REPLACE FUNCTION public.get_listing_og_card(p_id UUID)
RETURNS TABLE (
  name TEXT,
  description TEXT,
  image_url TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.name, l.description, l.image_url
  FROM public.mcn_listings l
  WHERE l.id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.get_community_og_card(p_id UUID)
RETURNS TABLE (
  name TEXT,
  address TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.name, c.address
  FROM public.communities c
  WHERE c.id = p_id;
$$;

REVOKE ALL ON FUNCTION public.get_listing_og_card(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_community_og_card(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_listing_og_card(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_og_card(UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
