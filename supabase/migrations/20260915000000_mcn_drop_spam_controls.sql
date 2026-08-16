-- Moderation for community food drops, mirroring the business-listing controls
-- in 20260821000000_mcn_listing_spam_controls.sql:
--   1. A report mechanism that auto-hides a drop once it collects 3 pending
--      reports, pending lead review.
--   2. Presidents / vice-presidents can hide a drop for review directly.
--   3. A hidden drop stops taking new orders and only a lead can un-hide it.
--
-- Deliberately NOT a delete. A drop cascades to mcn_preorder_orders, so
-- deleting one destroys every pre-order and the money record attached to it,
-- with no notice to the buyers. Hiding keeps the row, stops the harm, notifies
-- everyone affected, and stays reversible.
--
-- Also deliberately NOT a public "spam" badge. Drop tiles carry the host's name
-- and flat number, so a public flag is a public accusation against a named
-- neighbour by an elected neighbour. Hidden drops simply leave the catalogue;
-- only the host and existing buyers are told, and each is told a different thing.

-- ============================================================
-- 1. Flag columns on the drop
-- ============================================================

ALTER TABLE public.mcn_preorder_drops
  ADD COLUMN IF NOT EXISTS flagged_for_review_at TIMESTAMPTZ;

ALTER TABLE public.mcn_preorder_drops
  ADD COLUMN IF NOT EXISTS flagged_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.mcn_preorder_drops
  ADD COLUMN IF NOT EXISTS flagged_reason TEXT;

CREATE INDEX IF NOT EXISTS mcn_preorder_drops_flagged_idx
  ON public.mcn_preorder_drops (community_id, flagged_for_review_at);

-- ============================================================
-- 2. Drop reports, mirroring mcn_listing_reports
-- ============================================================

CREATE TABLE IF NOT EXISTS public.mcn_drop_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id UUID NOT NULL REFERENCES public.mcn_preorder_drops(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,        -- 'not_food', 'spam', 'inappropriate', 'unsafe', 'other'
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'reviewed' | 'dismissed'
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT one_report_per_user_per_drop UNIQUE (drop_id, reported_by)
);

CREATE INDEX IF NOT EXISTS mcn_drop_reports_drop_idx
  ON public.mcn_drop_reports (drop_id, status);

CREATE INDEX IF NOT EXISTS mcn_drop_reports_reporter_idx
  ON public.mcn_drop_reports (reported_by);

ALTER TABLE public.mcn_drop_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own drop reports" ON public.mcn_drop_reports;
CREATE POLICY "Users can view their own drop reports"
  ON public.mcn_drop_reports
  FOR SELECT
  USING (reported_by = auth.uid());

DROP POLICY IF EXISTS "Leads and admins can view all drop reports" ON public.mcn_drop_reports;
CREATE POLICY "Leads and admins can view all drop reports"
  ON public.mcn_drop_reports
  FOR SELECT
  USING (
    (public.is_community_lead(auth.uid()) OR public.is_platform_admin(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.mcn_preorder_drops d
      WHERE d.id = drop_id
        AND d.community_id = get_user_community_id()
    )
  );

-- A host cannot report their own drop: it only pollutes the pending count that
-- drives auto-hide, and there is no legitimate reason to do it.
DROP POLICY IF EXISTS "Approved users can report drops" ON public.mcn_drop_reports;
CREATE POLICY "Approved users can report drops"
  ON public.mcn_drop_reports
  FOR INSERT
  WITH CHECK (
    reported_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.mcn_preorder_drops d
      WHERE d.id = drop_id
        AND d.community_id = get_user_community_id()
        AND d.created_by <> auth.uid()
    )
  );

DROP POLICY IF EXISTS "Leads and admins can update drop reports" ON public.mcn_drop_reports;
CREATE POLICY "Leads and admins can update drop reports"
  ON public.mcn_drop_reports
  FOR UPDATE
  USING (public.is_community_lead(auth.uid()) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_community_lead(auth.uid()) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Drop reports cannot be deleted" ON public.mcn_drop_reports;
CREATE POLICY "Drop reports cannot be deleted"
  ON public.mcn_drop_reports
  FOR DELETE
  USING (false);

-- ============================================================
-- 3. Notify leads on every report; auto-hide at the threshold
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_drop_report_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auto_hide_threshold CONSTANT INTEGER := 3;
  v_drop_title TEXT;
  v_drop_community_id UUID;
  v_reporter_name TEXT;
  v_pending_count INTEGER;
BEGIN
  SELECT d.title, d.community_id INTO v_drop_title, v_drop_community_id
  FROM public.mcn_preorder_drops d
  WHERE d.id = NEW.drop_id;

  SELECT p.full_name INTO v_reporter_name
  FROM public.profiles p
  WHERE p.id = NEW.reported_by;

  SELECT COUNT(*) INTO v_pending_count
  FROM public.mcn_drop_reports r
  WHERE r.drop_id = NEW.drop_id
    AND r.status = 'pending';

  IF v_pending_count >= v_auto_hide_threshold THEN
    -- Closing the drop is what actually stops new orders; the flag is what
    -- keeps it closed and out of the catalogue until a lead rules on it.
    UPDATE public.mcn_preorder_drops
    SET flagged_for_review_at = now(),
        flagged_reason = 'Auto-hidden after ' || v_pending_count || ' resident reports',
        status = CASE WHEN status = 'open' THEN 'closed' ELSE status END
    WHERE id = NEW.drop_id
      AND flagged_for_review_at IS NULL;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT
      p.id,
      'drop_auto_hidden',
      'Food drop hidden for review',
      '"' || COALESCE(v_drop_title, 'A food drop') || '" was hidden after ' || v_pending_count || ' reports. Tap to review it.',
      jsonb_build_object('drop_id', NEW.drop_id)
    FROM public.profiles p
    WHERE p.community_id = v_drop_community_id
      AND p.app_role IN ('president'::public.app_role_type, 'vice_president'::public.app_role_type)
      AND p.removed_at IS NULL;
  ELSE
    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT
      p.id,
      'drop_reported',
      'Food drop reported',
      COALESCE(v_reporter_name, 'A resident') || ' reported "' || COALESCE(v_drop_title, 'a food drop') || '". Tap to review.',
      jsonb_build_object('drop_id', NEW.drop_id, 'report_id', NEW.id, 'reason', NEW.reason)
    FROM public.profiles p
    WHERE p.community_id = v_drop_community_id
      AND p.app_role IN ('president'::public.app_role_type, 'vice_president'::public.app_role_type)
      AND p.removed_at IS NULL
      AND p.id != NEW.reported_by;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_drop_report_created ON public.mcn_drop_reports;
CREATE TRIGGER on_drop_report_created
  AFTER INSERT ON public.mcn_drop_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_drop_report_notification();

GRANT EXECUTE ON FUNCTION public.handle_drop_report_notification() TO authenticated;

-- ============================================================
-- 4. Tell the host and the existing buyers when a drop is hidden
-- ============================================================
--
-- This is the part deletion never did. Buyers who committed money find out,
-- and the host learns why their drop went quiet instead of guessing.

CREATE OR REPLACE FUNCTION public.handle_drop_hidden_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.flagged_for_review_at IS NOT NULL OR NEW.flagged_for_review_at IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.created_by,
    'drop_hidden_host',
    'Your food drop was hidden for review',
    '"' || NEW.title || '" is no longer visible to neighbours and cannot take new orders'
      || COALESCE(' — ' || NEW.flagged_reason, '')
      || '. A community lead will review it.',
    jsonb_build_object('drop_id', NEW.id)
  );

  -- Buyers are told the drop was withdrawn, not that it was reported. Whether
  -- the host did something wrong is unresolved at this point, and the buyers
  -- only need to know their order is not going ahead as planned.
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT DISTINCT
    o.buyer_id,
    'drop_hidden_buyer',
    'A pre-order you placed is on hold',
    '"' || NEW.title || '" has been withdrawn pending review. Please contact the host about your order.',
    jsonb_build_object('drop_id', NEW.id)
  FROM public.mcn_preorder_orders o
  WHERE o.drop_id = NEW.id
    AND o.status = 'confirmed'
    AND o.buyer_id <> NEW.created_by;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_drop_hidden ON public.mcn_preorder_drops;
CREATE TRIGGER on_drop_hidden
  AFTER UPDATE OF flagged_for_review_at ON public.mcn_preorder_drops
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_drop_hidden_notification();

GRANT EXECUTE ON FUNCTION public.handle_drop_hidden_notification() TO authenticated;

-- ============================================================
-- 5. A hidden drop cannot take new orders
-- ============================================================
--
-- The order INSERT policy never checked drop status, so "closed" was a UI
-- convention only. A hidden drop has to be enforced server-side or the direct
-- API still accepts orders on it.

DROP POLICY IF EXISTS "mcn_preorder_orders_insert" ON public.mcn_preorder_orders;
CREATE POLICY "mcn_preorder_orders_insert"
  ON public.mcn_preorder_orders FOR INSERT
  WITH CHECK (
    community_id = get_user_community_id()
    AND buyer_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.mcn_preorder_drops d
      WHERE d.id = drop_id
        AND (d.created_by = auth.uid() OR d.flagged_for_review_at IS NOT NULL)
    )
  );

-- ============================================================
-- 6. Only a lead or platform admin can un-hide
-- ============================================================
--
-- Mirrors enforce_flagged_listing_reactivation (20260821000200): without this
-- the reported host just clears the flag themselves and the review never
-- happens. Reopening the drop is blocked on the same terms.

CREATE OR REPLACE FUNCTION public.enforce_flagged_drop_reactivation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.flagged_for_review_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_community_lead(auth.uid()) OR public.is_platform_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.flagged_for_review_at IS NULL THEN
    RAISE EXCEPTION 'This food drop was hidden for review. Only a community lead or platform admin can restore it.';
  END IF;

  IF NEW.status = 'open' AND OLD.status <> 'open' THEN
    RAISE EXCEPTION 'This food drop was hidden for review and cannot be reopened until a community lead restores it.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_flagged_drop_reactivation ON public.mcn_preorder_drops;
CREATE TRIGGER trg_enforce_flagged_drop_reactivation
BEFORE UPDATE ON public.mcn_preorder_drops
FOR EACH ROW
EXECUTE FUNCTION public.enforce_flagged_drop_reactivation();

NOTIFY pgrst, 'reload schema';
