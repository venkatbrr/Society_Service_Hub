-- Fix: Replace partial unique index with proper unique constraint for ratings
-- PostgREST upsert requires a real UNIQUE constraint, not a partial index

-- Drop the partial unique index
DROP INDEX IF EXISTS ratings_user_business_idx;

-- Add a proper unique constraint (the CHECK constraint on the table already ensures
-- that exactly one of provider_id/business_id is set, so this won't conflict
-- with the existing UNIQUE(user_id, provider_id) constraint)
ALTER TABLE public.ratings
  ADD CONSTRAINT ratings_user_id_business_id_key UNIQUE (user_id, business_id);
