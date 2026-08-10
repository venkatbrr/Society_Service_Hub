-- Migration: 20260902000400_dedupe_provider_contacts.sql
-- M5: Add generated contact_date column and unique index for one contact per (user, provider, day).

ALTER TABLE public.provider_hires
  ADD COLUMN IF NOT EXISTS contact_date DATE
    GENERATED ALWAYS AS ((created_at AT TIME ZONE 'Asia/Kolkata')::date) STORED;

-- Existing rows can already violate the constraint: tapping "Contact" twice in a
-- row logged two hires the same day. Collapse those before adding the index, or
-- the CREATE fails on live data. Keep the row that carries feedback (hire_feedback
-- cascades on delete, so dropping it would destroy a real rating); otherwise keep
-- the earliest contact of that day.
WITH ranked AS (
  SELECT
    ph.id,
    row_number() OVER (
      PARTITION BY ph.user_id, ph.provider_id, ph.contact_date
      ORDER BY
        (SELECT count(*) FROM public.hire_feedback hf WHERE hf.hire_id = ph.id) DESC,
        ph.created_at ASC
    ) AS rn
  FROM public.provider_hires ph
)
DELETE FROM public.provider_hires
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS provider_hires_user_provider_day_uniq
  ON public.provider_hires (user_id, provider_id, contact_date);

NOTIFY pgrst, 'reload schema';
