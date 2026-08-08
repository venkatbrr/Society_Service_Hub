-- Migration: 20260902000300_platform_admin_provider_moderation.sql
-- M4: Extend platform_get_provider_details and platform_get_all_providers with fraud, moderation, and review details.

-- §1. Extend platform_get_provider_details
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

  -- Get provider info including moderation fields
  SELECT sp.*, c.name AS community_name
  INTO v_provider
  FROM public.service_providers sp
  JOIN public.communities c ON sp.community_id = c.id
  WHERE sp.id = p_provider_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Get ratings (reviews) including review_text, fraud_status, rules, and reviewer community_id
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'rating_id', r.id,
      'rating', r.rating,
      'review_text', r.review_text,
      'fraud_status', r.fraud_status,
      'fraud_rules_triggered', r.fraud_rules_triggered,
      'created_at', r.created_at,
      'user_name', p.full_name,
      'user_email', p.email,
      'flat_number', p.flat_number,
      'user_community_id', p.community_id
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

  -- Get total hires count
  SELECT COUNT(*) INTO v_hires_count
  FROM public.provider_hires
  WHERE provider_id = p_provider_id;

  RETURN jsonb_build_object(
    'provider', jsonb_build_object(
      'id', v_provider.id,
      'name', v_provider.name,
      'phone', v_provider.phone,
      'category', v_provider.category,
      'description', v_provider.description,
      'flat_block', v_provider.flat_block,
      'details', v_provider.details,
      'avg_rating', v_provider.avg_rating,
      'rating_count', v_provider.rating_count,
      'fraud_status', v_provider.fraud_status,
      'is_verified', v_provider.is_verified,
      'visibility', v_provider.visibility,
      'community_id', v_provider.community_id,
      'community_name', v_provider.community_name,
      'created_at', v_provider.created_at
    ),
    'hires_count', v_hires_count,
    'reviews', v_reviews,
    'reports', v_reports
  );
END;
$$;

-- §2. Extend platform_get_all_providers (must drop due to signature change)
DROP FUNCTION IF EXISTS public.platform_get_all_providers(UUID, TEXT);

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
  community_name TEXT,
  fraud_status TEXT,
  is_verified BOOLEAN,
  report_count BIGINT
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
    c.name AS community_name,
    sp.fraud_status,
    sp.is_verified,
    (SELECT COUNT(*) FROM public.provider_reports pr WHERE pr.provider_id = sp.id AND pr.status = 'pending') AS report_count
  FROM public.service_providers sp
  JOIN public.communities c ON sp.community_id = c.id
  WHERE (p_community_id IS NULL OR sp.community_id = p_community_id)
    AND (p_search = '' OR sp.name ILIKE '%' || p_search || '%' OR sp.phone ILIKE '%' || p_search || '%' OR sp.category ILIKE '%' || p_search || '%')
  ORDER BY sp.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_provider_details(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_provider_details(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.platform_get_all_providers(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_all_providers(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
