-- Allow anonymous users to browse food drops and item menus.
-- Order placement remains restricted by existing INSERT policies.

DROP POLICY IF EXISTS mcn_preorder_drops_select_public ON public.mcn_preorder_drops;
CREATE POLICY mcn_preorder_drops_select_public
  ON public.mcn_preorder_drops FOR SELECT
  USING (true);

DROP POLICY IF EXISTS mcn_preorder_items_select_public ON public.mcn_preorder_items;
CREATE POLICY mcn_preorder_items_select_public
  ON public.mcn_preorder_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.mcn_preorder_drops d
      WHERE d.id = drop_id
    )
  );

NOTIFY pgrst, 'reload schema';
