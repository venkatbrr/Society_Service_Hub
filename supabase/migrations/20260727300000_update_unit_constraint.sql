-- Migration to allow 250g and 500g units in mcn_preorder_items

ALTER TABLE public.mcn_preorder_items DROP CONSTRAINT IF EXISTS mcn_preorder_items_unit_check;

ALTER TABLE public.mcn_preorder_items ADD CONSTRAINT mcn_preorder_items_unit_check 
  CHECK (unit IN ('piece', 'kg', 'box', 'pack', 'portion', 'litre', '250g', '500g'));

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
