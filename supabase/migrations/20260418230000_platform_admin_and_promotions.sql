DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'app_role_type'
  ) THEN
    CREATE TYPE public.app_role_type AS ENUM ('admin', 'community_admin', 'resident');
  END IF;
END
$$;

DO $$
DECLARE
  app_role_check_name TEXT;
BEGIN
  SELECT c.conname
  INTO app_role_check_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'profiles'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%app_role%'
  LIMIT 1;

  IF app_role_check_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', app_role_check_name);
  END IF;
END
$$;

ALTER TABLE public.profiles
  ALTER COLUMN app_role DROP DEFAULT;

ALTER TABLE public.profiles
  ALTER COLUMN app_role TYPE public.app_role_type
  USING COALESCE(app_role, 'resident')::public.app_role_type;

ALTER TABLE public.profiles
  ALTER COLUMN app_role SET DEFAULT 'resident'::public.app_role_type,
  ALTER COLUMN app_role SET NOT NULL;

UPDATE public.profiles p
SET community_id = NULL,
    app_role = 'admin'::public.app_role_type
WHERE EXISTS (
  SELECT 1
  FROM auth.users u
  WHERE u.id = p.id
    AND lower(u.email) = 'societyservicehub@gmail.com'
);

UPDATE public.profiles p
SET app_role = 'community_admin'::public.app_role_type
WHERE app_role = 'admin'::public.app_role_type
  AND NOT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = p.id
      AND lower(u.email) = 'societyservicehub@gmail.com'
  );

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.community_requests
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE TABLE IF NOT EXISTS public.community_admin_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS community_admin_requests_unique_pending
  ON public.community_admin_requests (community_id, target_user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS community_admin_requests_status_idx
  ON public.community_admin_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS community_admin_requests_community_idx
  ON public.community_admin_requests (community_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.profile_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  field TEXT NOT NULL CHECK (field IN ('app_role', 'approval_status', 'community_id')),
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_audit_log_profile_idx
  ON public.profile_audit_log (profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS profile_audit_log_actor_idx
  ON public.profile_audit_log (actor_id, created_at DESC);

ALTER TABLE public.community_admin_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_audit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = COALESCE(p_user_id, auth.uid())
      AND app_role = 'admin'::public.app_role_type
      AND community_id IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = COALESCE(p_user_id, auth.uid())
      AND app_role = 'community_admin'::public.app_role_type
      AND community_id IS NOT NULL
      AND removed_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.set_audit_actor(p_actor_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Actor mismatch';
  END IF;

  PERFORM set_config('app.audit_actor_id', p_actor_id::TEXT, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_audit_context(p_actor_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.set_audit_actor(p_actor_id);
  PERFORM set_config('app.audit_reason', COALESCE(p_reason, ''), true);
END;
$$;

CREATE OR REPLACE FUNCTION public.profile_audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_text TEXT;
  actor_uuid UUID;
  reason_text TEXT;
BEGIN
  actor_text := nullif(current_setting('app.audit_actor_id', true), '');
  reason_text := nullif(current_setting('app.audit_reason', true), '');

  IF actor_text IS NOT NULL THEN
    BEGIN
      actor_uuid := actor_text::UUID;
    EXCEPTION
      WHEN OTHERS THEN
        actor_uuid := NULL;
    END;
  END IF;

  IF NEW.app_role IS DISTINCT FROM OLD.app_role THEN
    INSERT INTO public.profile_audit_log (profile_id, actor_id, field, old_value, new_value, reason)
    VALUES (
      NEW.id,
      actor_uuid,
      'app_role',
      OLD.app_role::TEXT,
      NEW.app_role::TEXT,
      reason_text
    );
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    INSERT INTO public.profile_audit_log (profile_id, actor_id, field, old_value, new_value, reason)
    VALUES (
      NEW.id,
      actor_uuid,
      'approval_status',
      OLD.approval_status::TEXT,
      NEW.approval_status::TEXT,
      reason_text
    );
  END IF;

  IF NEW.community_id IS DISTINCT FROM OLD.community_id THEN
    INSERT INTO public.profile_audit_log (profile_id, actor_id, field, old_value, new_value, reason)
    VALUES (
      NEW.id,
      actor_uuid,
      'community_id',
      OLD.community_id::TEXT,
      NEW.community_id::TEXT,
      reason_text
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_audit_log_on_profiles ON public.profiles;
CREATE TRIGGER profile_audit_log_on_profiles
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (
    OLD.app_role IS DISTINCT FROM NEW.app_role
    OR OLD.approval_status IS DISTINCT FROM NEW.approval_status
    OR OLD.community_id IS DISTINCT FROM NEW.community_id
  )
  EXECUTE FUNCTION public.profile_audit_log_trigger();

CREATE OR REPLACE FUNCTION public.enforce_profile_role_change_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.app_role IS DISTINCT FROM OLD.app_role THEN
    IF NOT public.is_platform_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only platform admin can change app roles';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_role_change_permissions_on_profiles ON public.profiles;
CREATE TRIGGER enforce_profile_role_change_permissions_on_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_role_change_permissions();

CREATE OR REPLACE FUNCTION public.enforce_max_community_admins()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_count INTEGER;
BEGIN
  IF NEW.app_role = 'community_admin'::public.app_role_type
     AND NEW.community_id IS NOT NULL
     AND NEW.removed_at IS NULL THEN
    SELECT count(*)
    INTO next_count
    FROM public.profiles p
    WHERE p.community_id = NEW.community_id
      AND p.app_role = 'community_admin'::public.app_role_type
      AND p.removed_at IS NULL
      AND p.id <> NEW.id;

    IF next_count >= 5 THEN
      RAISE EXCEPTION 'A community can have at most 5 community admins';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_max_community_admins_on_profiles ON public.profiles;
CREATE TRIGGER enforce_max_community_admins_on_profiles
  BEFORE INSERT OR UPDATE OF app_role, community_id, removed_at ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_max_community_admins();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, app_role)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    'resident'::public.app_role_type
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.approve_profile_membership(p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_profile public.profiles%ROWTYPE;
  approver_profile public.profiles%ROWTYPE;
  community_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only community admins can approve members';
  END IF;

  SELECT * INTO approver_profile
  FROM public.profiles
  WHERE id = auth.uid();

  SELECT * INTO target_profile
  FROM public.profiles
  WHERE id = p_profile_id;

  IF target_profile.id IS NULL THEN
    RAISE EXCEPTION 'Member request not found';
  END IF;

  IF target_profile.community_id IS DISTINCT FROM approver_profile.community_id THEN
    RAISE EXCEPTION 'Member request belongs to another community';
  END IF;

  PERFORM public.set_audit_context(auth.uid(), 'community membership approved');

  UPDATE public.profiles
  SET approval_status = 'approved',
      removed_at = NULL,
      removed_by = NULL
  WHERE id = p_profile_id;

  SELECT name INTO community_name
  FROM public.communities
  WHERE id = approver_profile.community_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    target_profile.id,
    'membership_approved',
    'Community request approved',
    'You''ve been approved to join ' || COALESCE(community_name, 'your community') || '.',
    jsonb_build_object('community_id', approver_profile.community_id, 'approval_status', 'approved')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_profile_membership(p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_profile public.profiles%ROWTYPE;
  approver_profile public.profiles%ROWTYPE;
  community_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only community admins can reject members';
  END IF;

  SELECT * INTO approver_profile
  FROM public.profiles
  WHERE id = auth.uid();

  SELECT * INTO target_profile
  FROM public.profiles
  WHERE id = p_profile_id;

  IF target_profile.id IS NULL THEN
    RAISE EXCEPTION 'Member request not found';
  END IF;

  IF target_profile.community_id IS DISTINCT FROM approver_profile.community_id THEN
    RAISE EXCEPTION 'Member request belongs to another community';
  END IF;

  PERFORM public.set_audit_context(auth.uid(), 'community membership rejected');

  UPDATE public.profiles
  SET approval_status = 'rejected'
  WHERE id = p_profile_id;

  SELECT name INTO community_name
  FROM public.communities
  WHERE id = approver_profile.community_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    target_profile.id,
    'membership_rejected',
    'Community request rejected',
    'Your request to join ' || COALESCE(community_name, 'this community') || ' was rejected.',
    jsonb_build_object('community_id', approver_profile.community_id, 'approval_status', 'rejected')
  );
END;
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
BEGIN
  IF public.is_admin(p_user_id) THEN
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

CREATE OR REPLACE FUNCTION public.platform_approve_community_request(p_request_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.community_requests%ROWTYPE;
  requester public.profiles%ROWTYPE;
  new_community_id UUID;
  generated_code TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can approve community requests';
  END IF;

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

  generated_code := upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 8));

  INSERT INTO public.communities (name, code, pincode, city, area, community_type, approximate_units)
  VALUES (
    req.name,
    generated_code,
    req.pincode,
    req.city,
    req.area,
    req.community_type,
    req.approximate_units
  )
  RETURNING id INTO new_community_id;

  UPDATE public.community_requests
  SET status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      resulting_community_id = new_community_id,
      rejection_reason = NULL
  WHERE id = req.id;

  PERFORM public.set_audit_context(auth.uid(), 'platform approved community request');

  UPDATE public.profiles
  SET community_id = new_community_id,
      approval_status = 'approved',
      app_role = 'community_admin'::public.app_role_type,
      removed_at = NULL,
      removed_by = NULL
  WHERE id = req.requested_by;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    req.requested_by,
    'community_approved',
    'Community request approved',
    'Your community request has been approved.',
    jsonb_build_object('community_id', new_community_id, 'community_name', req.name)
  );

  RETURN new_community_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_reject_community_request(
  p_request_id UUID,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.community_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can reject community requests';
  END IF;

  SELECT * INTO req
  FROM public.community_requests
  WHERE id = p_request_id
    AND status = 'pending';

  IF req.id IS NULL THEN
    RAISE EXCEPTION 'Pending request not found';
  END IF;

  UPDATE public.community_requests
  SET status = 'rejected',
      rejection_reason = NULLIF(btrim(COALESCE(p_rejection_reason, '')), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = req.id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    req.requested_by,
    'community_rejected',
    'Community request rejected',
    'Your community request was rejected. You can update details and resubmit.',
    jsonb_build_object('rejection_reason', NULLIF(btrim(COALESCE(p_rejection_reason, '')), ''))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_community_admin_request(p_target_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester public.profiles%ROWTYPE;
  target_profile public.profiles%ROWTYPE;
  new_request_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only community admins can request promotions';
  END IF;

  SELECT * INTO requester
  FROM public.profiles
  WHERE id = auth.uid();

  SELECT * INTO target_profile
  FROM public.profiles
  WHERE id = p_target_user_id;

  IF target_profile.id IS NULL THEN
    RAISE EXCEPTION 'Resident not found';
  END IF;

  IF target_profile.community_id IS DISTINCT FROM requester.community_id THEN
    RAISE EXCEPTION 'Resident belongs to another community';
  END IF;

  IF target_profile.app_role <> 'resident'::public.app_role_type THEN
    RAISE EXCEPTION 'Only residents can be promoted';
  END IF;

  IF target_profile.approval_status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved residents can be promoted';
  END IF;

  INSERT INTO public.community_admin_requests (
    community_id,
    requested_by,
    target_user_id,
    status
  )
  VALUES (
    requester.community_id,
    requester.id,
    target_profile.id,
    'pending'
  )
  RETURNING id INTO new_request_id;

  RETURN new_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_community_admin_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.community_admin_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only community admins can cancel promotion requests';
  END IF;

  SELECT * INTO req
  FROM public.community_admin_requests
  WHERE id = p_request_id
    AND status = 'pending';

  IF req.id IS NULL THEN
    RAISE EXCEPTION 'Pending request not found';
  END IF;

  IF req.requested_by <> auth.uid() THEN
    RAISE EXCEPTION 'Only the requester can cancel this promotion request';
  END IF;

  UPDATE public.community_admin_requests
  SET status = 'cancelled',
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = req.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_approve_community_admin_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.community_admin_requests%ROWTYPE;
  target_profile public.profiles%ROWTYPE;
  requester_profile public.profiles%ROWTYPE;
  community_name TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can approve promotions';
  END IF;

  SELECT * INTO req
  FROM public.community_admin_requests
  WHERE id = p_request_id
    AND status = 'pending';

  IF req.id IS NULL THEN
    RAISE EXCEPTION 'Pending promotion request not found';
  END IF;

  SELECT * INTO target_profile
  FROM public.profiles
  WHERE id = req.target_user_id;

  SELECT * INTO requester_profile
  FROM public.profiles
  WHERE id = req.requested_by;

  IF target_profile.id IS NULL OR requester_profile.id IS NULL THEN
    RAISE EXCEPTION 'Profile missing for promotion request';
  END IF;

  IF target_profile.community_id IS DISTINCT FROM req.community_id
     OR requester_profile.community_id IS DISTINCT FROM req.community_id THEN
    RAISE EXCEPTION 'Promotion request community mismatch';
  END IF;

  PERFORM public.set_audit_context(auth.uid(), 'platform approved community admin promotion');

  UPDATE public.profiles
  SET app_role = 'community_admin'::public.app_role_type
  WHERE id = req.target_user_id;

  UPDATE public.community_admin_requests
  SET status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = NULL
  WHERE id = req.id;

  SELECT name INTO community_name
  FROM public.communities
  WHERE id = req.community_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    req.target_user_id,
    'promoted_to_admin',
    'You are now a community admin',
    'Your promotion request has been approved.',
    jsonb_build_object('community_id', req.community_id, 'community_name', community_name)
  );

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    req.requested_by,
    'promotion_approved',
    'Promotion approved',
    COALESCE(target_profile.full_name, 'Resident') || ' has been promoted to community admin.',
    jsonb_build_object('target_name', target_profile.full_name)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_reject_community_admin_request(
  p_request_id UUID,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.community_admin_requests%ROWTYPE;
  target_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can reject promotions';
  END IF;

  SELECT * INTO req
  FROM public.community_admin_requests
  WHERE id = p_request_id
    AND status = 'pending';

  IF req.id IS NULL THEN
    RAISE EXCEPTION 'Pending promotion request not found';
  END IF;

  SELECT * INTO target_profile
  FROM public.profiles
  WHERE id = req.target_user_id;

  UPDATE public.community_admin_requests
  SET status = 'rejected',
      rejection_reason = NULLIF(btrim(COALESCE(p_rejection_reason, '')), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = req.id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    req.requested_by,
    'promotion_rejected',
    'Promotion request rejected',
    'Promotion request was rejected. You can submit a new request later.',
    jsonb_build_object(
      'target_name', COALESCE(target_profile.full_name, 'Resident'),
      'rejection_reason', NULLIF(btrim(COALESCE(p_rejection_reason, '')), '')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_soft_remove_resident(
  p_target_profile_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_profile public.profiles%ROWTYPE;
  community_name TEXT;
  admin_count INTEGER;
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

  IF target_profile.app_role = 'community_admin'::public.app_role_type THEN
    SELECT count(*)
    INTO admin_count
    FROM public.profiles p
    WHERE p.community_id = target_profile.community_id
      AND p.app_role = 'community_admin'::public.app_role_type
      AND p.approval_status = 'approved'
      AND p.removed_at IS NULL;

    IF admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the only community admin in this community';
    END IF;
  END IF;

  PERFORM public.set_audit_context(auth.uid(), COALESCE(p_reason, 'platform removed resident from community'));

  UPDATE public.profiles
  SET community_id = NULL,
      approval_status = 'pending',
      app_role = 'resident'::public.app_role_type,
      removed_at = now(),
      removed_by = auth.uid()
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
$$;

CREATE OR REPLACE FUNCTION public.get_residents_directory(p_include_phone BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  flat_number TEXT,
  phone_number TEXT,
  app_role public.app_role_type
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO caller
  FROM public.profiles
  WHERE id = auth.uid();

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF caller.approval_status <> 'approved' AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only approved members can access the directory';
  END IF;

  IF caller.community_id IS NULL AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Community not selected';
  END IF;

  IF p_include_phone
     AND NOT public.is_platform_admin(auth.uid())
     AND caller.app_role <> 'community_admin'::public.app_role_type THEN
    RAISE EXCEPTION 'Only community admins can view phone numbers';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.flat_number,
    CASE
      WHEN p_include_phone
           AND (public.is_platform_admin(auth.uid()) OR caller.app_role = 'community_admin'::public.app_role_type)
      THEN p.phone_number
      ELSE NULL
    END AS phone_number,
    p.app_role
  FROM public.profiles p
  WHERE p.community_id = caller.community_id
    AND p.approval_status = 'approved'
    AND p.removed_at IS NULL
  ORDER BY p.full_name NULLS LAST;
END;
$$;

DROP POLICY IF EXISTS "Platform admins can view community requests" ON public.community_requests;
CREATE POLICY "Platform admins can view community requests"
  ON public.community_requests
  FOR SELECT
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins can update community requests" ON public.community_requests;
CREATE POLICY "Platform admins can update community requests"
  ON public.community_requests
  FOR UPDATE
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Community admins can view community admin requests in their community" ON public.community_admin_requests;
CREATE POLICY "Community admins can view community admin requests in their community"
  ON public.community_admin_requests
  FOR SELECT
  USING (
    public.is_admin(auth.uid())
    AND community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Community admins can create community admin requests" ON public.community_admin_requests;
CREATE POLICY "Community admins can create community admin requests"
  ON public.community_admin_requests
  FOR INSERT
  WITH CHECK (
    public.is_admin(auth.uid())
    AND requested_by = auth.uid()
    AND status = 'pending'
    AND community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles tp
      WHERE tp.id = target_user_id
        AND tp.community_id = community_id
        AND tp.app_role = 'resident'::public.app_role_type
        AND tp.approval_status = 'approved'
        AND tp.removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Community admins can cancel own promotion requests" ON public.community_admin_requests;
CREATE POLICY "Community admins can cancel own promotion requests"
  ON public.community_admin_requests
  FOR UPDATE
  USING (
    requested_by = auth.uid()
    AND status = 'pending'
    AND public.is_admin(auth.uid())
  )
  WITH CHECK (
    requested_by = auth.uid()
    AND status = 'cancelled'
    AND public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Platform admins can view all community admin requests" ON public.community_admin_requests;
CREATE POLICY "Platform admins can view all community admin requests"
  ON public.community_admin_requests
  FOR SELECT
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins can update community admin requests" ON public.community_admin_requests;
CREATE POLICY "Platform admins can update community admin requests"
  ON public.community_admin_requests
  FOR UPDATE
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins can view all communities" ON public.communities;
CREATE POLICY "Platform admins can view all communities"
  ON public.communities
  FOR SELECT
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins can view all profiles" ON public.profiles;
CREATE POLICY "Platform admins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins can update profiles" ON public.profiles;
CREATE POLICY "Platform admins can update profiles"
  ON public.profiles
  FOR UPDATE
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins can view profile audit log" ON public.profile_audit_log;
CREATE POLICY "Platform admins can view profile audit log"
  ON public.profile_audit_log
  FOR SELECT
  USING (public.is_platform_admin(auth.uid()));

GRANT EXECUTE ON FUNCTION public.set_audit_actor(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_audit_context(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_approve_community_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_reject_community_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_community_admin_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_community_admin_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_approve_community_admin_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_reject_community_admin_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_soft_remove_resident(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_residents_directory(BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
