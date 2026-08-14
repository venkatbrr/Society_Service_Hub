-- Migration: add an identifying email to the per-resident rollups.
--
-- Real data already contains two distinct profiles with the same full name in
-- the same flat, both hosting food drops. "Venkata Ramana Reddy (A-412)" twice
-- in a host table is unreadable, so the rollups carry the email as well.
--
-- Changing a function's OUT columns needs DROP + CREATE — CREATE OR REPLACE
-- cannot change a return type.

DROP FUNCTION IF EXISTS public.platform_get_preorder_hosts(UUID);

CREATE FUNCTION public.platform_get_preorder_hosts(p_community_id UUID DEFAULT NULL)
RETURNS TABLE (
  host_id UUID,
  host_name TEXT,
  host_flat TEXT,
  host_email TEXT,
  community_id UUID,
  community_name TEXT,
  drops_total BIGINT,
  drops_open BIGINT,
  orders_total BIGINT,
  distinct_buyers BIGINT,
  revenue_total NUMERIC,
  avg_order_value NUMERIC,
  first_drop_at TIMESTAMPTZ,
  last_drop_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view pre-order host statistics';
  END IF;

  RETURN QUERY
  WITH scoped_drops AS (
    SELECT d.id, d.created_by, d.community_id, d.status, d.cutoff_at, d.created_at
    FROM public.mcn_preorder_drops d
    WHERE (p_community_id IS NULL OR d.community_id = p_community_id)
  ),
  -- Aggregate orders per drop first. Joining drops to orders and aggregating in
  -- one pass would multiply every drop count by that drop's order count.
  order_rollup AS (
    SELECT
      o.drop_id,
      COUNT(*)::BIGINT AS orders_count,
      COALESCE(SUM(o.total_amount), 0)::NUMERIC AS revenue
    FROM public.mcn_preorder_orders o
    WHERE o.status <> 'cancelled'
      AND o.drop_id IN (SELECT sd.id FROM scoped_drops sd)
    GROUP BY o.drop_id
  ),
  host_drops AS (
    SELECT
      sd.created_by,
      sd.community_id,
      COUNT(sd.id)::BIGINT AS drops_total,
      COUNT(sd.id) FILTER (WHERE sd.status = 'open' AND sd.cutoff_at > now())::BIGINT AS drops_open,
      COALESCE(SUM(orr.orders_count), 0)::BIGINT AS orders_total,
      COALESCE(SUM(orr.revenue), 0)::NUMERIC AS revenue_total,
      MIN(sd.created_at) AS first_drop_at,
      MAX(sd.created_at) AS last_drop_at
    FROM scoped_drops sd
    LEFT JOIN order_rollup orr ON orr.drop_id = sd.id
    GROUP BY sd.created_by, sd.community_id
  ),
  -- Distinct buyers must be counted across the host's drops, not summed per
  -- drop: one buyer ordering from three of the same host's drops is one buyer.
  host_buyers AS (
    SELECT
      sd.created_by,
      sd.community_id,
      COUNT(DISTINCT o.buyer_id)::BIGINT AS distinct_buyers
    FROM scoped_drops sd
    JOIN public.mcn_preorder_orders o
      ON o.drop_id = sd.id AND o.status <> 'cancelled'
    GROUP BY sd.created_by, sd.community_id
  )
  SELECT
    hd.created_by AS host_id,
    COALESCE(p.full_name, 'Resident Host') AS host_name,
    COALESCE(p.flat_number, '') AS host_flat,
    COALESCE(p.email, '') AS host_email,
    hd.community_id,
    COALESCE(c.name, '') AS community_name,
    hd.drops_total,
    hd.drops_open,
    hd.orders_total,
    COALESCE(hb.distinct_buyers, 0)::BIGINT AS distinct_buyers,
    hd.revenue_total,
    CASE
      WHEN hd.orders_total > 0 THEN ROUND(hd.revenue_total / hd.orders_total, 2)
      ELSE 0
    END::NUMERIC AS avg_order_value,
    hd.first_drop_at,
    hd.last_drop_at
  FROM host_drops hd
  LEFT JOIN host_buyers hb
    ON hb.created_by = hd.created_by
   AND hb.community_id IS NOT DISTINCT FROM hd.community_id
  LEFT JOIN public.profiles p ON p.id = hd.created_by
  LEFT JOIN public.communities c ON c.id = hd.community_id
  ORDER BY hd.revenue_total DESC, hd.drops_total DESC, host_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_preorder_hosts(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_preorder_hosts(UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.platform_get_business_owners(UUID);

CREATE FUNCTION public.platform_get_business_owners(p_community_id UUID DEFAULT NULL)
RETURNS TABLE (
  owner_id UUID,
  owner_name TEXT,
  owner_flat TEXT,
  owner_email TEXT,
  community_id UUID,
  community_name TEXT,
  listings_total BIGINT,
  listings_active BIGINT,
  products_total BIGINT,
  flagged_count BIGINT,
  avg_rating NUMERIC,
  rating_count BIGINT,
  categories TEXT,
  first_listing_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view business owner statistics';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT
      l.id,
      l.owner_id,
      l.community_id,
      l.is_active,
      l.created_at,
      l.flagged_for_review_at,
      COALESCE(bc.name, 'General') AS category_name,
      (SELECT COUNT(*) FROM public.mcn_products mp WHERE mp.listing_id = l.id) AS product_count,
      (SELECT COUNT(*) FROM public.ratings r WHERE r.listing_id = l.id) AS rating_count,
      (SELECT COALESCE(SUM(r.rating), 0) FROM public.ratings r WHERE r.listing_id = l.id) AS rating_sum
    FROM public.mcn_listings l
    LEFT JOIN public.mcn_business_categories bc ON bc.id = l.category_id
    WHERE (p_community_id IS NULL OR l.community_id = p_community_id)
  )
  SELECT
    s.owner_id,
    COALESCE(p.full_name, 'Resident Owner') AS owner_name,
    COALESCE(p.flat_number, '') AS owner_flat,
    COALESCE(p.email, '') AS owner_email,
    s.community_id,
    COALESCE(c.name, '') AS community_name,
    COUNT(s.id)::BIGINT AS listings_total,
    COUNT(s.id) FILTER (WHERE s.is_active)::BIGINT AS listings_active,
    COALESCE(SUM(s.product_count), 0)::BIGINT AS products_total,
    COUNT(s.id) FILTER (WHERE s.flagged_for_review_at IS NOT NULL)::BIGINT AS flagged_count,
    CASE
      WHEN COALESCE(SUM(s.rating_count), 0) > 0
        THEN ROUND(SUM(s.rating_sum)::NUMERIC / SUM(s.rating_count), 1)
      ELSE 0
    END::NUMERIC AS avg_rating,
    COALESCE(SUM(s.rating_count), 0)::BIGINT AS rating_count,
    STRING_AGG(DISTINCT s.category_name, ', ' ORDER BY s.category_name) AS categories,
    MIN(s.created_at) AS first_listing_at
  FROM scoped s
  LEFT JOIN public.profiles p ON p.id = s.owner_id
  LEFT JOIN public.communities c ON c.id = s.community_id
  GROUP BY s.owner_id, p.full_name, p.flat_number, p.email, s.community_id, c.name
  ORDER BY listings_total DESC, owner_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_business_owners(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_business_owners(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
