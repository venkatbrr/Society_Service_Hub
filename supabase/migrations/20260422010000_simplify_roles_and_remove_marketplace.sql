-- ============================================================
-- Migration: Simplify roles and remove marketplace
-- Date: 2026-04-22
--
-- Changes:
--   1. Drop marketplace tables (business_inquiries, business_offerings, resident_businesses)
--   2. Drop community_admin_requests table and associated RPCs
--   3. Drop join-approval RPCs (approve_profile_membership, reject_profile_membership)
--   4. Add 'community_lead' enum value, migrate data from 'community_admin'
--   5. Remove approval_status, join_note, requested_at from profiles
--   6. Update community_requests table for new onboarding form
--   7. Add address column to communities
--   8. Recreate helper functions with new role names
--   9. New functions: generate_community_code, join_community_by_code,
--      community_lead_remove_resident, updated platform_approve_community_request
--  10. Update storage (add community-uploads bucket)
-- ============================================================


-- ============================================================
-- SECTION 1: Drop marketplace RPCs
-- ============================================================

DROP FUNCTION IF EXISTS public.get_community_businesses(UUID);
DROP FUNCTION IF EXISTS public.search_communities_by_pincode(TEXT);


-- ============================================================
-- SECTION 2: Drop promotion workflow RPCs
-- ============================================================

DROP FUNCTION IF EXISTS public.create_community_admin_request(UUID);
DROP FUNCTION IF EXISTS public.cancel_community_admin_request(UUID);
DROP FUNCTION IF EXISTS public.platform_approve_community_admin_request(UUID);
DROP FUNCTION IF EXISTS public.platform_reject_community_admin_request(UUID, TEXT);


-- ============================================================
-- SECTION 3: Drop join-approval RPCs
-- ============================================================

DROP FUNCTION IF EXISTS public.approve_profile_membership(UUID);
DROP FUNCTION IF EXISTS public.reject_profile_membership(UUID);


-- ============================================================
-- SECTION 4: Drop functions that will be replaced
-- ============================================================

-- Drop the max-admins enforcement (no longer needed — only one lead per community)
DROP TRIGGER IF EXISTS enforce_max_community_admins_on_profiles ON public.profiles;
DROP FUNCTION IF EXISTS public.enforce_max_community_admins();

-- Drop profile audit log trigger before we remove approval_status column
-- (WHEN clause references OLD.approval_status which would be invalid after column drop)
DROP TRIGGER IF EXISTS profile_audit_log_on_profiles ON public.profiles;
DROP FUNCTION IF EXISTS public.profile_audit_log_trigger();

-- get_residents_directory is updated via CREATE OR REPLACE below (return type unchanged).

-- Drop functions that will be replaced via CREATE OR REPLACE further down.
-- Note: is_admin, get_fund_role, platform_soft_remove_resident,
--       platform_approve_community_request, and get_residents_directory are
--       NOT dropped here because RLS policies depend on them.
--       They are updated in-place with CREATE OR REPLACE below.

-- Drop handle_new_user trigger/function (will recreate without approval_status default)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();


-- ============================================================
-- SECTION 5: Drop marketplace tables
-- ============================================================

DROP TABLE IF EXISTS public.business_inquiries CASCADE;
DROP TABLE IF EXISTS public.business_offerings CASCADE;
DROP TABLE IF EXISTS public.resident_businesses CASCADE;


-- ============================================================
-- SECTION 6: Drop community admin promotion table
-- ============================================================

DROP TABLE IF EXISTS public.community_admin_requests CASCADE;


-- ============================================================
-- SECTION 7: Clean up ratings and favorites after business tables removed
-- ============================================================

-- Ratings: remove business-related check constraint, drop business_id column,
--          restore NOT NULL on provider_id
DROP INDEX IF EXISTS public.ratings_user_business_idx;
ALTER TABLE public.ratings DROP CONSTRAINT IF EXISTS rating_target_check;
ALTER TABLE public.ratings DROP COLUMN IF EXISTS business_id;
ALTER TABLE public.ratings ALTER COLUMN provider_id SET NOT NULL;

-- Favorites: same cleanup
DROP INDEX IF EXISTS public.favorites_user_business_idx;
ALTER TABLE public.favorites DROP CONSTRAINT IF EXISTS favorite_target_check;
ALTER TABLE public.favorites DROP COLUMN IF EXISTS business_id;
ALTER TABLE public.favorites ALTER COLUMN provider_id SET NOT NULL;


-- ============================================================
-- SECTION 8: Migrate community_admin data to community_lead
--
-- 'community_lead' was already committed in migration
-- 20260422000000_add_community_lead_enum_value.sql (separate transaction).
-- We leave 'community_admin' as an orphaned enum value rather than
-- recreating the type (which would cascade-drop all dependent RLS policies).
-- ============================================================

-- 'community_lead' was added in 20260422000000_add_community_lead_enum_value.sql

-- Migrate existing community_admin rows to community_lead
UPDATE public.profiles
SET app_role = 'community_lead'
WHERE app_role = 'community_admin';


-- ============================================================
-- SECTION 9: Remove approval-workflow columns from profiles
-- ============================================================

-- Drop approval_status (community code is now the gate; no pending/rejected state)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS approval_status CASCADE;

-- Drop fields that existed only to support the join-approval flow
ALTER TABLE public.profiles DROP COLUMN IF EXISTS join_note;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS requested_at;

-- Update profile_audit_log CHECK constraint to keep historical 'approval_status'
-- records valid while no longer requiring the field.
-- We simply drop the restrictive constraint — historical records are preserved.
ALTER TABLE public.profile_audit_log
  DROP CONSTRAINT IF EXISTS profile_audit_log_field_check;
ALTER TABLE public.profile_audit_log
  ADD CONSTRAINT profile_audit_log_field_check
  CHECK (field IN ('app_role', 'approval_status', 'community_id'));


-- ============================================================
-- SECTION 10: Update community_requests for new onboarding form
-- ============================================================

-- Add new fields the updated community request form uses
ALTER TABLE public.community_requests
  ADD COLUMN IF NOT EXISTS requester_flat_number TEXT,
  ADD COLUMN IF NOT EXISTS proof_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT;

-- Remove fields that only existed for the old promoted-admin nomination workflow
ALTER TABLE public.community_requests
  DROP COLUMN IF EXISTS requester_role,
  DROP COLUMN IF EXISTS nominated_admin_name,
  DROP COLUMN IF EXISTS nominated_admin_contact;


-- ============================================================
-- SECTION 11: Add address column to communities
-- ============================================================

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS address TEXT;


-- ============================================================
-- SECTION 12: Recreate is_user_approved
--   Old: checks approval_status = 'approved'
--   New: checks community_id IS NOT NULL AND removed_at IS NULL
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_user_approved(p_user_id UUID DEFAULT auth.uid())
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
      AND community_id IS NOT NULL
      AND removed_at IS NULL
  );
$$;


-- ============================================================
-- SECTION 13: Create is_community_lead
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_community_lead(p_user_id UUID DEFAULT auth.uid())
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
      AND app_role = 'community_lead'::public.app_role_type
      AND community_id IS NOT NULL
      AND removed_at IS NULL
  );
$$;


-- ============================================================
-- SECTION 14: Recreate is_admin as alias for is_community_lead
--   All existing RLS policies use is_admin(), so we keep the name
--   and just redirect it to is_community_lead().
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_community_lead(COALESCE(p_user_id, auth.uid()));
$$;


-- ============================================================
-- SECTION 15: Recreate get_fund_role
-- ============================================================

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
  -- Community leads (and platform admins via is_community_lead alias) get admin fund access
  IF public.is_community_lead(p_user_id) THEN
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


-- ============================================================
-- SECTION 16: Recreate handle_new_user trigger
--   Removed: approval_status (column no longer exists)
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, app_role, email)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    'resident'::public.app_role_type,
    new.email
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ============================================================
-- SECTION 17: Recreate profile_audit_log_trigger
--   Removed: approval_status change tracking (column dropped)
-- ============================================================

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
  actor_text  := nullif(current_setting('app.audit_actor_id', true), '');
  reason_text := nullif(current_setting('app.audit_reason', true), '');

  IF actor_text IS NOT NULL THEN
    BEGIN
      actor_uuid := actor_text::UUID;
    EXCEPTION
      WHEN OTHERS THEN actor_uuid := NULL;
    END;
  END IF;

  IF NEW.app_role IS DISTINCT FROM OLD.app_role THEN
    INSERT INTO public.profile_audit_log (profile_id, actor_id, field, old_value, new_value, reason)
    VALUES (NEW.id, actor_uuid, 'app_role', OLD.app_role::TEXT, NEW.app_role::TEXT, reason_text);
  END IF;

  IF NEW.community_id IS DISTINCT FROM OLD.community_id THEN
    INSERT INTO public.profile_audit_log (profile_id, actor_id, field, old_value, new_value, reason)
    VALUES (NEW.id, actor_uuid, 'community_id', OLD.community_id::TEXT, NEW.community_id::TEXT, reason_text);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profile_audit_log_on_profiles
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (
    OLD.app_role IS DISTINCT FROM NEW.app_role
    OR OLD.community_id IS DISTINCT FROM NEW.community_id
  )
  EXECUTE FUNCTION public.profile_audit_log_trigger();


-- ============================================================
-- SECTION 18: Recreate enforce_profile_role_change_permissions trigger
--   (same logic — just re-applying after function drops above)
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_profile_role_change_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.app_role IS DISTINCT FROM OLD.app_role THEN
    -- Allow if auth.uid() is NULL (admin dashboard / direct SQL)
    IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin(auth.uid()) THEN
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


-- ============================================================
-- SECTION 19: Recreate get_residents_directory
--   Old: checked approval_status = 'approved', gated phone by community_admin
--   New: checks community_id IS NOT NULL AND removed_at IS NULL,
--        gates phone by community_lead or platform_admin
-- ============================================================

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
  caller              public.profiles%ROWTYPE;
  caller_can_view_phone BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT p.* INTO caller
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF (caller.community_id IS NULL OR caller.removed_at IS NOT NULL)
     AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only active community members can access the directory';
  END IF;

  IF caller.community_id IS NULL AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Community not selected';
  END IF;

  caller_can_view_phone :=
    public.is_platform_admin(auth.uid())
    OR public.is_community_lead(auth.uid());

  IF p_include_phone AND NOT caller_can_view_phone THEN
    RAISE EXCEPTION 'Only community leads can view phone numbers';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.flat_number,
    CASE
      WHEN p_include_phone AND caller_can_view_phone THEN p.phone_number
      ELSE NULL
    END AS phone_number,
    p.app_role
  FROM public.profiles p
  WHERE p.community_id = caller.community_id
    AND p.removed_at IS NULL
  ORDER BY p.full_name NULLS LAST;
END;
$$;


-- ============================================================
-- SECTION 20: Recreate platform_soft_remove_resident
--   Old: reset approval_status to 'pending', checked for community_admin count
--   New: no approval_status, checks for community_lead count
-- ============================================================

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

  -- Prevent removal of the last community lead
  IF target_profile.app_role = 'community_lead'::public.app_role_type THEN
    SELECT count(*) INTO lead_count
    FROM public.profiles p
    WHERE p.community_id = target_profile.community_id
      AND p.app_role = 'community_lead'::public.app_role_type
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
$$;


-- ============================================================
-- SECTION 21: New function — generate_community_code
--   Generates a unique 6-character alphanumeric code.
--   Avoids ambiguous characters (0/O, 1/I).
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_community_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars        TEXT    := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code         TEXT;
  exists_count INTEGER;
  i            INTEGER;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
    END LOOP;

    SELECT COUNT(*) INTO exists_count
    FROM public.communities
    WHERE communities.code = code;

    EXIT WHEN exists_count = 0;
  END LOOP;

  RETURN code;
END;
$$;


-- ============================================================
-- SECTION 22: Updated platform_approve_community_request
--   Old: set role to 'community_admin', code was 8-char from gen_random_uuid
--   New: set role to 'community_lead', use generate_community_code() (6-char),
--        include code in notification
-- ============================================================

CREATE OR REPLACE FUNCTION public.platform_approve_community_request(p_request_id UUID)
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

  -- Generate unique 6-character community code
  generated_code := public.generate_community_code();

  INSERT INTO public.communities (name, code, pincode, city, area, community_type, approximate_units, address)
  VALUES (
    req.name,
    generated_code,
    req.pincode,
    req.city,
    req.area,
    req.community_type,
    req.approximate_units,
    req.address
  )
  RETURNING id INTO new_community_id;

  UPDATE public.community_requests
  SET status                = 'approved',
      reviewed_by           = auth.uid(),
      reviewed_at           = now(),
      resulting_community_id = new_community_id,
      rejection_reason      = NULL
  WHERE id = req.id;

  PERFORM public.set_audit_context(auth.uid(), 'platform approved community request');

  UPDATE public.profiles
  SET community_id = new_community_id,
      app_role     = 'community_lead'::public.app_role_type,
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
-- SECTION 23: New function — join_community_by_code
--   Validates code and assigns the caller to the community.
--   No approval required — the code is the gate.
-- ============================================================

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

  PERFORM public.set_audit_context(auth.uid(), 'joined community via code');

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


-- ============================================================
-- SECTION 24: New function — community_lead_remove_resident
--   Community leads can remove residents from their own community.
--   Cannot remove other community leads or themselves.
-- ============================================================

CREATE OR REPLACE FUNCTION public.community_lead_remove_resident(
  p_target_profile_id UUID,
  p_reason            TEXT DEFAULT NULL
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

  IF target_profile.app_role = 'community_lead'::public.app_role_type THEN
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
$$;


-- ============================================================
-- SECTION 25: Updated submit_community_request
--   Removed: requester_role, nominated_admin_name, nominated_admin_contact params
--   Added:   address, requester_flat_number, proof_photo_url params
--
--   Must DROP first because parameter names changed (same types, different names/order).
--   No RLS policies depend on this function so the drop is safe.
-- ============================================================

-- Old signature: (TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
DROP FUNCTION IF EXISTS public.submit_community_request(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.submit_community_request(
  p_name                  TEXT,
  p_city                  TEXT,
  p_pincode               TEXT,
  p_address               TEXT    DEFAULT NULL,
  p_area                  TEXT    DEFAULT NULL,
  p_community_type        TEXT    DEFAULT NULL,
  p_approximate_units     TEXT    DEFAULT NULL,
  p_requester_flat_number TEXT    DEFAULT NULL,
  p_proof_photo_url       TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.community_requests
    WHERE requested_by = auth.uid()
      AND status IN ('pending', 'needs_info')
  ) THEN
    RAISE EXCEPTION 'You already have an active community request.';
  END IF;

  INSERT INTO public.community_requests (
    requested_by,
    name,
    city,
    pincode,
    address,
    area,
    community_type,
    approximate_units,
    requester_flat_number,
    proof_photo_url
  )
  VALUES (
    auth.uid(),
    btrim(p_name),
    btrim(p_city),
    btrim(p_pincode),
    NULLIF(btrim(COALESCE(p_address, '')), ''),
    NULLIF(btrim(COALESCE(p_area, '')), ''),
    NULLIF(btrim(COALESCE(p_community_type, '')), ''),
    NULLIF(btrim(COALESCE(p_approximate_units, '')), ''),
    NULLIF(btrim(COALESCE(p_requester_flat_number, '')), ''),
    NULLIF(btrim(COALESCE(p_proof_photo_url, '')), '')
  )
  RETURNING id INTO request_id;

  RETURN request_id;
END;
$$;


-- ============================================================
-- SECTION 26: Grant execute on new/updated functions
-- ============================================================

GRANT EXECUTE ON FUNCTION public.is_community_lead(UUID)                                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_community_code()                                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_community_by_code(TEXT)                               TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_lead_remove_resident(UUID, TEXT)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_residents_directory(BOOLEAN)                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_soft_remove_resident(UUID, TEXT)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_approve_community_request(UUID)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_reject_community_request(UUID, TEXT)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_audit_actor(UUID)                                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_audit_context(UUID, TEXT)                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_community_request(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;


-- ============================================================
-- SECTION 27: Storage — add community-uploads bucket
--   Used for community creation proof photos.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('community-uploads', 'community-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload proof photos
DROP POLICY IF EXISTS "Authenticated users can upload community proofs" ON storage.objects;
CREATE POLICY "Authenticated users can upload community proofs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'community-uploads'
    AND auth.role() = 'authenticated'
  );

-- Allow public reads (community proof photos are not sensitive)
DROP POLICY IF EXISTS "Community upload files are publicly readable" ON storage.objects;
CREATE POLICY "Community upload files are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'community-uploads');


-- ============================================================
-- Reload PostgREST schema cache
-- ============================================================

NOTIFY pgrst, 'reload schema';
