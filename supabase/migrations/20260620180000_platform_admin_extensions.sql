-- Migration: Platform admin extensions for managing residents and service providers
-- Date: 2026-06-20

-- ============================================================
-- 1. platform_get_all_providers RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.platform_get_all_providers(
  p_community_id UUID DEFAULT NULL,
  p_search TEXT DEFAULT ''
)
RETURNS TABLE (
  id UUID,
  community_id UUID,
  name TEXT,
  phone TEXT,
  category TEXT,
  avg_rating NUMERIC,
  rating_count INTEGER,
  community_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view providers';
  END IF;

  RETURN QUERY
  SELECT
    sp.id,
    sp.community_id,
    sp.name,
    sp.phone,
    sp.category,
    sp.avg_rating,
    sp.rating_count,
    c.name AS community_name
  FROM public.service_providers sp
  JOIN public.communities c ON sp.community_id = c.id
  WHERE (p_community_id IS NULL OR sp.community_id = p_community_id)
    AND (p_search = '' OR sp.name ILIKE '%' || p_search || '%' OR sp.phone ILIKE '%' || p_search || '%' OR sp.category ILIKE '%' || p_search || '%')
  ORDER BY sp.name ASC;
END;
$$;

-- ============================================================
-- 2. platform_get_provider_details RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.platform_get_provider_details(p_provider_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_provider RECORD;
  v_reviews JSONB;
  v_reports JSONB;
  v_hires_count BIGINT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view provider details';
  END IF;

  -- Get provider info
  SELECT sp.*, c.name AS community_name
  INTO v_provider
  FROM public.service_providers sp
  JOIN public.communities c ON sp.community_id = c.id
  WHERE sp.id = p_provider_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Get ratings (reviews)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'rating_id', r.id,
      'rating', r.rating,
      'created_at', r.created_at,
      'user_name', p.full_name,
      'user_email', p.email,
      'flat_number', p.flat_number
    ) ORDER BY r.created_at DESC
  ), '[]'::jsonb)
  INTO v_reviews
  FROM public.ratings r
  JOIN public.profiles p ON r.user_id = p.id
  WHERE r.provider_id = p_provider_id;

  -- Get reports
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'report_id', pr.id,
      'reason', pr.reason,
      'details', pr.details,
      'status', pr.status,
      'created_at', pr.created_at,
      'user_name', p.full_name,
      'user_email', p.email
    ) ORDER BY pr.created_at DESC
  ), '[]'::jsonb)
  INTO v_reports
  FROM public.provider_reports pr
  JOIN public.profiles p ON pr.reported_by = p.id
  WHERE pr.provider_id = p_provider_id;

  -- Get total hires
  SELECT COUNT(*)::BIGINT
  INTO v_hires_count
  FROM public.provider_hires
  WHERE provider_id = p_provider_id;

  RETURN jsonb_build_object(
    'id', v_provider.id,
    'name', v_provider.name,
    'phone', v_provider.phone,
    'category', v_provider.category,
    'description', v_provider.description,
    'flat_block', v_provider.flat_block,
    'avg_rating', v_provider.avg_rating,
    'rating_count', v_provider.rating_count,
    'community_id', v_provider.community_id,
    'community_name', v_provider.community_name,
    'created_at', v_provider.created_at,
    'hires_count', v_hires_count,
    'reviews', v_reviews,
    'reports', v_reports
  );
END;
$$;

-- ============================================================
-- 3. platform_delete_service_provider RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.platform_delete_service_provider(p_provider_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can delete service providers';
  END IF;

  DELETE FROM public.service_providers WHERE id = p_provider_id;
  RETURN TRUE;
END;
$$;

-- ============================================================
-- 4. platform_get_resident_details RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.platform_get_resident_details(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
  v_orders_count BIGINT;
  v_posts_count BIGINT;
  v_visits_count BIGINT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view resident details';
  END IF;

  SELECT p.*, c.name AS community_name
  INTO v_profile
  FROM public.profiles p
  LEFT JOIN public.communities c ON p.community_id = c.id
  WHERE p.id = p_profile_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Count orders
  SELECT COUNT(*)::BIGINT INTO v_orders_count FROM public.mcn_orders WHERE user_id = p_profile_id;
  
  -- Count posts
  SELECT COUNT(*)::BIGINT INTO v_posts_count FROM public.mcn_posts WHERE author_id = p_profile_id;

  -- Count service visits
  SELECT COUNT(*)::BIGINT INTO v_visits_count FROM public.service_visits WHERE created_by = p_profile_id;

  RETURN jsonb_build_object(
    'id', v_profile.id,
    'full_name', v_profile.full_name,
    'email', v_profile.email,
    'phone_number', v_profile.phone_number,
    'flat_number', v_profile.flat_number,
    'app_role', v_profile.app_role,
    'community_id', v_profile.community_id,
    'community_name', v_profile.community_name,
    'created_at', v_profile.created_at,
    'removed_at', v_profile.removed_at,
    'orders_count', v_orders_count,
    'posts_count', v_posts_count,
    'visits_count', v_visits_count
  );
END;
$$;

-- ============================================================
-- 5. Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION public.platform_get_all_providers(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_get_provider_details(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_delete_service_provider(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_get_resident_details(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
