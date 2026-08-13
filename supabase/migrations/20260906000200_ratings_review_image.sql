-- supabase/migrations/20260906000200_ratings_review_image.sql
--
-- One optional photo on a community business review. Existing RLS on
-- `ratings` already covers the new column — no policy change needed.

ALTER TABLE public.ratings
  ADD COLUMN IF NOT EXISTS image_url TEXT;

NOTIFY pgrst, 'reload schema';
