-- Food drops: make the item-less pre-order impossible, not merely unlikely.
--
-- 20260824000000 moved placement into place_mcn_preorder() so a cap rejection
-- rolls the order row back with it. That fixed the app's code path but left the
-- door open at the database: mcn_preorder_orders still carried a permissive
-- INSERT policy, so anything that was not the RPC — a stale client bundle, a
-- direct PostgREST call — could still commit a bare order row and then have its
-- line items rejected a round trip later.
--
-- That is what a "confirmed" order showing a total with no items is. Note the
-- tell: the RPC inserts the order with total_amount = 0 and writes the real
-- total only after every line item is in. An item-less order carrying a
-- non-zero total therefore had its total supplied by a client, which the RPC
-- never does.
--
-- Two changes close it for good:
--   1. A DEFERRED constraint trigger — at COMMIT, an order must have at least
--      one line item. This catches every path, present and future, including a
--      two-round-trip client, whose first commit now fails instead of leaving
--      an orphan behind.
--   2. Direct INSERT is revoked on both tables. Placement is RPC-only.
--      place_mcn_preorder is SECURITY DEFINER and owned by postgres, so it
--      bypasses RLS and keeps working. (If FORCE ROW LEVEL SECURITY is ever
--      enabled on these tables, revisit this.)

-- ============================================================
-- 1. Clear the orphans the still-open path has minted since 20260824000000
-- ============================================================

DO $$
DECLARE
  v_deleted INTEGER;
BEGIN
  WITH orphans AS (
    DELETE FROM public.mcn_preorder_orders o
    WHERE NOT EXISTS (
      SELECT 1 FROM public.mcn_preorder_order_items oi WHERE oi.order_id = o.id
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM orphans;

  RAISE NOTICE 'Removed % item-less pre-order(s).', v_deleted;
END $$;

-- ============================================================
-- 2. An order must have line items by commit time
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_mcn_order_has_items()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Deferred to commit, so the RPC's "insert order, then insert its items"
  -- ordering is fine while a client that commits the order on its own is not.
  IF NOT EXISTS (
    SELECT 1 FROM public.mcn_preorder_order_items WHERE order_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'A pre-order must contain at least one item';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_mcn_order_has_items ON public.mcn_preorder_orders;
CREATE CONSTRAINT TRIGGER trg_mcn_order_has_items
AFTER INSERT ON public.mcn_preorder_orders
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_mcn_order_has_items();

-- ============================================================
-- 3. Placement is RPC-only
-- ============================================================

-- The app has no direct-insert path left: every other write to these tables is
-- an UPDATE (cancel / mark delivered) or a SELECT. Editing an order also goes
-- through place_mcn_preorder(p_order_id => …).
DROP POLICY IF EXISTS "mcn_preorder_orders_insert" ON public.mcn_preorder_orders;
CREATE POLICY "mcn_preorder_orders_insert"
  ON public.mcn_preorder_orders FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "mcn_preorder_order_items_insert" ON public.mcn_preorder_order_items;
CREATE POLICY "mcn_preorder_order_items_insert"
  ON public.mcn_preorder_order_items FOR INSERT
  WITH CHECK (false);

NOTIFY pgrst, 'reload schema';
