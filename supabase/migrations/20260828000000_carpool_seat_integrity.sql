-- Carpool seat integrity.
--
-- Before this migration, app/mcn/carpools/[id].tsx mutated mcn_carpools.available_seats
-- on every accept/reject/cancel, treating the published capacity column as a live
-- remaining-seats counter. That (a) destroyed the original capacity, (b) inflated it above
-- the original on release because the decrement clamped at 0 while the increment did not,
-- (c) had no capacity check at all, and (d) hit the CHECK (available_seats >= 1) constraint
-- when accepting the last seat, with the error discarded client-side.
--
-- After this migration available_seats is IMMUTABLE CAPACITY. Occupancy is derived.
-- The client must stop writing it (see app/mcn/carpools/[id].tsx).

-- ---------------------------------------------------------------------------
-- 1. Best-effort repair of drifted capacities.
--    Restores capacity = current value + seats currently held by accepted requests.
-- ---------------------------------------------------------------------------
UPDATE public.mcn_carpools c
SET available_seats = LEAST(6, c.available_seats + a.booked)
FROM (
  SELECT r.carpool_id, SUM(r.seats_requested)::INT AS booked
  FROM public.mcn_carpool_requests r
  WHERE r.status = 'accepted'
  GROUP BY r.carpool_id
) a
WHERE a.carpool_id = c.id;

-- ---------------------------------------------------------------------------
-- 2. Derived seat availability. OUT params are deliberately named differently from
--    the available_seats column to avoid the RETURNS TABLE shadowing trap.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_mcn_carpool_seats(p_carpool_id UUID)
RETURNS TABLE (total_seats INT, booked_seats INT, remaining_seats INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.available_seats AS total_seats,
    COALESCE(SUM(r.seats_requested) FILTER (WHERE r.status = 'accepted'), 0)::INT AS booked_seats,
    GREATEST(
      c.available_seats
        - COALESCE(SUM(r.seats_requested) FILTER (WHERE r.status = 'accepted'), 0),
      0
    )::INT AS remaining_seats
  FROM public.mcn_carpools c
  LEFT JOIN public.mcn_carpool_requests r ON r.carpool_id = c.id
  WHERE c.id = p_carpool_id
    AND (
      c.community_id = public.get_user_community_id()
      OR public.is_platform_admin(auth.uid())
    )
  GROUP BY c.id, c.available_seats;
$$;

GRANT EXECUTE ON FUNCTION public.get_mcn_carpool_seats(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Server-side validity + capacity enforcement on join requests.
--    SECURITY DEFINER is mandatory: the aggregate below spans OTHER riders' rows,
--    which the caller cannot see under mcn_carpool_requests_select.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_mcn_carpool_request_validity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carpool   public.mcn_carpools%ROWTYPE;
  v_booked    INT;
  v_remaining INT;
BEGIN
  SELECT * INTO v_carpool FROM public.mcn_carpools WHERE id = NEW.carpool_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This ride no longer exists.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_carpool.role_type <> 'offering' THEN
      RAISE EXCEPTION 'You can only request a seat on a ride that is offering seats.';
    END IF;
    IF v_carpool.status <> 'active' THEN
      RAISE EXCEPTION 'This ride is % and is not accepting requests.', v_carpool.status;
    END IF;
    IF NEW.rider_id = v_carpool.created_by THEN
      RAISE EXCEPTION 'You cannot request a seat on your own ride.';
    END IF;
    IF NEW.community_id <> v_carpool.community_id THEN
      RAISE EXCEPTION 'This ride belongs to a different community.';
    END IF;
  END IF;

  IF NEW.seats_requested > v_carpool.available_seats THEN
    RAISE EXCEPTION 'This ride has only % seat(s) in total.', v_carpool.available_seats;
  END IF;

  -- Capacity is only consumed by acceptance.
  IF NEW.status = 'accepted'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'accepted') THEN

    SELECT COALESCE(SUM(r.seats_requested), 0)::INT
      INTO v_booked
    FROM public.mcn_carpool_requests r
    WHERE r.carpool_id = NEW.carpool_id
      AND r.status = 'accepted'
      AND r.id <> NEW.id;

    v_remaining := v_carpool.available_seats - v_booked;

    IF NEW.seats_requested > v_remaining THEN
      RAISE EXCEPTION
        'Only % seat(s) left on this ride, but % were requested.',
        v_remaining, NEW.seats_requested;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mcn_carpool_request_validity ON public.mcn_carpool_requests;
CREATE TRIGGER mcn_carpool_request_validity
  BEFORE INSERT OR UPDATE ON public.mcn_carpool_requests
  FOR EACH ROW EXECUTE FUNCTION public.check_mcn_carpool_request_validity();

-- ---------------------------------------------------------------------------
-- 4. Column-level authorization on requests.
--    The RLS UPDATE policy is column-blind (no WITH CHECK), so a rider could PATCH
--    their own row to status='accepted'. RLS cannot see OLD, so the rules live here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_mcn_carpool_request_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host   UUID;
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT c.created_by INTO v_host
  FROM public.mcn_carpools c
  WHERE c.id = OLD.carpool_id;

  -- Nobody may re-parent a request or move it between communities or riders.
  IF NEW.id           IS DISTINCT FROM OLD.id
     OR NEW.carpool_id   IS DISTINCT FROM OLD.carpool_id
     OR NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.rider_id     IS DISTINCT FROM OLD.rider_id THEN
    RAISE EXCEPTION 'A join request cannot be re-assigned.';
  END IF;

  IF v_caller = v_host OR public.is_community_lead(v_caller) OR public.is_platform_admin(v_caller) THEN
    -- Host (or lead/admin via moderation/cascade): may only move status, and only along legal edges.
    IF NEW.rider_name      IS DISTINCT FROM OLD.rider_name
       OR NEW.rider_phone     IS DISTINCT FROM OLD.rider_phone
       OR NEW.flat_number     IS DISTINCT FROM OLD.flat_number
       OR NEW.seats_requested IS DISTINCT FROM OLD.seats_requested
       OR NEW.note            IS DISTINCT FROM OLD.note THEN
      RAISE EXCEPTION 'A host may only change the status of a request.';
    END IF;

    IF NOT (
         OLD.status = NEW.status
      OR (OLD.status = 'pending'  AND NEW.status IN ('accepted', 'rejected', 'cancelled'))
      OR (OLD.status = 'accepted' AND NEW.status = 'cancelled')
    ) THEN
      RAISE EXCEPTION 'A host cannot move a request from % to %.', OLD.status, NEW.status;
    END IF;

  ELSIF v_caller = OLD.rider_id THEN
    -- Rider: may edit their own details while still pending, and may only ever cancel.
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'A rider may only cancel their own request.';
    END IF;

    IF OLD.status <> 'pending'
       AND (NEW.rider_name      IS DISTINCT FROM OLD.rider_name
         OR NEW.rider_phone     IS DISTINCT FROM OLD.rider_phone
         OR NEW.flat_number     IS DISTINCT FROM OLD.flat_number
         OR NEW.seats_requested IS DISTINCT FROM OLD.seats_requested
         OR NEW.note            IS DISTINCT FROM OLD.note) THEN
      RAISE EXCEPTION 'A request can only be edited while it is pending.';
    END IF;

  ELSE
    RAISE EXCEPTION 'Only the rider or the ride host can change this request.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mcn_carpool_request_transition ON public.mcn_carpool_requests;
CREATE TRIGGER mcn_carpool_request_transition
  BEFORE UPDATE ON public.mcn_carpool_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_mcn_carpool_request_transition();

-- ---------------------------------------------------------------------------
-- 5. Make "one open request per rider per ride" real.
--    Cancelled and rejected rows are excluded so a rider can re-apply.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS mcn_carpool_requests_one_open_idx
  ON public.mcn_carpool_requests (carpool_id, rider_id)
  WHERE status IN ('pending', 'accepted');

-- ---------------------------------------------------------------------------
-- 6. Pin carpool ownership and community on UPDATE.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "mcn_carpools_update" ON public.mcn_carpools;
CREATE POLICY "mcn_carpools_update"
  ON public.mcn_carpools FOR UPDATE
  USING (
    created_by = auth.uid()
    OR public.is_community_lead(auth.uid())
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    community_id = public.get_user_community_id()
    OR public.is_platform_admin(auth.uid())
  );

CREATE OR REPLACE FUNCTION public.enforce_mcn_carpool_immutables()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booked INT;
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'The owner of a ride cannot be changed.';
  END IF;
  IF NEW.community_id IS DISTINCT FROM OLD.community_id THEN
    RAISE EXCEPTION 'A ride cannot be moved to another community.';
  END IF;

  -- Capacity may not drop below what is already booked.
  IF NEW.available_seats < OLD.available_seats THEN
    SELECT COALESCE(SUM(r.seats_requested), 0)::INT
      INTO v_booked
    FROM public.mcn_carpool_requests r
    WHERE r.carpool_id = OLD.id
      AND r.status = 'accepted';

    IF NEW.available_seats < v_booked THEN
      RAISE EXCEPTION
        'Cannot reduce capacity to % — % seat(s) are already confirmed.',
        NEW.available_seats, v_booked;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mcn_carpools_immutables ON public.mcn_carpools;
CREATE TRIGGER mcn_carpools_immutables
  BEFORE UPDATE ON public.mcn_carpools
  FOR EACH ROW EXECUTE FUNCTION public.enforce_mcn_carpool_immutables();

NOTIFY pgrst, 'reload schema';
