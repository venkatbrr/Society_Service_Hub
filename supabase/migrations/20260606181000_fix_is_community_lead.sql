-- Redefine public.is_community_lead to not check c.funds_enabled = true
CREATE OR REPLACE FUNCTION public.is_community_lead(p_user_id UUID DEFAULT auth.uid())
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
      AND p.app_role = 'community_lead'::public.app_role_type
      AND p.community_id IS NOT NULL
      AND p.removed_at IS NULL
  );
$$;

-- Redefine RLS SELECT policy on public.provider_reports
DROP POLICY IF EXISTS "Leads and admins can view all provider reports" ON public.provider_reports;
CREATE POLICY "Leads and admins can view all provider reports"
  ON public.provider_reports
  FOR SELECT
  USING (
    public.is_user_approved(auth.uid())
    AND (
      public.is_platform_admin(auth.uid())
      OR (
        public.is_community_lead(auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.service_providers sp
          WHERE sp.id = provider_id
            AND sp.community_id = get_user_community_id()
        )
      )
    )
  );

-- Redefine RLS DELETE policy on public.service_providers
DROP POLICY IF EXISTS "Leads and admins can delete providers" ON public.service_providers;
CREATE POLICY "Leads and admins can delete providers"
  ON public.service_providers
  FOR DELETE
  USING (
    public.is_user_approved(auth.uid())
    AND (
      public.is_platform_admin(auth.uid())
      OR (
        public.is_community_lead(auth.uid())
        AND community_id = get_user_community_id()
      )
    )
  );

-- Promote community leads back
UPDATE public.profiles
SET app_role = 'community_lead'::public.app_role_type
WHERE email IN ('ira@gmail.com', 'vipina@gmail.com');

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
