-- Migration: 20260827000000_service_reminders_fixes.sql
-- Description: Service reminders edge-case fixes (tasks M1-M6)

-- Task M1: IST date helper
CREATE OR REPLACE FUNCTION public.today_ist()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date;
$$;

GRANT EXECUTE ON FUNCTION public.today_ist() TO authenticated;


-- Task M2: Move images out of notes
ALTER TABLE public.user_services
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Temporary helper for URL-decoding titles
CREATE OR REPLACE FUNCTION public.url_decode_tmp(p_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  v_bytes bytea := '\x'::bytea;
  i integer := 1;
  n integer := length(p_input);
  ch text;
BEGIN
  WHILE i <= n LOOP
    ch := substr(p_input, i, 1);
    IF ch = '%' AND i + 2 <= n AND substr(p_input, i + 1, 2) ~ '^[0-9a-fA-F]{2}$' THEN
      v_bytes := v_bytes || decode(substr(p_input, i + 1, 2), 'hex');
      i := i + 3;
    ELSE
      v_bytes := v_bytes || convert_to(ch, 'utf8');
      i := i + 1;
    END IF;
  END LOOP;
  RETURN convert_from(v_bytes, 'utf8');
EXCEPTION WHEN OTHERS THEN
  RETURN p_input;   -- never fail a backfill over one malformed title
END;
$$;

-- Backfill ReminderImage tags
WITH parsed AS (
  SELECT
    u.id,
    r.ord,
    public.url_decode_tmp(r.m[1]) AS title,
    btrim(r.m[2])                 AS url
  FROM public.user_services u,
       LATERAL regexp_matches(
         u.notes,
         '\[ReminderImage:([^|\]]+)\|([^\]]+)\]',
         'g'
       ) WITH ORDINALITY AS r(m, ord)
  WHERE u.notes IS NOT NULL
),
agg AS (
  SELECT
    id,
    jsonb_agg(
      jsonb_build_object('title', COALESCE(NULLIF(btrim(title), ''), 'Attachment'),
                         'url',   url)
      ORDER BY ord
    ) AS imgs
  FROM parsed
  WHERE url <> ''
  GROUP BY id
)
UPDATE public.user_services s
SET images = agg.imgs
FROM agg
WHERE agg.id = s.id
  AND s.images = '[]'::jsonb;

-- Backfill legacy single-URL Receipt tags
UPDATE public.user_services s
SET images = jsonb_build_array(
      jsonb_build_object('title', 'Receipt / Warranty Card',
                         'url',   btrim((regexp_match(s.notes, '\[Receipt:\s*(https?://[^\]]+)\]'))[1]))
    )
WHERE s.images = '[]'::jsonb
  AND s.notes ~* '\[Receipt:\s*https?://[^\]]+\]';

-- Clear tags from notes
UPDATE public.user_services
SET notes = NULLIF(
      btrim(
        regexp_replace(
          regexp_replace(notes, '\[ReminderImage:[^\]]+\]', '', 'g'),
          '\[Receipt:[^\]]+\]', '', 'g'
        )
      ),
      ''
    )
WHERE notes ~* '\[(ReminderImage|Receipt):';

-- Constraint image count <= 3
ALTER TABLE public.user_services
  DROP CONSTRAINT IF EXISTS user_services_images_check;

ALTER TABLE public.user_services
  ADD CONSTRAINT user_services_images_check
  CHECK (jsonb_typeof(images) = 'array' AND jsonb_array_length(images) <= 3);

-- Drop temporary helper
DROP FUNCTION IF EXISTS public.url_decode_tmp(text);

-- Expose images on get_my_upcoming_services
DROP FUNCTION IF EXISTS public.get_my_upcoming_services();

CREATE FUNCTION public.get_my_upcoming_services()
RETURNS TABLE (
  id uuid, user_id uuid, community_id uuid, service_name text, category text,
  last_serviced_on date, frequency_months integer, next_due_on date, notes text,
  images jsonb, provider_id uuid, notified_at timestamptz,
  created_at timestamptz, updated_at timestamptz, days_until_due integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.user_id, s.community_id, s.service_name, s.category,
         s.last_serviced_on, s.frequency_months, s.next_due_on, s.notes,
         s.images, s.provider_id, s.notified_at, s.created_at, s.updated_at,
         (s.next_due_on - public.today_ist())::integer
  FROM public.user_services s
  WHERE s.user_id = auth.uid()
  ORDER BY s.next_due_on ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_upcoming_services() TO authenticated;


-- Task M3: IST date handling
ALTER TABLE public.user_services
  DROP CONSTRAINT IF EXISTS user_services_last_serviced_on_check;

ALTER TABLE public.user_service_history
  DROP CONSTRAINT IF EXISTS user_service_history_serviced_on_check;

CREATE OR REPLACE FUNCTION public.user_service_history_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.serviced_on > public.today_ist() THEN
    RAISE EXCEPTION 'Service date cannot be in the future.'
      USING ERRCODE = '22007';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_service_history_validate_trigger ON public.user_service_history;
CREATE TRIGGER user_service_history_validate_trigger
  BEFORE INSERT OR UPDATE ON public.user_service_history
  FOR EACH ROW EXECUTE FUNCTION public.user_service_history_validate();

CREATE OR REPLACE FUNCTION public.get_my_due_soon_count()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.user_services
  WHERE user_id = auth.uid()
    AND next_due_on <= public.today_ist() + 7;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_due_soon_count() TO authenticated;


-- Task M4: Drop 1-arg overload and update 4-arg mark_service_done
DROP FUNCTION IF EXISTS public.mark_service_done(uuid);

CREATE OR REPLACE FUNCTION public.mark_service_done(
  p_service_id uuid,
  p_provider_id uuid DEFAULT NULL,
  p_cost_paid numeric DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS public.user_services
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result public.user_services;
  v_provider_name text;
BEGIN
  UPDATE public.user_services
  SET last_serviced_on = public.today_ist(),
      notified_at      = NULL,
      notify_count     = 0
  WHERE id = p_service_id
    AND user_id = auth.uid()
  RETURNING * INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found or not owned by caller';
  END IF;

  IF p_provider_id IS NOT NULL THEN
    SELECT sp.name INTO v_provider_name
    FROM public.service_providers sp WHERE sp.id = p_provider_id;
  END IF;

  INSERT INTO public.user_service_history (
    service_id, user_id, serviced_on, provider_id,
    provider_name_snapshot, cost_paid, note
  ) VALUES (
    v_result.id, v_result.user_id, public.today_ist(), p_provider_id,
    v_provider_name, p_cost_paid,
    CASE WHEN p_note IS NULL OR length(btrim(p_note)) = 0
         THEN NULL ELSE left(btrim(p_note), 280) END
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_service_done(uuid, uuid, numeric, text) TO authenticated;


-- Task M5: Counter column & notify_due_services cadence
ALTER TABLE public.user_services
  ADD COLUMN IF NOT EXISTS notify_count smallint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.user_services_compute_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.last_serviced_on > public.today_ist() THEN
    RAISE EXCEPTION 'Last serviced date cannot be in the future.'
      USING ERRCODE = '22007';
  END IF;

  NEW.next_due_on := NEW.last_serviced_on + (NEW.frequency_months || ' months')::interval;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.last_serviced_on <> OLD.last_serviced_on
       OR NEW.frequency_months <> OLD.frequency_months THEN
      NEW.notified_at  := NULL;
      NEW.notify_count := 0;
    END IF;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_due_services()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count   integer := 0;
  v_today   date    := public.today_ist();
  v_service RECORD;
BEGIN
  FOR v_service IN
    SELECT s.id AS service_id, s.user_id, s.service_name, s.category, s.next_due_on,
           (s.next_due_on - v_today)::integer AS days_until_due
    FROM public.user_services s
    WHERE s.next_due_on <= v_today + 7
      AND s.notify_count < 5
      AND (
        s.notified_at IS NULL
        OR s.notified_at < now() - interval '6 days 12 hours'
      )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, data, is_read)
    VALUES (
      v_service.user_id,
      'service_reminder',
      CASE
        WHEN v_service.days_until_due < 0  THEN v_service.service_name || ' is overdue!'
        WHEN v_service.days_until_due = 0  THEN v_service.service_name || ' is due today'
        ELSE v_service.service_name || ' is due in ' || v_service.days_until_due || ' days'
      END,
      CASE
        WHEN v_service.days_until_due < 0
          THEN 'Overdue by ' || ABS(v_service.days_until_due) || ' days. Schedule a service now.'
        WHEN v_service.days_until_due = 0
          THEN 'Your service is due today. Book a technician!'
        ELSE 'Service reminder: due in ' || v_service.days_until_due || ' days.'
      END,
      jsonb_build_object(
        'service_id',     v_service.service_id,
        'service_name',   v_service.service_name,
        'category',       v_service.category,
        'next_due_on',    v_service.next_due_on,
        'days_until_due', v_service.days_until_due
      ),
      false
    );

    UPDATE public.user_services
    SET notified_at  = now(),
        notify_count = notify_count + 1
    WHERE id = v_service.service_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


-- Task M6: Reconcile last_serviced_on from history
CREATE OR REPLACE FUNCTION public.user_service_history_sync_parent()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_service_id uuid := COALESCE(NEW.service_id, OLD.service_id);
  v_latest     date;
BEGIN
  SELECT MAX(h.serviced_on) INTO v_latest
  FROM public.user_service_history h
  WHERE h.service_id = v_service_id;

  IF v_latest IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.user_services s
  SET last_serviced_on = v_latest
  WHERE s.id = v_service_id
    AND s.last_serviced_on IS DISTINCT FROM v_latest;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS user_service_history_sync_parent_trigger ON public.user_service_history;
CREATE TRIGGER user_service_history_sync_parent_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.user_service_history
  FOR EACH ROW EXECUTE FUNCTION public.user_service_history_sync_parent();

NOTIFY pgrst, 'reload schema';
