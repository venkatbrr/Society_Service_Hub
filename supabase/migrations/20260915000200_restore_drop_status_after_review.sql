-- Restoring a hidden food drop left it stuck in "Past".
--
-- Hiding force-closes the drop (`open` -> `closed`) to stop new orders, but
-- restoring only cleared `flagged_for_review_at` — it never put the status
-- back. Nothing else in the app can set a drop to `open` either: `add.tsx`
-- writes it once on insert, and the manage screen only goes `open -> closed`
-- or `-> completed`. So a cleared drop stayed `closed` forever and never
-- returned to the Open tab.
--
-- The status bookkeeping now lives entirely in the database, on the same
-- transition that sets the flag, so the direct-hide path and the 3-report
-- auto-hide path cannot drift apart.

ALTER TABLE public.mcn_preorder_drops
  ADD COLUMN IF NOT EXISTS flagged_prev_status TEXT;

CREATE OR REPLACE FUNCTION public.sync_flagged_drop_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Hiding: remember where the drop was, then stop it taking orders.
  IF OLD.flagged_for_review_at IS NULL AND NEW.flagged_for_review_at IS NOT NULL THEN
    NEW.flagged_prev_status := OLD.status;
    IF OLD.status = 'open' THEN
      NEW.status := 'closed';
    END IF;
    RETURN NEW;
  END IF;

  -- Restoring: put it back exactly where it was. A drop whose cut-off passed
  -- while hidden is still safe to mark `open` — both the catalog's Open tab
  -- and `isOpen` on the detail screen additionally require `cutoff_at` to be
  -- in the future, so it simply lands in Past on its own merits rather than
  -- because it was moderated.
  IF OLD.flagged_for_review_at IS NOT NULL AND NEW.flagged_for_review_at IS NULL THEN
    NEW.status := COALESCE(OLD.flagged_prev_status, NEW.status);
    NEW.flagged_prev_status := NULL;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Name matters: BEFORE UPDATE triggers fire in alphabetical order, and this
-- must run *after* trg_enforce_flagged_drop_reactivation so the permission
-- guard still sees the caller's own intended status change, not this one's.
DROP TRIGGER IF EXISTS trg_sync_flagged_drop_status ON public.mcn_preorder_drops;
CREATE TRIGGER trg_sync_flagged_drop_status
BEFORE UPDATE OF flagged_for_review_at ON public.mcn_preorder_drops
FOR EACH ROW
EXECUTE FUNCTION public.sync_flagged_drop_status();

-- The auto-hide path no longer sets status itself — the trigger above owns it
-- for both paths. Otherwise the two would have to be kept in step by hand.
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
    UPDATE public.mcn_preorder_drops
    SET flagged_for_review_at = now(),
        flagged_reason = 'Auto-hidden after ' || v_pending_count || ' resident reports'
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

-- Backfill: any drop already hidden by the earlier code has no recorded
-- previous status. It was force-closed from `open` (that is the only status
-- the hide path changed), so that is what it should return to.
UPDATE public.mcn_preorder_drops
SET flagged_prev_status = 'open'
WHERE flagged_for_review_at IS NOT NULL
  AND flagged_prev_status IS NULL
  AND status = 'closed';

NOTIFY pgrst, 'reload schema';
