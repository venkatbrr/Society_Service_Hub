-- Carpool notifications, co-passenger roster RPC, and ride cancellation cascade.

-- ---------------------------------------------------------------------------
-- 1. Co-passenger roster for society members (names and flats, NO phone numbers).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_mcn_carpool_passengers(p_carpool_id UUID)
RETURNS TABLE (passenger_name TEXT, passenger_flat TEXT, seats INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.rider_name, r.flat_number, r.seats_requested
  FROM public.mcn_carpool_requests r
  JOIN public.mcn_carpools c ON c.id = r.carpool_id
  WHERE r.carpool_id = p_carpool_id
    AND r.status = 'accepted'
    AND (
      c.community_id = public.get_user_community_id()
      OR public.is_platform_admin(auth.uid())
    )
  ORDER BY r.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_mcn_carpool_passengers(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Notification trigger on new carpool join request (notifies host).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_mcn_carpool_request_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host_id UUID;
  v_title   TEXT;
BEGIN
  SELECT created_by, title INTO v_host_id, v_title
  FROM public.mcn_carpools
  WHERE id = NEW.carpool_id;

  IF v_host_id IS NOT NULL AND v_host_id <> NEW.rider_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_host_id,
      'carpool_request',
      'Carpool Request',
      NEW.rider_name || ' (' || NEW.flat_number || ') asked for ' || NEW.seats_requested || ' seat(s) on ' || v_title || '.',
      jsonb_build_object('carpool_id', NEW.carpool_id, 'request_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_mcn_carpool_request_created ON public.mcn_carpool_requests;
CREATE TRIGGER on_mcn_carpool_request_created
  AFTER INSERT ON public.mcn_carpool_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_mcn_carpool_request_created();

-- ---------------------------------------------------------------------------
-- 3. Notification trigger on carpool request status change.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_mcn_carpool_request_status_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host_id UUID;
  v_title   TEXT;
BEGIN
  SELECT created_by, title INTO v_host_id, v_title
  FROM public.mcn_carpools
  WHERE id = NEW.carpool_id;

  IF NEW.status = 'accepted' THEN
    -- Notify rider
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.rider_id,
      'carpool_request_accepted',
      'Seat Confirmed',
      'Your seat on ' || v_title || ' is confirmed.',
      jsonb_build_object('carpool_id', NEW.carpool_id, 'request_id', NEW.id)
    );
  ELSIF NEW.status = 'rejected' THEN
    -- Notify rider
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.rider_id,
      'carpool_request_rejected',
      'Request Declined',
      'The host could not accept your request for ' || v_title || '.',
      jsonb_build_object('carpool_id', NEW.carpool_id, 'request_id', NEW.id)
    );
  ELSIF NEW.status = 'cancelled' AND OLD.status = 'accepted' AND auth.uid() = NEW.rider_id THEN
    -- Rider cancelled an accepted seat -> notify host
    IF v_host_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_host_id,
        'carpool_request_cancelled',
        'Booking Cancelled',
        NEW.rider_name || ' (' || NEW.flat_number || ') cancelled their seat on ' || v_title || '.',
        jsonb_build_object('carpool_id', NEW.carpool_id, 'request_id', NEW.id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_mcn_carpool_request_status ON public.mcn_carpool_requests;
CREATE TRIGGER on_mcn_carpool_request_status
  AFTER UPDATE ON public.mcn_carpool_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.handle_mcn_carpool_request_status_changed();

-- ---------------------------------------------------------------------------
-- 4. Notification trigger and booking cascade on carpool status change.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_mcn_carpool_status_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  IF NEW.status = 'cancelled' THEN
    -- Notify all confirmed riders before or during cascade
    FOR r IN (
      SELECT rider_id FROM public.mcn_carpool_requests
      WHERE carpool_id = NEW.id AND status = 'accepted'
    ) LOOP
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        r.rider_id,
        'carpool_cancelled',
        'Carpool Cancelled',
        NEW.title || ' has been cancelled by the host.',
        jsonb_build_object('carpool_id', NEW.id)
      );
    END LOOP;

    -- Cascade request cancellation
    UPDATE public.mcn_carpool_requests
    SET status = 'cancelled'
    WHERE carpool_id = NEW.id
      AND status IN ('pending', 'accepted');

  ELSIF NEW.status = 'paused' THEN
    -- Notify all confirmed riders
    FOR r IN (
      SELECT rider_id FROM public.mcn_carpool_requests
      WHERE carpool_id = NEW.id AND status = 'accepted'
    ) LOOP
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        r.rider_id,
        'carpool_paused',
        'Carpool Paused',
        NEW.title || ' has been paused temporarily by the host.',
        jsonb_build_object('carpool_id', NEW.id)
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_mcn_carpool_status ON public.mcn_carpools;
CREATE TRIGGER on_mcn_carpool_status
  AFTER UPDATE ON public.mcn_carpools
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('cancelled', 'paused'))
  EXECUTE FUNCTION public.handle_mcn_carpool_status_changed();

NOTIFY pgrst, 'reload schema';
