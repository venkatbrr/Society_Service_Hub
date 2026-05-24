-- Fix: ensure caller's profile exists before inserting into community_requests
-- so the FK constraint on requested_by → profiles(id) is always satisfied.
--
-- Root cause: if handle_new_user trigger fails or is skipped (e.g. duplicate key
-- from a previously deleted+recreated account), the profile row may not exist.
-- The insert into community_requests then fails with a foreign key violation.

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
  caller_id  UUID := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Ensure caller has a profile row (handles edge case where
  -- the handle_new_user trigger failed or was skipped).
  INSERT INTO public.profiles (id, full_name, avatar_url, app_role, email, flat_number)
  SELECT
    u.id,
    COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
    u.raw_user_meta_data->>'avatar_url',
    'resident'::public.app_role_type,
    u.email,
    u.raw_user_meta_data->>'flat_number'
  FROM auth.users u
  WHERE u.id = caller_id
  ON CONFLICT (id) DO NOTHING;

  IF EXISTS (
    SELECT 1
    FROM public.community_requests
    WHERE requested_by = caller_id
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
    caller_id,
    btrim(p_name),
    btrim(p_city),
    btrim(p_pincode),
    NULLIF(btrim(COALESCE(p_address, '')), ''),
    NULLIF(btrim(COALESCE(p_area, '')), ''),
    COALESCE(NULLIF(btrim(COALESCE(p_community_type, '')), ''), 'apartment'),
    NULLIF(btrim(COALESCE(p_approximate_units, '')), ''),
    NULLIF(btrim(COALESCE(p_requester_flat_number, '')), ''),
    NULLIF(btrim(COALESCE(p_proof_photo_url, '')), '')
  )
  RETURNING id INTO request_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    t.user_id,
    'new_community_request',
    'New community request',
    'A new community request for "' || btrim(p_name) || '" needs your review.',
    jsonb_build_object('request_id', request_id, 'community_name', btrim(p_name))
  FROM (
    SELECT p.id AS user_id
    FROM public.profiles p
    WHERE p.app_role = 'admin'::public.app_role_type
      AND p.community_id IS NULL
    UNION
    SELECT u.id AS user_id
    FROM auth.users u
    WHERE lower(COALESCE(u.email, '')) = 'societyservicehub@gmail.com'
  ) AS t;

  RETURN request_id;
END;
$$;

-- Fix: ensure platform reviewer profile exists before setting
-- community_requests.reviewed_by (FK -> profiles.id).
CREATE OR REPLACE FUNCTION public.platform_approve_community_request(p_request_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req              public.community_requests%ROWTYPE;
  requester        public.profiles%ROWTYPE;
  new_community_id UUID;
  generated_code   TEXT;
  reviewer_id      UUID := auth.uid();
BEGIN
  IF reviewer_id IS NULL OR NOT public.is_platform_admin(reviewer_id) THEN
    RAISE EXCEPTION 'Only platform admins can approve community requests';
  END IF;

  -- Ensure reviewer has a profile row so reviewed_by FK is valid.
  INSERT INTO public.profiles (id, full_name, avatar_url, app_role, email)
  SELECT
    u.id,
    COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1)),
    u.raw_user_meta_data->>'avatar_url',
    CASE
      WHEN lower(COALESCE(u.email, '')) = 'societyservicehub@gmail.com'
        THEN 'admin'::public.app_role_type
      ELSE 'resident'::public.app_role_type
    END,
    u.email
  FROM auth.users u
  WHERE u.id = reviewer_id
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO req
  FROM public.community_requests
  WHERE id = p_request_id
    AND status = 'pending';

  IF req.id IS NULL THEN
    RAISE EXCEPTION 'Pending request not found';
  END IF;

  SELECT * INTO requester
  FROM public.profiles
  WHERE id = req.requested_by;

  IF requester.id IS NULL THEN
    RAISE EXCEPTION 'Requester profile not found';
  END IF;

  generated_code := public.generate_community_code();

  INSERT INTO public.communities (name, code, pincode, city, area, community_type, approximate_units, address)
  VALUES (
    req.name,
    generated_code,
    req.pincode,
    req.city,
    req.area,
    req.community_type,
    req.approximate_units,
    req.address
  )
  RETURNING id INTO new_community_id;

  UPDATE public.community_requests
  SET status                 = 'approved',
      reviewed_by            = reviewer_id,
      reviewed_at            = now(),
      resulting_community_id = new_community_id,
      rejection_reason       = NULL
  WHERE id = req.id;

  PERFORM public.set_audit_context(reviewer_id, 'platform approved community request');

  UPDATE public.profiles
  SET community_id = new_community_id,
      app_role     = 'resident'::public.app_role_type,
      removed_at   = NULL,
      removed_by   = NULL
  WHERE id = req.requested_by;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    req.requested_by,
    'community_approved',
    'Community request approved!',
    'Your community "' || req.name || '" has been approved. '
      || 'Your community code is: ' || generated_code
      || '. Share it with your neighbors to let them join!',
    jsonb_build_object(
      'community_id',   new_community_id,
      'community_name', req.name,
      'community_code', generated_code
    )
  );

  RETURN new_community_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_community_request(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_approve_community_request(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
