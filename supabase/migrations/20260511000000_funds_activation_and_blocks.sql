-- ============================================================
-- Migration: Funds activation and blocks
-- Date: 2026-05-11
-- ============================================================

-- ============================================================
-- Section 1 - communities flags
-- ============================================================

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS funds_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocks_enabled BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- Section 2 - funds access requests
-- ============================================================

CREATE TABLE IF NOT EXISTS public.funds_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL CHECK (length(btrim(contact_name)) > 0 AND length(contact_name) <= 80),
  contact_phone TEXT NOT NULL CHECK (length(btrim(contact_phone)) > 0 AND length(contact_phone) <= 20),
  purpose TEXT CHECK (purpose IS NULL OR length(purpose) <= 280),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR length(rejection_reason) <= 280),
  designated_lead_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_funds_access_requests_one_pending_per_community
  ON public.funds_access_requests (community_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_funds_access_requests_status_created
  ON public.funds_access_requests (status, created_at DESC);

-- ============================================================
-- Section 3 - community blocks
-- ============================================================

CREATE TABLE IF NOT EXISTS public.community_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0 AND length(name) <= 50),
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (community_id, name)
);

CREATE INDEX IF NOT EXISTS idx_community_blocks_community_active
  ON public.community_blocks (community_id)
  WHERE archived_at IS NULL;

-- ============================================================
-- Section 4 - block_id columns and integrity triggers
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS block_id UUID REFERENCES public.community_blocks(id) ON DELETE SET NULL;

ALTER TABLE public.fund_roles
  ADD COLUMN IF NOT EXISTS block_id UUID REFERENCES public.community_blocks(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.validate_profile_block_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  block_community_id UUID;
BEGIN
  IF NEW.block_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT community_id
  INTO block_community_id
  FROM public.community_blocks
  WHERE id = NEW.block_id;

  IF block_community_id IS NULL THEN
    RAISE EXCEPTION 'Assigned block does not exist';
  END IF;

  IF NEW.community_id IS NULL OR block_community_id IS DISTINCT FROM NEW.community_id THEN
    RAISE EXCEPTION 'Profile block must belong to the same community';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_block_guard ON public.profiles;
CREATE TRIGGER profile_block_guard
BEFORE INSERT OR UPDATE OF community_id, block_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.validate_profile_block_assignment();

CREATE OR REPLACE FUNCTION public.validate_fund_role_block_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  fund_community_id UUID;
  block_community_id UUID;
BEGIN
  IF NEW.block_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT community_id
  INTO fund_community_id
  FROM public.events
  WHERE id = NEW.event_id;

  IF fund_community_id IS NULL THEN
    RAISE EXCEPTION 'Fund not found';
  END IF;

  SELECT community_id
  INTO block_community_id
  FROM public.community_blocks
  WHERE id = NEW.block_id;

  IF block_community_id IS NULL THEN
    RAISE EXCEPTION 'Assigned block does not exist';
  END IF;

  IF block_community_id IS DISTINCT FROM fund_community_id THEN
    RAISE EXCEPTION 'Fund role block must belong to the fund community';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fund_role_block_guard ON public.fund_roles;
CREATE TRIGGER fund_role_block_guard
BEFORE INSERT OR UPDATE OF event_id, block_id ON public.fund_roles
FOR EACH ROW
EXECUTE FUNCTION public.validate_fund_role_block_assignment();

-- ============================================================
-- Section 5 - backfill and role consistency
-- ============================================================

UPDATE public.communities c
SET funds_enabled = true
WHERE EXISTS (
  SELECT 1
  FROM public.events e
  WHERE e.community_id = c.id
);

UPDATE public.profiles p
SET app_role = 'resident'::public.app_role_type
WHERE app_role = 'community_lead'::public.app_role_type
  AND community_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.communities c
    WHERE c.id = p.community_id
      AND c.funds_enabled = true
  );

-- ============================================================
-- Section 6 - updated fund role guard trigger
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_fund_role_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  role_count INTEGER;
  fund_community_id UUID;
  member_community_id UUID;
  community_funds_enabled BOOLEAN;
  community_blocks_enabled BOOLEAN;
  target_block_archived_at TIMESTAMPTZ;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    SELECT e.community_id, c.funds_enabled, c.blocks_enabled
    INTO fund_community_id, community_funds_enabled, community_blocks_enabled
    FROM public.events e
    JOIN public.communities c ON c.id = e.community_id
    WHERE e.id = NEW.event_id;

    SELECT community_id
    INTO member_community_id
    FROM public.profiles
    WHERE id = NEW.user_id;

    IF fund_community_id IS NULL THEN
      RAISE EXCEPTION 'Fund not found';
    END IF;

    IF member_community_id IS DISTINCT FROM fund_community_id THEN
      RAISE EXCEPTION 'Assigned member must belong to the same community';
    END IF;

    IF NOT COALESCE(community_funds_enabled, false) THEN
      RAISE EXCEPTION 'Funds are not active in this community';
    END IF;

    IF NEW.block_id IS NOT NULL THEN
      IF NEW.role <> 'collector' THEN
        RAISE EXCEPTION 'Only collector assignments can be block-scoped';
      END IF;

      SELECT archived_at
      INTO target_block_archived_at
      FROM public.community_blocks
      WHERE id = NEW.block_id
        AND community_id = fund_community_id;

      IF target_block_archived_at IS NULL AND NOT EXISTS (
        SELECT 1 FROM public.community_blocks WHERE id = NEW.block_id AND community_id = fund_community_id
      ) THEN
        RAISE EXCEPTION 'Block does not belong to this community';
      END IF;

      IF target_block_archived_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot assign collector to an archived block';
      END IF;
    END IF;

    SELECT COUNT(*)
    INTO role_count
    FROM public.fund_roles
    WHERE event_id = NEW.event_id
      AND role = NEW.role
      AND (TG_OP = 'INSERT' OR id <> NEW.id)
      AND (
        NEW.role <> 'collector'
        OR (
          (NOT COALESCE(community_blocks_enabled, false) OR NEW.block_id IS NULL)
          AND block_id IS NULL
        )
        OR (
          COALESCE(community_blocks_enabled, false)
          AND NEW.block_id IS NOT NULL
          AND block_id = NEW.block_id
        )
      );

    IF NEW.role = 'treasurer' AND role_count >= 2 THEN
      RAISE EXCEPTION 'A fund can have at most 2 treasurers';
    END IF;

    -- Collector cap rules:
    -- 1) If blocks are disabled OR collector has block_id NULL: limit to 6 unscoped collectors.
    -- 2) If blocks are enabled and collector has block_id: limit to 3 collectors per (event_id, block_id).
    IF NEW.role = 'collector' THEN
      IF (NOT COALESCE(community_blocks_enabled, false) OR NEW.block_id IS NULL) AND role_count >= 6 THEN
        RAISE EXCEPTION 'A fund can have at most 6 unscoped collectors';
      END IF;

      IF COALESCE(community_blocks_enabled, false) AND NEW.block_id IS NOT NULL AND role_count >= 3 THEN
        RAISE EXCEPTION 'A block can have at most 3 collectors per fund';
      END IF;
    END IF;

    NEW.updated_at := now();
  END IF;

  IF TG_OP = 'DELETE'
    OR (TG_OP = 'UPDATE' AND OLD.role = 'treasurer' AND NEW.role <> 'treasurer') THEN
    SELECT COUNT(*)
    INTO role_count
    FROM public.fund_roles
    WHERE event_id = OLD.event_id
      AND role = 'treasurer'
      AND id <> OLD.id;

    IF role_count < 1 THEN
      RAISE EXCEPTION 'A fund must always have at least 1 treasurer';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS fund_role_guard ON public.fund_roles;
CREATE TRIGGER fund_role_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.fund_roles
FOR EACH ROW EXECUTE FUNCTION public.validate_fund_role_change();

-- ============================================================
-- Section 7 - updated event transaction guard trigger
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_event_transaction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  fund_community_id UUID;
  contributor_community_id UUID;
  community_funds_enabled BOOLEAN;
  caller_role TEXT;
  caller_block_id UUID;
  contributor_block_id UUID;
  caller_is_community_lead BOOLEAN;
BEGIN
  IF COALESCE(NULLIF(NEW.title, ''), '') = '' THEN
    RAISE EXCEPTION 'Transaction title is required';
  END IF;

  SELECT e.community_id, c.funds_enabled
  INTO fund_community_id, community_funds_enabled
  FROM public.events e
  JOIN public.communities c ON c.id = e.community_id
  WHERE e.id = NEW.event_id;

  IF fund_community_id IS NULL THEN
    RAISE EXCEPTION 'Fund not found';
  END IF;

  IF NOT COALESCE(community_funds_enabled, false) THEN
    RAISE EXCEPTION 'Funds are not active in this community';
  END IF;

  IF NEW.type = 'income' THEN
    IF NEW.contributor_user_id IS NULL THEN
      RAISE EXCEPTION 'Contributor is required for contributions';
    END IF;

    SELECT community_id
    INTO contributor_community_id
    FROM public.profiles
    WHERE id = NEW.contributor_user_id;

    IF contributor_community_id IS DISTINCT FROM fund_community_id THEN
      RAISE EXCEPTION 'Contributor must belong to the same community';
    END IF;

    IF TG_OP = 'INSERT' THEN
      SELECT fr.role, fr.block_id
      INTO caller_role, caller_block_id
      FROM public.fund_roles fr
      WHERE fr.event_id = NEW.event_id
        AND fr.user_id = auth.uid()
      LIMIT 1;

      SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.community_id = fund_community_id
          AND p.app_role = 'community_lead'::public.app_role_type
          AND p.removed_at IS NULL
      ) INTO caller_is_community_lead;

      IF caller_role = 'collector' AND caller_block_id IS NOT NULL THEN
        SELECT p.block_id
        INTO contributor_block_id
        FROM public.profiles p
        WHERE p.id = NEW.contributor_user_id;

        IF contributor_block_id IS DISTINCT FROM caller_block_id THEN
          RAISE EXCEPTION 'Block in-charge can only record contributions for residents of their block';
        END IF;
      ELSIF caller_role IS NULL AND NOT caller_is_community_lead AND NOT public.is_platform_admin(auth.uid()) THEN
        -- Keep validation strict for direct SQL usage where RLS may not run first.
        RAISE EXCEPTION 'Only assigned fund members can add contributions';
      END IF;
    END IF;
  ELSE
    NEW.contributor_user_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_transaction_guard ON public.event_transactions;
CREATE TRIGGER event_transaction_guard
BEFORE INSERT OR UPDATE ON public.event_transactions
FOR EACH ROW EXECUTE FUNCTION public.validate_event_transaction();

-- ============================================================
-- Section 8 - helpers and lead predicate updates
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_funds_enabled(p_community_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(funds_enabled, false)
  FROM public.communities
  WHERE id = p_community_id;
$$;

CREATE OR REPLACE FUNCTION public.is_blocks_enabled(p_community_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(funds_enabled, false) AND COALESCE(blocks_enabled, false)
  FROM public.communities
  WHERE id = p_community_id;
$$;

CREATE OR REPLACE FUNCTION public.is_community_lead(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.communities c ON c.id = p.community_id
    WHERE p.id = COALESCE(p_user_id, auth.uid())
      AND p.app_role = 'community_lead'::public.app_role_type
      AND p.community_id IS NOT NULL
      AND p.removed_at IS NULL
      AND c.funds_enabled = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_community_lead(COALESCE(p_user_id, auth.uid()));
$$;

CREATE OR REPLACE FUNCTION public.get_fund_role(p_event_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_value TEXT;
  fund_community_id UUID;
BEGIN
  SELECT community_id INTO fund_community_id FROM public.events WHERE id = p_event_id;

  IF fund_community_id IS NULL THEN
    RETURN 'resident';
  END IF;

  IF public.is_platform_admin(p_user_id) THEN
    RETURN 'admin';
  END IF;

  IF public.is_funds_enabled(fund_community_id) AND public.is_community_lead(p_user_id) THEN
    RETURN 'admin';
  END IF;

  SELECT fr.role
  INTO role_value
  FROM public.fund_roles fr
  WHERE fr.event_id = p_event_id
    AND fr.user_id = p_user_id
  LIMIT 1;

  RETURN COALESCE(role_value, 'resident');
END;
$$;

CREATE OR REPLACE FUNCTION public.list_community_blocks(p_community_id UUID)
RETURNS SETOF public.community_blocks
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT *
  FROM public.community_blocks
  WHERE community_id = p_community_id
    AND archived_at IS NULL
  ORDER BY name;
$$;

CREATE OR REPLACE FUNCTION public.get_my_block_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT block_id
  FROM public.profiles
  WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_funds_access_status(p_community_id UUID)
RETURNS TABLE (
  status TEXT,
  request_id UUID,
  rejection_reason TEXT,
  decided_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT far.status, far.id, far.rejection_reason, far.decided_at
  FROM public.funds_access_requests far
  WHERE far.community_id = p_community_id
  ORDER BY far.created_at DESC
  LIMIT 1;
$$;

-- ============================================================
-- Section 9 - funds access request RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_funds_access_request(
  p_contact_name TEXT,
  p_contact_phone TEXT,
  p_purpose TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_profile public.profiles%ROWTYPE;
  community_row public.communities%ROWTYPE;
  pending_request_id UUID;
  new_request_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO caller_profile
  FROM public.profiles
  WHERE id = auth.uid();

  IF caller_profile.id IS NULL OR caller_profile.community_id IS NULL THEN
    RAISE EXCEPTION 'Join a community before requesting funds support';
  END IF;

  SELECT * INTO community_row
  FROM public.communities
  WHERE id = caller_profile.community_id;

  IF COALESCE(community_row.funds_enabled, false) THEN
    RAISE EXCEPTION 'Funds are already active in your community';
  END IF;

  SELECT id
  INTO pending_request_id
  FROM public.funds_access_requests
  WHERE community_id = caller_profile.community_id
    AND status = 'pending'
  LIMIT 1;

  IF pending_request_id IS NOT NULL THEN
    RAISE EXCEPTION 'A pending funds support request already exists for this community (request_id=%)', pending_request_id;
  END IF;

  INSERT INTO public.funds_access_requests (
    community_id,
    requested_by,
    contact_name,
    contact_phone,
    purpose,
    status
  )
  VALUES (
    caller_profile.community_id,
    auth.uid(),
    btrim(p_contact_name),
    btrim(p_contact_phone),
    NULLIF(btrim(COALESCE(p_purpose, '')), ''),
    'pending'
  )
  RETURNING id INTO new_request_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    admin_profile.id,
    'funds_access_requested',
    'Funds support requested',
    COALESCE(caller_profile.full_name, 'A resident') || ' requested funds activation for ' || COALESCE(community_row.name, 'their community') || '.',
    jsonb_build_object(
      'request_id', new_request_id,
      'community_id', caller_profile.community_id,
      'community_name', community_row.name,
      'requester_name', caller_profile.full_name
    )
  FROM public.profiles admin_profile
  WHERE admin_profile.app_role = 'admin'::public.app_role_type
    AND admin_profile.removed_at IS NULL;

  RETURN new_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_funds_access_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  req public.funds_access_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO req
  FROM public.funds_access_requests
  WHERE id = p_request_id;

  IF req.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF req.requested_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the requester can withdraw this request';
  END IF;

  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending requests can be withdrawn';
  END IF;

  UPDATE public.funds_access_requests
  SET status = 'withdrawn',
      decided_at = now(),
      decided_by = auth.uid()
  WHERE id = p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_approve_funds_access_request(
  p_request_id UUID,
  p_lead_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  req public.funds_access_requests%ROWTYPE;
  target_lead public.profiles%ROWTYPE;
  requester_name TEXT;
  community_name TEXT;
  merged_message TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can approve funds support requests';
  END IF;

  SELECT * INTO req
  FROM public.funds_access_requests
  WHERE id = p_request_id
    AND status = 'pending';

  IF req.id IS NULL THEN
    RAISE EXCEPTION 'Pending funds request not found';
  END IF;

  SELECT * INTO target_lead
  FROM public.profiles
  WHERE id = p_lead_user_id;

  IF target_lead.id IS NULL THEN
    RAISE EXCEPTION 'Selected lead profile not found';
  END IF;

  IF target_lead.community_id IS DISTINCT FROM req.community_id THEN
    RAISE EXCEPTION 'Selected lead must belong to the request community';
  END IF;

  IF target_lead.app_role <> 'resident'::public.app_role_type OR target_lead.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Selected lead must be an active resident';
  END IF;

  SELECT p.full_name INTO requester_name FROM public.profiles p WHERE p.id = req.requested_by;
  SELECT c.name INTO community_name FROM public.communities c WHERE c.id = req.community_id;

  UPDATE public.communities
  SET funds_enabled = true
  WHERE id = req.community_id;

  UPDATE public.profiles
  SET app_role = 'community_lead'::public.app_role_type
  WHERE id = p_lead_user_id;

  UPDATE public.funds_access_requests
  SET status = 'approved',
      decided_at = now(),
      decided_by = auth.uid(),
      designated_lead_id = p_lead_user_id,
      rejection_reason = NULL
  WHERE id = p_request_id;

  IF req.requested_by = p_lead_user_id THEN
    merged_message := 'Funds support was approved for ' || COALESCE(community_name, 'your community') || '. You are now the community lead.';

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      p_lead_user_id,
      'community_lead_appointed',
      'Funds support approved',
      merged_message,
      jsonb_build_object('request_id', req.id, 'community_id', req.community_id)
    );
  ELSE
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      req.requested_by,
      'funds_access_approved',
      'Funds support approved',
      'Your funds support request for ' || COALESCE(community_name, 'your community') || ' was approved.',
      jsonb_build_object('request_id', req.id, 'community_id', req.community_id, 'designated_lead_id', p_lead_user_id)
    );

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      p_lead_user_id,
      'community_lead_appointed',
      'You are now community lead',
      'Platform admin approved funds support and assigned you as community lead for ' || COALESCE(community_name, 'your community') || '.',
      jsonb_build_object('request_id', req.id, 'community_id', req.community_id, 'requested_by_name', requester_name)
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_reject_funds_access_request(
  p_request_id UUID,
  p_rejection_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  req public.funds_access_requests%ROWTYPE;
  rejection_reason_text TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can reject funds support requests';
  END IF;

  SELECT * INTO req
  FROM public.funds_access_requests
  WHERE id = p_request_id
    AND status = 'pending';

  IF req.id IS NULL THEN
    RAISE EXCEPTION 'Pending funds request not found';
  END IF;

  rejection_reason_text := NULLIF(btrim(COALESCE(p_rejection_reason, '')), '');

  UPDATE public.funds_access_requests
  SET status = 'rejected',
      rejection_reason = rejection_reason_text,
      decided_at = now(),
      decided_by = auth.uid()
  WHERE id = p_request_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    req.requested_by,
    'funds_access_rejected',
    'Funds support request rejected',
    'Your funds support request was rejected.' || CASE WHEN rejection_reason_text IS NOT NULL THEN ' Reason: ' || rejection_reason_text ELSE '' END,
    jsonb_build_object('request_id', req.id, 'reason', rejection_reason_text)
  );
END;
$$;

CREATE TABLE IF NOT EXISTS public.funds_access_revocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  revoked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.platform_revoke_funds_access(
  p_community_id UUID,
  p_revoke_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  current_lead_id UUID;
  community_name TEXT;
  reason_text TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can revoke funds access';
  END IF;

  reason_text := NULLIF(btrim(COALESCE(p_revoke_reason, '')), '');
  IF reason_text IS NULL THEN
    RAISE EXCEPTION 'Revocation reason is required';
  END IF;

  IF NOT public.is_funds_enabled(p_community_id) THEN
    RAISE EXCEPTION 'Funds are not active in this community';
  END IF;

  SELECT name INTO community_name FROM public.communities WHERE id = p_community_id;

  SELECT id
  INTO current_lead_id
  FROM public.profiles
  WHERE community_id = p_community_id
    AND app_role = 'community_lead'::public.app_role_type
    AND removed_at IS NULL
  LIMIT 1;

  UPDATE public.communities
  SET funds_enabled = false,
      blocks_enabled = false
  WHERE id = p_community_id;

  IF current_lead_id IS NOT NULL THEN
    UPDATE public.profiles
    SET app_role = 'resident'::public.app_role_type
    WHERE id = current_lead_id;
  END IF;

  UPDATE public.profiles
  SET block_id = NULL
  WHERE community_id = p_community_id;

  UPDATE public.fund_roles fr
  SET block_id = NULL
  FROM public.events e
  WHERE fr.event_id = e.id
    AND e.community_id = p_community_id;

  INSERT INTO public.funds_access_revocations (community_id, revoked_by, reason)
  VALUES (p_community_id, auth.uid(), reason_text);

  IF current_lead_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      current_lead_id,
      'funds_access_revoked',
      'Funds access revoked',
      'Funds access was revoked for ' || COALESCE(community_name, 'your community') || '. Reason: ' || reason_text,
      jsonb_build_object('community_id', p_community_id, 'reason', reason_text)
    );
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    p.id,
    'funds_access_revoked',
    'Funds access revoked',
    'Funds access is currently inactive in your community. Existing ledger history remains available.',
    jsonb_build_object('community_id', p_community_id, 'reason', reason_text)
  FROM public.profiles p
  WHERE p.community_id = p_community_id
    AND p.removed_at IS NULL
    AND (current_lead_id IS NULL OR p.id <> current_lead_id);
END;
$$;

-- ============================================================
-- Section 10 - community lead block management RPCs
-- ============================================================

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

  IF caller_profile.community_id IS NULL OR NOT public.is_funds_enabled(caller_profile.community_id) THEN
    RAISE EXCEPTION 'Funds must be active before managing blocks';
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

CREATE OR REPLACE FUNCTION public.add_community_block(p_name TEXT)
RETURNS public.community_blocks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_profile public.profiles%ROWTYPE;
  inserted_row public.community_blocks%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_community_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Only community leads can add blocks';
  END IF;

  SELECT * INTO caller_profile FROM public.profiles WHERE id = auth.uid();

  IF caller_profile.community_id IS NULL OR NOT public.is_funds_enabled(caller_profile.community_id) THEN
    RAISE EXCEPTION 'Funds must be active before adding blocks';
  END IF;

  INSERT INTO public.community_blocks (community_id, name)
  VALUES (caller_profile.community_id, btrim(p_name))
  RETURNING * INTO inserted_row;

  RETURN inserted_row;
END;
$$;

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

  IF caller_profile.community_id IS NULL OR NOT public.is_funds_enabled(caller_profile.community_id) THEN
    RAISE EXCEPTION 'Funds must be active before archiving blocks';
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

  IF caller_profile.community_id IS NULL OR NOT public.is_funds_enabled(caller_profile.community_id) THEN
    RAISE EXCEPTION 'Funds must be active before renaming blocks';
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

CREATE OR REPLACE FUNCTION public.set_resident_block(p_resident_id UUID, p_block_id UUID)
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_profile public.profiles%ROWTYPE;
  target_profile public.profiles%ROWTYPE;
  updated_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_community_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Only community leads can assign resident blocks';
  END IF;

  SELECT * INTO caller_profile FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO target_profile FROM public.profiles WHERE id = p_resident_id;

  IF caller_profile.community_id IS NULL OR NOT public.is_funds_enabled(caller_profile.community_id) THEN
    RAISE EXCEPTION 'Funds must be active before assigning blocks';
  END IF;

  IF target_profile.id IS NULL OR target_profile.community_id IS DISTINCT FROM caller_profile.community_id THEN
    RAISE EXCEPTION 'Resident not found in your community';
  END IF;

  IF target_profile.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot assign a removed resident';
  END IF;

  IF p_block_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.community_blocks cb
    WHERE cb.id = p_block_id
      AND cb.community_id = caller_profile.community_id
      AND cb.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Block must be active and belong to your community';
  END IF;

  UPDATE public.profiles
  SET block_id = p_block_id
  WHERE id = p_resident_id
  RETURNING * INTO updated_profile;

  RETURN updated_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_block_in_charge(p_event_id UUID, p_user_id UUID, p_block_id UUID)
RETURNS public.fund_roles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_profile public.profiles%ROWTYPE;
  event_community_id UUID;
  upserted_row public.fund_roles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_community_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Only community leads can assign block in-charges';
  END IF;

  SELECT * INTO caller_profile FROM public.profiles WHERE id = auth.uid();

  IF caller_profile.community_id IS NULL OR NOT public.is_funds_enabled(caller_profile.community_id) THEN
    RAISE EXCEPTION 'Funds must be active before assigning block in-charges';
  END IF;

  SELECT community_id INTO event_community_id FROM public.events WHERE id = p_event_id;

  IF event_community_id IS DISTINCT FROM caller_profile.community_id THEN
    RAISE EXCEPTION 'Fund does not belong to your community';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.community_blocks cb
    WHERE cb.id = p_block_id
      AND cb.community_id = caller_profile.community_id
      AND cb.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Block must be active and belong to your community';
  END IF;

  INSERT INTO public.fund_roles (event_id, user_id, role, block_id, assigned_by)
  VALUES (p_event_id, p_user_id, 'collector', p_block_id, auth.uid())
  ON CONFLICT (event_id, user_id)
  DO UPDATE SET
    role = EXCLUDED.role,
    block_id = EXCLUDED.block_id,
    assigned_by = EXCLUDED.assigned_by,
    updated_at = now()
  RETURNING * INTO upserted_row;

  RETURN upserted_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_block_in_charge(p_event_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_community_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Only community leads can remove block in-charges';
  END IF;

  SELECT * INTO caller_profile FROM public.profiles WHERE id = auth.uid();

  IF caller_profile.community_id IS NULL OR NOT public.is_funds_enabled(caller_profile.community_id) THEN
    RAISE EXCEPTION 'Funds must be active before removing block in-charges';
  END IF;

  DELETE FROM public.fund_roles fr
  USING public.events e
  WHERE fr.event_id = p_event_id
    AND fr.user_id = p_user_id
    AND fr.role = 'collector'
    AND fr.event_id = e.id
    AND e.community_id = caller_profile.community_id;
END;
$$;

-- ============================================================
-- Section 11 - platform admin personnel/block RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.platform_set_community_lead(p_community_id UUID, p_target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  existing_lead_id UUID;
  target_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can set community leads';
  END IF;

  IF NOT public.is_funds_enabled(p_community_id) THEN
    RAISE EXCEPTION 'Community lead can be set only when funds are active';
  END IF;

  SELECT * INTO target_profile FROM public.profiles WHERE id = p_target_user_id;

  IF target_profile.id IS NULL OR target_profile.community_id IS DISTINCT FROM p_community_id THEN
    RAISE EXCEPTION 'Target resident does not belong to this community';
  END IF;

  IF target_profile.app_role <> 'resident'::public.app_role_type OR target_profile.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Target user must be an active resident';
  END IF;

  SELECT id
  INTO existing_lead_id
  FROM public.profiles
  WHERE community_id = p_community_id
    AND app_role = 'community_lead'::public.app_role_type
    AND removed_at IS NULL
  LIMIT 1;

  IF existing_lead_id IS NOT NULL THEN
    UPDATE public.profiles
    SET app_role = 'resident'::public.app_role_type
    WHERE id = existing_lead_id;
  END IF;

  UPDATE public.profiles
  SET app_role = 'community_lead'::public.app_role_type
  WHERE id = p_target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_remove_community_lead(p_target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can remove community leads';
  END IF;

  UPDATE public.profiles
  SET app_role = 'resident'::public.app_role_type
  WHERE id = p_target_user_id
    AND app_role = 'community_lead'::public.app_role_type;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_add_community_block(p_community_id UUID, p_name TEXT)
RETURNS public.community_blocks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  inserted_row public.community_blocks%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can add blocks';
  END IF;

  IF NOT public.is_funds_enabled(p_community_id) THEN
    RAISE EXCEPTION 'Blocks can be managed only when funds are active';
  END IF;

  INSERT INTO public.community_blocks (community_id, name)
  VALUES (p_community_id, btrim(p_name))
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

  IF NOT public.is_funds_enabled(block_community_id) THEN
    RAISE EXCEPTION 'Blocks can be managed only when funds are active';
  END IF;

  UPDATE public.community_blocks
  SET archived_at = now(),
      updated_at = now()
  WHERE id = p_block_id
    AND archived_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_assign_block_in_charge(p_event_id UUID, p_user_id UUID, p_block_id UUID)
RETURNS public.fund_roles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  event_community_id UUID;
  result_row public.fund_roles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can assign block in-charges';
  END IF;

  SELECT community_id INTO event_community_id FROM public.events WHERE id = p_event_id;

  IF event_community_id IS NULL THEN
    RAISE EXCEPTION 'Fund not found';
  END IF;

  IF NOT public.is_funds_enabled(event_community_id) THEN
    RAISE EXCEPTION 'Funds are not active in this community';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.community_blocks cb
    WHERE cb.id = p_block_id
      AND cb.community_id = event_community_id
      AND cb.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Block must be active and belong to the fund community';
  END IF;

  INSERT INTO public.fund_roles (event_id, user_id, role, block_id, assigned_by)
  VALUES (p_event_id, p_user_id, 'collector', p_block_id, auth.uid())
  ON CONFLICT (event_id, user_id)
  DO UPDATE SET
    role = EXCLUDED.role,
    block_id = EXCLUDED.block_id,
    assigned_by = EXCLUDED.assigned_by,
    updated_at = now()
  RETURNING * INTO result_row;

  RETURN result_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_remove_block_in_charge(p_event_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can remove block in-charges';
  END IF;

  DELETE FROM public.fund_roles
  WHERE event_id = p_event_id
    AND user_id = p_user_id
    AND role = 'collector';
END;
$$;

-- ============================================================
-- Section 12 - resident block self-declaration RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_my_block(p_block_id UUID)
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_profile public.profiles%ROWTYPE;
  updated_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO caller_profile FROM public.profiles WHERE id = auth.uid();

  IF caller_profile.community_id IS NULL THEN
    RAISE EXCEPTION 'Community not selected';
  END IF;

  IF NOT public.is_blocks_enabled(caller_profile.community_id) THEN
    RAISE EXCEPTION 'Blocks are not active in your community';
  END IF;

  IF p_block_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.community_blocks cb
    WHERE cb.id = p_block_id
      AND cb.community_id = caller_profile.community_id
      AND cb.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Select an active block from your community';
  END IF;

  UPDATE public.profiles
  SET block_id = p_block_id
  WHERE id = auth.uid()
  RETURNING * INTO updated_profile;

  RETURN updated_profile;
END;
$$;

-- ============================================================
-- Section 13 - block-scoped contributor list RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_eligible_contributors_for_collector(
  p_event_id UUID
)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  flat_no TEXT,
  block_id UUID,
  block_name TEXT,
  has_contributed BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  event_community_id UUID;
  caller_role TEXT;
  caller_block_id UUID;
  caller_is_community_lead BOOLEAN;
  caller_is_platform_admin BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT e.community_id
  INTO event_community_id
  FROM public.events e
  WHERE e.id = p_event_id;

  IF event_community_id IS NULL THEN
    RAISE EXCEPTION 'Fund not found';
  END IF;

  SELECT fr.role, fr.block_id
  INTO caller_role, caller_block_id
  FROM public.fund_roles fr
  WHERE fr.event_id = p_event_id
    AND fr.user_id = auth.uid()
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.community_id = event_community_id
      AND p.app_role = 'community_lead'::public.app_role_type
      AND p.removed_at IS NULL
  ) INTO caller_is_community_lead;

  caller_is_platform_admin := public.is_platform_admin(auth.uid());

  IF caller_role IS NULL AND NOT caller_is_community_lead AND NOT caller_is_platform_admin THEN
    RAISE EXCEPTION 'Caller does not have access to this fund';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    COALESCE(p.full_name, 'Resident')::TEXT,
    p.flat_number::TEXT,
    p.block_id,
    cb.name::TEXT,
    EXISTS (
      SELECT 1
      FROM public.event_transactions et
      WHERE et.event_id = p_event_id
        AND et.type = 'income'
        AND et.contributor_user_id = p.id
    ) AS has_contributed
  FROM public.profiles p
  LEFT JOIN public.community_blocks cb ON cb.id = p.block_id
  WHERE p.community_id = event_community_id
    AND p.removed_at IS NULL
    AND p.app_role = 'resident'::public.app_role_type
    AND (
      (caller_role = 'collector' AND caller_block_id IS NOT NULL AND p.block_id = caller_block_id)
      OR (caller_role = 'collector' AND caller_block_id IS NULL)
      OR (caller_role IN ('treasurer'))
      OR caller_is_community_lead
      OR caller_is_platform_admin
    )
  ORDER BY cb.name NULLS LAST, p.full_name NULLS LAST;
END;
$$;

-- ============================================================
-- Section 14 - RLS for new tables
-- ============================================================

ALTER TABLE public.funds_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funds_access_revocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Funds requests readable by requester/community/admin" ON public.funds_access_requests;
CREATE POLICY "Funds requests readable by requester/community/admin"
  ON public.funds_access_requests
  FOR SELECT
  USING (
    requested_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.community_id = funds_access_requests.community_id
        AND p.removed_at IS NULL
    )
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Funds requests insert denied" ON public.funds_access_requests;
CREATE POLICY "Funds requests insert denied"
  ON public.funds_access_requests
  FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "Funds requests update denied" ON public.funds_access_requests;
CREATE POLICY "Funds requests update denied"
  ON public.funds_access_requests
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Funds requests delete denied" ON public.funds_access_requests;
CREATE POLICY "Funds requests delete denied"
  ON public.funds_access_requests
  FOR DELETE
  USING (false);

DROP POLICY IF EXISTS "Community blocks readable by same community" ON public.community_blocks;
CREATE POLICY "Community blocks readable by same community"
  ON public.community_blocks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.community_id = community_blocks.community_id
        AND p.removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Community blocks insert denied" ON public.community_blocks;
CREATE POLICY "Community blocks insert denied"
  ON public.community_blocks
  FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "Community blocks update denied" ON public.community_blocks;
CREATE POLICY "Community blocks update denied"
  ON public.community_blocks
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Community blocks delete denied" ON public.community_blocks;
CREATE POLICY "Community blocks delete denied"
  ON public.community_blocks
  FOR DELETE
  USING (false);

DROP POLICY IF EXISTS "Funds revocations readable by admin" ON public.funds_access_revocations;
CREATE POLICY "Funds revocations readable by admin"
  ON public.funds_access_revocations
  FOR SELECT
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Funds revocations insert denied" ON public.funds_access_revocations;
CREATE POLICY "Funds revocations insert denied"
  ON public.funds_access_revocations
  FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "Funds revocations update denied" ON public.funds_access_revocations;
CREATE POLICY "Funds revocations update denied"
  ON public.funds_access_revocations
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Funds revocations delete denied" ON public.funds_access_revocations;
CREATE POLICY "Funds revocations delete denied"
  ON public.funds_access_revocations
  FOR DELETE
  USING (false);

-- ============================================================
-- Section 15 - function grants
-- ============================================================

GRANT EXECUTE ON FUNCTION public.is_funds_enabled(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocks_enabled(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_community_blocks(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_block_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_funds_access_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_funds_access_request(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_funds_access_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_approve_funds_access_request(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_reject_funds_access_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_revoke_funds_access(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_community_blocks_enabled(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_community_block(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_community_block(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rename_community_block(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_resident_block(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_block_in_charge(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_block_in_charge(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_community_lead(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_remove_community_lead(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_add_community_block(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_archive_community_block(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_assign_block_in_charge(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_remove_block_in_charge(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_block(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_eligible_contributors_for_collector(UUID) TO authenticated;

-- ============================================================
-- Section 16 - reload schema
-- ============================================================

NOTIFY pgrst, 'reload schema';
