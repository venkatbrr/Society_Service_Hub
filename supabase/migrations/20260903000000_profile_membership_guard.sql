-- supabase/migrations/20260903000000_profile_membership_guard.sql

-- ============================================================================
-- 1. Bypass token for legitimate membership-changing RPCs (Part 2, D5).
--    Transaction-local, so it cannot be set from one PostgREST request and
--    used in another. Granted to nobody.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.allow_membership_change()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.membership_change_ok', '1', true);
END;
$$;

REVOKE ALL ON FUNCTION public.allow_membership_change() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. The guard trigger itself. Pins the columns a resident must never self-edit.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_profile_membership_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Direct SQL / service role (no JWT) is unrestricted.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- A membership RPC ran allow_membership_change() earlier in this transaction.
  IF COALESCE(nullif(current_setting('app.membership_change_ok', true), ''), '0') = '1' THEN
    RETURN NEW;
  END IF;

  -- Platform admin override.
  IF public.is_platform_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.block_id   IS DISTINCT FROM OLD.block_id
     OR NEW.removed_at IS DISTINCT FROM OLD.removed_at
     OR NEW.removed_by IS DISTINCT FROM OLD.removed_by
  THEN
    RAISE EXCEPTION
      'Community membership cannot be changed directly. Use join_community_by_code() or set_my_block().';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_membership_guard_on_profiles ON public.profiles;
CREATE TRIGGER enforce_profile_membership_guard_on_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_membership_guard();

-- ============================================================================
-- 3. Teach the four legitimate RPCs to raise the flag.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.join_community_by_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_community public.communities%ROWTYPE;
  caller_profile   public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO caller_profile
  FROM public.profiles
  WHERE id = auth.uid();

  IF caller_profile.community_id IS NOT NULL THEN
    RAISE EXCEPTION 'Already a member of a community';
  END IF;

  SELECT * INTO target_community
  FROM public.communities
  WHERE upper(code) = upper(btrim(p_code));

  IF target_community.id IS NULL THEN
    RAISE EXCEPTION 'Invalid community code';
  END IF;

  -- Block re-join if user was removed from this community
  IF EXISTS (
    SELECT 1 FROM public.profile_audit_log l
    WHERE l.profile_id = auth.uid()
      AND l.field = 'community_id'
      AND l.old_value = target_community.id::text
      AND l.new_value IS NULL
  ) AND caller_profile.removed_at IS NOT NULL THEN
    RAISE EXCEPTION
      'Your access to this community was removed. Ask a community lead to re-admit you.';
  END IF;

  PERFORM public.set_audit_context(auth.uid(), 'joined community via code');
  PERFORM public.allow_membership_change();

  UPDATE public.profiles
  SET community_id = target_community.id,
      removed_at   = NULL,
      removed_by   = NULL
  WHERE id = auth.uid();

  RETURN jsonb_build_object(
    'community_id',   target_community.id,
    'community_name', target_community.name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_community_by_code(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_my_block(p_block_id UUID)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  PERFORM public.allow_membership_change();

  UPDATE public.profiles
  SET block_id = p_block_id
  WHERE id = auth.uid()
  RETURNING * INTO updated_profile;

  RETURN updated_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_block(UUID) TO authenticated;

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
  PERFORM public.allow_membership_change();

  UPDATE public.profiles
  SET community_id = NULL,
      app_role     = 'resident'::public.app_role_type,
      removed_at   = now(),
      removed_by   = auth.uid()
  WHERE id = target_profile.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_lead_remove_resident(UUID, TEXT) TO authenticated;

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
  PERFORM public.allow_membership_change();

  UPDATE public.profiles
  SET community_id = NULL,
      app_role     = 'resident'::public.app_role_type,
      removed_at   = now(),
      removed_by   = auth.uid()
  WHERE id = target_profile.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_soft_remove_resident(UUID, TEXT) TO authenticated;

-- ============================================================================
-- 4. Re-admit path for community leads (Part 2, D3).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.community_lead_readmit_resident(p_target_profile_id uuid)
RETURNS void
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

  IF NOT public.is_community_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Only community leads can re-admit residents';
  END IF;

  SELECT * INTO caller_profile FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO target_profile FROM public.profiles WHERE id = p_target_profile_id;

  IF target_profile.id IS NULL THEN
    RAISE EXCEPTION 'Resident not found';
  END IF;

  IF target_profile.community_id IS NOT NULL THEN
    RAISE EXCEPTION 'Resident already belongs to a community';
  END IF;

  IF caller_profile.community_id IS NULL THEN
    RAISE EXCEPTION 'You are not assigned to a community';
  END IF;

  PERFORM public.set_audit_context(auth.uid(), 'community lead re-admitted resident');
  PERFORM public.allow_membership_change();

  UPDATE public.profiles
  SET community_id = caller_profile.community_id,
      removed_at   = NULL,
      removed_by   = NULL
  WHERE id = target_profile.id;
END;
$$;

REVOKE ALL ON FUNCTION public.community_lead_readmit_resident(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_lead_readmit_resident(uuid) TO authenticated;

-- ============================================================================
-- 5. Issue #15 — pin handle_new_user()'s search_path.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, app_role, email)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    CASE
      WHEN lower(COALESCE(new.email, '')) = 'thewooru@gmail.com'
        THEN 'admin'::public.app_role_type
      ELSE 'resident'::public.app_role_type
    END,
    new.email
  );
  RETURN new;
END;
$$;

NOTIFY pgrst, 'reload schema';
