-- Migration to add contact_phone to mcn_carpools

ALTER TABLE public.mcn_carpools
ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- Backfill existing rows from profiles if missing
UPDATE public.mcn_carpools c
SET contact_phone = p.phone_number
FROM public.profiles p
WHERE c.created_by = p.id AND (c.contact_phone IS NULL OR c.contact_phone = '');

NOTIFY pgrst, 'reload schema';
