-- Migration: 20260904000400_resident_removal_and_hard_delete.sql
-- Description: Fixes profile block/flat trigger on resident removal, provides platform_remove_resident_from_community,
-- and adds platform_delete_user RPC for hard deleting accounts from auth.users.

-- 1. Fix validate_profile_block_assignment to safely handle community_id IS NULL
CREATE OR REPLACE FUNCTION public.validate_profile_block_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  block_community_id UUID;
BEGIN
  -- If community_id is NULL, automatically clear block_id
  IF NEW.community_id IS NULL THEN
    NEW.block_id := NULL;
    RETURN NEW;
  END IF;

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

  IF block_community_id IS DISTINCT FROM NEW.community_id THEN
    RAISE EXCEPTION 'Profile block must belong to the same community';
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Update platform_soft_remove_resident to clear block_id, flat_id, flat_number and fund_roles
CREATE OR REPLACE FUNCTION public.platform_soft_remove_resident(
  p_target_profile_id UUID,
  p_reason TEXT DEFAULT NULL::TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_profile public.profiles%ROWTYPE;
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

  -- Delete any fund roles held by this resident in that community
  DELETE FROM public.fund_roles
  WHERE user_id = target_profile.id;

  PERFORM public.set_audit_context(
    auth.uid(),
    COALESCE(p_reason, 'platform removed resident from community')
  );
  PERFORM public.allow_membership_change();

  UPDATE public.profiles
  SET community_id = NULL,
      block_id     = NULL,
      flat_id      = NULL,
      flat_number  = NULL,
      app_role     = 'resident'::public.app_role_type,
      removed_at   = now(),
      removed_by   = auth.uid()
  WHERE id = target_profile.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_soft_remove_resident(UUID, TEXT) TO authenticated;

-- 3. Clean hard removal from community (clears community, block, flat with removed_at = NULL)
CREATE OR REPLACE FUNCTION public.platform_remove_resident_from_community(
  p_target_profile_id UUID,
  p_reason TEXT DEFAULT NULL::TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_profile public.profiles%ROWTYPE;
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

  -- Prevent removal of the last community lead (president / vice president)
  IF target_profile.community_id IS NOT NULL AND target_profile.app_role IN (
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

  -- Delete any fund roles held by this resident
  DELETE FROM public.fund_roles
  WHERE user_id = target_profile.id;

  PERFORM public.set_audit_context(
    auth.uid(),
    COALESCE(p_reason, 'platform hard-removed resident from community')
  );
  PERFORM public.allow_membership_change();

  -- Clear community association completely so they can join fresh
  UPDATE public.profiles
  SET community_id = NULL,
      block_id     = NULL,
      flat_id      = NULL,
      flat_number  = NULL,
      app_role     = 'resident'::public.app_role_type,
      removed_at   = NULL,
      removed_by   = NULL
  WHERE id = target_profile.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_remove_resident_from_community(UUID, TEXT) TO authenticated;

-- 4. Permanent account deletion from auth.users (cascades to profiles and all user data)
CREATE OR REPLACE FUNCTION public.platform_delete_user(
  p_target_user_id UUID,
  p_reason TEXT DEFAULT NULL::TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_profile public.profiles%ROWTYPE;
  lead_count     INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can delete user accounts';
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own platform admin account';
  END IF;

  SELECT * INTO target_profile
  FROM public.profiles
  WHERE id = p_target_user_id;

  -- Disallow deleting other platform admins
  IF target_profile.app_role = 'admin'::public.app_role_type OR target_profile.email IN ('thewooru@gmail.com', 'societyservicehub@gmail.com') THEN
    RAISE EXCEPTION 'Cannot delete platform admin accounts';
  END IF;

  -- If part of a community and is lead, check last lead guard
  IF target_profile.community_id IS NOT NULL AND target_profile.app_role IN (
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
      RAISE EXCEPTION 'Cannot delete the only community lead in this community. Reassign lead role first.';
    END IF;
  END IF;

  -- Clean up non-cascading relations before deleting auth user
  DELETE FROM public.fund_roles WHERE user_id = p_target_user_id;
  DELETE FROM public.notifications WHERE user_id = p_target_user_id;
  DELETE FROM public.ratings WHERE user_id = p_target_user_id;
  DELETE FROM public.favorites WHERE user_id = p_target_user_id;

  PERFORM public.allow_membership_change();

  -- Delete from auth.users (cascades to public.profiles and child tables)
  DELETE FROM auth.users WHERE id = p_target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_delete_user(UUID, TEXT) TO authenticated;

-- 5. Fix community_lead_remove_resident to clear block_id, flat_id, flat_number and fund_roles
CREATE OR REPLACE FUNCTION public.community_lead_remove_resident(
  p_target_profile_id UUID,
  p_reason TEXT DEFAULT NULL::TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_profile public.profiles%ROWTYPE;
  target_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO caller_profile
  FROM public.profiles
  WHERE id = auth.uid();

  IF caller_profile.community_id IS NULL OR NOT public.is_community_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Only community leads can remove residents';
  END IF;

  SELECT * INTO target_profile
  FROM public.profiles
  WHERE id = p_target_profile_id;

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

  -- Delete any fund roles held by this resident in this community
  DELETE FROM public.fund_roles
  WHERE user_id = target_profile.id;

  PERFORM public.set_audit_context(
    auth.uid(),
    COALESCE(p_reason, 'community lead removed resident')
  );
  PERFORM public.allow_membership_change();

  UPDATE public.profiles
  SET community_id = NULL,
      block_id     = NULL,
      flat_id      = NULL,
      flat_number  = NULL,
      app_role     = 'resident'::public.app_role_type,
      removed_at   = now(),
      removed_by   = auth.uid()
  WHERE id = target_profile.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_lead_remove_resident(UUID, TEXT) TO authenticated;
