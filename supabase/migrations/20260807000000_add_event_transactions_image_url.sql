-- Add image_url to event_transactions for bills/receipts
ALTER TABLE public.event_transactions ADD COLUMN IF NOT EXISTS image_url TEXT;
