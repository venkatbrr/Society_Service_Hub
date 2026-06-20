-- Migration: Replace community_lead with president and vice_president roles, and clean up community_admin

-- 1. Migrate existing community leads to presidents
UPDATE public.profiles
SET app_role = 'president'::public.app_role_type
WHERE app_role = 'community_lead'::public.app_role_type;

-- 2. Clean up any remaining community_admin roles to president
UPDATE public.profiles
SET app_role = 'president'::public.app_role_type
WHERE app_role = 'community_admin'::public.app_role_type;

-- 3. Redefine public.is_community_lead to check for president or vice_president
CREATE OR REPLACE FUNCTION public.is_community_lead(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = COALESCE(p_user_id, auth.uid())
      AND p.app_role IN ('president'::public.app_role_type, 'vice_president'::public.app_role_type)
      AND p.removed_at IS NULL
  );
END;
$$;

-- 4. Redefine platform_approve_funds_access_request to appoint designated lead as president
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

  -- Default to appointing the designated lead as president
  UPDATE public.profiles
  SET app_role = 'president'::public.app_role_type
  WHERE id = p_lead_user_id;

  UPDATE public.funds_access_requests
  SET status = 'approved',
      decided_at = now(),
      decided_by = auth.uid(),
      designated_lead_id = p_lead_user_id,
      rejection_reason = NULL
  WHERE id = p_request_id;

  IF req.requested_by = p_lead_user_id THEN
    merged_message := 'Funds support was approved for ' || COALESCE(community_name, 'your community') || '. You are now the President.';

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
      'You are now President',
      'Platform admin approved funds support and assigned you as President for ' || COALESCE(community_name, 'your community') || '.',
      jsonb_build_object('request_id', req.id, 'community_id', req.community_id, 'requested_by_name', requester_name)
    );
  END IF;
END;
$$;

-- 5. Redefine platform_revoke_funds_access to demote both president and vice president
CREATE OR REPLACE FUNCTION public.platform_revoke_funds_access(
  p_community_id UUID,
  p_revoke_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
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

  -- 1. Send notifications to all active presidents and vice presidents before demoting them
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    p.id,
    'funds_access_revoked',
    'Funds access revoked',
    'Funds access was revoked for ' || COALESCE(community_name, 'your community') || '. Reason: ' || reason_text,
    jsonb_build_object('community_id', p_community_id, 'reason', reason_text)
  FROM public.profiles p
  WHERE p.community_id = p_community_id
    AND p.app_role IN ('president'::public.app_role_type, 'vice_president'::public.app_role_type)
    AND p.removed_at IS NULL;

  -- 2. Notify all other active residents
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
    AND p.app_role NOT IN ('president'::public.app_role_type, 'vice_president'::public.app_role_type);

  -- 3. Demote any active presidents or vice presidents in the community to resident
  UPDATE public.profiles
  SET app_role = 'resident'::public.app_role_type
  WHERE community_id = p_community_id
    AND app_role IN ('president'::public.app_role_type, 'vice_president'::public.app_role_type);

  -- 4. Clear blocks and revoke funds enablement
  UPDATE public.communities
  SET funds_enabled = false,
      blocks_enabled = false
  WHERE id = p_community_id;

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
END;
$$;

-- 6. Drop old platform_set_community_lead(UUID, UUID) and recreate it with role parameter
DROP FUNCTION IF EXISTS public.platform_set_community_lead(UUID, UUID);

CREATE OR REPLACE FUNCTION public.platform_set_community_lead(
  p_community_id UUID,
  p_target_user_id UUID,
  p_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  existing_user_id UUID;
  target_profile public.profiles%ROWTYPE;
  target_role public.app_role_type;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can set community leads';
  END IF;

  IF p_role NOT IN ('president', 'vice_president') THEN
    RAISE EXCEPTION 'Invalid role. Must be president or vice_president';
  END IF;

  target_role := p_role::public.app_role_type;

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

  -- Ensure only one person has this role in the community
  SELECT id
  INTO existing_user_id
  FROM public.profiles
  WHERE community_id = p_community_id
    AND app_role = target_role
    AND removed_at IS NULL
  LIMIT 1;

  IF existing_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET app_role = 'resident'::public.app_role_type
    WHERE id = existing_user_id;
  END IF;

  UPDATE public.profiles
  SET app_role = target_role
  WHERE id = p_target_user_id;

  -- Notify the new lead
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    p_target_user_id,
    'community_lead_appointed',
    'Role Appointed',
    'You have been appointed as ' || INITCAP(p_role) || ' for your community.',
    jsonb_build_object('community_id', p_community_id, 'role', p_role)
  );
END;
$$;

-- 7. Redefine platform_remove_community_lead(UUID)
CREATE OR REPLACE FUNCTION public.platform_remove_community_lead(p_target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can remove community leads';
  END IF;

  SELECT app_role::TEXT INTO v_role
  FROM public.profiles
  WHERE id = p_target_user_id;

  UPDATE public.profiles
  SET app_role = 'resident'::public.app_role_type
  WHERE id = p_target_user_id
    AND app_role IN ('president'::public.app_role_type, 'vice_president'::public.app_role_type);

  IF FOUND THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      p_target_user_id,
      'community_lead_removed',
      'Role Revoked',
      'Your role as ' || INITCAP(COALESCE(v_role, 'lead')) || ' has been revoked.',
      jsonb_build_object('role', v_role)
    );
  END IF;
END;
$$;

-- 8. Redefine list_eligible_contributors_for_collector to check for president or vice_president
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
      AND p.app_role IN ('president'::public.app_role_type, 'vice_president'::public.app_role_type)
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

-- 9. Grant executes
GRANT EXECUTE ON FUNCTION public.platform_approve_funds_access_request(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_community_lead(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_remove_community_lead(UUID) TO authenticated;
