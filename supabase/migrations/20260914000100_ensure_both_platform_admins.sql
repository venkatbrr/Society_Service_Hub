-- Migration: 20260914000100_ensure_both_platform_admins.sql
-- Description: Ensure both thewooru@gmail.com and societyservicehub@gmail.com are break-glass platform admins

CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = COALESCE(p_user_id, auth.uid())
      AND p.app_role = 'admin'::public.app_role_type
      AND p.community_id IS NULL
  )
  OR EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = COALESCE(p_user_id, auth.uid())
      AND lower(COALESCE(u.email, '')) IN ('thewooru@gmail.com', 'societyservicehub@gmail.com')
  );
$$;

-- Ensure profile row for societyservicehub@gmail.com has app_role = 'admin' and community_id = NULL
UPDATE public.profiles
SET app_role = 'admin'::public.app_role_type,
    community_id = NULL,
    block_id = NULL,
    flat_id = NULL,
    flat_number = NULL
WHERE lower(COALESCE(email, '')) = 'societyservicehub@gmail.com';
