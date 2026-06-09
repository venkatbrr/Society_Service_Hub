-- Migration to add delete policy on mcn_order_items to allow buyers to modify pending order items

CREATE POLICY "mcn_order_items_delete"
  ON public.mcn_order_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.mcn_orders o
      WHERE o.id = order_id AND o.buyer_id = auth.uid() AND o.status = 'pending'
    )
  );

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
