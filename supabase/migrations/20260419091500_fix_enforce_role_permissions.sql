-- Fix: Allow platform-level role updates (direct SQL / service role)
-- This updates the permission check trigger to allow updates when auth.uid() is NULL.

CREATE OR REPLACE FUNCTION public.enforce_profile_role_change_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.app_role IS DISTINCT FROM OLD.app_role THEN
    -- Allow if auth.uid() is NULL (admin dashboard/direct SQL)
    -- Otherwise, check if the authenticated user is a platform admin
    IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only platform admin can change app roles';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
