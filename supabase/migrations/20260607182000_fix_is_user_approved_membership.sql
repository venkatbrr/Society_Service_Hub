-- Align approval gating with current onboarding flow.
-- Users with an assigned community should be treated as approved for RLS checks.
CREATE OR REPLACE FUNCTION public.is_user_approved(p_user_id UUID DEFAULT auth.uid())
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
      AND (
        p.community_id IS NOT NULL
        OR p.app_role = 'admin'::public.app_role_type
      )
  );
$$;
