-- Migration: Add Personal Service Reminders feature
-- This introduces user_services table (user-scoped, NOT community-scoped).
-- RLS enforces auth.uid() = user_id — the first purely personal data table in this app.

-- =============================================================
-- TABLE: user_services
-- =============================================================
CREATE TABLE user_services (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  community_id      uuid        REFERENCES communities(id) ON DELETE SET NULL,
  service_name      text        NOT NULL CHECK (length(service_name) > 0 AND length(service_name) <= 100),
  category          text        NOT NULL,
  last_serviced_on  date        NOT NULL CHECK (last_serviced_on <= CURRENT_DATE),
  frequency_months  integer     NOT NULL CHECK (frequency_months > 0 AND frequency_months <= 60),
  next_due_on       date        NOT NULL,
  notes             text        CHECK (notes IS NULL OR length(notes) <= 500),
  provider_id       uuid        REFERENCES service_providers(id) ON DELETE SET NULL,
  notified_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_services_user_id      ON user_services(user_id);
CREATE INDEX idx_user_services_due_pending  ON user_services(next_due_on) WHERE notified_at IS NULL;

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================
ALTER TABLE user_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_services_select_own ON user_services
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY user_services_insert_own ON user_services
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_services_update_own ON user_services
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_services_delete_own ON user_services
  FOR DELETE USING (auth.uid() = user_id);

-- =============================================================
-- TRIGGER: Auto-compute next_due_on and reset notified_at
-- =============================================================
CREATE OR REPLACE FUNCTION user_services_compute_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.next_due_on := NEW.last_serviced_on + (NEW.frequency_months || ' months')::interval;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.last_serviced_on <> OLD.last_serviced_on
       OR NEW.frequency_months <> OLD.frequency_months THEN
      NEW.notified_at := NULL;
    END IF;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_services_compute_fields_trigger
  BEFORE INSERT OR UPDATE ON user_services
  FOR EACH ROW EXECUTE FUNCTION user_services_compute_fields();

-- =============================================================
-- RPC: mark_service_done
-- =============================================================
CREATE OR REPLACE FUNCTION mark_service_done(p_service_id uuid)
RETURNS user_services
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result user_services;
BEGIN
  UPDATE user_services
  SET last_serviced_on = CURRENT_DATE,
      notified_at = NULL
  WHERE id = p_service_id AND user_id = auth.uid()
  RETURNING * INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found or not owned by caller';
  END IF;

  RETURN v_result;
END;
$$;

-- =============================================================
-- RPC: get_my_upcoming_services
-- Returns services ordered by next_due_on ASC with days_until_due
-- =============================================================
CREATE OR REPLACE FUNCTION get_my_upcoming_services()
RETURNS TABLE (
  id                uuid,
  user_id           uuid,
  community_id      uuid,
  service_name      text,
  category          text,
  last_serviced_on  date,
  frequency_months  integer,
  next_due_on       date,
  notes             text,
  provider_id       uuid,
  notified_at       timestamptz,
  created_at        timestamptz,
  updated_at        timestamptz,
  days_until_due    integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.user_id,
    s.community_id,
    s.service_name,
    s.category,
    s.last_serviced_on,
    s.frequency_months,
    s.next_due_on,
    s.notes,
    s.provider_id,
    s.notified_at,
    s.created_at,
    s.updated_at,
    (s.next_due_on - CURRENT_DATE)::integer AS days_until_due
  FROM user_services s
  WHERE s.user_id = auth.uid()
  ORDER BY s.next_due_on ASC;
END;
$$;

-- =============================================================
-- RPC: get_my_due_soon_count
-- Returns count of services due within 7 days
-- =============================================================
CREATE OR REPLACE FUNCTION get_my_due_soon_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*)::integer
  INTO v_count
  FROM user_services
  WHERE user_id = auth.uid()
    AND next_due_on <= CURRENT_DATE + interval '7 days';

  RETURN v_count;
END;
$$;

-- =============================================================
-- RPC: notify_due_services
-- Called by daily cron. Idempotent: re-running immediately produces zero new notifications.
-- Finds services due within 7 days where notified_at IS NULL,
-- inserts into notifications, then marks notified_at = now().
-- =============================================================
CREATE OR REPLACE FUNCTION notify_due_services()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_service RECORD;
BEGIN
  FOR v_service IN
    SELECT
      s.id         AS service_id,
      s.user_id,
      s.service_name,
      s.category,
      s.next_due_on,
      (s.next_due_on - CURRENT_DATE)::integer AS days_until_due
    FROM user_services s
    WHERE s.next_due_on <= CURRENT_DATE + interval '7 days'
      AND s.notified_at IS NULL
  LOOP
    INSERT INTO notifications (user_id, type, title, body, data, is_read)
    VALUES (
      v_service.user_id,
      'service_reminder',
      CASE
        WHEN v_service.days_until_due < 0 THEN v_service.service_name || ' is overdue!'
        WHEN v_service.days_until_due = 0 THEN v_service.service_name || ' is due today'
        ELSE v_service.service_name || ' is due in ' || v_service.days_until_due || ' days'
      END,
      CASE
        WHEN v_service.days_until_due < 0 THEN 'Overdue by ' || ABS(v_service.days_until_due) || ' days. Schedule a service now.'
        WHEN v_service.days_until_due = 0 THEN 'Your service is due today. Book a technician!'
        ELSE 'Service reminder: due in ' || v_service.days_until_due || ' days.'
      END,
      jsonb_build_object(
        'service_id',    v_service.service_id,
        'service_name',  v_service.service_name,
        'category',      v_service.category,
        'next_due_on',   v_service.next_due_on,
        'days_until_due', v_service.days_until_due
      ),
      false
    );

    UPDATE user_services
    SET notified_at = now()
    WHERE id = v_service.service_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- =============================================================
-- CRON SCHEDULING
-- Preferred: pg_cron extension at 3:30 UTC = 9:00 AM IST daily.
-- NOTE: If pg_cron is not available on your Supabase plan, use the
-- Edge Function at supabase/functions/check_due_services/index.ts
-- and schedule it via the Supabase Dashboard → Edge Functions → Schedule.
-- =============================================================
DO $cron_block$
BEGIN
  -- Attempt to schedule via pg_cron if the extension is available
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.schedule(
      'check-due-services',
      '30 3 * * *',
      $cron_sql$SELECT notify_due_services()$cron_sql$
    );
    RAISE NOTICE 'pg_cron schedule created: check-due-services at 03:30 UTC daily';
  ELSE
    RAISE NOTICE 'pg_cron not available. Use Supabase Edge Function check_due_services with a scheduled trigger instead.';
  END IF;
END;
$cron_block$;
