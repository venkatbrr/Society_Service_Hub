-- Community leads lose DELETE on food drops; hiding for review
-- (20260915000000) replaces it.
--
-- Deleting a drop cascades to mcn_preorder_orders and destroys every pre-order
-- on it with no notice to the buyers, which is too much reach for a one-tap
-- action by an elected neighbour. Hiding stops the harm, is reversible, and
-- notifies everyone affected.
--
-- The host keeps delete on their own drop, and the platform admin keeps it as
-- the genuine last resort.

DROP POLICY IF EXISTS "mcn_preorder_drops_delete" ON public.mcn_preorder_drops;
CREATE POLICY "mcn_preorder_drops_delete"
  ON public.mcn_preorder_drops FOR DELETE
  USING (
    created_by = auth.uid()
    OR public.is_platform_admin(auth.uid())
  );

NOTIFY pgrst, 'reload schema';
