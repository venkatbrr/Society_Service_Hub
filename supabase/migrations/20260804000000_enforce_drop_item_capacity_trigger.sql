-- Create a trigger function to strictly enforce drop capacity
CREATE OR REPLACE FUNCTION public.enforce_mcn_drop_capacity_trigger()
RETURNS TRIGGER AS $$
DECLARE
  v_drop_id uuid;
  v_max_orders integer;
  v_total_ordered numeric;
BEGIN
  -- Find the drop_id associated with this order item
  IF TG_OP = 'DELETE' THEN
    SELECT drop_id INTO v_drop_id FROM public.mcn_preorder_orders WHERE id = OLD.order_id;
  ELSE
    SELECT drop_id INTO v_drop_id FROM public.mcn_preorder_orders WHERE id = NEW.order_id;
  END IF;

  -- Lock the drop row to serialize concurrent transactions
  SELECT max_orders INTO v_max_orders
  FROM public.mcn_preorder_drops
  WHERE id = v_drop_id
  FOR UPDATE;

  -- If there is a capacity limit, enforce it
  IF v_max_orders IS NOT NULL THEN
    -- Calculate total currently ordered
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_mcn_drop_capacity ON public.mcn_preorder_order_items;
CREATE TRIGGER trg_enforce_mcn_drop_capacity
AFTER INSERT OR UPDATE ON public.mcn_preorder_order_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_mcn_drop_capacity_trigger();

-- Also add it to orders to catch status changes (e.g. cancelled -> confirmed)
CREATE OR REPLACE FUNCTION public.enforce_mcn_drop_capacity_order_trigger()
RETURNS TRIGGER AS $$
DECLARE
  v_max_orders integer;
  v_total_ordered numeric;
BEGIN
  -- Only care if status changed
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Lock the drop row to serialize concurrent transactions
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_mcn_drop_capacity_order ON public.mcn_preorder_orders;
CREATE TRIGGER trg_enforce_mcn_drop_capacity_order
AFTER UPDATE OF status ON public.mcn_preorder_orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_mcn_drop_capacity_order_trigger();

NOTIFY pgrst, 'reload schema';
