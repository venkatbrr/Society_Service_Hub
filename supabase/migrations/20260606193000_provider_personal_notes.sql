-- ============================================================
-- Private per-user notes for service providers
-- ------------------------------------------------------------
-- - One note per (user, provider)
-- - User-scoped RLS (only author can read/write/delete)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.provider_personal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  note TEXT CHECK (note IS NULL OR length(note) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider_id)
);

CREATE INDEX IF NOT EXISTS provider_personal_notes_provider_idx
  ON public.provider_personal_notes (provider_id);

ALTER TABLE public.provider_personal_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own provider notes" ON public.provider_personal_notes;
CREATE POLICY "Users can view own provider notes"
  ON public.provider_personal_notes
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own provider notes" ON public.provider_personal_notes;
CREATE POLICY "Users can insert own provider notes"
  ON public.provider_personal_notes
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own provider notes" ON public.provider_personal_notes;
CREATE POLICY "Users can update own provider notes"
  ON public.provider_personal_notes
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own provider notes" ON public.provider_personal_notes;
CREATE POLICY "Users can delete own provider notes"
  ON public.provider_personal_notes
  FOR DELETE
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_provider_personal_notes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS provider_personal_notes_updated_at_trigger ON public.provider_personal_notes;
CREATE TRIGGER provider_personal_notes_updated_at_trigger
  BEFORE UPDATE ON public.provider_personal_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_provider_personal_notes_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_personal_notes TO authenticated;
