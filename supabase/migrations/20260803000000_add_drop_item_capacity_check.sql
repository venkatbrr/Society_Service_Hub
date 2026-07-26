-- Enforce and expose capacity checks for food drops where max_orders is treated as max total item quantity.

CREATE OR REPLACE FUNCTION public.check_mcn_drop_item_capacity(
  p_drop_id uuid,
  p_requested_qty numeric,
  p_existing_order_id uuid DEFAULT NULL
)
RETURNS TABLE (
  max_items integer,
  current_items numeric,
  effective_current_items numeric,
  projected_items numeric,
  remaining_capacity numeric,
  can_place boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_items integer;
  v_current_items numeric := 0;
  v_existing_items numeric := 0;
  v_effective_current numeric := 0;
  v_projected numeric := 0;
  v_remaining numeric := 0;
BEGIN
  SELECT d.max_orders
  INTO v_max_items
  FROM public.mcn_preorder_drops d
  WHERE d.id = p_drop_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Food drop not found';
  END IF;

  SELECT COALESCE(SUM(oi.quantity), 0)
  INTO v_current_items
  FROM public.mcn_preorder_orders o
  JOIN public.mcn_preorder_order_items oi ON oi.order_id = o.id
  WHERE o.drop_id = p_drop_id
    AND o.status <> 'cancelled';

  IF p_existing_order_id IS NOT NULL THEN
    SELECT COALESCE(SUM(oi.quantity), 0)
    INTO v_existing_items
    FROM public.mcn_preorder_order_items oi
    WHERE oi.order_id = p_existing_order_id;
  END IF;

  v_effective_current := GREATEST(0, v_current_items - v_existing_items);
  v_projected := v_effective_current + COALESCE(p_requested_qty, 0);

  IF v_max_items IS NULL THEN
    v_remaining := 0;
    RETURN QUERY
    SELECT
      v_max_items,
      v_current_items,
      v_effective_current,
      v_projected,
      v_remaining,
      true;
    RETURN;
  END IF;

  v_remaining := GREATEST(0, v_max_items::numeric - v_effective_current);

  RETURN QUERY
  SELECT
    v_max_items,
    v_current_items,
    v_effective_current,
    v_projected,
    v_remaining,
    v_projected <= v_max_items;
END;
$$;

REVOKE ALL ON FUNCTION public.check_mcn_drop_item_capacity(uuid, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_mcn_drop_item_capacity(uuid, numeric, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
