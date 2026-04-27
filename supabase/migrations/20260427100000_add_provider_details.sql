-- Add JSONB details column to service_providers for category-specific metadata
ALTER TABLE public.service_providers
ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::JSONB;

-- Add a comment for documentation
COMMENT ON COLUMN public.service_providers.details IS 'Category-specific optional details (cuisine, salary, specialization, etc.) stored as key-value JSON';
