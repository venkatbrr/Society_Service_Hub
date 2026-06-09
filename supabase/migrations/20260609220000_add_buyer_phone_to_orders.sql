-- Migration to add buyer_phone to mcn_orders and allow buyers to update pending orders

-- 1. Add buyer_phone column
ALTER TABLE public.mcn_orders ADD COLUMN IF NOT EXISTS buyer_phone TEXT;

-- 2. Backfill existing orders with profile phone numbers where available
UPDATE public.mcn_orders o
SET buyer_phone = p.phone_number
FROM public.profiles p
WHERE o.buyer_id = p.id AND o.buyer_phone IS NULL;

-- 3. Update mcn_orders RLS update policy
DROP POLICY IF EXISTS "mcn_orders_update" ON public.mcn_orders;

CREATE POLICY "mcn_orders_update"
  ON public.mcn_orders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.mcn_listings l
      WHERE l.id = listing_id AND l.owner_id = auth.uid()
    )
    OR (buyer_id = auth.uid() AND status = 'pending')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.mcn_listings l
      WHERE l.id = listing_id AND l.owner_id = auth.uid()
    )
    OR (buyer_id = auth.uid() AND status = 'pending')
  );

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
