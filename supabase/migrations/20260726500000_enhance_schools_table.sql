-- Migration to enhance schools table with area_locality, address, google_rating, and google_maps_link
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS area_locality TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS google_rating TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS google_maps_link TEXT;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
