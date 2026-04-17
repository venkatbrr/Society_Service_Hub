-- Fix: Replace incremental avg_rating formula with accurate recalculation
-- The old trigger used incremental math that could drift with NUMERIC(2,1) precision

CREATE OR REPLACE FUNCTION update_provider_rating()
RETURNS TRIGGER AS $$
DECLARE
  target_provider_id UUID;
BEGIN
  -- Determine which provider to update
  IF TG_OP = 'DELETE' THEN
    target_provider_id := OLD.provider_id;
  ELSE
    target_provider_id := NEW.provider_id;
  END IF;

  -- Skip if this is a business rating (no provider_id)
  IF target_provider_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Recalculate from scratch — always accurate
  UPDATE public.service_providers
  SET rating_count = (
        SELECT COUNT(*) FROM public.ratings WHERE provider_id = target_provider_id
      ),
      avg_rating = COALESCE(
        (SELECT ROUND(AVG(rating)::numeric, 1) FROM public.ratings WHERE provider_id = target_provider_id),
        0
      )
  WHERE id = target_provider_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
