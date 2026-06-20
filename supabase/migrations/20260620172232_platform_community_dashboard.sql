-- Migration: Platform community dashboard and provider metrics RPCs
-- Date: 2026-06-20

-- ============================================================
-- 1. Create platform_get_community_dashboard RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.platform_get_community_dashboard(p_community_id UUID)
RETURNS TABLE (
  total_residents BIGINT,
  total_providers BIGINT,
  visits_planned BIGINT,
  visits_completed BIGINT,
  visits_cancelled BIGINT,
  visits_past_30d BIGINT,
  total_hires BIGINT,
  hires_past_30d BIGINT,
  total_mcn_orders BIGINT,
  orders_pending BIGINT,
  orders_fulfilled BIGINT,
  total_funds BIGINT,
  total_collected NUMERIC,
  total_spent NUMERIC,
  total_mcn_posts BIGINT,
  total_listings BIGINT
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
    (SELECT COUNT(*)::BIGINT FROM public.profiles WHERE community_id = p_community_id AND removed_at IS NULL) AS total_residents,
    (SELECT COUNT(*)::BIGINT FROM public.service_providers WHERE community_id = p_community_id) AS total_providers,
    (SELECT COUNT(*)::BIGINT FROM public.service_visits WHERE community_id = p_community_id AND status = 'upcoming') AS visits_planned,
    (SELECT COUNT(*)::BIGINT FROM public.service_visits WHERE community_id = p_community_id AND status = 'completed') AS visits_completed,
    (SELECT COUNT(*)::BIGINT FROM public.service_visits WHERE community_id = p_community_id AND status = 'cancelled') AS visits_cancelled,
    (SELECT COUNT(*)::BIGINT FROM public.service_visits WHERE community_id = p_community_id AND created_at >= now() - INTERVAL '30 days') AS visits_past_30d,
    (SELECT COUNT(*)::BIGINT FROM public.provider_hires h JOIN public.service_providers sp ON h.provider_id = sp.id WHERE sp.community_id = p_community_id) AS total_hires,
    (SELECT COUNT(*)::BIGINT FROM public.provider_hires h JOIN public.service_providers sp ON h.provider_id = sp.id WHERE sp.community_id = p_community_id AND h.created_at >= now() - INTERVAL '30 days') AS hires_past_30d,
    (SELECT COUNT(*)::BIGINT FROM public.mcn_orders WHERE community_id = p_community_id) AS total_mcn_orders,
    (SELECT COUNT(*)::BIGINT FROM public.mcn_orders WHERE community_id = p_community_id AND status = 'pending') AS orders_pending,
    (SELECT COUNT(*)::BIGINT FROM public.mcn_orders WHERE community_id = p_community_id AND status = 'fulfilled') AS orders_fulfilled,
    (SELECT COUNT(*)::BIGINT FROM public.events WHERE community_id = p_community_id) AS total_funds,
    (SELECT COALESCE(SUM(amount), 0)::NUMERIC FROM public.event_transactions t JOIN public.events e ON t.event_id = e.id WHERE e.community_id = p_community_id AND t.type = 'income') AS total_collected,
    (SELECT COALESCE(SUM(amount), 0)::NUMERIC FROM public.event_transactions t JOIN public.events e ON t.event_id = e.id WHERE e.community_id = p_community_id AND t.type = 'expense') AS total_spent,
    (SELECT COUNT(*)::BIGINT FROM public.mcn_posts WHERE community_id = p_community_id) AS total_mcn_posts,
    (SELECT COUNT(*)::BIGINT FROM public.mcn_listings WHERE community_id = p_community_id) AS total_listings;
END;
$$;

-- ============================================================
-- 2. Create platform_get_providers_by_category RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.platform_get_providers_by_category(p_community_id UUID)
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
    WHERE sp.community_id = p_community_id
    GROUP BY sp.id, sp.name, sp.category, sp.avg_rating
  ),
  ranked_providers AS (
    SELECT
      ps.id,
      ps.name,
      ps.category,
      ps.avg_rating,
      ps.total_hires,
      ROW_NUMBER() OVER (PARTITION BY ps.category ORDER BY ps.avg_rating DESC, ps.total_hires DESC, ps.name ASC) as rank
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
  WHERE sp_cat.community_id = p_community_id
  GROUP BY sp_cat.category, tt.top_providers_list
  ORDER BY provider_count DESC, sp_cat.category ASC;
END;
$$;

-- ============================================================
-- 3. Grants
-- ============================================================

GRANT EXECUTE ON FUNCTION public.platform_get_community_dashboard(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_get_providers_by_category(UUID) TO authenticated;

-- ============================================================
-- 4. Reload Schema Notification
-- ============================================================

NOTIFY pgrst, 'reload schema';
