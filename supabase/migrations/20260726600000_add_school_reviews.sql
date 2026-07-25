-- Migration to add school_reviews table and update aggregate scores on schools table

-- 1. Add aggregate aspect score columns and review_count to schools table
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS avg_academics NUMERIC(2,1) DEFAULT 0;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS avg_teachers NUMERIC(2,1) DEFAULT 0;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS avg_infrastructure NUMERIC(2,1) DEFAULT 0;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS avg_safety NUMERIC(2,1) DEFAULT 0;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS avg_transport NUMERIC(2,1) DEFAULT 0;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS avg_value NUMERIC(2,1) DEFAULT 0;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS avg_happiness NUMERIC(2,1) DEFAULT 0;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;

-- 2. Create school_reviews table
CREATE TABLE IF NOT EXISTS public.school_reviews (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id               UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id                 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  community_id            UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  child_grade             TEXT NOT NULL,
  academics_score         INTEGER NOT NULL CHECK (academics_score >= 1 AND academics_score <= 5),
  teachers_score          INTEGER NOT NULL CHECK (teachers_score >= 1 AND teachers_score <= 5),
  infrastructure_score    INTEGER NOT NULL CHECK (infrastructure_score >= 1 AND infrastructure_score <= 5),
  safety_score            INTEGER NOT NULL CHECK (safety_score >= 1 AND safety_score <= 5),
  transport_score         INTEGER NOT NULL CHECK (transport_score >= 1 AND transport_score <= 5),
  value_score             INTEGER NOT NULL CHECK (value_score >= 1 AND value_score <= 5),
  happiness_score         INTEGER NOT NULL CHECK (happiness_score >= 1 AND happiness_score <= 5),
  academics_comment       TEXT,
  teachers_comment        TEXT,
  infrastructure_comment  TEXT,
  safety_comment          TEXT,
  transport_comment       TEXT,
  value_comment           TEXT,
  happiness_comment       TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, school_id)
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS school_reviews_school_idx ON public.school_reviews(school_id);
CREATE INDEX IF NOT EXISTS school_reviews_community_idx ON public.school_reviews(community_id);
CREATE INDEX IF NOT EXISTS school_reviews_user_idx ON public.school_reviews(user_id);

-- 3. Enable RLS
ALTER TABLE public.school_reviews ENABLE ROW LEVEL SECURITY;

-- 4. Define RLS Policies
DROP POLICY IF EXISTS "school_reviews_select" ON public.school_reviews;
CREATE POLICY "school_reviews_select"
  ON public.school_reviews FOR SELECT
  USING (community_id = get_user_community_id());

DROP POLICY IF EXISTS "school_reviews_insert" ON public.school_reviews;
CREATE POLICY "school_reviews_insert"
  ON public.school_reviews FOR INSERT
  WITH CHECK (community_id = get_user_community_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS "school_reviews_update" ON public.school_reviews;
CREATE POLICY "school_reviews_update"
  ON public.school_reviews FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "school_reviews_delete" ON public.school_reviews;
CREATE POLICY "school_reviews_delete"
  ON public.school_reviews FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND app_role = 'community_lead' AND community_id = get_user_community_id()
    )
  );

-- 5. Function & Trigger to update aggregate aspect scores on schools
CREATE OR REPLACE FUNCTION update_school_aspect_averages()
RETURNS TRIGGER AS $$
DECLARE
  target_school_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_school_id := OLD.school_id;
  ELSE
    target_school_id := NEW.school_id;
  END IF;

  UPDATE public.schools
  SET
    review_count = COALESCE((SELECT COUNT(*) FROM public.school_reviews WHERE school_id = target_school_id), 0),
    avg_academics = COALESCE((SELECT ROUND(AVG(academics_score)::numeric, 1) FROM public.school_reviews WHERE school_id = target_school_id), 0),
    avg_teachers = COALESCE((SELECT ROUND(AVG(teachers_score)::numeric, 1) FROM public.school_reviews WHERE school_id = target_school_id), 0),
    avg_infrastructure = COALESCE((SELECT ROUND(AVG(infrastructure_score)::numeric, 1) FROM public.school_reviews WHERE school_id = target_school_id), 0),
    avg_safety = COALESCE((SELECT ROUND(AVG(safety_score)::numeric, 1) FROM public.school_reviews WHERE school_id = target_school_id), 0),
    avg_transport = COALESCE((SELECT ROUND(AVG(transport_score)::numeric, 1) FROM public.school_reviews WHERE school_id = target_school_id), 0),
    avg_value = COALESCE((SELECT ROUND(AVG(value_score)::numeric, 1) FROM public.school_reviews WHERE school_id = target_school_id), 0),
    avg_happiness = COALESCE((SELECT ROUND(AVG(happiness_score)::numeric, 1) FROM public.school_reviews WHERE school_id = target_school_id), 0),
    updated_at = now()
  WHERE id = target_school_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_school_review_change ON public.school_reviews;
CREATE TRIGGER on_school_review_change
AFTER INSERT OR UPDATE OR DELETE ON public.school_reviews
FOR EACH ROW EXECUTE FUNCTION update_school_aspect_averages();

-- 6. Reload schema cache
NOTIFY pgrst, 'reload schema';
