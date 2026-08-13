-- supabase/migrations/20260906000100_parent_corner_school_catalog.sql
--
-- Links a Parent Corner entry to data/westHyderabadSchools.ts when the parent
-- picked from the searchable school catalog instead of typing a free-text
-- name ("Other"). Nullable, no backfill — existing rows keep free-text only.
-- The catalog id (e.g. "wh_school_1") is a plain string, not a foreign key,
-- since the catalog lives in app code, not the database.

ALTER TABLE public.mcn_parent_corner
  ADD COLUMN IF NOT EXISTS school_catalog_id TEXT;

NOTIFY pgrst, 'reload schema';
