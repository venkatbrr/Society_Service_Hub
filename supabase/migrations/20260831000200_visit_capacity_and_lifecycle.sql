-- ============================================================
-- Visit integrity: capacity enforcement, lead moderation,
-- community pinning, time-slot sanity, and a one-time status backfill.
--
-- FEDERATION: nothing here removes or narrows cross-community functionality.
-- Section 4 replaces ONLY the two single-community UPDATE/DELETE policies.
-- The additive SELECT policy service_visits_select_cross_community is NOT
-- dropped and NOT referenced — leave it exactly as it is. The community_id pin
-- in the UPDATE WITH CHECK constrains ownership, not sharing: a cross-community
-- visit is owned by one community and shared through service_visit_communities
-- plus service_visits.is_cross_community, none of which this migration touches.
-- See docs/cross-community.md.
-- ============================================================

-- ------------------------------------------------------------
-- 1. max_joiners sanity.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.service_visits'::regclass
      AND conname  = 'service_visits_max_joiners_positive'
  ) THEN
    ALTER TABLE public.service_visits
      ADD CONSTRAINT service_visits_max_joiners_positive
      CHECK (max_joiners IS NULL OR max_joiners >= 1);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Server-side capacity enforcement on join.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_visit_joiner_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max     INTEGER;
  v_current INTEGER;
BEGIN
  SELECT sv.max_joiners INTO v_max
  FROM public.service_visits sv
  WHERE sv.id = NEW.visit_id
  FOR UPDATE;

  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_current
  FROM public.visit_joiners vj
  WHERE vj.visit_id = NEW.visit_id;

  IF v_current >= v_max THEN
    RAISE EXCEPTION 'This visit is already full (% of % neighbours joined)', v_current, v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS visit_joiner_capacity_guard ON public.visit_joiners;
CREATE TRIGGER visit_joiner_capacity_guard
  BEFORE INSERT ON public.visit_joiners
  FOR EACH ROW EXECUTE FUNCTION public.enforce_visit_joiner_capacity();

GRANT EXECUTE ON FUNCTION public.enforce_visit_joiner_capacity() TO authenticated;

-- ------------------------------------------------------------
-- 3. One-time status backfill (issue 6).
-- ------------------------------------------------------------
UPDATE public.service_visits
SET status = 'completed', updated_at = now()
WHERE status = 'upcoming'
  AND visit_date < CURRENT_DATE;

-- ------------------------------------------------------------
-- 4. Lead / platform-admin moderation + community pinning (issue 12).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Creators can update their visits" ON public.service_visits;
CREATE POLICY "Creators can update their visits"
  ON public.service_visits FOR UPDATE
  USING (
    public.is_user_approved(auth.uid())
    AND (
      created_by = auth.uid()
      OR public.is_community_lead(auth.uid())
      OR public.is_platform_admin(auth.uid())
    )
  )
  WITH CHECK (
    public.is_user_approved(auth.uid())
    AND (
      created_by = auth.uid()
      OR public.is_community_lead(auth.uid())
      OR public.is_platform_admin(auth.uid())
    )
    AND community_id = (SELECT pr.community_id FROM public.profiles pr WHERE pr.id = auth.uid())
  );

DROP POLICY IF EXISTS "Creators can delete their visits" ON public.service_visits;
CREATE POLICY "Creators can delete their visits"
  ON public.service_visits FOR DELETE
  USING (
    public.is_user_approved(auth.uid())
    AND (
      created_by = auth.uid()
      OR public.is_community_lead(auth.uid())
      OR public.is_platform_admin(auth.uid())
    )
  );

-- ------------------------------------------------------------
-- 5. Time-slot sanity (issue 21).
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.service_visits'::regclass
      AND conname  = 'service_visits_time_slot_format'
  ) THEN
    ALTER TABLE public.service_visits
      ADD CONSTRAINT service_visits_time_slot_format
      CHECK (visit_time_slot ~* '^\s*\d{1,2}:\d{2}\s*(am|pm)\s*-\s*\d{1,2}:\d{2}\s*(am|pm)\s*$');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 6. handle_new_visit_notification COALESCE full_name (issue 23).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_visit_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    p.id,
    'new_visit',
    'New planned visit',
    COALESCE(
      (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = NEW.created_by),
      'A neighbour'
    ) || ' scheduled a ' || NEW.category || ' visit.',
    jsonb_build_object('visit_id', NEW.id)
  FROM public.profiles p
  WHERE p.community_id = NEW.community_id
    AND p.id <> NEW.created_by
    AND p.removed_at IS NULL;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
