-- Migration: Allow platform admins to assign/replace a fund's treasurer.
-- Community leads/admins can already manage treasurers for their own
-- community via direct fund_roles RLS policies (see
-- 20260813000000_single_treasurer_per_fund.sql), but those policies key off
-- get_user_community_id(), which is null/irrelevant for a platform admin
-- viewing another community's fund from the admin console. This RPC mirrors
-- platform_set_community_lead's "replace the current occupant" pattern:
-- it removes any existing treasurer on the fund and assigns the new one in
-- the same transaction, keeping the "at most 1 treasurer" trigger invariant
-- (validate_fund_role_change) satisfied throughout.

CREATE OR REPLACE FUNCTION public.platform_set_fund_treasurer(p_event_id UUID, p_target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id UUID;
  target_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can set fund treasurers';
  END IF;

  SELECT community_id INTO v_community_id
  FROM public.events
  WHERE id = p_event_id;

  IF v_community_id IS NULL THEN
    RAISE EXCEPTION 'Fund not found';
  END IF;

  SELECT * INTO target_profile FROM public.profiles WHERE id = p_target_user_id;

  IF target_profile.id IS NULL OR target_profile.community_id IS DISTINCT FROM v_community_id THEN
    RAISE EXCEPTION 'Target resident does not belong to this community';
  END IF;

  IF target_profile.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Target user must be an active resident';
  END IF;

  IF target_profile.app_role IN ('admin', 'president', 'vice_president') THEN
    RAISE EXCEPTION 'Community leads and admins cannot be assigned as fund treasurer';
  END IF;

  DELETE FROM public.fund_roles
  WHERE event_id = p_event_id
    AND role = 'treasurer';

  INSERT INTO public.fund_roles (event_id, user_id, role, assigned_by)
  VALUES (p_event_id, p_target_user_id, 'treasurer', auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_set_fund_treasurer(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
