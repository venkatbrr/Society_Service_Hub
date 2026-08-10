-- ============================================================
-- Migration: Flat addition requests escape hatch
-- Date: 2026-09-04
-- ============================================================

CREATE TABLE IF NOT EXISTS public.flat_addition_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id     UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  block_id         UUID NOT NULL REFERENCES public.community_blocks(id) ON DELETE CASCADE,
  requested_by     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  flat_number      TEXT NOT NULL CHECK (flat_number = upper(flat_number) AND flat_number ~ '^[A-Z0-9]{1,10}$'),
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR length(rejection_reason) <= 280),
  reviewed_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_flat_addition_requests_one_pending
  ON public.flat_addition_requests (community_id, block_id, flat_number)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_flat_addition_requests_community_status
  ON public.flat_addition_requests (community_id, status);

CREATE INDEX IF NOT EXISTS idx_flat_addition_requests_user
  ON public.flat_addition_requests (requested_by);

ALTER TABLE public.flat_addition_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "flat_addition_requests_select" ON public.flat_addition_requests;
CREATE POLICY "flat_addition_requests_select"
  ON public.flat_addition_requests
  FOR SELECT
  TO authenticated
  USING (
    requested_by = auth.uid()
    OR public.is_community_lead(auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

-- ============================================================
-- RPC: request_flat_addition
-- ============================================================

CREATE OR REPLACE FUNCTION public.request_flat_addition(
  p_block_id    UUID,
  p_flat_number TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id         UUID := auth.uid();
  caller_profile    public.profiles%ROWTYPE;
  block_row         public.community_blocks%ROWTYPE;
  community_row     public.communities%ROWTYPE;
  clean_flat        TEXT;
  existing_flat     public.community_flats%ROWTYPE;
  existing_req      public.flat_addition_requests%ROWTYPE;
  new_req_id        UUID;
  pending_count     INT;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO caller_profile FROM public.profiles WHERE id = caller_id;

  SELECT * INTO block_row
  FROM public.community_blocks
  WHERE id = p_block_id AND archived_at IS NULL;

  IF block_row.id IS NULL THEN
    RAISE EXCEPTION 'Block not found or archived';
  END IF;

  SELECT * INTO community_row
  FROM public.communities
  WHERE id = block_row.community_id;

  clean_flat := upper(regexp_replace(COALESCE(p_flat_number, ''), '[^A-Za-z0-9]', '', 'g'));
  IF length(clean_flat) = 0 OR length(clean_flat) > 10 THEN
    RAISE EXCEPTION 'Invalid flat number. Must be 1 to 10 alphanumeric characters.';
  END IF;

  -- If flat already exists and is active, return it directly
  SELECT * INTO existing_flat
  FROM public.community_flats
  WHERE community_id = block_row.community_id
    AND block_id = p_block_id
    AND flat_number = clean_flat;

  IF existing_flat.id IS NOT NULL THEN
    IF existing_flat.archived_at IS NOT NULL THEN
      UPDATE public.community_flats
      SET archived_at = NULL, updated_at = now()
      WHERE id = existing_flat.id;
    END IF;

    RETURN jsonb_build_object(
      'status', 'already_exists',
      'flat_id', existing_flat.id,
      'flat_number', existing_flat.flat_number
    );
  END IF;

  -- Rate limit pending requests per user (max 5)
  SELECT COUNT(*) INTO pending_count
  FROM public.flat_addition_requests
  WHERE requested_by = caller_id AND status = 'pending';

  IF pending_count >= 5 THEN
    RAISE EXCEPTION 'You already have 5 pending flat addition requests. Please wait for them to be reviewed.';
  END IF;

  -- Check if a pending request already exists for this (community, block, flat)
  SELECT * INTO existing_req
  FROM public.flat_addition_requests
  WHERE community_id = block_row.community_id
    AND block_id = p_block_id
    AND flat_number = clean_flat
    AND status = 'pending';

  IF existing_req.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'pending_exists',
      'request_id', existing_req.id,
      'message', 'A request for this flat is already pending review.'
    );
  END IF;

  INSERT INTO public.flat_addition_requests (
    community_id,
    block_id,
    requested_by,
    flat_number
  )
  VALUES (
    block_row.community_id,
    p_block_id,
    caller_id,
    clean_flat
  )
  RETURNING id INTO new_req_id;

  -- Notify community leads
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    p.id,
    'flat_addition_requested',
    'New flat addition request',
    COALESCE(caller_profile.full_name, 'A resident') || ' requested to add flat ' || block_row.name || '-' || clean_flat || '.',
    jsonb_build_object(
      'request_id', new_req_id,
      'community_id', block_row.community_id,
      'block_id', p_block_id,
      'flat_number', clean_flat
    )
  FROM public.profiles p
  WHERE p.community_id = block_row.community_id
    AND (p.app_role = 'president'::public.app_role_type OR p.app_role = 'vice_president'::public.app_role_type)
    AND p.removed_at IS NULL;

  RETURN jsonb_build_object(
    'status', 'submitted',
    'request_id', new_req_id,
    'message', 'Flat addition request submitted. Your community lead will review it shortly.'
  );
END;
$$;

-- ============================================================
-- RPC: review_flat_addition
-- ============================================================

CREATE OR REPLACE FUNCTION public.review_flat_addition(
  p_request_id UUID,
  p_approve    BOOLEAN,
  p_reason     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reviewer_id   UUID := auth.uid();
  req           public.flat_addition_requests%ROWTYPE;
  block_row     public.community_blocks%ROWTYPE;
  created_flat  public.community_flats%ROWTYPE;
  reason_text   TEXT;
BEGIN
  IF reviewer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO req
  FROM public.flat_addition_requests
  WHERE id = p_request_id AND status = 'pending';

  IF req.id IS NULL THEN
    RAISE EXCEPTION 'Pending flat addition request not found';
  END IF;

  -- Guard: must be platform admin or lead of that community
  IF NOT public.is_platform_admin(reviewer_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = reviewer_id
        AND community_id = req.community_id
        AND (app_role = 'president'::public.app_role_type OR app_role = 'vice_president'::public.app_role_type)
        AND removed_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Only community leads or platform admins can review flat addition requests';
    END IF;
  END IF;

  SELECT * INTO block_row FROM public.community_blocks WHERE id = req.block_id;
  reason_text := NULLIF(btrim(COALESCE(p_reason, '')), '');

  IF p_approve THEN
    INSERT INTO public.community_flats (
      community_id,
      block_id,
      flat_number
    )
    VALUES (
      req.community_id,
      req.block_id,
      req.flat_number
    )
    ON CONFLICT (community_id, block_id, flat_number) DO UPDATE
      SET archived_at = NULL, updated_at = now()
    RETURNING * INTO created_flat;

    UPDATE public.flat_addition_requests
    SET status = 'approved',
        reviewed_by = reviewer_id,
        reviewed_at = now(),
        rejection_reason = NULL,
        updated_at = now()
    WHERE id = req.id;

    -- Automatically set flat for requester if they do not have one set yet
    UPDATE public.profiles
    SET flat_id = created_flat.id
    WHERE id = req.requested_by
      AND (flat_id IS NULL OR community_id = req.community_id);

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      req.requested_by,
      'flat_addition_approved',
      'Flat addition approved',
      'Your request for flat ' || COALESCE(block_row.name, '') || '-' || req.flat_number || ' has been approved.',
      jsonb_build_object(
        'request_id', req.id,
        'flat_id', created_flat.id,
        'flat_number', req.flat_number,
        'block_name', block_row.name
      )
    );

    RETURN jsonb_build_object(
      'status', 'approved',
      'flat_id', created_flat.id
    );
  ELSE
    UPDATE public.flat_addition_requests
    SET status = 'rejected',
        rejection_reason = reason_text,
        reviewed_by = reviewer_id,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = req.id;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      req.requested_by,
      'flat_addition_rejected',
      'Flat addition request rejected',
      'Your request for flat ' || COALESCE(block_row.name, '') || '-' || req.flat_number || ' was rejected.'
        || CASE WHEN reason_text IS NOT NULL THEN ' Reason: ' || reason_text ELSE '' END,
      jsonb_build_object(
        'request_id', req.id,
        'flat_number', req.flat_number,
        'reason', reason_text
      )
    );

    RETURN jsonb_build_object(
      'status', 'rejected',
      'reason', reason_text
    );
  END IF;
END;
$$;

-- ============================================================
-- RPC: list_pending_flat_addition_requests
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_pending_flat_addition_requests(p_community_id UUID)
RETURNS TABLE (
  id               UUID,
  community_id     UUID,
  block_id         UUID,
  block_name       TEXT,
  requested_by     UUID,
  requester_name   TEXT,
  requester_email  TEXT,
  requester_phone  TEXT,
  flat_number      TEXT,
  created_at       TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.community_id,
    r.block_id,
    b.name AS block_name,
    r.requested_by,
    p.full_name AS requester_name,
    p.email AS requester_email,
    p.phone_number AS requester_phone,
    r.flat_number,
    r.created_at
  FROM public.flat_addition_requests r
  JOIN public.community_blocks b ON b.id = r.block_id
  JOIN public.profiles p ON p.id = r.requested_by
  WHERE r.community_id = p_community_id
    AND r.status = 'pending'
  ORDER BY r.created_at ASC;
$$;

GRANT SELECT ON public.flat_addition_requests TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_flat_addition(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_flat_addition(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_pending_flat_addition_requests(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
