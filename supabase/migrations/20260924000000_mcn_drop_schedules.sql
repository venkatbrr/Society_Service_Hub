-- Recurring pre-order menus: "cook this again every Mon/Wed/Fri".
--
-- DESIGN: this schedule REMINDS, it does not publish.
--
-- Auto-publishing a food drop commits a host to cooking on a day they may be
-- unwell or travelling, and the failure mode lands on the neighbours: they pay
-- for food nobody is making, and only the host can cancel it. So the daily
-- sweep raises a notification and the host publishes with one tap. A host who
-- ignores it has silently, correctly, not cooked that day.
--
-- It also stores NO MENU. The schedule points at the drop it was created from,
-- and republishing runs through the existing `?fromDropId=` duplicate path, so
-- there is exactly one copy of a host's menu and no second thing to keep in
-- step. Deleting that drop cascades the schedule away with it, which is the
-- honest outcome: the menu it reran no longer exists.

CREATE TABLE IF NOT EXISTS public.mcn_drop_schedules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id        UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_by          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_drop_id      UUID NOT NULL REFERENCES public.mcn_preorder_drops(id) ON DELETE CASCADE,

  pattern             TEXT NOT NULL CHECK (pattern IN ('weekly', 'alternate_days')),
  -- 0 = Sunday … 6 = Saturday, matching EXTRACT(DOW). Only for 'weekly'.
  weekdays            SMALLINT[],
  -- The day the alternate-day rhythm counts from. Only for 'alternate_days'.
  anchor_date         DATE,

  -- Times of day only, never dates: a schedule that stored a date would go
  -- stale the moment it passed.
  fulfillment_time    TEXT NOT NULL CHECK (fulfillment_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  meal_type           TEXT NOT NULL DEFAULT 'lunch',

  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  -- Idempotency for the daily sweep: at most one reminder per schedule per day,
  -- however many times the cron fires.
  last_reminded_on    DATE,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT mcn_drop_schedules_pattern_fields CHECK (
    (pattern = 'weekly'         AND weekdays IS NOT NULL AND array_length(weekdays, 1) > 0)
    OR
    (pattern = 'alternate_days' AND anchor_date IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS mcn_drop_schedules_creator_idx
  ON public.mcn_drop_schedules(created_by);
CREATE INDEX IF NOT EXISTS mcn_drop_schedules_active_idx
  ON public.mcn_drop_schedules(is_active, last_reminded_on);
-- One live schedule per source menu: two rhythms on the same menu would just
-- produce two reminders for the same day.
CREATE UNIQUE INDEX IF NOT EXISTS mcn_drop_schedules_one_per_drop
  ON public.mcn_drop_schedules(source_drop_id) WHERE is_active;

ALTER TABLE public.mcn_drop_schedules ENABLE ROW LEVEL SECURITY;

-- A schedule is the host's own reminder, not community content: nobody else
-- has any reason to read it, and it names nothing a neighbour needs.
DROP POLICY IF EXISTS mcn_drop_schedules_select_own ON public.mcn_drop_schedules;
CREATE POLICY mcn_drop_schedules_select_own ON public.mcn_drop_schedules
  FOR SELECT USING (
    created_by = auth.uid() OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS mcn_drop_schedules_insert_own ON public.mcn_drop_schedules;
CREATE POLICY mcn_drop_schedules_insert_own ON public.mcn_drop_schedules
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND community_id = public.get_user_community_id()
    AND EXISTS (
      SELECT 1 FROM public.mcn_preorder_drops d
      WHERE d.id = source_drop_id
        AND d.created_by = auth.uid()
        AND d.flagged_for_review_at IS NULL
    )
  );

-- USING and WITH CHECK both, and both pin the tenant: with USING alone Postgres
-- reuses it for the new row and the host could move the schedule elsewhere.
DROP POLICY IF EXISTS mcn_drop_schedules_update_own ON public.mcn_drop_schedules;
CREATE POLICY mcn_drop_schedules_update_own ON public.mcn_drop_schedules
  FOR UPDATE
  USING (created_by = auth.uid() AND community_id = public.get_user_community_id())
  WITH CHECK (created_by = auth.uid() AND community_id = public.get_user_community_id());

DROP POLICY IF EXISTS mcn_drop_schedules_delete_own ON public.mcn_drop_schedules;
CREATE POLICY mcn_drop_schedules_delete_own ON public.mcn_drop_schedules
  FOR DELETE USING (
    created_by = auth.uid() OR public.is_platform_admin(auth.uid())
  );


-- Is a schedule due on a given day?
CREATE OR REPLACE FUNCTION public.mcn_drop_schedule_due_on(
  p_pattern TEXT,
  p_weekdays SMALLINT[],
  p_anchor_date DATE,
  p_day DATE
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE p_pattern
    WHEN 'weekly' THEN EXTRACT(DOW FROM p_day)::SMALLINT = ANY(p_weekdays)
    -- abs(), so a schedule reminds correctly on days before its anchor too
    -- (a host can only create one for today onward, but the arithmetic should
    -- not quietly depend on that).
    WHEN 'alternate_days' THEN abs(p_day - p_anchor_date) % 2 = 0
    ELSE FALSE
  END;
$$;


-- The daily sweep. Driven by the `check_due_services` Edge Function, which is
-- already scheduled in the Supabase dashboard — a second cron nobody remembers
-- to configure is a feature that silently never runs.
CREATE OR REPLACE FUNCTION public.remind_due_drop_schedules()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::DATE;
  v_count INTEGER := 0;
BEGIN
  WITH due AS (
    SELECT s.id, s.created_by, s.source_drop_id, s.fulfillment_time, d.title
    FROM public.mcn_drop_schedules s
    JOIN public.mcn_preorder_drops d ON d.id = s.source_drop_id
    JOIN public.profiles p ON p.id = s.created_by
    WHERE s.is_active
      AND p.removed_at IS NULL
      AND (s.last_reminded_on IS NULL OR s.last_reminded_on < v_today)
      AND public.mcn_drop_schedule_due_on(s.pattern, s.weekdays, s.anchor_date, v_today)
      -- Nothing to remind about if the host already has this menu open today.
      AND NOT EXISTS (
        SELECT 1 FROM public.mcn_preorder_drops o
        WHERE o.created_by = s.created_by
          AND o.status = 'open'
          AND o.cutoff_at > now()
          AND o.fulfillment_date = v_today
      )
  ), inserted AS (
    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT
      due.created_by,
      'drop_schedule_reminder',
      'Cooking today?',
      'Tap to publish "' || due.title || '" for today. Set your closing and delivery time, and neighbours can start ordering.',
      jsonb_build_object('drop_id', due.source_drop_id, 'schedule_id', due.id)
    FROM due
    RETURNING 1
  ), marked AS (
    UPDATE public.mcn_drop_schedules s
    SET last_reminded_on = v_today, updated_at = now()
    FROM due
    WHERE s.id = due.id
    RETURNING 1
  )
  SELECT count(*)::INTEGER INTO v_count FROM inserted;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.remind_due_drop_schedules() FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
