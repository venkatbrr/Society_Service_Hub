-- Carpool trip dates and numeric pricing.

-- 1. Trip date for one-off / outstation rides.
ALTER TABLE public.mcn_carpools
  ADD COLUMN IF NOT EXISTS trip_date DATE;

COMMENT ON COLUMN public.mcn_carpools.trip_date IS
  'Local calendar date for a one-off trip. NULL means the ride recurs on recurring_days.';

CREATE INDEX IF NOT EXISTS mcn_carpools_trip_date_idx
  ON public.mcn_carpools (community_id, trip_date)
  WHERE trip_date IS NOT NULL;

-- 2. Numeric price per seat column.
ALTER TABLE public.mcn_carpools
  ADD COLUMN IF NOT EXISTS price_per_seat_amount NUMERIC(10,2);

-- Backfill numeric values where possible
UPDATE public.mcn_carpools
SET price_per_seat_amount = NULLIF(regexp_replace(price_per_seat, '[^0-9.]', '', 'g'), '')::NUMERIC
WHERE pricing_type = 'paid'
  AND price_per_seat IS NOT NULL
  AND price_per_seat ~ '[0-9]';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mcn_carpools_price_positive'
  ) THEN
    ALTER TABLE public.mcn_carpools
      ADD CONSTRAINT mcn_carpools_price_positive
      CHECK (price_per_seat_amount IS NULL OR price_per_seat_amount >= 0);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
