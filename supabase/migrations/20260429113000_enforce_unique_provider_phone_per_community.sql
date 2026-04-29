-- Normalize provider phones and block duplicate providers by phone within a community.

CREATE OR REPLACE FUNCTION public.normalize_indian_mobile(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN NULL
    ELSE CASE
      WHEN RIGHT(regexp_replace(p_value, '\D', '', 'g'), 10) ~ '^[6-9][0-9]{9}$'
        THEN RIGHT(regexp_replace(p_value, '\D', '', 'g'), 10)
      ELSE NULL
    END
  END;
$$;

UPDATE public.service_providers
SET phone = public.normalize_indian_mobile(phone)
WHERE public.normalize_indian_mobile(phone) IS NOT NULL
  AND phone IS DISTINCT FROM public.normalize_indian_mobile(phone);

CREATE INDEX IF NOT EXISTS service_providers_community_phone_idx
  ON public.service_providers (community_id, phone);

CREATE OR REPLACE FUNCTION public.enforce_service_provider_phone_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_phone TEXT;
BEGIN
  normalized_phone := public.normalize_indian_mobile(NEW.phone);

  IF normalized_phone IS NULL THEN
    RAISE EXCEPTION 'Provider phone must be a valid 10-digit mobile number';
  END IF;

  NEW.phone := normalized_phone;

  IF EXISTS (
    SELECT 1
    FROM public.service_providers sp
    WHERE sp.community_id = NEW.community_id
      AND sp.phone = NEW.phone
      AND sp.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'A provider with this phone number already exists in your community';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_provider_phone_guard_trigger ON public.service_providers;
CREATE TRIGGER service_provider_phone_guard_trigger
  BEFORE INSERT OR UPDATE OF phone, community_id ON public.service_providers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_service_provider_phone_rules();

NOTIFY pgrst, 'reload schema';
