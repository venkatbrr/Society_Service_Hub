-- Feature 1: Household Log (user-scoped service history)

CREATE TABLE IF NOT EXISTS public.user_service_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.user_services(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  serviced_on date NOT NULL CHECK (serviced_on <= CURRENT_DATE),
  provider_id uuid REFERENCES public.service_providers(id) ON DELETE SET NULL,
  provider_name_snapshot text,
  cost_paid numeric(10,2) CHECK (cost_paid IS NULL OR cost_paid >= 0),
  note text CHECK (note IS NULL OR length(note) <= 280),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_service_history_user_serviced_on
  ON public.user_service_history(user_id, serviced_on DESC);

CREATE INDEX IF NOT EXISTS idx_user_service_history_service_serviced_on
  ON public.user_service_history(service_id, serviced_on DESC);

ALTER TABLE public.user_service_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_service_history_select_own ON public.user_service_history;
CREATE POLICY user_service_history_select_own ON public.user_service_history
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_service_history_insert_own ON public.user_service_history;
CREATE POLICY user_service_history_insert_own ON public.user_service_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_service_history_update_own ON public.user_service_history;
CREATE POLICY user_service_history_update_own ON public.user_service_history
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_service_history_delete_own ON public.user_service_history;
CREATE POLICY user_service_history_delete_own ON public.user_service_history
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.mark_service_done(
  p_service_id uuid,
  p_provider_id uuid DEFAULT NULL,
  p_cost_paid numeric DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS public.user_services
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.user_services;
  v_provider_name text;
BEGIN
  UPDATE public.user_services
  SET last_serviced_on = CURRENT_DATE,
      notified_at = NULL
  WHERE id = p_service_id
    AND user_id = auth.uid()
  RETURNING * INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found or not owned by caller';
  END IF;

  IF p_provider_id IS NOT NULL THEN
    SELECT sp.name
    INTO v_provider_name
    FROM public.service_providers sp
    WHERE sp.id = p_provider_id;
  END IF;

  INSERT INTO public.user_service_history (
    service_id,
    user_id,
    serviced_on,
    provider_id,
    provider_name_snapshot,
    cost_paid,
    note
  ) VALUES (
    v_result.id,
    v_result.user_id,
    CURRENT_DATE,
    p_provider_id,
    v_provider_name,
    p_cost_paid,
    CASE
      WHEN p_note IS NULL OR length(btrim(p_note)) = 0 THEN NULL
      ELSE left(btrim(p_note), 280)
    END
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_service_history(p_service_id uuid)
RETURNS TABLE (
  id uuid,
  service_id uuid,
  serviced_on date,
  provider_id uuid,
  provider_name_snapshot text,
  provider_name text,
  cost_paid numeric,
  note text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    h.id,
    h.service_id,
    h.serviced_on,
    h.provider_id,
    h.provider_name_snapshot,
    COALESCE(h.provider_name_snapshot, sp.name) AS provider_name,
    h.cost_paid,
    h.note,
    h.created_at
  FROM public.user_service_history h
  LEFT JOIN public.service_providers sp ON sp.id = h.provider_id
  WHERE h.service_id = p_service_id
    AND EXISTS (
      SELECT 1
      FROM public.user_services s
      WHERE s.id = p_service_id
        AND s.user_id = auth.uid()
    )
  ORDER BY h.serviced_on DESC, h.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_my_recent_service_history(p_limit integer DEFAULT 20)
RETURNS TABLE (
  id uuid,
  service_id uuid,
  service_name text,
  serviced_on date,
  provider_id uuid,
  provider_name_snapshot text,
  provider_name text,
  cost_paid numeric,
  note text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    h.id,
    h.service_id,
    s.service_name,
    h.serviced_on,
    h.provider_id,
    h.provider_name_snapshot,
    COALESCE(h.provider_name_snapshot, sp.name) AS provider_name,
    h.cost_paid,
    h.note,
    h.created_at
  FROM public.user_service_history h
  JOIN public.user_services s
    ON s.id = h.service_id
   AND s.user_id = auth.uid()
  LEFT JOIN public.service_providers sp ON sp.id = h.provider_id
  WHERE h.user_id = auth.uid()
  ORDER BY h.serviced_on DESC, h.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 20), 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_service_history(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_recent_service_history(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_service_done(uuid, uuid, numeric, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
