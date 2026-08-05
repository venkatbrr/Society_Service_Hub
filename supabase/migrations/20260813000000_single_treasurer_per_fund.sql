-- ============================================================
-- Migration: Single Treasurer per Fund and Community Lead Fund Management
-- Date: 2026-08-13
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
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

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

    IF NEW.role = 'treasurer' AND role_count >= 1 THEN
      RAISE EXCEPTION 'A fund can have at most 1 treasurer';
    END IF;

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

  IF TG_OP = 'UPDATE' AND OLD.role = 'treasurer' AND NEW.role <> 'treasurer' THEN
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

-- RLS policies for events table to allow community leads (president/vice_president) and admins to manage funds
DROP POLICY IF EXISTS "Admins can create funds in their community" ON public.events;
DROP POLICY IF EXISTS "Admins and community leads can create funds in their community" ON public.events;
CREATE POLICY "Admins and community leads can create funds in their community"
  ON public.events
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND community_id = get_user_community_id()
    AND (public.is_admin(auth.uid()) OR public.is_community_lead(auth.uid()))
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can update funds in their community" ON public.events;
DROP POLICY IF EXISTS "Admins and community leads can update funds in their community" ON public.events;
CREATE POLICY "Admins and community leads can update funds in their community"
  ON public.events
  FOR UPDATE
  USING (
    community_id = get_user_community_id()
    AND (public.is_admin(auth.uid()) OR public.is_community_lead(auth.uid()))
    AND public.is_user_approved(auth.uid())
  )
  WITH CHECK (
    community_id = get_user_community_id()
    AND (public.is_admin(auth.uid()) OR public.is_community_lead(auth.uid()))
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can delete funds in their community" ON public.events;
DROP POLICY IF EXISTS "Admins and community leads can delete funds in their community" ON public.events;
CREATE POLICY "Admins and community leads can delete funds in their community"
  ON public.events
  FOR DELETE
  USING (
    community_id = get_user_community_id()
    AND (public.is_admin(auth.uid()) OR public.is_community_lead(auth.uid()))
    AND public.is_user_approved(auth.uid())
  );

-- RLS policies for fund_roles table to allow community leads (president/vice_president) and admins to manage treasurers
DROP POLICY IF EXISTS "Admins can manage treasurers" ON public.fund_roles;
DROP POLICY IF EXISTS "Admins and community leads can manage treasurers" ON public.fund_roles;
CREATE POLICY "Admins and community leads can manage treasurers"
  ON public.fund_roles
  FOR INSERT
  WITH CHECK (
    role = 'treasurer'
    AND assigned_by = auth.uid()
    AND (public.is_admin(auth.uid()) OR public.is_community_lead(auth.uid()))
    AND public.is_user_approved(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id
        AND e.community_id = get_user_community_id()
    )
  );

DROP POLICY IF EXISTS "Admins can update treasurer roles" ON public.fund_roles;
DROP POLICY IF EXISTS "Admins and community leads can update treasurer roles" ON public.fund_roles;
CREATE POLICY "Admins and community leads can update treasurer roles"
  ON public.fund_roles
  FOR UPDATE
  USING (
    (public.is_admin(auth.uid()) OR public.is_community_lead(auth.uid()))
    AND public.is_user_approved(auth.uid())
  )
  WITH CHECK (
    role = 'treasurer'
    AND assigned_by = auth.uid()
    AND (public.is_admin(auth.uid()) OR public.is_community_lead(auth.uid()))
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can delete treasurers" ON public.fund_roles;
DROP POLICY IF EXISTS "Admins and community leads can delete treasurers" ON public.fund_roles;
CREATE POLICY "Admins and community leads can delete treasurers"
  ON public.fund_roles
  FOR DELETE
  USING (
    role = 'treasurer'
    AND (public.is_admin(auth.uid()) OR public.is_community_lead(auth.uid()))
    AND public.is_user_approved(auth.uid())
  );

-- RPC for deleting a community fund cleanly
CREATE OR REPLACE FUNCTION public.delete_community_fund(p_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT community_id INTO v_community_id
  FROM public.events
  WHERE id = p_event_id;

  IF v_community_id IS NULL THEN
    RAISE EXCEPTION 'Fund not found';
  END IF;

  IF v_community_id IS DISTINCT FROM get_user_community_id() THEN
    RAISE EXCEPTION 'Fund belongs to another community';
  END IF;

  IF NOT (public.is_admin(auth.uid()) OR public.is_community_lead(auth.uid())) THEN
    RAISE EXCEPTION 'Only community leads can delete funds';
  END IF;

  DELETE FROM public.event_transactions WHERE event_id = p_event_id;
  DELETE FROM public.fund_roles WHERE event_id = p_event_id;
  DELETE FROM public.events WHERE id = p_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_community_fund(UUID) TO authenticated;
