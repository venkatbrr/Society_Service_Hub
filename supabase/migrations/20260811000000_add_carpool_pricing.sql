-- Migration to add pricing type and price per seat to mcn_carpools

ALTER TABLE public.mcn_carpools
ADD COLUMN IF NOT EXISTS pricing_type TEXT NOT NULL DEFAULT 'free' CHECK (pricing_type IN ('free', 'paid')),
ADD COLUMN IF NOT EXISTS price_per_seat TEXT;

COMMENT ON COLUMN public.mcn_carpools.pricing_type IS 'Ride cost option: free or paid';
COMMENT ON COLUMN public.mcn_carpools.price_per_seat IS 'Cost per seat, e.g. 50 or Free';

NOTIFY pgrst, 'reload schema';
