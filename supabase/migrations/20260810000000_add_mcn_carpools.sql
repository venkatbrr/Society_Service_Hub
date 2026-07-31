-- Migration to add MCN Carpools and Carpool Requests

-- 1. MCN Carpools Table
CREATE TABLE IF NOT EXISTS public.mcn_carpools (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id        UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_by          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,                         -- e.g. "Weekday Hitech City Commute"
  role_type           TEXT NOT NULL DEFAULT 'offering' CHECK (role_type IN ('offering', 'seeking')),
  start_point         TEXT NOT NULL,                         -- e.g. "Tower B / Main Gate"
  end_point           TEXT NOT NULL,                         -- e.g. "Mindspace IT Park, Hitech City"
  departure_time      TEXT NOT NULL,                         -- e.g. "08:30 AM"
  return_time         TEXT,                                  -- e.g. "06:00 PM"
  recurring_days      TEXT[] NOT NULL DEFAULT '{}',          -- e.g. ARRAY['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  available_seats     INTEGER NOT NULL DEFAULT 1 CHECK (available_seats >= 1),
  vehicle_info        TEXT,                                  -- e.g. "White Honda City (TS 09 AB 1234)"
  notes               TEXT,                                  -- e.g. "AC, non-smoking, fuel cost sharing"
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'completed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS mcn_carpools_community_idx ON public.mcn_carpools(community_id, status);
CREATE INDEX IF NOT EXISTS mcn_carpools_creator_idx ON public.mcn_carpools(created_by);

-- 2. Carpool Join Requests Table
CREATE TABLE IF NOT EXISTS public.mcn_carpool_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carpool_id          UUID NOT NULL REFERENCES public.mcn_carpools(id) ON DELETE CASCADE,
  community_id        UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  rider_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rider_name          TEXT NOT NULL,
  rider_phone         TEXT NOT NULL,
  flat_number         TEXT NOT NULL,
  seats_requested     INTEGER NOT NULL DEFAULT 1 CHECK (seats_requested >= 1),
  note                TEXT,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcn_carpool_requests_carpool_idx ON public.mcn_carpool_requests(carpool_id, status);
CREATE INDEX IF NOT EXISTS mcn_carpool_requests_rider_idx ON public.mcn_carpool_requests(rider_id);

-- RLS Setup
ALTER TABLE public.mcn_carpools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcn_carpool_requests ENABLE ROW LEVEL SECURITY;

-- Policies for mcn_carpools
DROP POLICY IF EXISTS "mcn_carpools_select" ON public.mcn_carpools;
CREATE POLICY "mcn_carpools_select"
  ON public.mcn_carpools FOR SELECT
  USING (community_id = get_user_community_id());

DROP POLICY IF EXISTS "mcn_carpools_insert" ON public.mcn_carpools;
CREATE POLICY "mcn_carpools_insert"
  ON public.mcn_carpools FOR INSERT
  WITH CHECK (community_id = get_user_community_id() AND created_by = auth.uid());

DROP POLICY IF EXISTS "mcn_carpools_update" ON public.mcn_carpools;
CREATE POLICY "mcn_carpools_update"
  ON public.mcn_carpools FOR UPDATE
  USING (created_by = auth.uid() OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND app_role = 'community_lead' AND community_id = get_user_community_id()
  ));

DROP POLICY IF EXISTS "mcn_carpools_delete" ON public.mcn_carpools;
CREATE POLICY "mcn_carpools_delete"
  ON public.mcn_carpools FOR DELETE
  USING (created_by = auth.uid() OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND app_role = 'community_lead' AND community_id = get_user_community_id()
  ));

-- Policies for mcn_carpool_requests
DROP POLICY IF EXISTS "mcn_carpool_requests_select" ON public.mcn_carpool_requests;
CREATE POLICY "mcn_carpool_requests_select"
  ON public.mcn_carpool_requests FOR SELECT
  USING (rider_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.mcn_carpools c WHERE c.id = carpool_id AND c.created_by = auth.uid()
  ));

DROP POLICY IF EXISTS "mcn_carpool_requests_insert" ON public.mcn_carpool_requests;
CREATE POLICY "mcn_carpool_requests_insert"
  ON public.mcn_carpool_requests FOR INSERT
  WITH CHECK (community_id = get_user_community_id() AND rider_id = auth.uid());

DROP POLICY IF EXISTS "mcn_carpool_requests_update" ON public.mcn_carpool_requests;
CREATE POLICY "mcn_carpool_requests_update"
  ON public.mcn_carpool_requests FOR UPDATE
  USING (rider_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.mcn_carpools c WHERE c.id = carpool_id AND c.created_by = auth.uid()
  ));

DROP POLICY IF EXISTS "mcn_carpool_requests_delete" ON public.mcn_carpool_requests;
CREATE POLICY "mcn_carpool_requests_delete"
  ON public.mcn_carpool_requests FOR DELETE
  USING (rider_id = auth.uid());

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION public.touch_mcn_carpools_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mcn_carpools_updated_at ON public.mcn_carpools;
CREATE TRIGGER mcn_carpools_updated_at
  BEFORE UPDATE ON public.mcn_carpools
  FOR EACH ROW EXECUTE FUNCTION public.touch_mcn_carpools_updated_at();

DROP TRIGGER IF EXISTS mcn_carpool_requests_updated_at ON public.mcn_carpool_requests;
CREATE TRIGGER mcn_carpool_requests_updated_at
  BEFORE UPDATE ON public.mcn_carpool_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_mcn_carpools_updated_at();

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
