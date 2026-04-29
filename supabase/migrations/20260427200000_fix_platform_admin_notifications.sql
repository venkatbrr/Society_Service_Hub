-- Fix platform admin notification system

-- 1. Fix notification RLS policies to allow platform admin to view and update notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (
    user_id = auth.uid()
    AND (public.is_user_approved(auth.uid()) OR public.is_platform_admin(auth.uid()))
  );

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (
    user_id = auth.uid()
    AND (public.is_user_approved(auth.uid()) OR public.is_platform_admin(auth.uid()))
  )
  WITH CHECK (
    user_id = auth.uid()
    AND (public.is_user_approved(auth.uid()) OR public.is_platform_admin(auth.uid()))
  );

-- 2. Update submit_community_request to notify platform admins
CREATE OR REPLACE FUNCTION public.submit_community_request(
  p_name                  TEXT,
  p_city                  TEXT,
  p_pincode               TEXT,
  p_address               TEXT    DEFAULT NULL,
  p_area                  TEXT    DEFAULT NULL,
  p_community_type        TEXT    DEFAULT NULL,
  p_approximate_units     TEXT    DEFAULT NULL,
  p_requester_flat_number TEXT    DEFAULT NULL,
  p_proof_photo_url       TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.community_requests
    WHERE requested_by = auth.uid()
      AND status IN ('pending', 'needs_info')
  ) THEN
    RAISE EXCEPTION 'You already have an active community request.';
  END IF;

  INSERT INTO public.community_requests (
    requested_by,
    name,
    city,
    pincode,
    address,
    area,
    community_type,
    approximate_units,
    requester_flat_number,
    proof_photo_url
  )
  VALUES (
    auth.uid(),
    btrim(p_name),
    btrim(p_city),
    btrim(p_pincode),
    NULLIF(btrim(COALESCE(p_address, '')), ''),
    NULLIF(btrim(COALESCE(p_area, '')), ''),
    NULLIF(btrim(COALESCE(p_community_type, '')), ''),
    NULLIF(btrim(COALESCE(p_approximate_units, '')), ''),
    NULLIF(btrim(COALESCE(p_requester_flat_number, '')), ''),
    NULLIF(btrim(COALESCE(p_proof_photo_url, '')), '')
  )
  RETURNING id INTO request_id;

  -- Notify platform admins about the new community request
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    p.id,
    'new_community_request',
    'New community request',
    'A new community request for "' || btrim(p_name) || '" needs your review.',
    jsonb_build_object('request_id', request_id, 'community_name', btrim(p_name))
  FROM public.profiles p
  WHERE p.app_role = 'admin'::public.app_role_type
    AND p.community_id IS NULL;

  RETURN request_id;
END;
$$;

-- 3. Ensure execute permissions are granted
GRANT EXECUTE ON FUNCTION public.submit_community_request(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;

-- Reload schema
NOTIFY pgrst, 'reload schema';
