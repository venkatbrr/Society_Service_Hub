-- Migration: per-resident, per-category and per-community rollups for the
-- platform admin console.
--
-- The console could previously only list raw rows (one per drop, one per
-- listing). Everything here answers "who and how much" instead: which residents
-- host food drops, which residents run businesses, which categories carry the
-- community, and how each community compares against the others.
--
-- `platform_get_communities_overview` additionally replaces a direct
-- `supabase.from('profiles').select(...)` read in the console that pulled every
-- profile row on the platform into the browser just to count members per card.

-- 1. Pre-order food drops grouped by host resident --------------------------

CREATE OR REPLACE FUNCTION public.platform_get_preorder_hosts(p_community_id UUID DEFAULT NULL)
RETURNS TABLE (
  host_id UUID,
  host_name TEXT,
  host_flat TEXT,
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

-- 2. Resident businesses grouped by owner ------------------------------------

CREATE OR REPLACE FUNCTION public.platform_get_business_owners(p_community_id UUID DEFAULT NULL)
RETURNS TABLE (
  owner_id UUID,
  owner_name TEXT,
  owner_flat TEXT,
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
  GROUP BY s.owner_id, p.full_name, p.flat_number, s.community_id, c.name
  ORDER BY listings_total DESC, owner_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_business_owners(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_business_owners(UUID) TO authenticated;

-- 3. Resident businesses grouped by category ---------------------------------

CREATE OR REPLACE FUNCTION public.platform_get_business_categories(p_community_id UUID DEFAULT NULL)
RETURNS TABLE (
  category_id UUID,
  category_name TEXT,
  category_emoji TEXT,
  listing_count BIGINT,
  active_count BIGINT,
  owner_count BIGINT,
  product_count BIGINT,
  avg_rating NUMERIC,
  rating_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view business category statistics';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT
      l.id,
      l.owner_id,
      l.is_active,
      l.category_id,
      COALESCE(bc.name, 'General') AS category_name,
      COALESCE(bc.emoji, '🏪') AS category_emoji,
      (SELECT COUNT(*) FROM public.mcn_products mp WHERE mp.listing_id = l.id) AS product_count,
      (SELECT COUNT(*) FROM public.ratings r WHERE r.listing_id = l.id) AS rating_count,
      (SELECT COALESCE(SUM(r.rating), 0) FROM public.ratings r WHERE r.listing_id = l.id) AS rating_sum
    FROM public.mcn_listings l
    LEFT JOIN public.mcn_business_categories bc ON bc.id = l.category_id
    WHERE (p_community_id IS NULL OR l.community_id = p_community_id)
  )
  SELECT
    s.category_id,
    s.category_name,
    s.category_emoji,
    COUNT(s.id)::BIGINT AS listing_count,
    COUNT(s.id) FILTER (WHERE s.is_active)::BIGINT AS active_count,
    COUNT(DISTINCT s.owner_id)::BIGINT AS owner_count,
    COALESCE(SUM(s.product_count), 0)::BIGINT AS product_count,
    CASE
      WHEN COALESCE(SUM(s.rating_count), 0) > 0
        THEN ROUND(SUM(s.rating_sum)::NUMERIC / SUM(s.rating_count), 1)
      ELSE 0
    END::NUMERIC AS avg_rating,
    COALESCE(SUM(s.rating_count), 0)::BIGINT AS rating_count
  FROM scoped s
  GROUP BY s.category_id, s.category_name, s.category_emoji
  ORDER BY listing_count DESC, s.category_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_business_categories(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_business_categories(UUID) TO authenticated;

-- 4. One row per community ---------------------------------------------------

CREATE OR REPLACE FUNCTION public.platform_get_communities_overview()
RETURNS TABLE (
  id UUID,
  name TEXT,
  code TEXT,
  city TEXT,
  area TEXT,
  pincode TEXT,
  community_type TEXT,
  funds_enabled BOOLEAN,
  blocks_enabled BOOLEAN,
  created_at TIMESTAMPTZ,
  members BIGINT,
  leads BIGINT,
  new_members_30d BIGINT,
  mau_30d BIGINT,
  providers BIGINT,
  drops BIGINT,
  orders BIGINT,
  food_revenue NUMERIC,
  listings BIGINT,
  funds BIGINT,
  collected NUMERIC,
  spent NUMERIC,
  balance NUMERIC,
  events BIGINT,
  organizers BIGINT,
  last_activity_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view the communities overview';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.code,
    c.city,
    c.area,
    c.pincode,
    c.community_type,
    c.funds_enabled,
    c.blocks_enabled,
    c.created_at,
    (SELECT COUNT(*)::BIGINT FROM public.profiles p
      WHERE p.community_id = c.id AND p.removed_at IS NULL) AS members,
    (SELECT COUNT(*)::BIGINT FROM public.profiles p
      WHERE p.community_id = c.id AND p.removed_at IS NULL
        AND p.app_role IN ('president', 'vice_president')) AS leads,
    (SELECT COUNT(*)::BIGINT FROM public.profiles p
      WHERE p.community_id = c.id AND p.removed_at IS NULL
        AND p.created_at >= now() - INTERVAL '30 days') AS new_members_30d,
    (SELECT COUNT(*)::BIGINT FROM public.user_last_seen u
      WHERE u.community_id = c.id
        AND u.last_seen_at >= now() - INTERVAL '30 days') AS mau_30d,
    (SELECT COUNT(*)::BIGINT FROM public.service_providers sp
      WHERE sp.community_id = c.id) AS providers,
    (SELECT COUNT(*)::BIGINT FROM public.mcn_preorder_drops d
      WHERE d.community_id = c.id) AS drops,
    (SELECT COUNT(*)::BIGINT FROM public.mcn_preorder_orders o
      WHERE o.community_id = c.id AND o.status <> 'cancelled') AS orders,
    (SELECT COALESCE(SUM(o.total_amount), 0)::NUMERIC FROM public.mcn_preorder_orders o
      WHERE o.community_id = c.id AND o.status <> 'cancelled') AS food_revenue,
    (SELECT COUNT(*)::BIGINT FROM public.mcn_listings l
      WHERE l.community_id = c.id) AS listings,
    (SELECT COUNT(*)::BIGINT FROM public.events e
      WHERE e.community_id = c.id) AS funds,
    (SELECT COALESCE(SUM(t.amount), 0)::NUMERIC FROM public.event_transactions t
      JOIN public.events e ON t.event_id = e.id
      WHERE e.community_id = c.id AND t.type = 'income') AS collected,
    (SELECT COALESCE(SUM(t.amount), 0)::NUMERIC FROM public.event_transactions t
      JOIN public.events e ON t.event_id = e.id
      WHERE e.community_id = c.id AND t.type = 'expense') AS spent,
    (
      (SELECT COALESCE(SUM(t.amount), 0) FROM public.event_transactions t
        JOIN public.events e ON t.event_id = e.id
        WHERE e.community_id = c.id AND t.type = 'income')
      -
      (SELECT COALESCE(SUM(t.amount), 0) FROM public.event_transactions t
        JOIN public.events e ON t.event_id = e.id
        WHERE e.community_id = c.id AND t.type = 'expense')
    )::NUMERIC AS balance,
    (SELECT COUNT(*)::BIGINT FROM public.community_events ce
      WHERE ce.community_id = c.id) AS events,
    (SELECT COUNT(*)::BIGINT FROM public.community_event_organizers o
      JOIN public.profiles p ON p.id = o.user_id AND p.removed_at IS NULL
      WHERE o.community_id = c.id) AS organizers,
    (SELECT MAX(u.last_seen_at) FROM public.user_last_seen u
      WHERE u.community_id = c.id
        AND u.last_seen_at > '-infinity'::timestamptz) AS last_activity_at
  FROM public.communities c
  ORDER BY c.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_communities_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_communities_overview() TO authenticated;

-- 5. Full fund ledger --------------------------------------------------------
-- `platform_get_community_funds` returns a `contributions` array that lumps
-- sponsor income in with resident contributions and renders it as a nameless
-- "Resident". This separates the three kinds of row explicitly.

CREATE OR REPLACE FUNCTION public.platform_get_fund_ledger(p_event_id UUID)
RETURNS TABLE (
  transaction_id UUID,
  entry_kind TEXT,
  type TEXT,
  category TEXT,
  title TEXT,
  description TEXT,
  amount NUMERIC,
  running_balance NUMERIC,
  contributor_id UUID,
  contributor_name TEXT,
  contributor_flat TEXT,
  contributor_block TEXT,
  sponsor_name TEXT,
  sponsor_phone TEXT,
  sponsor_note TEXT,
  image_url TEXT,
  recorded_by_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view fund ledgers';
  END IF;

  RETURN QUERY
  SELECT
    t.id AS transaction_id,
    CASE
      WHEN t.type = 'expense' THEN 'expense'
      WHEN t.contributor_user_id IS NOT NULL THEN 'resident_contribution'
      WHEN t.sponsor_name IS NOT NULL THEN 'sponsor_contribution'
      ELSE 'other_income'
    END AS entry_kind,
    t.type,
    t.category,
    t.title,
    t.description,
    t.amount,
    SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
      OVER (ORDER BY t.created_at ASC, t.id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::NUMERIC AS running_balance,
    t.contributor_user_id AS contributor_id,
    cp.full_name AS contributor_name,
    cp.flat_number AS contributor_flat,
    cb.name AS contributor_block,
    t.sponsor_name,
    t.sponsor_phone,
    t.sponsor_note,
    t.image_url,
    rp.full_name AS recorded_by_name,
    t.created_at
  FROM public.event_transactions t
  LEFT JOIN public.profiles cp ON cp.id = t.contributor_user_id
  LEFT JOIN public.community_blocks cb ON cb.id = cp.block_id
  LEFT JOIN public.profiles rp ON rp.id = t.created_by
  WHERE t.event_id = p_event_id
  ORDER BY t.created_at DESC, t.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_fund_ledger(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_fund_ledger(UUID) TO authenticated;

-- 6. Collection coverage per block -------------------------------------------
-- "How much of the society has actually paid." Relies on the
-- unique_income_contribution_per_member partial index semantics: at most one
-- income row per resident per fund.

CREATE OR REPLACE FUNCTION public.platform_get_fund_collection_coverage(p_event_id UUID)
RETURNS TABLE (
  block_id UUID,
  block_name TEXT,
  residents BIGINT,
  contributors BIGINT,
  collected NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_community_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view fund collection coverage';
  END IF;

  SELECT e.community_id INTO v_community_id FROM public.events e WHERE e.id = p_event_id;
  IF v_community_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.block_id,
    COALESCE(b.name, 'Unassigned') AS block_name,
    COUNT(p.id)::BIGINT AS residents,
    COUNT(t.id)::BIGINT AS contributors,
    COALESCE(SUM(t.amount), 0)::NUMERIC AS collected
  FROM public.profiles p
  LEFT JOIN public.community_blocks b ON b.id = p.block_id
  LEFT JOIN public.event_transactions t
    ON t.contributor_user_id = p.id
   AND t.event_id = p_event_id
   AND t.type = 'income'
  WHERE p.community_id = v_community_id
    AND p.removed_at IS NULL
  GROUP BY p.block_id, b.name
  ORDER BY block_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_fund_collection_coverage(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_fund_collection_coverage(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
