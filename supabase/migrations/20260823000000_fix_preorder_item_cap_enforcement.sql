-- Food drops: two defects let an item's max_quantity cap be exceeded and left
-- buyers looking at orders whose line items disagreed with the amount charged.
--
-- 1. mcn_preorder_order_items had only SELECT and INSERT policies. Editing an
--    order deletes the old lines and re-inserts them, so under RLS the delete
--    silently matched zero rows while the insert succeeded — the order kept the
--    old line AND gained the new one (e.g. "2x Sandwich" + "1x Sandwich" on an
--    order whose total_amount was correctly 1x). Those orphan lines also count
--    as sold quantity everywhere capacity is computed.
--
-- 2. The cap-enforcement triggers were plain (invoker-rights) functions, so
--    their SELECT over mcn_preorder_order_items / mcn_preorder_orders ran under
--    the buyer's RLS and could only see that buyer's own orders. The totals they
--    compared against max_quantity / max_orders therefore excluded every other
--    resident's quantity, and the server-side backstop never fired across
--    buyers. The pre-flight RPCs were already SECURITY DEFINER and correct,
--    which is why the cap appeared to work right up until a second buyer
--    ordered.

-- ============================================================
-- 1. Let a buyer maintain the line items of their own open order
-- ============================================================

DROP POLICY IF EXISTS "mcn_preorder_order_items_update" ON public.mcn_preorder_order_items;
CREATE POLICY "mcn_preorder_order_items_update"
  ON public.mcn_preorder_order_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.mcn_preorder_orders o
    WHERE o.id = order_id AND o.buyer_id = auth.uid() AND o.status = 'confirmed'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.mcn_preorder_orders o
    WHERE o.id = order_id AND o.buyer_id = auth.uid() AND o.status = 'confirmed'
  ));

DROP POLICY IF EXISTS "mcn_preorder_order_items_delete" ON public.mcn_preorder_order_items;
CREATE POLICY "mcn_preorder_order_items_delete"
  ON public.mcn_preorder_order_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.mcn_preorder_orders o
    WHERE o.id = order_id AND o.buyer_id = auth.uid() AND o.status = 'confirmed'
  ));

-- ============================================================
-- 2. Repair orders already corrupted by the swallowed delete
--    Keep the newest line per (order_id, item_id) — that is the one the last
--    edit wrote, and the one total_amount was calculated from — then recompute
--    the total so line items and amount agree.
-- ============================================================

DO $$
DECLARE
  v_affected UUID[];
BEGIN
  WITH ranked AS (
    SELECT
      id,
      order_id,
      ROW_NUMBER() OVER (
        PARTITION BY order_id, item_id
        ORDER BY created_at DESC, id DESC
      ) AS rn
    FROM public.mcn_preorder_order_items
  ),
  dupes AS (
    SELECT id FROM ranked WHERE rn > 1
  ),
  del AS (
    DELETE FROM public.mcn_preorder_order_items
    WHERE id IN (SELECT id FROM dupes)
    RETURNING order_id
  )
  SELECT COALESCE(ARRAY_AGG(DISTINCT order_id), '{}'::UUID[]) INTO v_affected FROM del;

  IF COALESCE(array_length(v_affected, 1), 0) > 0 THEN
    UPDATE public.mcn_preorder_orders o
    SET total_amount = COALESCE((
          SELECT SUM(oi.quantity * oi.unit_price)
          FROM public.mcn_preorder_order_items oi
          WHERE oi.order_id = o.id
        ), 0),
        updated_at = now()
    WHERE o.id = ANY(v_affected);

    RAISE NOTICE 'Deduplicated line items on % pre-order(s).', array_length(v_affected, 1);
  END IF;
END $$;

-- One line per item per order, so a future failed delete errors loudly instead
-- of silently doubling the order.
CREATE UNIQUE INDEX IF NOT EXISTS mcn_preorder_order_items_order_item_uniq
  ON public.mcn_preorder_order_items(order_id, item_id);

-- ============================================================
-- 3. Cap enforcement must see every buyer's quantity, not just the caller's.
--    SECURITY DEFINER so the totals below are computed without RLS filtering;
--    the FOR UPDATE row lock continues to serialize concurrent buyers.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_mcn_item_max_quantity_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_item_id UUID;
  v_max_quantity INTEGER;
  v_total_ordered NUMERIC;
BEGIN
  v_item_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.item_id ELSE NEW.item_id END;

  SELECT max_quantity INTO v_max_quantity
  FROM public.mcn_preorder_items
  WHERE id = v_item_id
  FOR UPDATE;

  IF v_max_quantity IS NOT NULL THEN
    SELECT COALESCE(SUM(oi.quantity), 0)
    INTO v_total_ordered
    FROM public.mcn_preorder_order_items oi
    JOIN public.mcn_preorder_orders o ON o.id = oi.order_id
    WHERE oi.item_id = v_item_id
      AND o.status <> 'cancelled';

    IF v_total_ordered > v_max_quantity THEN
      RAISE EXCEPTION 'This item is capped at % total across all pre-orders (requested total would be %).', v_max_quantity, v_total_ordered;
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_mcn_item_max_quantity_order_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_total_ordered NUMERIC;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  FOR v_row IN
    SELECT DISTINCT oi.item_id, i.max_quantity
    FROM public.mcn_preorder_order_items oi
    JOIN public.mcn_preorder_items i ON i.id = oi.item_id
    WHERE oi.order_id = NEW.id
      AND i.max_quantity IS NOT NULL
  LOOP
    SELECT COALESCE(SUM(oi.quantity), 0)
    INTO v_total_ordered
    FROM public.mcn_preorder_order_items oi
    JOIN public.mcn_preorder_orders o ON o.id = oi.order_id
    WHERE oi.item_id = v_row.item_id
      AND o.status <> 'cancelled';

    IF v_total_ordered > v_row.max_quantity THEN
      RAISE EXCEPTION 'This item is capped at % total across all pre-orders.', v_row.max_quantity;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Same invoker-rights blindness applied to the drop-level max_orders cap.
CREATE OR REPLACE FUNCTION public.enforce_mcn_drop_capacity_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_drop_id UUID;
  v_max_orders INTEGER;
  v_total_ordered NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT drop_id INTO v_drop_id FROM public.mcn_preorder_orders WHERE id = OLD.order_id;
  ELSE
    SELECT drop_id INTO v_drop_id FROM public.mcn_preorder_orders WHERE id = NEW.order_id;
  END IF;

  SELECT max_orders INTO v_max_orders
  FROM public.mcn_preorder_drops
  WHERE id = v_drop_id
  FOR UPDATE;

  IF v_max_orders IS NOT NULL THEN
    SELECT COALESCE(SUM(oi.quantity), 0)
    INTO v_total_ordered
    FROM public.mcn_preorder_orders o
    JOIN public.mcn_preorder_order_items oi ON oi.order_id = o.id
    WHERE o.drop_id = v_drop_id AND o.status <> 'cancelled';

    IF v_total_ordered > v_max_orders THEN
      RAISE EXCEPTION 'Item limit reached. Maximum allowed is %, but current total would be %.', v_max_orders, v_total_ordered;
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_mcn_drop_capacity_order_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_max_orders INTEGER;
  v_total_ordered NUMERIC;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT max_orders INTO v_max_orders
  FROM public.mcn_preorder_drops
  WHERE id = NEW.drop_id
  FOR UPDATE;

  IF v_max_orders IS NOT NULL THEN
    SELECT COALESCE(SUM(oi.quantity), 0)
    INTO v_total_ordered
    FROM public.mcn_preorder_orders o
    JOIN public.mcn_preorder_order_items oi ON oi.order_id = o.id
    WHERE o.drop_id = NEW.drop_id AND o.status <> 'cancelled';

    IF v_total_ordered > v_max_orders THEN
      RAISE EXCEPTION 'Item limit reached for this drop.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate the triggers so they bind to the redefined functions.
DROP TRIGGER IF EXISTS trg_enforce_mcn_item_max_quantity ON public.mcn_preorder_order_items;
CREATE TRIGGER trg_enforce_mcn_item_max_quantity
AFTER INSERT OR UPDATE ON public.mcn_preorder_order_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_mcn_item_max_quantity_trigger();

DROP TRIGGER IF EXISTS trg_enforce_mcn_item_max_quantity_order ON public.mcn_preorder_orders;
CREATE TRIGGER trg_enforce_mcn_item_max_quantity_order
AFTER UPDATE OF status ON public.mcn_preorder_orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_mcn_item_max_quantity_order_trigger();

DROP TRIGGER IF EXISTS trg_enforce_mcn_drop_capacity ON public.mcn_preorder_order_items;
CREATE TRIGGER trg_enforce_mcn_drop_capacity
AFTER INSERT OR UPDATE ON public.mcn_preorder_order_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_mcn_drop_capacity_trigger();

DROP TRIGGER IF EXISTS trg_enforce_mcn_drop_capacity_order ON public.mcn_preorder_orders;
CREATE TRIGGER trg_enforce_mcn_drop_capacity_order
AFTER UPDATE OF status ON public.mcn_preorder_orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_mcn_drop_capacity_order_trigger();

NOTIFY pgrst, 'reload schema';
