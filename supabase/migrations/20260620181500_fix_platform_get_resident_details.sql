-- Migration: Fix public.platform_get_resident_details RPC column names
-- Date: 2026-06-20

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

  -- Count orders (buyer_id is the correct column name in mcn_orders)
  SELECT COUNT(*)::BIGINT INTO v_orders_count FROM public.mcn_orders WHERE buyer_id = p_profile_id;
  
  -- Count posts (user_id is the correct column name in mcn_posts)
  SELECT COUNT(*)::BIGINT INTO v_posts_count FROM public.mcn_posts WHERE user_id = p_profile_id;

  -- Count service visits (created_by is the correct column name in service_visits)
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

GRANT EXECUTE ON FUNCTION public.platform_get_resident_details(UUID) TO authenticated;
