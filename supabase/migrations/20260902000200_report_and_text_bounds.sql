-- Migration: 20260902000200_report_and_text_bounds.sql
-- M3: Add CHECK constraints on provider_reports, ratings, and service_providers text fields.

ALTER TABLE public.provider_reports DROP CONSTRAINT IF EXISTS provider_reports_reason_check;
ALTER TABLE public.provider_reports ADD CONSTRAINT provider_reports_reason_check
  CHECK (reason IN ('wrong_info','spam','inappropriate','unavailable','other'));

ALTER TABLE public.provider_reports DROP CONSTRAINT IF EXISTS provider_reports_status_check;
ALTER TABLE public.provider_reports ADD CONSTRAINT provider_reports_status_check
  CHECK (status IN ('pending','reviewed','dismissed'));

ALTER TABLE public.provider_reports DROP CONSTRAINT IF EXISTS provider_reports_details_len;
ALTER TABLE public.provider_reports ADD CONSTRAINT provider_reports_details_len
  CHECK (details IS NULL OR length(details) <= 500);

ALTER TABLE public.ratings DROP CONSTRAINT IF EXISTS ratings_review_text_len;
ALTER TABLE public.ratings ADD CONSTRAINT ratings_review_text_len
  CHECK (review_text IS NULL OR length(review_text) <= 1000);

ALTER TABLE public.service_providers DROP CONSTRAINT IF EXISTS service_providers_name_len;
ALTER TABLE public.service_providers ADD CONSTRAINT service_providers_name_len
  CHECK (length(name) BETWEEN 2 AND 80);

ALTER TABLE public.service_providers DROP CONSTRAINT IF EXISTS service_providers_description_len;
ALTER TABLE public.service_providers ADD CONSTRAINT service_providers_description_len
  CHECK (description IS NULL OR length(description) <= 1000);

NOTIFY pgrst, 'reload schema';
