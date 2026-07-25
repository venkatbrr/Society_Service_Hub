-- Migration to prevent drop creators from placing pre-orders on their own drops

DROP POLICY IF EXISTS "mcn_preorder_orders_insert" ON public.mcn_preorder_orders;
CREATE POLICY "mcn_preorder_orders_insert"
  ON public.mcn_preorder_orders FOR INSERT
  WITH CHECK (
    community_id = get_user_community_id()
    AND buyer_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.mcn_preorder_drops d
      WHERE d.id = drop_id AND d.created_by = auth.uid()
    )
  );

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
