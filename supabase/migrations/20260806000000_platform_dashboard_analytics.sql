-- Migration: Platform dashboard analytics extension for pre-order food, businesses, and DAU
-- Date: 2026-08-06

-- 1. Create platform_get_community_dashboard_v2 RPC
CREATE OR REPLACE FUNCTION public.platform_get_community_dashboard_v2(p_community_id UUID DEFAULT NULL)
RETURNS TABLE (
  total_residents BIGINT,
  total_providers BIGINT,
  dau_today BIGINT,
  mau_30d BIGINT,
  visits_planned BIGINT,
  visits_completed BIGINT,
  visits_past_30d BIGINT,
  total_hires BIGINT,
  hires_past_30d BIGINT,
  total_food_drops BIGINT,
  active_food_drops BIGINT,
  total_preorders BIGINT,
  total_food_revenue NUMERIC,
  total_businesses BIGINT,
  active_businesses BIGINT,
  total_business_products BIGINT,
  total_funds BIGINT,
  total_collected NUMERIC,
  total_spent NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view dashboard metrics';
  END IF;

  RETURN QUERY
  SELECT
    -- Residents count
    (SELECT COUNT(*)::BIGINT FROM public.profiles WHERE (p_community_id IS NULL OR community_id = p_community_id) AND removed_at IS NULL) AS total_residents,
    -- Providers count
    (SELECT COUNT(*)::BIGINT FROM public.service_providers WHERE (p_community_id IS NULL OR community_id = p_community_id)) AS total_providers,
    -- Daily Active Users (past 24h)
    (SELECT COUNT(DISTINCT id)::BIGINT FROM public.profiles WHERE (p_community_id IS NULL OR community_id = p_community_id) AND (updated_at >= now() - INTERVAL '24 hours' OR created_at >= now() - INTERVAL '24 hours')) AS dau_today,
    -- Monthly Active Users (past 30d)
    (SELECT COUNT(DISTINCT id)::BIGINT FROM public.profiles WHERE (p_community_id IS NULL OR community_id = p_community_id) AND (updated_at >= now() - INTERVAL '30 days' OR created_at >= now() - INTERVAL '30 days')) AS mau_30d,
    -- Visits stats
    (SELECT COUNT(*)::BIGINT FROM public.service_visits WHERE (p_community_id IS NULL OR community_id = p_community_id) AND status = 'upcoming') AS visits_planned,
    (SELECT COUNT(*)::BIGINT FROM public.service_visits WHERE (p_community_id IS NULL OR community_id = p_community_id) AND status = 'completed') AS visits_completed,
    (SELECT COUNT(*)::BIGINT FROM public.service_visits WHERE (p_community_id IS NULL OR community_id = p_community_id) AND created_at >= now() - INTERVAL '30 days') AS visits_past_30d,
    -- Hires stats
    (SELECT COUNT(*)::BIGINT FROM public.provider_hires h JOIN public.service_providers sp ON h.provider_id = sp.id WHERE (p_community_id IS NULL OR sp.community_id = p_community_id)) AS total_hires,
    (SELECT COUNT(*)::BIGINT FROM public.provider_hires h JOIN public.service_providers sp ON h.provider_id = sp.id WHERE (p_community_id IS NULL OR sp.community_id = p_community_id) AND h.created_at >= now() - INTERVAL '30 days') AS hires_past_30d,
    -- Food Drops stats
    (SELECT COUNT(*)::BIGINT FROM public.mcn_preorder_drops WHERE (p_community_id IS NULL OR community_id = p_community_id)) AS total_food_drops,
    (SELECT COUNT(*)::BIGINT FROM public.mcn_preorder_drops WHERE (p_community_id IS NULL OR community_id = p_community_id) AND status = 'open' AND cutoff_at > now()) AS active_food_drops,
    (SELECT COUNT(*)::BIGINT FROM public.mcn_preorder_orders WHERE (p_community_id IS NULL OR community_id = p_community_id)) AS total_preorders,
    (SELECT COALESCE(SUM(total_amount), 0)::NUMERIC FROM public.mcn_preorder_orders WHERE (p_community_id IS NULL OR community_id = p_community_id) AND status != 'cancelled') AS total_food_revenue,
    -- Business listings stats
    (SELECT COUNT(*)::BIGINT FROM public.mcn_listings WHERE (p_community_id IS NULL OR community_id = p_community_id)) AS total_businesses,
    (SELECT COUNT(*)::BIGINT FROM public.mcn_listings WHERE (p_community_id IS NULL OR community_id = p_community_id) AND is_active = true) AS active_businesses,
    (SELECT COUNT(*)::BIGINT FROM public.mcn_products p JOIN public.mcn_listings l ON p.listing_id = l.id WHERE (p_community_id IS NULL OR l.community_id = p_community_id)) AS total_business_products,
    -- Funds stats
    (SELECT COUNT(*)::BIGINT FROM public.events WHERE (p_community_id IS NULL OR community_id = p_community_id)) AS total_funds,
    (SELECT COALESCE(SUM(amount), 0)::NUMERIC FROM public.event_transactions t JOIN public.events e ON t.event_id = e.id WHERE (p_community_id IS NULL OR e.community_id = p_community_id) AND t.type = 'income') AS total_collected,
    (SELECT COALESCE(SUM(amount), 0)::NUMERIC FROM public.event_transactions t JOIN public.events e ON t.event_id = e.id WHERE (p_community_id IS NULL OR e.community_id = p_community_id) AND t.type = 'expense') AS total_spent;
END;
$$;

-- 2. Create platform_get_community_preorders RPC
CREATE OR REPLACE FUNCTION public.platform_get_community_preorders(p_community_id UUID)
RETURNS TABLE (
  drop_id UUID,
  title TEXT,
  description TEXT,
  fulfillment_date DATE,
  fulfillment_time TEXT,
  cutoff_at TIMESTAMPTZ,
  status TEXT,
  creator_name TEXT,
  creator_flat TEXT,
  orders_count BIGINT,
  total_revenue NUMERIC,
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
    RAISE EXCEPTION 'Only platform admins can view preorder drop details';
  END IF;

  RETURN QUERY
  SELECT
    d.id AS drop_id,
    d.title,
    d.description,
    d.fulfillment_date,
    d.fulfillment_time,
    d.cutoff_at,
    d.status,
    COALESCE(p.full_name, 'Resident Host') AS creator_name,
    COALESCE(p.flat_number, '') AS creator_flat,
    COUNT(o.id)::BIGINT AS orders_count,
    COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total_amount ELSE 0 END), 0)::NUMERIC AS total_revenue,
    d.image_url,
    d.created_at
  FROM public.mcn_preorder_drops d
  LEFT JOIN public.profiles p ON d.created_by = p.id
  LEFT JOIN public.mcn_preorder_orders o ON o.drop_id = d.id
  WHERE d.community_id = p_community_id
  GROUP BY d.id, d.title, d.description, d.fulfillment_date, d.fulfillment_time, d.cutoff_at, d.status, p.full_name, p.flat_number, d.image_url, d.created_at
  ORDER BY d.created_at DESC;
END;
$$;

-- 3. Create platform_get_community_businesses RPC
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
    (SELECT COUNT(*)::BIGINT FROM public.mcn_products WHERE listing_id = l.id) AS product_count,
    COALESCE((SELECT AVG(rating)::NUMERIC(3,1) FROM public.mcn_listing_ratings WHERE listing_id = l.id), 0) AS avg_rating,
    (SELECT COUNT(*)::BIGINT FROM public.mcn_listing_ratings WHERE listing_id = l.id) AS rating_count,
    l.image_url,
    l.created_at
  FROM public.mcn_listings l
  LEFT JOIN public.mcn_business_categories c ON l.category_id = c.id
  LEFT JOIN public.profiles p ON l.owner_id = p.id
  WHERE l.community_id = p_community_id
  ORDER BY l.created_at DESC;
END;
$$;
