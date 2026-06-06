-- =============================================================
-- Provider Reports & Delete Policy Update
--
-- 1. Create provider_reports table for community members to flag
--    problematic providers.
-- 2. RLS policies on provider_reports.
-- 3. Notification trigger: notify community leads on new reports.
-- 4. Replace the old "creator can delete" policy with a
--    "leads and admins can delete" policy.
-- =============================================================

-- Section 1: Create provider_reports table
CREATE TABLE IF NOT EXISTS public.provider_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,        -- 'wrong_info', 'spam', 'inappropriate', 'unavailable', 'other'
  details TEXT,                -- optional free-text explanation
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'reviewed' | 'dismissed'
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT one_report_per_user_per_provider UNIQUE (provider_id, reported_by)
);

CREATE INDEX IF NOT EXISTS provider_reports_provider_idx
  ON public.provider_reports (provider_id, status);

CREATE INDEX IF NOT EXISTS provider_reports_reporter_idx
  ON public.provider_reports (reported_by);

ALTER TABLE public.provider_reports ENABLE ROW LEVEL SECURITY;

-- Section 2: RLS policies on provider_reports

-- Users can view their own reports
DROP POLICY IF EXISTS "Users can view their own provider reports" ON public.provider_reports;
CREATE POLICY "Users can view their own provider reports"
  ON public.provider_reports
  FOR SELECT
  USING (
    reported_by = auth.uid()
    AND public.is_user_approved(auth.uid())
  );

-- Community leads and platform admins can view all reports in their community
DROP POLICY IF EXISTS "Leads and admins can view all provider reports" ON public.provider_reports;
CREATE POLICY "Leads and admins can view all provider reports"
  ON public.provider_reports
  FOR SELECT
  USING (
    public.is_user_approved(auth.uid())
    AND (public.is_community_lead(auth.uid()) OR public.is_platform_admin(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.service_providers sp
      WHERE sp.id = provider_id
        AND sp.community_id = get_user_community_id()
    )
  );

-- Any approved community member can submit a report
DROP POLICY IF EXISTS "Approved users can report providers" ON public.provider_reports;
CREATE POLICY "Approved users can report providers"
  ON public.provider_reports
  FOR INSERT
  WITH CHECK (
    reported_by = auth.uid()
    AND public.is_user_approved(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.service_providers sp
      WHERE sp.id = provider_id
        AND sp.community_id = get_user_community_id()
    )
  );

-- Only community leads and platform admins can update reports (change status)
DROP POLICY IF EXISTS "Leads and admins can update provider reports" ON public.provider_reports;
CREATE POLICY "Leads and admins can update provider reports"
  ON public.provider_reports
  FOR UPDATE
  USING (
    public.is_user_approved(auth.uid())
    AND (public.is_community_lead(auth.uid()) OR public.is_platform_admin(auth.uid()))
  )
  WITH CHECK (
    public.is_user_approved(auth.uid())
    AND (public.is_community_lead(auth.uid()) OR public.is_platform_admin(auth.uid()))
  );

-- No one can delete reports (audit trail)
DROP POLICY IF EXISTS "Provider reports cannot be deleted" ON public.provider_reports;
CREATE POLICY "Provider reports cannot be deleted"
  ON public.provider_reports
  FOR DELETE
  USING (false);


-- Section 3: Notification trigger — notify community leads on new reports

CREATE OR REPLACE FUNCTION public.handle_provider_report_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  provider_name TEXT;
  reporter_name TEXT;
  provider_community_id UUID;
BEGIN
  -- Get provider info
  SELECT sp.name, sp.community_id
  INTO provider_name, provider_community_id
  FROM public.service_providers sp
  WHERE sp.id = NEW.provider_id;

  -- Get reporter name
  SELECT p.full_name
  INTO reporter_name
  FROM public.profiles p
  WHERE p.id = NEW.reported_by;

  -- Notify all community leads in the same community
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    p.id,
    'provider_reported',
    'Provider reported',
    COALESCE(reporter_name, 'A resident') || ' reported "' || COALESCE(provider_name, 'a provider') || '". Tap to review.',
    jsonb_build_object(
      'provider_id', NEW.provider_id,
      'report_id', NEW.id,
      'reason', NEW.reason
    )
  FROM public.profiles p
  WHERE p.community_id = provider_community_id
    AND p.app_role = 'community_lead'::public.app_role_type
    AND p.removed_at IS NULL
    AND p.id != NEW.reported_by;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_provider_report_created ON public.provider_reports;
CREATE TRIGGER on_provider_report_created
  AFTER INSERT ON public.provider_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_provider_report_notification();


-- Section 4: Update service_providers DELETE policy
-- Remove old creator-can-delete policy and replace with leads/admins-only

DROP POLICY IF EXISTS "Users can delete providers they created" ON public.service_providers;

CREATE POLICY "Leads and admins can delete providers"
  ON public.service_providers
  FOR DELETE
  USING (
    public.is_user_approved(auth.uid())
    AND (public.is_community_lead(auth.uid()) OR public.is_platform_admin(auth.uid()))
    AND community_id = get_user_community_id()
  );


-- Section 5: Grant execute permissions
GRANT EXECUTE ON FUNCTION public.handle_provider_report_notification() TO authenticated;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
