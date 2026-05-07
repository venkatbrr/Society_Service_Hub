-- Feature 2: Hire Feedback Loop (private resident feedback + one-time public rating nudge memory)

CREATE TABLE IF NOT EXISTS public.hire_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hire_id uuid NOT NULL REFERENCES public.provider_hires(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  signal text NOT NULL CHECK (signal IN ('positive', 'negative', 'skipped')),
  note text CHECK (note IS NULL OR length(note) <= 280),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hire_id)
);

CREATE INDEX IF NOT EXISTS idx_hire_feedback_user_provider_created
  ON public.hire_feedback(user_id, provider_id, created_at DESC);

ALTER TABLE public.hire_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hire_feedback_select_own ON public.hire_feedback;
CREATE POLICY hire_feedback_select_own ON public.hire_feedback
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS hire_feedback_insert_own ON public.hire_feedback;
CREATE POLICY hire_feedback_insert_own ON public.hire_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS hire_feedback_update_own ON public.hire_feedback;
CREATE POLICY hire_feedback_update_own ON public.hire_feedback
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS hire_feedback_delete_own ON public.hire_feedback;
CREATE POLICY hire_feedback_delete_own ON public.hire_feedback
  FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.provider_public_rating_nudges (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  nudged_at timestamptz NOT NULL DEFAULT now(),
  outcome text CHECK (outcome IN ('rated', 'dismissed', 'pending')),
  PRIMARY KEY (user_id, provider_id)
);

ALTER TABLE public.provider_public_rating_nudges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_public_rating_nudges_select_own ON public.provider_public_rating_nudges;
CREATE POLICY provider_public_rating_nudges_select_own ON public.provider_public_rating_nudges
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS provider_public_rating_nudges_insert_own ON public.provider_public_rating_nudges;
CREATE POLICY provider_public_rating_nudges_insert_own ON public.provider_public_rating_nudges
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS provider_public_rating_nudges_update_own ON public.provider_public_rating_nudges;
CREATE POLICY provider_public_rating_nudges_update_own ON public.provider_public_rating_nudges
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS provider_public_rating_nudges_delete_own ON public.provider_public_rating_nudges;
CREATE POLICY provider_public_rating_nudges_delete_own ON public.provider_public_rating_nudges
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.record_hire_feedback(
  p_hire_id uuid,
  p_signal text,
  p_note text DEFAULT NULL
)
RETURNS public.hire_feedback
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hire public.provider_hires%ROWTYPE;
  v_row public.hire_feedback;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_signal NOT IN ('positive', 'negative', 'skipped') THEN
    RAISE EXCEPTION 'Invalid signal: %', p_signal;
  END IF;

  SELECT *
  INTO v_hire
  FROM public.provider_hires
  WHERE id = p_hire_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hire not found or not owned by caller';
  END IF;

  INSERT INTO public.hire_feedback (hire_id, user_id, provider_id, signal, note)
  VALUES (
    p_hire_id,
    auth.uid(),
    v_hire.provider_id,
    p_signal,
    CASE
      WHEN p_note IS NULL OR length(btrim(p_note)) = 0 THEN NULL
      ELSE left(btrim(p_note), 280)
    END
  )
  ON CONFLICT (hire_id)
  DO UPDATE SET
    signal = EXCLUDED.signal,
    note = EXCLUDED.note,
    user_id = EXCLUDED.user_id,
    provider_id = EXCLUDED.provider_id,
    created_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_provider_history(p_provider_id uuid)
RETURNS TABLE (
  hire_id uuid,
  created_at timestamptz,
  signal text,
  note text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ph.id AS hire_id,
    ph.created_at,
    hf.signal,
    hf.note
  FROM public.provider_hires ph
  LEFT JOIN public.hire_feedback hf ON hf.hire_id = ph.id
  WHERE ph.user_id = auth.uid()
    AND ph.provider_id = p_provider_id
  ORDER BY ph.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.should_show_public_rating_nudge(p_provider_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT EXISTS (
      SELECT 1
      FROM public.ratings r
      WHERE r.user_id = auth.uid()
        AND r.provider_id = p_provider_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.provider_public_rating_nudges n
      WHERE n.user_id = auth.uid()
        AND n.provider_id = p_provider_id
    );
$$;

CREATE OR REPLACE FUNCTION public.mark_public_rating_nudge(
  p_provider_id uuid,
  p_outcome text
)
RETURNS public.provider_public_rating_nudges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.provider_public_rating_nudges;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_outcome NOT IN ('rated', 'dismissed', 'pending') THEN
    RAISE EXCEPTION 'Invalid outcome: %', p_outcome;
  END IF;

  INSERT INTO public.provider_public_rating_nudges (user_id, provider_id, outcome)
  VALUES (auth.uid(), p_provider_id, p_outcome)
  ON CONFLICT (user_id, provider_id)
  DO UPDATE SET
    outcome = EXCLUDED.outcome,
    nudged_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_hire_feedback(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_provider_history(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.should_show_public_rating_nudge(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_public_rating_nudge(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
