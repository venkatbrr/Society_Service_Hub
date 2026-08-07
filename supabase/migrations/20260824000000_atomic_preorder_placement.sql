-- Food drops: make pre-order placement atomic, and close the remaining
-- max_quantity edge cases.
--
-- Symptom that prompted this: a drop capped at 5 had orders showing a total
-- amount but no line items at all. Cause — placing an order was two separate
-- round trips:
--     1. INSERT INTO mcn_preorder_orders   (succeeds)
--     2. INSERT INTO mcn_preorder_order_items  (rejected by the cap trigger)
-- Step 2 failing left the step-1 order row behind forever: a "confirmed" order
-- with a total_amount, no items, and a phantom contribution to the host's
-- Est. Revenue. Every rejected over-cap attempt minted one.
--
-- Fixed by moving the whole operation into one SECURITY DEFINER function so a
-- cap rejection rolls the order row back with it. The function is also the
-- authority on price and total_amount, which the client previously supplied.

-- ============================================================
-- 1. Remove the orphan orders the old two-step flow left behind
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
-- 2. Atomic placement / edit
-- ============================================================

CREATE OR REPLACE FUNCTION public.place_mcn_preorder(
  p_drop_id UUID,
  p_items JSONB,                      -- [{"item_id": "<uuid>", "quantity": <numeric>}, ...]
  p_buyer_name TEXT,
  p_buyer_phone TEXT,
  p_flat_number TEXT,
  p_buyer_note TEXT DEFAULT NULL,
  p_order_id UUID DEFAULT NULL        -- non-null = edit that existing order
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_drop RECORD;
  v_order RECORD;
  v_item RECORD;
  v_line RECORD;
  v_order_id UUID;
  v_total NUMERIC := 0;
  v_units NUMERIC := 0;
  v_sold NUMERIC;
  v_drop_sold NUMERIC;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Login required to place a pre-order';
  END IF;

  -- Lock the drop so concurrent buyers serialize on the same row the
  -- drop-wide capacity check reads.
  SELECT * INTO v_drop FROM public.mcn_preorder_drops WHERE id = p_drop_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Food drop not found';
  END IF;

  IF v_drop.created_by = v_user THEN
    RAISE EXCEPTION 'Hosts cannot place pre-orders on their own food drop';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_user AND p.community_id = v_drop.community_id AND p.removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'You are not a member of this community';
  END IF;

  IF v_drop.status <> 'open' THEN
    RAISE EXCEPTION 'Pre-orders are closed for this food drop';
  END IF;

  IF v_drop.cutoff_at <= now() THEN
    RAISE EXCEPTION 'The pre-order cut-off for this food drop has passed';
  END IF;

  IF COALESCE(btrim(p_flat_number), '') = '' THEN
    RAISE EXCEPTION 'Flat / house number is required';
  END IF;

  IF COALESCE(btrim(p_buyer_phone), '') = '' THEN
    RAISE EXCEPTION 'Contact phone number is required';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Select at least one item';
  END IF;

  IF p_order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.mcn_preorder_orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pre-order not found';
    END IF;
    IF v_order.buyer_id <> v_user THEN
      RAISE EXCEPTION 'You can only edit your own pre-order';
    END IF;
    IF v_order.drop_id <> p_drop_id THEN
      RAISE EXCEPTION 'Pre-order does not belong to this food drop';
    END IF;
    IF v_order.status <> 'confirmed' THEN
      RAISE EXCEPTION 'Delivered or cancelled pre-orders cannot be edited';
    END IF;

    v_order_id := p_order_id;

    -- Clear first so the capacity sums below naturally exclude this buyer's own
    -- previous quantities instead of double-counting them.
    DELETE FROM public.mcn_preorder_order_items WHERE order_id = v_order_id;

    UPDATE public.mcn_preorder_orders
    SET buyer_name  = COALESCE(NULLIF(btrim(p_buyer_name), ''), 'Resident'),
        buyer_phone = btrim(p_buyer_phone),
        flat_number = upper(btrim(p_flat_number)),
        buyer_note  = NULLIF(btrim(p_buyer_note), ''),
        updated_at  = now()
    WHERE id = v_order_id;
  ELSE
    INSERT INTO public.mcn_preorder_orders (
      drop_id, community_id, buyer_id, buyer_name, buyer_phone,
      flat_number, buyer_note, total_amount, status
    ) VALUES (
      p_drop_id, v_drop.community_id, v_user,
      COALESCE(NULLIF(btrim(p_buyer_name), ''), 'Resident'),
      btrim(p_buyer_phone),
      upper(btrim(p_flat_number)),
      NULLIF(btrim(p_buyer_note), ''),
      0, 'confirmed'
    )
    RETURNING id INTO v_order_id;
  END IF;

  -- Aggregate by item so a client sending the same item twice cannot slip past
  -- the per-item cap check.
  FOR v_line IN
    SELECT (e->>'item_id')::UUID AS item_id,
           SUM((e->>'quantity')::NUMERIC) AS quantity
    FROM jsonb_array_elements(p_items) e
    WHERE COALESCE((e->>'quantity')::NUMERIC, 0) > 0
    GROUP BY 1
  LOOP
    SELECT * INTO v_item
    FROM public.mcn_preorder_items
    WHERE id = v_line.item_id
    FOR UPDATE;

    IF NOT FOUND OR v_item.drop_id <> p_drop_id THEN
      RAISE EXCEPTION 'That item is no longer part of this food drop';
    END IF;

    IF v_item.max_quantity IS NOT NULL THEN
      SELECT COALESCE(SUM(oi.quantity), 0)
      INTO v_sold
      FROM public.mcn_preorder_order_items oi
      JOIN public.mcn_preorder_orders o ON o.id = oi.order_id
      WHERE oi.item_id = v_item.id
        AND o.status <> 'cancelled';

      IF v_sold + v_line.quantity > v_item.max_quantity THEN
        RAISE EXCEPTION '% — only % of % left, shared across every resident''s orders.',
          v_item.name,
          GREATEST(0, v_item.max_quantity - v_sold),
          v_item.max_quantity;
      END IF;
    END IF;

    INSERT INTO public.mcn_preorder_order_items (
      order_id, item_id, item_name, quantity, unit_price
    ) VALUES (
      v_order_id, v_item.id, v_item.name, v_line.quantity, v_item.price
    );

    v_total := v_total + (v_line.quantity * v_item.price);
    v_units := v_units + v_line.quantity;
  END LOOP;

  IF v_units <= 0 THEN
    RAISE EXCEPTION 'Select at least one item';
  END IF;

  IF v_drop.max_orders IS NOT NULL THEN
    SELECT COALESCE(SUM(oi.quantity), 0)
    INTO v_drop_sold
    FROM public.mcn_preorder_order_items oi
    JOIN public.mcn_preorder_orders o ON o.id = oi.order_id
    WHERE o.drop_id = p_drop_id
      AND o.status <> 'cancelled';

    IF v_drop_sold > v_drop.max_orders THEN
      RAISE EXCEPTION 'This food drop is capped at % items in total — only % left.',
        v_drop.max_orders,
        GREATEST(0, v_drop.max_orders - (v_drop_sold - v_units));
    END IF;
  END IF;

  UPDATE public.mcn_preorder_orders
  SET total_amount = v_total,
      updated_at = now()
  WHERE id = v_order_id;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.place_mcn_preorder(uuid, jsonb, text, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_mcn_preorder(uuid, jsonb, text, text, text, text, uuid) TO authenticated;

-- ============================================================
-- 3. A host must not be able to invalidate orders already placed
-- ============================================================

-- Lowering max_quantity below what residents have already pre-ordered would
-- leave the drop permanently over cap with no way back.
CREATE OR REPLACE FUNCTION public.enforce_mcn_item_max_quantity_floor()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sold NUMERIC;
BEGIN
  IF NEW.max_quantity IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.max_quantity IS NOT DISTINCT FROM NEW.max_quantity THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(oi.quantity), 0)
  INTO v_sold
  FROM public.mcn_preorder_order_items oi
  JOIN public.mcn_preorder_orders o ON o.id = oi.order_id
  WHERE oi.item_id = NEW.id
    AND o.status <> 'cancelled';

  IF v_sold > NEW.max_quantity THEN
    RAISE EXCEPTION 'Cannot cap "%" at % — residents have already pre-ordered %.',
      NEW.name, NEW.max_quantity, v_sold;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_mcn_item_max_quantity_floor ON public.mcn_preorder_items;
CREATE TRIGGER trg_enforce_mcn_item_max_quantity_floor
BEFORE UPDATE ON public.mcn_preorder_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_mcn_item_max_quantity_floor();

-- mcn_preorder_order_items.item_id became ON DELETE CASCADE in 20260815000000
-- so that deleting a whole drop works. The side effect: removing one item while
-- editing a drop silently deleted every order line referencing it, leaving
-- buyers with an amount and no items — the same corruption from the other
-- direction. Block that, but stay out of the way of a genuine drop deletion
-- (the parent row is already gone by the time its cascade reaches items).
CREATE OR REPLACE FUNCTION public.prevent_mcn_item_delete_with_orders()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sold NUMERIC;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.mcn_preorder_drops WHERE id = OLD.drop_id) THEN
    RETURN OLD;
  END IF;

  SELECT COALESCE(SUM(oi.quantity), 0)
  INTO v_sold
  FROM public.mcn_preorder_order_items oi
  JOIN public.mcn_preorder_orders o ON o.id = oi.order_id
  WHERE oi.item_id = OLD.id
    AND o.status <> 'cancelled';

  IF v_sold > 0 THEN
    RAISE EXCEPTION 'Cannot remove "%" — residents have already pre-ordered % of it.',
      OLD.name, v_sold;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_mcn_item_delete_with_orders ON public.mcn_preorder_items;
CREATE TRIGGER trg_prevent_mcn_item_delete_with_orders
BEFORE DELETE ON public.mcn_preorder_items
FOR EACH ROW
EXECUTE FUNCTION public.prevent_mcn_item_delete_with_orders();

NOTIFY pgrst, 'reload schema';
