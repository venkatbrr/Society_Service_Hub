-- Follow-up to 20260917000000: the broadcast every resident receives when a
-- neighbour publishes still read "New food drop".
--
-- The `food_drops` channel key and the `drop_posted` type are untouched —
-- they are stored values that existing notification_preferences rows and the
-- client's mute toggle both match on.

CREATE OR REPLACE FUNCTION public.handle_drop_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_host TEXT;
  v_when TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM 'open' OR NEW.flagged_for_review_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(full_name), ''), 'A neighbour')
  INTO v_host
  FROM public.profiles
  WHERE id = NEW.created_by;

  v_when := TO_CHAR(NEW.fulfillment_date, 'FMDay, FMDD FMMon');

  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    p.id,
    'drop_posted',
    'New menu',
    COALESCE(v_host, 'A neighbour') || ' is cooking "' || NEW.title || '" for ' || v_when || '.',
    jsonb_build_object('drop_id', NEW.id)
  FROM public.profiles p
  WHERE p.community_id = NEW.community_id
    AND p.id IS DISTINCT FROM NEW.created_by
    AND p.removed_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_preferences np
      WHERE np.user_id = p.id AND np.channel = 'food_drops' AND np.muted
    );

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
