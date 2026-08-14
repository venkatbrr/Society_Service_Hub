-- Migration: platform dashboard v3, and a NULL-safe providers-by-category.
--
-- Two fixes and one expansion:
--   1. v2's DAU/MAU read `profiles.updated_at`, which does not exist, so v2
--      raised on *every* call and the console silently fell through to v1.
--      v3 reads `public.user_last_seen` (20260910000000) instead.
--   2. `platform_get_providers_by_category` used a strict
--      `sp.community_id = p_community_id`, so the "All Communities" overview
--      always rendered an empty chart. Now NULL means every community, matching
--      the convention the dashboard summary RPC already follows.
--   3. v3 adds the events, coordinator, rating and funds-participation columns
--      the admin console needs to report on shipped features.
--
-- v2 is intentionally left in place so a stale cached console keeps working
-- until the new bundle is deployed.

CREATE OR REPLACE FUNCTION public.platform_get_community_dashboard_v3(p_community_id UUID DEFAULT NULL)
RETURNS TABLE (
  total_communities BIGINT,
  total_residents BIGINT,
  new_residents_30d BIGINT,
  dau_today BIGINT,
  wau_7d BIGINT,
  mau_30d BIGINT,
  total_providers BIGINT,
  total_ratings BIGINT,
  avg_provider_rating NUMERIC,
  visits_planned BIGINT,
  visits_completed BIGINT,
  visits_past_30d BIGINT,
  total_hires BIGINT,
  hires_past_30d BIGINT,
  total_food_drops BIGINT,
  active_food_drops BIGINT,
  total_preorders BIGINT,
  total_food_revenue NUMERIC,
  distinct_food_hosts BIGINT,
  distinct_food_buyers BIGINT,
  total_businesses BIGINT,
  active_businesses BIGINT,
  total_business_products BIGINT,
  distinct_business_owners BIGINT,
  total_funds BIGINT,
  active_funds BIGINT,
  total_collected NUMERIC,
  total_spent NUMERIC,
  contributing_residents BIGINT,
  total_events BIGINT,
  upcoming_events BIGINT,
  cancelled_events BIGINT,
  total_event_organizers BIGINT
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
    -- Reach
    (SELECT COUNT(*)::BIGINT FROM public.communities
      WHERE (p_community_id IS NULL OR id = p_community_id)) AS total_communities,
    (SELECT COUNT(*)::BIGINT FROM public.profiles
      WHERE (p_community_id IS NULL OR community_id = p_community_id)
        AND removed_at IS NULL) AS total_residents,
    (SELECT COUNT(*)::BIGINT FROM public.profiles
      WHERE (p_community_id IS NULL OR community_id = p_community_id)
        AND removed_at IS NULL
        AND created_at >= now() - INTERVAL '30 days') AS new_residents_30d,

    -- Engagement, from the merged heartbeat + derived activity signal
    (SELECT COUNT(*)::BIGINT FROM public.user_last_seen
      WHERE (p_community_id IS NULL OR community_id = p_community_id)
        AND last_seen_at >= now() - INTERVAL '24 hours') AS dau_today,
    (SELECT COUNT(*)::BIGINT FROM public.user_last_seen
      WHERE (p_community_id IS NULL OR community_id = p_community_id)
        AND last_seen_at >= now() - INTERVAL '7 days') AS wau_7d,
    (SELECT COUNT(*)::BIGINT FROM public.user_last_seen
      WHERE (p_community_id IS NULL OR community_id = p_community_id)
        AND last_seen_at >= now() - INTERVAL '30 days') AS mau_30d,

    -- Service providers
    (SELECT COUNT(*)::BIGINT FROM public.service_providers
      WHERE (p_community_id IS NULL OR community_id = p_community_id)) AS total_providers,
    (SELECT COUNT(*)::BIGINT FROM public.ratings r
      JOIN public.service_providers sp ON r.provider_id = sp.id
      WHERE (p_community_id IS NULL OR sp.community_id = p_community_id)) AS total_ratings,
    (SELECT COALESCE(ROUND(AVG(sp.avg_rating), 2), 0)::NUMERIC FROM public.service_providers sp
      WHERE (p_community_id IS NULL OR sp.community_id = p_community_id)
        AND sp.rating_count > 0) AS avg_provider_rating,

    -- Visits
    (SELECT COUNT(*)::BIGINT FROM public.service_visits
      WHERE (p_community_id IS NULL OR community_id = p_community_id)
        AND status = 'upcoming') AS visits_planned,
    (SELECT COUNT(*)::BIGINT FROM public.service_visits
      WHERE (p_community_id IS NULL OR community_id = p_community_id)
        AND status = 'completed') AS visits_completed,
    (SELECT COUNT(*)::BIGINT FROM public.service_visits
      WHERE (p_community_id IS NULL OR community_id = p_community_id)
        AND created_at >= now() - INTERVAL '30 days') AS visits_past_30d,

    -- Hires
    (SELECT COUNT(*)::BIGINT FROM public.provider_hires h
      JOIN public.service_providers sp ON h.provider_id = sp.id
      WHERE (p_community_id IS NULL OR sp.community_id = p_community_id)) AS total_hires,
    (SELECT COUNT(*)::BIGINT FROM public.provider_hires h
      JOIN public.service_providers sp ON h.provider_id = sp.id
      WHERE (p_community_id IS NULL OR sp.community_id = p_community_id)
        AND h.created_at >= now() - INTERVAL '30 days') AS hires_past_30d,

    -- Pre-order food. Cancelled orders are excluded everywhere, matching the
    -- resident-facing definition (see 20260817000000).
    (SELECT COUNT(*)::BIGINT FROM public.mcn_preorder_drops
      WHERE (p_community_id IS NULL OR community_id = p_community_id)) AS total_food_drops,
    (SELECT COUNT(*)::BIGINT FROM public.mcn_preorder_drops
      WHERE (p_community_id IS NULL OR community_id = p_community_id)
        AND status = 'open' AND cutoff_at > now()) AS active_food_drops,
    (SELECT COUNT(*)::BIGINT FROM public.mcn_preorder_orders
      WHERE (p_community_id IS NULL OR community_id = p_community_id)
        AND status <> 'cancelled') AS total_preorders,
    (SELECT COALESCE(SUM(total_amount), 0)::NUMERIC FROM public.mcn_preorder_orders
      WHERE (p_community_id IS NULL OR community_id = p_community_id)
        AND status <> 'cancelled') AS total_food_revenue,
    (SELECT COUNT(DISTINCT created_by)::BIGINT FROM public.mcn_preorder_drops
      WHERE (p_community_id IS NULL OR community_id = p_community_id)) AS distinct_food_hosts,
    (SELECT COUNT(DISTINCT buyer_id)::BIGINT FROM public.mcn_preorder_orders
      WHERE (p_community_id IS NULL OR community_id = p_community_id)
        AND status <> 'cancelled') AS distinct_food_buyers,

    -- Resident businesses
    (SELECT COUNT(*)::BIGINT FROM public.mcn_listings
      WHERE (p_community_id IS NULL OR community_id = p_community_id)) AS total_businesses,
    (SELECT COUNT(*)::BIGINT FROM public.mcn_listings
      WHERE (p_community_id IS NULL OR community_id = p_community_id)
        AND is_active = true) AS active_businesses,
    (SELECT COUNT(*)::BIGINT FROM public.mcn_products p
      JOIN public.mcn_listings l ON p.listing_id = l.id
      WHERE (p_community_id IS NULL OR l.community_id = p_community_id)) AS total_business_products,
    (SELECT COUNT(DISTINCT owner_id)::BIGINT FROM public.mcn_listings
      WHERE (p_community_id IS NULL OR community_id = p_community_id)) AS distinct_business_owners,

    -- Funds. `public.events` is a FUND, not a community event.
    (SELECT COUNT(*)::BIGINT FROM public.events
      WHERE (p_community_id IS NULL OR community_id = p_community_id)) AS total_funds,
    (SELECT COUNT(*)::BIGINT FROM public.events
      WHERE (p_community_id IS NULL OR community_id = p_community_id)
        AND COALESCE(is_closed, false) = false) AS active_funds,
    (SELECT COALESCE(SUM(t.amount), 0)::NUMERIC FROM public.event_transactions t
      JOIN public.events e ON t.event_id = e.id
      WHERE (p_community_id IS NULL OR e.community_id = p_community_id)
        AND t.type = 'income') AS total_collected,
    (SELECT COALESCE(SUM(t.amount), 0)::NUMERIC FROM public.event_transactions t
      JOIN public.events e ON t.event_id = e.id
      WHERE (p_community_id IS NULL OR e.community_id = p_community_id)
        AND t.type = 'expense') AS total_spent,
    (SELECT COUNT(DISTINCT t.contributor_user_id)::BIGINT FROM public.event_transactions t
      JOIN public.events e ON t.event_id = e.id
      WHERE (p_community_id IS NULL OR e.community_id = p_community_id)
        AND t.type = 'income'
        AND t.contributor_user_id IS NOT NULL) AS contributing_residents,

    -- Community events (the cultural/sports module — NOT public.events)
    (SELECT COUNT(*)::BIGINT FROM public.community_events
      WHERE (p_community_id IS NULL OR community_id = p_community_id)) AS total_events,
    (SELECT COUNT(*)::BIGINT FROM public.community_events
      WHERE (p_community_id IS NULL OR community_id = p_community_id)
        AND status = 'published'
        AND event_date >= CURRENT_DATE) AS upcoming_events,
    (SELECT COUNT(*)::BIGINT FROM public.community_events
      WHERE (p_community_id IS NULL OR community_id = p_community_id)
        AND status = 'cancelled') AS cancelled_events,
    (SELECT COUNT(*)::BIGINT FROM public.community_event_organizers o
      JOIN public.profiles p ON p.id = o.user_id AND p.removed_at IS NULL
      WHERE (p_community_id IS NULL OR o.community_id = p_community_id)) AS total_event_organizers;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_community_dashboard_v3(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_community_dashboard_v3(UUID) TO authenticated;

-- NULL-safe providers by category -------------------------------------------

CREATE OR REPLACE FUNCTION public.platform_get_providers_by_category(p_community_id UUID DEFAULT NULL)
RETURNS TABLE (
  category TEXT,
  provider_count BIGINT,
  top_providers JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view provider metrics';
  END IF;

  RETURN QUERY
  WITH provider_stats AS (
    SELECT
      sp.id,
      sp.name,
      sp.category,
      sp.avg_rating,
      COUNT(ph.id) AS total_hires
    FROM public.service_providers sp
    LEFT JOIN public.provider_hires ph ON ph.provider_id = sp.id
    WHERE (p_community_id IS NULL OR sp.community_id = p_community_id)
    GROUP BY sp.id, sp.name, sp.category, sp.avg_rating
  ),
  ranked_providers AS (
    SELECT
      ps.*,
      ROW_NUMBER() OVER (
        PARTITION BY ps.category
        ORDER BY ps.avg_rating DESC NULLS LAST, ps.total_hires DESC, ps.name ASC
      ) AS rank
    FROM provider_stats ps
  ),
  top_three AS (
    SELECT
      rp.category,
      jsonb_agg(
        jsonb_build_object(
          'id', rp.id,
          'name', rp.name,
          'avg_rating', rp.avg_rating,
          'total_hires', rp.total_hires
        ) ORDER BY rp.rank ASC
      ) AS top_providers_list
    FROM ranked_providers rp
    WHERE rp.rank <= 3
    GROUP BY rp.category
  )
  SELECT
    sp_cat.category,
    COUNT(sp_cat.id)::BIGINT AS provider_count,
    COALESCE(tt.top_providers_list, '[]'::jsonb) AS top_providers
  FROM public.service_providers sp_cat
  LEFT JOIN top_three tt ON sp_cat.category = tt.category
  WHERE (p_community_id IS NULL OR sp_cat.community_id = p_community_id)
  GROUP BY sp_cat.category, tt.top_providers_list
  ORDER BY provider_count DESC, sp_cat.category ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_providers_by_category(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_providers_by_category(UUID) TO authenticated;

-- Daily activity trend for the dashboard chart ------------------------------

CREATE OR REPLACE FUNCTION public.platform_get_activity_trend(
  p_community_id UUID DEFAULT NULL,
  p_days INT DEFAULT 90
)
RETURNS TABLE (
  day DATE,
  signups BIGINT,
  orders BIGINT,
  contributions BIGINT,
  active_users BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_days INT := LEAST(GREATEST(COALESCE(p_days, 90), 1), 365);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view activity trends';
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT generate_series(
      (CURRENT_DATE - (v_days - 1))::date,
      CURRENT_DATE,
      INTERVAL '1 day'
    )::date AS day
  ),
  scoped_users AS (
    SELECT id FROM public.profiles
    WHERE (p_community_id IS NULL OR community_id = p_community_id)
  )
  SELECT
    d.day,
    (SELECT COUNT(*)::BIGINT FROM public.profiles p
      WHERE (p_community_id IS NULL OR p.community_id = p_community_id)
        AND p.created_at::date = d.day) AS signups,
    (SELECT COUNT(*)::BIGINT FROM public.mcn_preorder_orders o
      WHERE (p_community_id IS NULL OR o.community_id = p_community_id)
        AND o.status <> 'cancelled'
        AND o.created_at::date = d.day) AS orders,
    (SELECT COUNT(*)::BIGINT FROM public.event_transactions t
      JOIN public.events e ON t.event_id = e.id
      WHERE (p_community_id IS NULL OR e.community_id = p_community_id)
        AND t.type = 'income'
        AND t.created_at::date = d.day) AS contributions,
    (SELECT COUNT(DISTINCT a.user_id)::BIGINT FROM public.v_user_activity a
      WHERE a.user_id IN (SELECT id FROM scoped_users)
        AND a.created_at::date = d.day) AS active_users
  FROM days d
  ORDER BY d.day ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_activity_trend(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_activity_trend(UUID, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';
