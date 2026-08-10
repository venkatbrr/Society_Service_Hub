-- ============================================================
-- Migration: Add block_details to community_requests & update approval
-- Date: 2026-09-04
-- ============================================================

-- ============================================================
-- Section 1 - Add columns to community_requests
-- ============================================================

ALTER TABLE public.community_requests
  ADD COLUMN IF NOT EXISTS block_label TEXT CHECK (block_label IN ('Block', 'Tower')),
  ADD COLUMN IF NOT EXISTS block_details JSONB;

-- ============================================================
-- Section 2 - Replace submit_community_request
-- ============================================================

DROP FUNCTION IF EXISTS public.submit_community_request(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.submit_community_request(
  p_name                  TEXT,
  p_city                  TEXT,
  p_pincode               TEXT,
  p_address               TEXT    DEFAULT NULL,
  p_area                  TEXT    DEFAULT NULL,
  p_community_type        TEXT    DEFAULT NULL,
  p_approximate_units     TEXT    DEFAULT NULL,
  p_requester_flat_number TEXT    DEFAULT NULL,
  p_proof_photo_url       TEXT    DEFAULT NULL,
  p_block_label           TEXT    DEFAULT NULL,
  p_block_details         JSONB   DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_id      UUID;
  caller_id       UUID := auth.uid();
  effective_label TEXT;
  block_elem      JSONB;
  flat_elem       JSONB;
  block_count     INT := 0;
  total_flats     INT := 0;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Ensure caller has a profile row
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

  effective_label := NULLIF(btrim(COALESCE(p_block_label, '')), '');
  IF effective_label IS NOT NULL AND effective_label NOT IN ('Block', 'Tower') THEN
    effective_label := 'Block';
  END IF;

  -- Validate block_details payload if provided
  IF p_block_details IS NOT NULL THEN
    IF jsonb_typeof(p_block_details) <> 'array' THEN
      RAISE EXCEPTION 'block_details must be a JSON array';
    END IF;

    FOR block_elem IN SELECT * FROM jsonb_array_elements(p_block_details) LOOP
      block_count := block_count + 1;
      IF block_count > 50 THEN
        RAISE EXCEPTION 'Too many blocks (maximum 50)';
      END IF;

      IF block_elem->>'block' IS NULL OR length(btrim(block_elem->>'block')) = 0 THEN
        RAISE EXCEPTION 'Each block entry must have a non-empty block name';
      END IF;

      IF block_elem->'flats' IS NOT NULL AND jsonb_typeof(block_elem->'flats') = 'array' THEN
        FOR flat_elem IN SELECT * FROM jsonb_array_elements(block_elem->'flats') LOOP
          total_flats := total_flats + 1;
          IF total_flats > 2000 THEN
            RAISE EXCEPTION 'Too many flats across blocks (maximum 2000)';
          END IF;
        END LOOP;
      END IF;
    END LOOP;
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
    proof_photo_url,
    block_label,
    block_details
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
    NULLIF(btrim(COALESCE(p_proof_photo_url, '')), ''),
    effective_label,
    p_block_details
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
    WHERE lower(COALESCE(u.email, '')) IN ('thewooru@gmail.com', 'societyservicehub@gmail.com')
  ) AS t;

  RETURN request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_community_request(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ============================================================
-- Section 3 - Replace platform_approve_community_request
-- ============================================================

DROP FUNCTION IF EXISTS public.platform_approve_community_request(UUID, TEXT[], TEXT);

CREATE OR REPLACE FUNCTION public.platform_approve_community_request(
  p_request_id   UUID,
  p_block_names  TEXT[] DEFAULT NULL,
  p_block_label  TEXT DEFAULT 'Block',
  p_flats        JSONB DEFAULT NULL
)
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
  block_name       TEXT;
  effective_label  TEXT;
  clean_req_flat   TEXT;
  matched_flat_id  UUID;
  has_blocks       BOOLEAN := false;
BEGIN
  IF reviewer_id IS NULL OR NOT public.is_platform_admin(reviewer_id) THEN
    RAISE EXCEPTION 'Only platform admins can approve community requests';
  END IF;

  -- Ensure reviewer profile exists
  INSERT INTO public.profiles (id, full_name, avatar_url, app_role, email)
  SELECT
    u.id,
    COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1)),
    u.raw_user_meta_data->>'avatar_url',
    'admin'::public.app_role_type,
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

  effective_label := COALESCE(NULLIF(btrim(p_block_label), ''), 'Block');
  IF effective_label NOT IN ('Block', 'Tower') THEN
    effective_label := 'Block';
  END IF;

  IF (p_flats IS NOT NULL AND jsonb_typeof(p_flats) = 'array' AND jsonb_array_length(p_flats) > 0)
     OR (p_block_names IS NOT NULL AND array_length(p_block_names, 1) > 0) THEN
    has_blocks := true;
  END IF;

  INSERT INTO public.communities (
    name,
    code,
    pincode,
    city,
    area,
    community_type,
    approximate_units,
    address,
    blocks_enabled,
    block_label
  )
  VALUES (
    req.name,
    generated_code,
    req.pincode,
    req.city,
    req.area,
    req.community_type,
    req.approximate_units,
    req.address,
    has_blocks,
    effective_label
  )
  RETURNING id INTO new_community_id;

  -- Seed flats if provided
  IF p_flats IS NOT NULL AND jsonb_typeof(p_flats) = 'array' AND jsonb_array_length(p_flats) > 0 THEN
    PERFORM public.platform_seed_community_flats(new_community_id, p_flats, effective_label);
  ELSIF p_block_names IS NOT NULL AND array_length(p_block_names, 1) > 0 THEN
    FOREACH block_name IN ARRAY p_block_names LOOP
      IF btrim(block_name) <> '' THEN
        INSERT INTO public.community_blocks (community_id, name)
        VALUES (new_community_id, btrim(block_name))
        ON CONFLICT (community_id, name) DO UPDATE SET archived_at = NULL, updated_at = now();
      END IF;
    END LOOP;
  END IF;

  UPDATE public.community_requests
  SET status                 = 'approved',
      reviewed_by            = reviewer_id,
      reviewed_at            = now(),
      resulting_community_id = new_community_id,
      rejection_reason       = NULL
  WHERE id = req.id;

  PERFORM public.set_audit_context(reviewer_id, 'platform approved community request');

  -- Update requester profile to lead
  UPDATE public.profiles
  SET community_id = new_community_id,
      app_role     = 'president'::public.app_role_type,
      removed_at   = NULL,
      removed_by   = NULL
  WHERE id = req.requested_by;

  -- Try to match requester flat number against seeded flats
  IF req.requester_flat_number IS NOT NULL AND btrim(req.requester_flat_number) <> '' THEN
    clean_req_flat := upper(regexp_replace(req.requester_flat_number, '[^A-Za-z0-9]', '', 'g'));

    SELECT f.id INTO matched_flat_id
    FROM public.community_flats f
    LEFT JOIN public.community_blocks b ON b.id = f.block_id
    WHERE f.community_id = new_community_id
      AND f.archived_at IS NULL
      AND (
        f.flat_number = clean_req_flat
        OR (b.name IS NOT NULL AND upper(b.name || f.flat_number) = clean_req_flat)
        OR (b.name IS NOT NULL AND upper(b.name || '-' || f.flat_number) = clean_req_flat)
      )
    LIMIT 1;

    IF matched_flat_id IS NOT NULL THEN
      UPDATE public.profiles
      SET flat_id = matched_flat_id
      WHERE id = req.requested_by;
    END IF;
  END IF;

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

GRANT EXECUTE ON FUNCTION public.platform_approve_community_request(UUID, TEXT[], TEXT, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
