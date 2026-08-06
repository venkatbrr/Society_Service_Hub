-- ============================================================
-- Migration: Repoint dead 'community_lead' checks to president/vice_president
-- Date: 2026-08-21
-- ============================================================
--
-- Migration 20260616000001 moved every 'community_lead' / 'community_admin'
-- row to 'president' and redefined public.is_community_lead() to test
-- president OR vice_president. But 7 RLS policies and 5 functions were never
-- repointed and still compare against the literal 'community_lead'.
--
-- Because no row can hold that value anymore, those checks are permanently
-- FALSE. Presidents/VPs silently lose powers they should have, and two
-- safeguards never fire at all:
--   * platform_soft_remove_resident  -> "last community lead" guard is dead,
--     so a platform admin can strand a community with no lead.
--   * community_lead_remove_resident -> a president can remove another
--     president.
--
-- This migration repoints all 12 to public.is_community_lead(), giving
-- president and vice_president identical powers.
-- ============================================================

-- ------------------------------------------------------------
-- 1. RLS policies (7)
--    Rule:  owner = auth.uid()
--        OR is_community_lead()     -- president / vice_president
--        OR is_platform_admin()     -- platform admin: ultimate override
--
--    NOTE: deliberately is_platform_admin(), NOT is_admin(). public.is_admin()
--    is only an alias that calls is_community_lead(), so it grants a platform
--    admin nothing. This matches the convention set by the newer
--    20260821000000_mcn_listing_spam_controls.sql policies.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "schools_update" ON public.schools;
CREATE POLICY "schools_update"
  ON public.schools FOR UPDATE
  USING (
    created_by = auth.uid()
    OR public.is_community_lead(auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "schools_delete" ON public.schools;
CREATE POLICY "schools_delete"
  ON public.schools FOR DELETE
  USING (
    created_by = auth.uid()
    OR public.is_community_lead(auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "school_reviews_delete" ON public.school_reviews;
CREATE POLICY "school_reviews_delete"
  ON public.school_reviews FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.is_community_lead(auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "mcn_posts_update" ON public.mcn_posts;
CREATE POLICY "mcn_posts_update"
  ON public.mcn_posts FOR UPDATE
  USING (
    user_id = auth.uid()
    OR public.is_community_lead(auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "mcn_carpools_update" ON public.mcn_carpools;
CREATE POLICY "mcn_carpools_update"
  ON public.mcn_carpools FOR UPDATE
  USING (
    created_by = auth.uid()
    OR public.is_community_lead(auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "mcn_parent_corner_update" ON public.mcn_parent_corner;
CREATE POLICY "mcn_parent_corner_update"
  ON public.mcn_parent_corner FOR UPDATE
  USING (
    user_id = auth.uid()
    OR public.is_community_lead(auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "mcn_preorder_drops_update" ON public.mcn_preorder_drops;
CREATE POLICY "mcn_preorder_drops_update"
  ON public.mcn_preorder_drops FOR UPDATE
  USING (
    created_by = auth.uid()
    OR public.is_community_lead(auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

-- ------------------------------------------------------------
-- 2. platform_soft_remove_resident
--    Restore the "cannot remove the only community lead" safeguard by
--    counting president/vice_president instead of the dead value.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.platform_soft_remove_resident(
  p_target_profile_id UUID,
  p_reason TEXT DEFAULT NULL::TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  target_profile public.profiles%ROWTYPE;
  community_name TEXT;
  lead_count     INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can remove residents';
  END IF;

  SELECT * INTO target_profile
  FROM public.profiles
  WHERE id = p_target_profile_id;

  IF target_profile.id IS NULL THEN
    RAISE EXCEPTION 'Resident not found';
  END IF;

  IF target_profile.community_id IS NULL THEN
    RAISE EXCEPTION 'Resident is not assigned to any community';
  END IF;

  -- Prevent removal of the last community lead (president / vice president)
  IF target_profile.app_role IN (
       'president'::public.app_role_type,
       'vice_president'::public.app_role_type
     ) THEN
    SELECT count(*) INTO lead_count
    FROM public.profiles p
    WHERE p.community_id = target_profile.community_id
      AND p.app_role IN (
        'president'::public.app_role_type,
        'vice_president'::public.app_role_type
      )
      AND p.removed_at IS NULL;

    IF lead_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the only community lead in this community';
    END IF;
  END IF;

  PERFORM public.set_audit_context(
    auth.uid(),
    COALESCE(p_reason, 'platform removed resident from community')
  );

  UPDATE public.profiles
  SET community_id = NULL,
      app_role     = 'resident'::public.app_role_type,
      removed_at   = now(),
      removed_by   = auth.uid()
  WHERE id = target_profile.id;

  SELECT name INTO community_name
  FROM public.communities
  WHERE id = target_profile.community_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    target_profile.id,
    'removed_from_community',
    'Removed from community',
    'Your access to ' || COALESCE(community_name, 'the community') || ' has been removed.',
    jsonb_build_object('community_name', community_name, 'reason', p_reason)
  );
END;
$function$;

-- ------------------------------------------------------------
-- 3. community_lead_remove_resident
--    A lead must not be able to remove another lead.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.community_lead_remove_resident(
  p_target_profile_id UUID,
  p_reason TEXT DEFAULT NULL::TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller_profile public.profiles%ROWTYPE;
  target_profile public.profiles%ROWTYPE;
  community_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_community_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Only community leads can remove residents';
  END IF;

  SELECT * INTO caller_profile FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO target_profile FROM public.profiles WHERE id = p_target_profile_id;

  IF target_profile.id IS NULL THEN
    RAISE EXCEPTION 'Resident not found';
  END IF;

  IF target_profile.community_id IS DISTINCT FROM caller_profile.community_id THEN
    RAISE EXCEPTION 'Resident does not belong to your community';
  END IF;

  IF target_profile.app_role IN (
       'president'::public.app_role_type,
       'vice_president'::public.app_role_type
     ) THEN
    RAISE EXCEPTION 'Cannot remove a community lead — contact the platform admin';
  END IF;

  IF target_profile.id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot remove yourself from the community';
  END IF;

  PERFORM public.set_audit_context(
    auth.uid(),
    COALESCE(p_reason, 'community lead removed resident')
  );

  UPDATE public.profiles
  SET community_id = NULL,
      app_role     = 'resident'::public.app_role_type,
      removed_at   = now(),
      removed_by   = auth.uid()
  WHERE id = target_profile.id;

  SELECT name INTO community_name
  FROM public.communities
  WHERE id = caller_profile.community_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    target_profile.id,
    'removed_from_community',
    'Removed from community',
    'Your access to ' || COALESCE(community_name, 'the community') || ' has been removed.',
    jsonb_build_object('community_name', community_name, 'reason', p_reason)
  );
END;
$function$;

-- ------------------------------------------------------------
-- 4. validate_event_transaction
--    A president/VP holding no fund_roles row was being blocked from
--    recording contributions.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_event_transaction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
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
          AND p.app_role IN (
            'president'::public.app_role_type,
            'vice_president'::public.app_role_type
          )
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
$function$;

-- ------------------------------------------------------------
-- 5. handle_provider_report_notification
--    Provider-report notifications were being sent to nobody.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_provider_report_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  provider_name TEXT;
  reporter_name TEXT;
  provider_community_id UUID;
BEGIN
  -- Get provider info
  SELECT sp.name, sp.community_id
  INTO provider_name, provider_community_id
  FROM public.service_providers sp
  WHERE sp.id = NEW.provider_id;

  -- Get reporter name
  SELECT p.full_name
  INTO reporter_name
  FROM public.profiles p
  WHERE p.id = NEW.reported_by;

  -- Notify all community leads (president / vice president) in the community
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    p.id,
    'provider_reported',
    'Provider reported',
    COALESCE(reporter_name, 'A resident') || ' reported "' || COALESCE(provider_name, 'a provider') || '". Tap to review.',
    jsonb_build_object(
      'provider_id', NEW.provider_id,
      'report_id', NEW.id,
      'reason', NEW.reason
    )
  FROM public.profiles p
  WHERE p.community_id = provider_community_id
    AND p.app_role IN (
      'president'::public.app_role_type,
      'vice_president'::public.app_role_type
    )
    AND p.removed_at IS NULL
    AND p.id != NEW.reported_by;

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------
-- 6. request_community_partnership (federation)
--    Partnership-request notifications were being sent to nobody.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_community_partnership(
  p_target_community_id UUID,
  p_scope JSONB DEFAULT '{"providers": true}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller_community_id UUID;
  partnership_id      UUID;
  a_id                UUID;
  b_id                UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_community_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Only community leads can initiate partnerships';
  END IF;

  SELECT community_id INTO caller_community_id
  FROM public.profiles WHERE id = auth.uid();

  IF caller_community_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no community';
  END IF;

  IF caller_community_id = p_target_community_id THEN
    RAISE EXCEPTION 'Cannot partner with your own community';
  END IF;

  -- Canonical ordering.
  IF caller_community_id < p_target_community_id THEN
    a_id := caller_community_id; b_id := p_target_community_id;
  ELSE
    a_id := p_target_community_id; b_id := caller_community_id;
  END IF;

  INSERT INTO public.community_partnerships (
    community_a_id, community_b_id, status, scope, initiated_by
  ) VALUES (
    a_id, b_id, 'pending', COALESCE(p_scope, '{}'::jsonb), auth.uid()
  )
  ON CONFLICT (community_a_id, community_b_id) DO UPDATE
    SET status       = 'pending',
        scope        = EXCLUDED.scope,
        initiated_by = auth.uid(),
        accepted_by  = NULL,
        updated_at   = now()
  RETURNING id INTO partnership_id;

  -- Notify community leads (president / vice president) of the target community.
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    p.id,
    'partnership_request',
    'New partnership request',
    (SELECT name FROM public.communities WHERE id = caller_community_id)
      || ' wants to collaborate with your community.',
    jsonb_build_object(
      'partnership_id', partnership_id,
      'from_community_id', caller_community_id,
      'scope', COALESCE(p_scope, '{}'::jsonb)
    )
  FROM public.profiles p
  WHERE p.community_id = p_target_community_id
    AND p.app_role IN (
      'president'::public.app_role_type,
      'vice_president'::public.app_role_type
    )
    AND p.removed_at IS NULL;

  RETURN partnership_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';
