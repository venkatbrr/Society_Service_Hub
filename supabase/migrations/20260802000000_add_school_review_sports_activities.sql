-- Add sports and activities feedback fields to parent report cards.

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS avg_sports_activities NUMERIC(2,1) DEFAULT 0;

ALTER TABLE public.school_reviews
  ADD COLUMN IF NOT EXISTS sports_activities_score INTEGER
    CHECK (sports_activities_score >= 1 AND sports_activities_score <= 5),
  ADD COLUMN IF NOT EXISTS sports_activities_comment TEXT;

UPDATE public.school_reviews
SET sports_activities_score = COALESCE(sports_activities_score, 4)
WHERE sports_activities_score IS NULL;

ALTER TABLE public.school_reviews
  ALTER COLUMN sports_activities_score SET NOT NULL;

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

  IF target_school_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    UPDATE public.schools
    SET
      review_count = COALESCE((SELECT COUNT(*) FROM public.school_reviews WHERE school_id = target_school_id), 0),
      avg_academics = COALESCE((SELECT ROUND(AVG(academics_score)::numeric, 1) FROM public.school_reviews WHERE school_id = target_school_id), 0),
      avg_teachers = COALESCE((SELECT ROUND(AVG(teachers_score)::numeric, 1) FROM public.school_reviews WHERE school_id = target_school_id), 0),
      avg_infrastructure = COALESCE((SELECT ROUND(AVG(infrastructure_score)::numeric, 1) FROM public.school_reviews WHERE school_id = target_school_id), 0),
      avg_sports_activities = COALESCE((SELECT ROUND(AVG(sports_activities_score)::numeric, 1) FROM public.school_reviews WHERE school_id = target_school_id), 0),
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

-- Backfill aggregate values for existing schools.
UPDATE public.schools s
SET
  review_count = COALESCE((SELECT COUNT(*) FROM public.school_reviews r WHERE r.school_id = s.id::text), 0),
  avg_academics = COALESCE((SELECT ROUND(AVG(r.academics_score)::numeric, 1) FROM public.school_reviews r WHERE r.school_id = s.id::text), 0),
  avg_teachers = COALESCE((SELECT ROUND(AVG(r.teachers_score)::numeric, 1) FROM public.school_reviews r WHERE r.school_id = s.id::text), 0),
  avg_infrastructure = COALESCE((SELECT ROUND(AVG(r.infrastructure_score)::numeric, 1) FROM public.school_reviews r WHERE r.school_id = s.id::text), 0),
  avg_sports_activities = COALESCE((SELECT ROUND(AVG(r.sports_activities_score)::numeric, 1) FROM public.school_reviews r WHERE r.school_id = s.id::text), 0),
  avg_safety = COALESCE((SELECT ROUND(AVG(r.safety_score)::numeric, 1) FROM public.school_reviews r WHERE r.school_id = s.id::text), 0),
  avg_transport = COALESCE((SELECT ROUND(AVG(r.transport_score)::numeric, 1) FROM public.school_reviews r WHERE r.school_id = s.id::text), 0),
  avg_value = COALESCE((SELECT ROUND(AVG(r.value_score)::numeric, 1) FROM public.school_reviews r WHERE r.school_id = s.id::text), 0),
  avg_happiness = COALESCE((SELECT ROUND(AVG(r.happiness_score)::numeric, 1) FROM public.school_reviews r WHERE r.school_id = s.id::text), 0),
  updated_at = now();

NOTIFY pgrst, 'reload schema';
