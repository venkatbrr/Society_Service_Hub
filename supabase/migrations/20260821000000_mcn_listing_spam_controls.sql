-- Additional anti-spam controls for community business listings:
--   1. Cap total ACTIVE listings per resident at 5 (across all categories).
--   2. Rate-limit new listing creation to 1 per resident per 24 hours.
--   3. A report mechanism (mirrors provider_reports) that auto-hides a
--      listing once it collects 3 pending reports, pending lead review.

-- ============================================================
-- 1. Cap total active listings per owner
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_max_active_listings_per_owner()
RETURNS TRIGGER AS $$
DECLARE
  v_active_count INTEGER;
  v_max_active CONSTANT INTEGER := 5;
BEGIN
  IF NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_active_count
  FROM public.mcn_listings l
  WHERE l.owner_id = NEW.owner_id
    AND l.is_active = TRUE
    AND l.id <> NEW.id;

  IF v_active_count >= v_max_active THEN
    RAISE EXCEPTION 'You can have at most % active business listings at a time. Pause or delete one before adding another.', v_max_active;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_max_active_listings_per_owner ON public.mcn_listings;
CREATE TRIGGER trg_enforce_max_active_listings_per_owner
BEFORE INSERT OR UPDATE OF is_active, owner_id ON public.mcn_listings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_max_active_listings_per_owner();

-- ============================================================
-- 2. Rate-limit new listing creation
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_listing_creation_rate_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.mcn_listings l
    WHERE l.owner_id = NEW.owner_id
      AND l.created_at > now() - INTERVAL '24 hours'
  ) THEN
    RAISE EXCEPTION 'You can only create one new business listing per day. Please try again later.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_listing_creation_rate_limit ON public.mcn_listings;
CREATE TRIGGER trg_enforce_listing_creation_rate_limit
BEFORE INSERT ON public.mcn_listings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_listing_creation_rate_limit();

-- ============================================================
-- 3. Listing reports + auto-hide, mirroring provider_reports
-- ============================================================

ALTER TABLE public.mcn_listings ADD COLUMN IF NOT EXISTS flagged_for_review_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.mcn_listing_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.mcn_listings(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,        -- 'wrong_info', 'spam', 'inappropriate', 'unavailable', 'other'
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'reviewed' | 'dismissed'
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT one_report_per_user_per_listing UNIQUE (listing_id, reported_by)
);

CREATE INDEX IF NOT EXISTS mcn_listing_reports_listing_idx
  ON public.mcn_listing_reports (listing_id, status);

CREATE INDEX IF NOT EXISTS mcn_listing_reports_reporter_idx
  ON public.mcn_listing_reports (reported_by);

ALTER TABLE public.mcn_listing_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own listing reports" ON public.mcn_listing_reports;
CREATE POLICY "Users can view their own listing reports"
  ON public.mcn_listing_reports
  FOR SELECT
  USING (reported_by = auth.uid());

DROP POLICY IF EXISTS "Leads and admins can view all listing reports" ON public.mcn_listing_reports;
CREATE POLICY "Leads and admins can view all listing reports"
  ON public.mcn_listing_reports
  FOR SELECT
  USING (
    (public.is_community_lead(auth.uid()) OR public.is_platform_admin(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.mcn_listings l
      WHERE l.id = listing_id
        AND l.community_id = get_user_community_id()
    )
  );

DROP POLICY IF EXISTS "Approved users can report listings" ON public.mcn_listing_reports;
CREATE POLICY "Approved users can report listings"
  ON public.mcn_listing_reports
  FOR INSERT
  WITH CHECK (
    reported_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.mcn_listings l
      WHERE l.id = listing_id
        AND l.community_id = get_user_community_id()
    )
  );

DROP POLICY IF EXISTS "Leads and admins can update listing reports" ON public.mcn_listing_reports;
CREATE POLICY "Leads and admins can update listing reports"
  ON public.mcn_listing_reports
  FOR UPDATE
  USING (public.is_community_lead(auth.uid()) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_community_lead(auth.uid()) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Listing reports cannot be deleted" ON public.mcn_listing_reports;
CREATE POLICY "Listing reports cannot be deleted"
  ON public.mcn_listing_reports
  FOR DELETE
  USING (false);

-- Notify leads on every new report, and auto-hide once pending reports hit
-- the threshold — the listing stays hidden (is_active = false) until a lead
-- reopens it from the existing manage screen (owner-or-lead access already
-- covers this; no separate moderation UI needed).
CREATE OR REPLACE FUNCTION public.handle_listing_report_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auto_hide_threshold CONSTANT INTEGER := 3;
  v_listing_name TEXT;
  v_listing_community_id UUID;
  v_reporter_name TEXT;
  v_pending_count INTEGER;
BEGIN
  SELECT l.name, l.community_id INTO v_listing_name, v_listing_community_id
  FROM public.mcn_listings l
  WHERE l.id = NEW.listing_id;

  SELECT p.full_name INTO v_reporter_name
  FROM public.profiles p
  WHERE p.id = NEW.reported_by;

  SELECT COUNT(*) INTO v_pending_count
  FROM public.mcn_listing_reports r
  WHERE r.listing_id = NEW.listing_id
    AND r.status = 'pending';

  IF v_pending_count >= v_auto_hide_threshold THEN
    UPDATE public.mcn_listings
    SET is_active = FALSE, flagged_for_review_at = now()
    WHERE id = NEW.listing_id
      AND flagged_for_review_at IS NULL;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT
      p.id,
      'listing_auto_hidden',
      'Business listing hidden for review',
      '"' || COALESCE(v_listing_name, 'A business listing') || '" was hidden after ' || v_pending_count || ' reports. Review it in Manage listing.',
      jsonb_build_object('listing_id', NEW.listing_id)
    FROM public.profiles p
    WHERE p.community_id = v_listing_community_id
      AND p.app_role IN ('president'::public.app_role_type, 'vice_president'::public.app_role_type)
      AND p.removed_at IS NULL;
  ELSE
    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT
      p.id,
      'listing_reported',
      'Business listing reported',
      COALESCE(v_reporter_name, 'A resident') || ' reported "' || COALESCE(v_listing_name, 'a business listing') || '". Tap to review.',
      jsonb_build_object('listing_id', NEW.listing_id, 'report_id', NEW.id, 'reason', NEW.reason)
    FROM public.profiles p
    WHERE p.community_id = v_listing_community_id
      AND p.app_role IN ('president'::public.app_role_type, 'vice_president'::public.app_role_type)
      AND p.removed_at IS NULL
      AND p.id != NEW.reported_by;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_listing_report_created ON public.mcn_listing_reports;
CREATE TRIGGER on_listing_report_created
  AFTER INSERT ON public.mcn_listing_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_listing_report_notification();

GRANT EXECUTE ON FUNCTION public.handle_listing_report_notification() TO authenticated;

NOTIFY pgrst, 'reload schema';
