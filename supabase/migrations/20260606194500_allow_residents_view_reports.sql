-- Update RLS SELECT policy on public.provider_reports to allow all approved residents to view reports in their community
DROP POLICY IF EXISTS "Leads and admins can view all provider reports" ON public.provider_reports;
DROP POLICY IF EXISTS "Approved users can view provider reports" ON public.provider_reports;

CREATE POLICY "Approved users can view provider reports"
  ON public.provider_reports
  FOR SELECT
  USING (
    public.is_user_approved(auth.uid())
    AND (
      public.is_platform_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.service_providers sp
        WHERE sp.id = provider_id
          AND sp.community_id = get_user_community_id()
      )
    )
  );

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
