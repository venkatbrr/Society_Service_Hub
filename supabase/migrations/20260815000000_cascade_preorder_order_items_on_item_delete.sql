-- ============================================================
-- Migration: Cascade mcn_preorder_order_items when their item is deleted
-- Date: 2026-08-15
-- ============================================================
-- Deleting a mcn_preorder_drops row cascades to both mcn_preorder_items
-- (drop_id) and mcn_preorder_orders (drop_id), which itself cascades to
-- mcn_preorder_order_items (order_id). But mcn_preorder_order_items.item_id
-- was ON DELETE RESTRICT, and RESTRICT is checked immediately rather than
-- deferred, so it blocked the whole-drop delete whenever any order existed
-- for that drop — even though the order (and its line items) were being
-- deleted in the very same statement.

ALTER TABLE public.mcn_preorder_order_items
  DROP CONSTRAINT IF EXISTS mcn_preorder_order_items_item_id_fkey;

ALTER TABLE public.mcn_preorder_order_items
  ADD CONSTRAINT mcn_preorder_order_items_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.mcn_preorder_items(id) ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';
