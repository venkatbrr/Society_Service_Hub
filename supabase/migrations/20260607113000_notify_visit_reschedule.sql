-- Notify community members when a visit is rescheduled (date/time changes)
CREATE OR REPLACE FUNCTION public.handle_visit_rescheduled_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    p.id,
    'visit_rescheduled',
    'Visit Rescheduled',
    COALESCE((SELECT full_name FROM public.profiles WHERE id = NEW.created_by), 'A neighbor')
      || ' rescheduled a '
      || NEW.category
      || ' visit to '
      || NEW.visit_date
      || ' ('
      || COALESCE(NEW.visit_time_slot, 'time TBD')
      || ').',
    jsonb_build_object(
      'visit_id', NEW.id,
      'visit_date', NEW.visit_date,
      'visit_time_slot', NEW.visit_time_slot
    )
  FROM public.profiles p
  WHERE p.community_id = NEW.community_id
    AND p.id <> NEW.created_by;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_service_visit_rescheduled ON public.service_visits;

CREATE TRIGGER on_service_visit_rescheduled
AFTER UPDATE ON public.service_visits
FOR EACH ROW
WHEN (
  OLD.visit_date IS DISTINCT FROM NEW.visit_date
  OR OLD.visit_time_slot IS DISTINCT FROM NEW.visit_time_slot
)
EXECUTE FUNCTION public.handle_visit_rescheduled_notification();
