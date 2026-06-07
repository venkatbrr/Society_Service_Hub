-- ============================================================
-- Migration: Block label + decouple blocks from funds
-- Date: 2026-06-07
--
-- 1. Add block_label column to communities (Block or Tower)
-- 2. Decouple is_blocks_enabled() from funds_enabled
-- 3. Update platform_approve_community_request to seed blocks
-- 4. New platform_set_block_label RPC
-- 5. Remove funds gates from community-lead block management RPCs
-- 6. Remove funds gates from platform block management RPCs
-- ============================================================

-- ============================================================
-- Section 1 - block_label column
-- ============================================================

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS block_label TEXT NOT NULL DEFAULT 'Block'
    CHECK (block_label IN ('Block', 'Tower'));

-- ============================================================
-- Section 2 - decouple is_blocks_enabled from funds
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_blocks_enabled(p_community_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(blocks_enabled, false)
  FROM public.communities
  WHERE id = p_community_id;
$$;

-- ============================================================
-- Section 3 - update platform_approve_community_request
-- ============================================================

-- Drop the old single-arg overload so we can add the new one
-- (the old signature is kept because CREATE OR REPLACE will handle it)
CREATE OR REPLACE FUNCTION public.platform_approve_community_request(
  p_request_id UUID,
  p_block_names TEXT[] DEFAULT NULL,
  p_block_label TEXT DEFAULT 'Block'
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

  -- Determine effective label
  effective_label := COALESCE(NULLIF(btrim(p_block_label), ''), 'Block');
  IF effective_label NOT IN ('Block', 'Tower') THEN
    effective_label := 'Block';
  END IF;

  INSERT INTO public.communities (name, code, pincode, city, area, community_type, approximate_units, address, blocks_enabled, block_label)
  VALUES (
    req.name,
    generated_code,
    req.pincode,
    req.city,
    req.area,
    req.community_type,
    req.approximate_units,
    req.address,
    CASE WHEN p_block_names IS NOT NULL AND array_length(p_block_names, 1) > 0 THEN true ELSE false END,
    effective_label
  )
  RETURNING id INTO new_community_id;

  -- Seed blocks if provided
  IF p_block_names IS NOT NULL AND array_length(p_block_names, 1) > 0 THEN
    FOREACH block_name IN ARRAY p_block_names LOOP
      IF btrim(block_name) <> '' THEN
        INSERT INTO public.community_blocks (community_id, name)
        VALUES (new_community_id, btrim(block_name));
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

-- ============================================================
-- Section 4 - platform_set_block_label RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.platform_set_block_label(
  p_community_id UUID,
  p_label TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  effective_label TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can change block labels';
  END IF;

  effective_label := COALESCE(NULLIF(btrim(p_label), ''), 'Block');
  IF effective_label NOT IN ('Block', 'Tower') THEN
    RAISE EXCEPTION 'Block label must be either Block or Tower';
  END IF;

  UPDATE public.communities
  SET block_label = effective_label
  WHERE id = p_community_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Community not found';
  END IF;
END;
$$;

-- ============================================================
-- Section 5 - remove funds gate from community-lead block RPCs
-- ============================================================

-- set_community_blocks_enabled: remove funds gate
CREATE OR REPLACE FUNCTION public.set_community_blocks_enabled(p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_community_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Only community leads can manage blocks';
  END IF;

  SELECT * INTO caller_profile
  FROM public.profiles
  WHERE id = auth.uid();

  IF caller_profile.community_id IS NULL THEN
    RAISE EXCEPTION 'Community not found';
  END IF;

  UPDATE public.communities
  SET blocks_enabled = p_enabled
  WHERE id = caller_profile.community_id;

  IF NOT p_enabled THEN
    UPDATE public.profiles
    SET block_id = NULL
    WHERE community_id = caller_profile.community_id;

    UPDATE public.fund_roles fr
    SET block_id = NULL
    FROM public.events e
    WHERE fr.event_id = e.id
      AND e.community_id = caller_profile.community_id
      AND fr.role = 'collector';
  END IF;
END;
$$;

-- add_community_block: remove funds gate (keep restore-archived logic)
CREATE OR REPLACE FUNCTION public.add_community_block(p_name TEXT)
RETURNS public.community_blocks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_profile public.profiles%ROWTYPE;
  inserted_row public.community_blocks%ROWTYPE;
  existing_row public.community_blocks%ROWTYPE;
  block_name TEXT := btrim(p_name);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_community_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Only community leads can add blocks';
  END IF;

  IF block_name IS NULL OR length(block_name) = 0 THEN
    RAISE EXCEPTION 'Block name is required';
  END IF;

  SELECT * INTO caller_profile FROM public.profiles WHERE id = auth.uid();

  IF caller_profile.community_id IS NULL THEN
    RAISE EXCEPTION 'Community not found';
  END IF;

  SELECT *
  INTO existing_row
  FROM public.community_blocks
  WHERE community_id = caller_profile.community_id
    AND name = block_name
  LIMIT 1;

  IF FOUND THEN
    IF existing_row.archived_at IS NULL THEN
      RAISE EXCEPTION 'Block already exists';
    END IF;

    UPDATE public.community_blocks
    SET archived_at = NULL,
        updated_at = now()
    WHERE id = existing_row.id
    RETURNING * INTO inserted_row;

    RETURN inserted_row;
  END IF;

  INSERT INTO public.community_blocks (community_id, name)
  VALUES (caller_profile.community_id, block_name)
  RETURNING * INTO inserted_row;

  RETURN inserted_row;
END;
$$;

-- rename_community_block: remove funds gate
CREATE OR REPLACE FUNCTION public.rename_community_block(p_block_id UUID, p_new_name TEXT)
RETURNS public.community_blocks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_profile public.profiles%ROWTYPE;
  updated_row public.community_blocks%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_community_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Only community leads can rename blocks';
  END IF;

  SELECT * INTO caller_profile FROM public.profiles WHERE id = auth.uid();

  IF caller_profile.community_id IS NULL THEN
    RAISE EXCEPTION 'Community not found';
  END IF;

  UPDATE public.community_blocks
  SET name = btrim(p_new_name),
      updated_at = now()
  WHERE id = p_block_id
    AND community_id = caller_profile.community_id
    AND archived_at IS NULL
  RETURNING * INTO updated_row;

  IF updated_row.id IS NULL THEN
    RAISE EXCEPTION 'Active block not found in your community';
  END IF;

  RETURN updated_row;
END;
$$;

-- archive_community_block: remove funds gate
CREATE OR REPLACE FUNCTION public.archive_community_block(p_block_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_community_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Only community leads can archive blocks';
  END IF;

  SELECT * INTO caller_profile FROM public.profiles WHERE id = auth.uid();

  IF caller_profile.community_id IS NULL THEN
    RAISE EXCEPTION 'Community not found';
  END IF;

  UPDATE public.community_blocks
  SET archived_at = now(),
      updated_at = now()
  WHERE id = p_block_id
    AND community_id = caller_profile.community_id
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active block not found in your community';
  END IF;
END;
$$;

-- ============================================================
-- Section 6 - remove funds gate from platform block RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.platform_add_community_block(p_community_id UUID, p_name TEXT)
RETURNS public.community_blocks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  inserted_row public.community_blocks%ROWTYPE;
  existing_row public.community_blocks%ROWTYPE;
  block_name TEXT := btrim(p_name);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can add blocks';
  END IF;

  IF block_name IS NULL OR length(block_name) = 0 THEN
    RAISE EXCEPTION 'Block name is required';
  END IF;

  SELECT *
  INTO existing_row
  FROM public.community_blocks
  WHERE community_id = p_community_id
    AND name = block_name
  LIMIT 1;

  IF FOUND THEN
    IF existing_row.archived_at IS NULL THEN
      RAISE EXCEPTION 'Block already exists';
    END IF;

    UPDATE public.community_blocks
    SET archived_at = NULL,
        updated_at = now()
    WHERE id = existing_row.id
    RETURNING * INTO inserted_row;

    RETURN inserted_row;
  END IF;

  INSERT INTO public.community_blocks (community_id, name)
  VALUES (p_community_id, block_name)
  RETURNING * INTO inserted_row;

  RETURN inserted_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_archive_community_block(p_block_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  block_community_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can archive blocks';
  END IF;

  SELECT community_id INTO block_community_id FROM public.community_blocks WHERE id = p_block_id;

  IF block_community_id IS NULL THEN
    RAISE EXCEPTION 'Block not found';
  END IF;

  UPDATE public.community_blocks
  SET archived_at = now(),
      updated_at = now()
  WHERE id = p_block_id
    AND archived_at IS NULL;
END;
$$;

-- ============================================================
-- Section 7 - grants
-- ============================================================

GRANT EXECUTE ON FUNCTION public.platform_approve_community_request(UUID, TEXT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_block_label(UUID, TEXT) TO authenticated;

-- ============================================================
-- Section 8 - reload schema
-- ============================================================

NOTIFY pgrst, 'reload schema';
