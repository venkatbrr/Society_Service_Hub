-- Migration: Fix platform_get_community_businesses.
-- 1. The function's RETURNS TABLE declares an OUT parameter named listing_id,
--    which shadows the bare "listing_id" column used inside the product_count/
--    avg_rating/rating_count subqueries. Postgres can't resolve the bare
--    reference between the OUT parameter and the table column, raising
--    "column reference \"listing_id\" is ambiguous". Qualify each subquery's
--    listing_id with its source table.
-- 2. The avg_rating/rating_count subqueries referenced a nonexistent
--    "mcn_listing_ratings" table. Listing ratings actually live in the shared
--    public.ratings table (same table used for provider ratings), scoped by
--    its listing_id column.

CREATE OR REPLACE FUNCTION public.platform_get_community_businesses(p_community_id UUID)
RETURNS TABLE (
  listing_id UUID,
  name TEXT,
  description TEXT,
  category_name TEXT,
  category_emoji TEXT,
  owner_name TEXT,
  owner_flat TEXT,
  contact_phone TEXT,
  is_active BOOLEAN,
  product_count BIGINT,
  avg_rating NUMERIC,
  rating_count BIGINT,
  image_url TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view business details';
  END IF;

  RETURN QUERY
  SELECT
    l.id AS listing_id,
    l.name,
    l.description,
    COALESCE(c.name, 'General') AS category_name,
    COALESCE(c.emoji, '🏪') AS category_emoji,
    COALESCE(p.full_name, 'Resident Owner') AS owner_name,
    COALESCE(p.flat_number, '') AS owner_flat,
    l.contact_phone,
    l.is_active,
    (SELECT COUNT(*)::BIGINT FROM public.mcn_products mp WHERE mp.listing_id = l.id) AS product_count,
    COALESCE((SELECT AVG(r.rating)::NUMERIC(3,1) FROM public.ratings r WHERE r.listing_id = l.id), 0) AS avg_rating,
    (SELECT COUNT(*)::BIGINT FROM public.ratings r WHERE r.listing_id = l.id) AS rating_count,
    l.image_url,
    l.created_at
  FROM public.mcn_listings l
  LEFT JOIN public.mcn_business_categories c ON l.category_id = c.id
  LEFT JOIN public.profiles p ON l.owner_id = p.id
  WHERE l.community_id = p_community_id
  ORDER BY l.created_at DESC;
END;
$$;

NOTIFY pgrst, 'reload schema';
