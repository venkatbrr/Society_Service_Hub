-- Community events: cultural/sports/festival events posted by a designated
-- "events coordinator" grant (or a lead), with up to 3 call/WhatsApp contacts
-- per event.
--
-- Naming note: public.events already exists and means a FUND (see
-- docs/architecture.md §4.4). This module is deliberately named
-- community_events / community_event_contacts / community_event_organizers
-- throughout so it is never confused with the funds module.

-- ============================================================
-- 1. Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.community_event_organizers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by    UUID REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_event_organizers_community
  ON public.community_event_organizers (community_id);

CREATE TABLE IF NOT EXISTS public.community_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id            UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_by              UUID NOT NULL REFERENCES public.profiles(id),
  title                   TEXT NOT NULL,
  category                TEXT NOT NULL DEFAULT 'cultural',
  description             TEXT,
  image_url               TEXT,
  venue                   TEXT,
  event_date              DATE NOT NULL,
  start_time              TIME,
  end_time                TIME,
  registration_last_date  DATE,
  entry_fee               NUMERIC(10,2),
  registration_link       TEXT,
  status                  TEXT NOT NULL DEFAULT 'published',
  cancelled_at            TIMESTAMPTZ,
  cancellation_note       TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT community_events_category_valid CHECK (
    category IN ('cultural', 'sports', 'festival', 'meeting', 'workshop', 'other')
  ),
  CONSTRAINT community_events_status_valid CHECK (
    status IN ('published', 'cancelled')
  ),
  CONSTRAINT community_events_text_lengths CHECK (
    length(btrim(title)) > 0 AND length(title) <= 80
    AND (description IS NULL OR length(description) <= 2000)
    AND (venue IS NULL OR length(venue) <= 120)
    AND (cancellation_note IS NULL OR length(cancellation_note) <= 200)
    AND (registration_link IS NULL OR length(registration_link) <= 300)
  ),
  CONSTRAINT community_events_registration_before_event CHECK (
    registration_last_date IS NULL OR registration_last_date <= event_date
  ),
  CONSTRAINT community_events_time_order CHECK (
    end_time IS NULL OR start_time IS NULL OR end_time > start_time
  ),
  CONSTRAINT community_events_fee_bounds CHECK (
    entry_fee IS NULL OR (entry_fee >= 0 AND entry_fee <= 100000)
  )
);

CREATE INDEX IF NOT EXISTS idx_community_events_community_date
  ON public.community_events (community_id, event_date);

CREATE TABLE IF NOT EXISTS public.community_event_contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES public.community_events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  role_label  TEXT,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT community_event_contacts_text_lengths CHECK (
    length(btrim(name)) > 0 AND length(name) <= 60
    AND (role_label IS NULL OR length(role_label) <= 40)
    AND phone ~ '^[6-9][0-9]{9}$'
  )
);

CREATE INDEX IF NOT EXISTS idx_community_event_contacts_event
  ON public.community_event_contacts (event_id, sort_order);

ALTER TABLE public.community_event_organizers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_event_contacts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Predicate
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_event_organizer(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.community_event_organizers o
    JOIN public.profiles p ON p.id = o.user_id
    WHERE o.user_id = COALESCE(p_user_id, auth.uid())
      AND o.community_id = p.community_id
      AND p.removed_at IS NULL
  );
END;
$$;

-- ============================================================
-- 3. Triggers
-- ============================================================

-- Contact cap: at most 3 per event.
CREATE OR REPLACE FUNCTION public.enforce_community_event_contact_cap()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.community_event_contacts
  WHERE event_id = NEW.event_id;

  IF v_count >= 3 THEN
    RAISE EXCEPTION 'An event can have at most 3 contacts';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_event_contact_cap ON public.community_event_contacts;
CREATE TRIGGER trg_community_event_contact_cap
BEFORE INSERT ON public.community_event_contacts
FOR EACH ROW EXECUTE FUNCTION public.enforce_community_event_contact_cap();

-- Immutables + updated_at stamp.
CREATE OR REPLACE FUNCTION public.enforce_community_event_immutables()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.community_id IS DISTINCT FROM OLD.community_id THEN
    RAISE EXCEPTION 'An event cannot be moved to another community';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'An event''s creator cannot be changed';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_event_immutables ON public.community_events;
CREATE TRIGGER trg_community_event_immutables
BEFORE UPDATE ON public.community_events
FOR EACH ROW EXECUTE FUNCTION public.enforce_community_event_immutables();

-- Cancellation attribution, mirroring stamp_mcn_preorder_cancellation.
CREATE OR REPLACE FUNCTION public.stamp_community_event_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    NEW.cancelled_at := now();
  ELSIF NEW.status <> 'cancelled' AND OLD.status = 'cancelled' THEN
    NEW.cancelled_at := NULL;
    NEW.cancellation_note := NULL;
  ELSE
    NEW.cancelled_at := OLD.cancelled_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_event_stamp_cancellation ON public.community_events;
CREATE TRIGGER trg_community_event_stamp_cancellation
BEFORE UPDATE ON public.community_events
FOR EACH ROW EXECUTE FUNCTION public.stamp_community_event_cancellation();

-- Anti-spam: at most 5 published, future-dated events per creator at a time,
-- same shape as the food-drop concurrent-open cap (20260821000100).
CREATE OR REPLACE FUNCTION public.enforce_community_event_creator_cap()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.community_events
  WHERE created_by = NEW.created_by
    AND status = 'published'
    AND event_date >= CURRENT_DATE;

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'You can have at most 5 upcoming published events at a time';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_event_creator_cap ON public.community_events;
CREATE TRIGGER trg_community_event_creator_cap
BEFORE INSERT ON public.community_events
FOR EACH ROW EXECUTE FUNCTION public.enforce_community_event_creator_cap();

-- ============================================================
-- 4. RLS
-- ============================================================

DROP POLICY IF EXISTS "Event organizers readable by same community" ON public.community_event_organizers;
CREATE POLICY "Event organizers readable by same community"
  ON public.community_event_organizers
  FOR SELECT
  USING (community_id = public.get_user_community_id());

DROP POLICY IF EXISTS "Event organizers managed by leads" ON public.community_event_organizers;
CREATE POLICY "Event organizers managed by leads"
  ON public.community_event_organizers
  FOR INSERT
  WITH CHECK (
    community_id = public.get_user_community_id()
    AND public.is_community_lead(auth.uid())
  );

DROP POLICY IF EXISTS "Event organizers removed by leads" ON public.community_event_organizers;
CREATE POLICY "Event organizers removed by leads"
  ON public.community_event_organizers
  FOR DELETE
  USING (
    community_id = public.get_user_community_id()
    AND public.is_community_lead(auth.uid())
  );

DROP POLICY IF EXISTS "Community events readable by same community" ON public.community_events;
CREATE POLICY "Community events readable by same community"
  ON public.community_events
  FOR SELECT
  USING (community_id = public.get_user_community_id());

DROP POLICY IF EXISTS "Community events insertable by organizers and leads" ON public.community_events;
CREATE POLICY "Community events insertable by organizers and leads"
  ON public.community_events
  FOR INSERT
  WITH CHECK (
    community_id = public.get_user_community_id()
    AND created_by = auth.uid()
    AND (public.is_event_organizer(auth.uid()) OR public.is_community_lead(auth.uid()))
  );

DROP POLICY IF EXISTS "Community events updatable by creator or leads" ON public.community_events;
CREATE POLICY "Community events updatable by creator or leads"
  ON public.community_events
  FOR UPDATE
  USING (
    community_id = public.get_user_community_id()
    AND (created_by = auth.uid() OR public.is_community_lead(auth.uid()))
  )
  WITH CHECK (
    community_id = public.get_user_community_id()
    AND (created_by = auth.uid() OR public.is_community_lead(auth.uid()))
  );

DROP POLICY IF EXISTS "Community events deletable by creator, leads, or admin" ON public.community_events;
CREATE POLICY "Community events deletable by creator, leads, or admin"
  ON public.community_events
  FOR DELETE
  USING (
    created_by = auth.uid()
    OR (public.is_community_lead(auth.uid()) AND community_id = public.get_user_community_id())
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Community event contacts readable with event" ON public.community_event_contacts;
CREATE POLICY "Community event contacts readable with event"
  ON public.community_event_contacts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.community_events e
      WHERE e.id = community_event_contacts.event_id
        AND e.community_id = public.get_user_community_id()
    )
  );

DROP POLICY IF EXISTS "Community event contacts insertable with event" ON public.community_event_contacts;
CREATE POLICY "Community event contacts insertable with event"
  ON public.community_event_contacts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_events e
      WHERE e.id = community_event_contacts.event_id
        AND e.community_id = public.get_user_community_id()
        AND (e.created_by = auth.uid() OR public.is_community_lead(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Community event contacts deletable with event" ON public.community_event_contacts;
CREATE POLICY "Community event contacts deletable with event"
  ON public.community_event_contacts
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.community_events e
      WHERE e.id = community_event_contacts.event_id
        AND e.community_id = public.get_user_community_id()
        AND (e.created_by = auth.uid() OR public.is_community_lead(auth.uid()))
    )
  );

-- ============================================================
-- 5. Atomic create/edit RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_community_event(
  p_event_id UUID,
  p_title TEXT,
  p_category TEXT,
  p_description TEXT,
  p_image_url TEXT,
  p_venue TEXT,
  p_event_date DATE,
  p_start_time TIME,
  p_end_time TIME,
  p_registration_last_date DATE,
  p_entry_fee NUMERIC,
  p_registration_link TEXT,
  p_contacts JSONB
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_community_id UUID;
  v_event RECORD;
  v_event_id UUID;
  v_contact RECORD;
  v_contact_count INT := 0;
  v_normalized_phone TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Login required';
  END IF;

  SELECT community_id INTO v_community_id
  FROM public.profiles
  WHERE id = v_user AND removed_at IS NULL;

  IF v_community_id IS NULL THEN
    RAISE EXCEPTION 'You are not a member of a community';
  END IF;

  IF NOT (public.is_event_organizer(v_user) OR public.is_community_lead(v_user)) THEN
    RAISE EXCEPTION 'Only events coordinators and community leads can post events';
  END IF;

  IF COALESCE(btrim(p_title), '') = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  IF p_event_date IS NULL THEN
    RAISE EXCEPTION 'Event date is required';
  END IF;

  IF p_contacts IS NULL OR jsonb_typeof(p_contacts) <> 'array'
     OR jsonb_array_length(p_contacts) < 1 OR jsonb_array_length(p_contacts) > 3 THEN
    RAISE EXCEPTION 'Add between 1 and 3 contacts';
  END IF;

  IF p_event_id IS NOT NULL THEN
    SELECT * INTO v_event FROM public.community_events WHERE id = p_event_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Event not found';
    END IF;
    IF v_event.community_id <> v_community_id THEN
      RAISE EXCEPTION 'Event does not belong to your community';
    END IF;
    IF v_event.created_by <> v_user AND NOT public.is_community_lead(v_user) THEN
      RAISE EXCEPTION 'You can only edit your own events';
    END IF;

    v_event_id := p_event_id;

    UPDATE public.community_events
    SET title = btrim(p_title),
        category = COALESCE(NULLIF(btrim(p_category), ''), 'cultural'),
        description = NULLIF(btrim(p_description), ''),
        image_url = p_image_url,
        venue = NULLIF(btrim(p_venue), ''),
        event_date = p_event_date,
        start_time = p_start_time,
        end_time = p_end_time,
        registration_last_date = p_registration_last_date,
        entry_fee = p_entry_fee,
        registration_link = NULLIF(btrim(p_registration_link), '')
    WHERE id = v_event_id;

    DELETE FROM public.community_event_contacts WHERE event_id = v_event_id;
  ELSE
    INSERT INTO public.community_events (
      community_id, created_by, title, category, description, image_url,
      venue, event_date, start_time, end_time, registration_last_date,
      entry_fee, registration_link
    ) VALUES (
      v_community_id, v_user, btrim(p_title),
      COALESCE(NULLIF(btrim(p_category), ''), 'cultural'),
      NULLIF(btrim(p_description), ''), p_image_url, NULLIF(btrim(p_venue), ''),
      p_event_date, p_start_time, p_end_time, p_registration_last_date,
      p_entry_fee, NULLIF(btrim(p_registration_link), '')
    )
    RETURNING id INTO v_event_id;
  END IF;

  FOR v_contact IN
    SELECT
      (e->>'name') AS name,
      (e->>'phone') AS phone,
      (e->>'role_label') AS role_label,
      ord - 1 AS sort_order
    FROM jsonb_array_elements(p_contacts) WITH ORDINALITY AS a(e, ord)
  LOOP
    IF COALESCE(btrim(v_contact.name), '') = '' THEN
      RAISE EXCEPTION 'Each contact needs a name';
    END IF;

    v_normalized_phone := public.normalize_indian_mobile(v_contact.phone);
    IF v_normalized_phone IS NULL THEN
      RAISE EXCEPTION '"%" needs a valid 10-digit mobile number', v_contact.name;
    END IF;

    INSERT INTO public.community_event_contacts (event_id, name, phone, role_label, sort_order)
    VALUES (v_event_id, btrim(v_contact.name), v_normalized_phone, NULLIF(btrim(v_contact.role_label), ''), v_contact.sort_order);

    v_contact_count := v_contact_count + 1;
  END LOOP;

  IF v_contact_count = 0 THEN
    RAISE EXCEPTION 'Add at least one contact';
  END IF;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_community_event(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TIME, TIME, DATE, NUMERIC, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_community_event(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TIME, TIME, DATE, NUMERIC, TEXT, JSONB
) TO authenticated;

NOTIFY pgrst, 'reload schema';
