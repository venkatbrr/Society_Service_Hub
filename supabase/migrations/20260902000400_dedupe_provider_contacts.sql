-- Migration: 20260902000400_dedupe_provider_contacts.sql
-- M5: Add generated contact_date column and unique index for one contact per (user, provider, day).

ALTER TABLE public.provider_hires
  ADD COLUMN IF NOT EXISTS contact_date DATE
    GENERATED ALWAYS AS ((created_at AT TIME ZONE 'Asia/Kolkata')::date) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS provider_hires_user_provider_day_uniq
  ON public.provider_hires (user_id, provider_id, contact_date);

NOTIFY pgrst, 'reload schema';
