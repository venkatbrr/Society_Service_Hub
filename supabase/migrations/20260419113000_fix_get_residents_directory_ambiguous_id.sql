CREATE OR REPLACE FUNCTION public.get_residents_directory(p_include_phone BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  flat_number TEXT,
  phone_number TEXT,
  app_role public.app_role_type
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller public.profiles%ROWTYPE;
  caller_can_view_phone BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT p.* INTO caller
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF caller.approval_status <> 'approved' AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only approved members can access the directory';
  END IF;

  IF caller.community_id IS NULL AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Community not selected';
  END IF;

  caller_can_view_phone := public.is_platform_admin(auth.uid())
    OR (
      caller.community_id IS NOT NULL
      AND caller.app_role IN ('community_admin'::public.app_role_type, 'admin'::public.app_role_type)
    );

  IF p_include_phone AND NOT caller_can_view_phone THEN
    RAISE EXCEPTION 'Only community admins can view phone numbers';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.flat_number,
    CASE WHEN p_include_phone AND caller_can_view_phone THEN p.phone_number ELSE NULL END AS phone_number,
    p.app_role
  FROM public.profiles p
  WHERE p.community_id = caller.community_id
    AND p.approval_status = 'approved'
    AND p.removed_at IS NULL
  ORDER BY p.full_name NULLS LAST;
END;
$$;
