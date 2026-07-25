-- Migration to add image_url columns to mcn_preorder_drops and mcn_preorder_items

ALTER TABLE public.mcn_preorder_drops ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.mcn_preorder_items ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
