-- Restore canonical platform admin role after profile resets
-- and ensure community request notifications always reach platform admin.

-- 1) Ensure canonical admin profile exists and is marked correctly.
INSERT INTO public.profiles (id, full_name, avatar_url, app_role, email, community_id)
SELECT
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1)),
  u.raw_user_meta_data->>'avatar_url',
  'admin'::public.app_role_type,
  u.email,
  NULL
FROM auth.users u
WHERE lower(COALESCE(u.email, '')) = 'societyservicehub@gmail.com'
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = u.id
  );

UPDATE public.profiles p
SET
  app_role = 'admin'::public.app_role_type,
  community_id = NULL,
  removed_at = NULL,
  removed_by = NULL,
  email = COALESCE(p.email, u.email)
FROM auth.users u
WHERE p.id = u.id
  AND lower(COALESCE(u.email, '')) = 'societyservicehub@gmail.com';

-- 2) Make platform-admin check resilient to accidental profile resets.
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = COALESCE(p_user_id, auth.uid())
      AND p.app_role = 'admin'::public.app_role_type
      AND p.community_id IS NULL
  )
  OR EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = COALESCE(p_user_id, auth.uid())
      AND lower(COALESCE(u.email, '')) = 'societyservicehub@gmail.com'
  );
$$;

-- 3) Ensure newly created auth users get the canonical admin role by email.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, app_role, email)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    CASE
      WHEN lower(COALESCE(new.email, '')) = 'societyservicehub@gmail.com'
        THEN 'admin'::public.app_role_type
      ELSE 'resident'::public.app_role_type
    END,
    new.email
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) Keep notifications robust even if role labels were reset before this migration.
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

GRANT EXECUTE ON FUNCTION public.submit_community_request(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';