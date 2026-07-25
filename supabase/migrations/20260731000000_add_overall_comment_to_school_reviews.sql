-- Migration to add overall_comment to school_reviews table
ALTER TABLE public.school_reviews
ADD COLUMN IF NOT EXISTS overall_comment TEXT;
