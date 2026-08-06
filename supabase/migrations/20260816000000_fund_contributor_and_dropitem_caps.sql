-- 1. Fund contributions: presidents/vice-presidents must be selectable as contributors
--    (including by themselves), not just plain residents. Collector block-scoping is
--    unchanged.
CREATE OR REPLACE FUNCTION public.list_eligible_contributors_for_collector(
  p_event_id UUID
)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  flat_no TEXT,
  block_id UUID,
  block_name TEXT,
  has_contributed BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  event_community_id UUID;
  caller_role TEXT;
  caller_block_id UUID;
  caller_is_community_lead BOOLEAN;
  caller_is_platform_admin BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT e.community_id
  INTO event_community_id
  FROM public.events e
  WHERE e.id = p_event_id;

  IF event_community_id IS NULL THEN
    RAISE EXCEPTION 'Fund not found';
  END IF;

  SELECT fr.role, fr.block_id
  INTO caller_role, caller_block_id
  FROM public.fund_roles fr
  WHERE fr.event_id = p_event_id
    AND fr.user_id = auth.uid()
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.community_id = event_community_id
      AND p.app_role IN ('president'::public.app_role_type, 'vice_president'::public.app_role_type)
      AND p.removed_at IS NULL
  ) INTO caller_is_community_lead;

  caller_is_platform_admin := public.is_platform_admin(auth.uid());

  IF caller_role IS NULL AND NOT caller_is_community_lead AND NOT caller_is_platform_admin THEN
    RAISE EXCEPTION 'Caller does not have access to this fund';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    COALESCE(p.full_name, 'Resident')::TEXT,
    p.flat_number::TEXT,
    p.block_id,
    cb.name::TEXT,
    EXISTS (
      SELECT 1
      FROM public.event_transactions et
      WHERE et.event_id = p_event_id
        AND et.type = 'income'
        AND et.contributor_user_id = p.id
    ) AS has_contributed
  FROM public.profiles p
  LEFT JOIN public.community_blocks cb ON cb.id = p.block_id
  WHERE p.community_id = event_community_id
    AND p.removed_at IS NULL
    AND p.app_role IN (
      'resident'::public.app_role_type,
      'president'::public.app_role_type,
      'vice_president'::public.app_role_type
    )
    AND (
      (caller_role = 'collector' AND caller_block_id IS NOT NULL AND p.block_id = caller_block_id)
      OR (caller_role = 'collector' AND caller_block_id IS NULL)
      OR (caller_role IN ('treasurer'))
      OR caller_is_community_lead
      OR caller_is_platform_admin
    )
  ORDER BY cb.name NULLS LAST, p.full_name NULLS LAST;
END;
$$;

-- ============================================================
-- 2. Food drop items: max_quantity is a total cap shared across every buyer's
--    orders, not a per-order allowance. Add an availability RPC for display, a
--    pre-flight check RPC for a clean error message, and triggers so the cap is
--    enforced server-side regardless of client behavior.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_mcn_drop_item_availability(p_drop_id UUID)
RETURNS TABLE (
  item_id UUID,
  max_quantity INTEGER,
  sold_quantity NUMERIC,
  remaining_quantity NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    i.id,
    i.max_quantity,
    COALESCE(sold.qty, 0) AS sold_quantity,
    CASE
      WHEN i.max_quantity IS NULL THEN NULL
      ELSE GREATEST(0, i.max_quantity - COALESCE(sold.qty, 0))
    END AS remaining_quantity
  FROM public.mcn_preorder_items i
  LEFT JOIN (
    SELECT oi.item_id, SUM(oi.quantity) AS qty
    FROM public.mcn_preorder_order_items oi
    JOIN public.mcn_preorder_orders o ON o.id = oi.order_id
    WHERE o.drop_id = p_drop_id
      AND o.status <> 'cancelled'
    GROUP BY oi.item_id
  ) sold ON sold.item_id = i.id
  WHERE i.drop_id = p_drop_id;
$$;

REVOKE ALL ON FUNCTION public.get_mcn_drop_item_availability(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mcn_drop_item_availability(uuid) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.check_mcn_drop_item_quantity_capacity(
  p_item_id UUID,
  p_requested_qty NUMERIC,
  p_existing_order_id UUID DEFAULT NULL
)
RETURNS TABLE (
  max_quantity INTEGER,
  current_quantity NUMERIC,
  effective_current_quantity NUMERIC,
  projected_quantity NUMERIC,
  remaining_capacity NUMERIC,
  can_place BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_max_quantity INTEGER;
  v_current_quantity NUMERIC := 0;
  v_existing_quantity NUMERIC := 0;
  v_effective_current NUMERIC := 0;
  v_projected NUMERIC := 0;
  v_remaining NUMERIC := 0;
BEGIN
  SELECT i.max_quantity
  INTO v_max_quantity
  FROM public.mcn_preorder_items i
  WHERE i.id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Food drop item not found';
  END IF;

  SELECT COALESCE(SUM(oi.quantity), 0)
  INTO v_current_quantity
  FROM public.mcn_preorder_order_items oi
  JOIN public.mcn_preorder_orders o ON o.id = oi.order_id
  WHERE oi.item_id = p_item_id
    AND o.status <> 'cancelled';

  IF p_existing_order_id IS NOT NULL THEN
    SELECT COALESCE(SUM(oi.quantity), 0)
    INTO v_existing_quantity
    FROM public.mcn_preorder_order_items oi
    WHERE oi.order_id = p_existing_order_id
      AND oi.item_id = p_item_id;
  END IF;

  v_effective_current := GREATEST(0, v_current_quantity - v_existing_quantity);
  v_projected := v_effective_current + COALESCE(p_requested_qty, 0);

  IF v_max_quantity IS NULL THEN
    RETURN QUERY
    SELECT v_max_quantity, v_current_quantity, v_effective_current, v_projected, 0::NUMERIC, true;
    RETURN;
  END IF;

  v_remaining := GREATEST(0, v_max_quantity::NUMERIC - v_effective_current);

  RETURN QUERY
  SELECT
    v_max_quantity,
    v_current_quantity,
    v_effective_current,
    v_projected,
    v_remaining,
    v_projected <= v_max_quantity;
END;
$$;

REVOKE ALL ON FUNCTION public.check_mcn_drop_item_quantity_capacity(uuid, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_mcn_drop_item_quantity_capacity(uuid, numeric, uuid) TO authenticated;

-- Server-side backstop: an item's total quantity across every non-cancelled
-- order can never exceed its max_quantity, no matter how many different
-- buyers are involved.
CREATE OR REPLACE FUNCTION public.enforce_mcn_item_max_quantity_trigger()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_mcn_item_max_quantity ON public.mcn_preorder_order_items;
CREATE TRIGGER trg_enforce_mcn_item_max_quantity
AFTER INSERT OR UPDATE ON public.mcn_preorder_order_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_mcn_item_max_quantity_trigger();

-- Also re-check when an order's status flips back into a counted state
-- (e.g. cancelled -> confirmed), mirroring the drop-level capacity trigger.
CREATE OR REPLACE FUNCTION public.enforce_mcn_item_max_quantity_order_trigger()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_mcn_item_max_quantity_order ON public.mcn_preorder_orders;
CREATE TRIGGER trg_enforce_mcn_item_max_quantity_order
AFTER UPDATE OF status ON public.mcn_preorder_orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_mcn_item_max_quantity_order_trigger();

NOTIFY pgrst, 'reload schema';
