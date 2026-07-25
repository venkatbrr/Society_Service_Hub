-- Migration to change school_id in public.school_reviews from UUID to TEXT
-- so static/seeded school IDs like 'wh_school_1' can be reviewed seamlessly.

ALTER TABLE public.school_reviews DROP CONSTRAINT IF EXISTS school_reviews_school_id_fkey;
ALTER TABLE public.school_reviews ALTER COLUMN school_id TYPE TEXT;

-- Update trigger function to accept TEXT target_school_id without UUID cast error
CREATE OR REPLACE FUNCTION update_school_aspect_averages()
RETURNS TRIGGER AS $$
DECLARE
  target_school_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_school_id := OLD.school_id;
  ELSE
    target_school_id := NEW.school_id;
  END IF;

  -- Only update public.schools if target_school_id is a valid UUID format
  IF target_school_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
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
    WHERE id = target_school_id::uuid;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
