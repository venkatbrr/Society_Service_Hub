-- Migration: 20260914000000_platform_feedback_reports_rpc.sql
-- Description: Provide platform admin RPC to read bug reports and feature ideas across communities

CREATE OR REPLACE FUNCTION public.platform_get_feedback_reports(
  p_community_id UUID DEFAULT NULL,
  p_kind TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  community_id UUID,
  kind TEXT,
  message TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ,
  resident_name TEXT,
  resident_email TEXT,
  resident_phone TEXT,
  flat_number TEXT,
  community_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: platform admin only';
  END IF;

  RETURN QUERY
  SELECT
    f.id,
    f.user_id,
    f.community_id,
    f.kind,
    f.message,
    f.image_url,
    f.created_at,
    p.full_name AS resident_name,
    p.email AS resident_email,
    p.phone_number AS resident_phone,
    p.flat_number AS flat_number,
    c.name AS community_name
  FROM public.feedback_reports f
  LEFT JOIN public.profiles p ON p.id = f.user_id
  LEFT JOIN public.communities c ON c.id = f.community_id
  WHERE (p_community_id IS NULL OR f.community_id = p_community_id)
    AND (p_kind IS NULL OR f.kind = p_kind)
  ORDER BY f.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.platform_get_feedback_reports(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_feedback_reports(UUID, TEXT) TO authenticated;
