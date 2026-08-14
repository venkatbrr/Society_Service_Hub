-- Notify every resident of the community when a community event is published,
-- and when a published event is later cancelled.
--
-- NAMING TRAP: public.events is a FUND. The community-events module is
-- community_events / community_event_contacts / community_event_organizers.

-- ---------------------------------------------------------------------------
-- 1. New event published -> notify all residents except the poster.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_community_event_published()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poster TEXT;
  v_when   TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM 'published' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(full_name), ''), 'A neighbour')
  INTO v_poster
  FROM public.profiles
  WHERE id = NEW.created_by;

  v_when := TO_CHAR(NEW.event_date, 'FMDay, FMDD FMMon');

  -- SECURITY DEFINER so the fan-out sees every profile in the community, not
  -- just the rows the poster's own RLS grants them.
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    p.id,
    'community_event_posted',
    'New community event',
    COALESCE(v_poster, 'A neighbour') || ' posted "' || NEW.title || '" on ' || v_when || '.',
    jsonb_build_object('event_id', NEW.id, 'category', NEW.category)
  FROM public.profiles p
  WHERE p.community_id = NEW.community_id
    AND p.id IS DISTINCT FROM NEW.created_by
    AND p.removed_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_community_event_published ON public.community_events;
CREATE TRIGGER on_community_event_published
  AFTER INSERT ON public.community_events
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_community_event_published();

-- ---------------------------------------------------------------------------
-- 2. Event cancelled -> tell the same audience, so nobody turns up.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_community_event_cancelled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_when TEXT;
BEGIN
  IF NEW.status <> 'cancelled' OR OLD.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  v_when := TO_CHAR(NEW.event_date, 'FMDay, FMDD FMMon');

  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    p.id,
    'community_event_cancelled',
    'Community event cancelled',
    '"' || NEW.title || '" on ' || v_when || ' has been cancelled.'
      || COALESCE(' ' || NULLIF(TRIM(NEW.cancellation_note), ''), ''),
    jsonb_build_object('event_id', NEW.id, 'category', NEW.category)
  FROM public.profiles p
  WHERE p.community_id = NEW.community_id
    AND p.id IS DISTINCT FROM NEW.created_by
    AND p.removed_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_community_event_cancelled ON public.community_events;
CREATE TRIGGER on_community_event_cancelled
  AFTER UPDATE OF status ON public.community_events
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_community_event_cancelled();

NOTIFY pgrst, 'reload schema';
