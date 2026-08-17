-- "Food drop" is renamed to "menu" everywhere a resident can read it.
--
-- Copy only. Tables (mcn_preorder_drops), columns (drop_id), function names,
-- notification `type` values, and route paths all keep the `drop` vocabulary —
-- renaming those would be a data migration with no user-visible payoff, and the
-- app already reads them by those names.
--
-- Every function below is reproduced verbatim from its live definition with the
-- RAISE EXCEPTION / notification strings reworded. No logic changes.

-- 1. Capacity checks ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_mcn_drop_item_capacity(
  p_drop_id uuid,
  p_requested_qty numeric,
  p_existing_order_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(max_items integer, current_items numeric, effective_current_items numeric, projected_items numeric, remaining_capacity numeric, can_place boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    RAISE EXCEPTION 'Menu not found';
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
$function$;

CREATE OR REPLACE FUNCTION public.check_mcn_drop_item_quantity_capacity(
  p_item_id uuid,
  p_requested_qty numeric,
  p_existing_order_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(max_quantity integer, current_quantity numeric, effective_current_quantity numeric, projected_quantity numeric, remaining_capacity numeric, can_place boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    RAISE EXCEPTION 'Menu item not found';
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
$function$;

-- 2. Moderation guards -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_flagged_drop_reactivation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.flagged_for_review_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_community_lead(auth.uid()) OR public.is_platform_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.flagged_for_review_at IS NULL THEN
    RAISE EXCEPTION 'This menu was hidden for review. Only a community lead or platform admin can restore it.';
  END IF;

  IF NEW.status = 'open' AND OLD.status <> 'open' THEN
    RAISE EXCEPTION 'This menu was hidden for review and cannot be reopened until a community lead restores it.';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_max_open_drops_per_host()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_open_count INTEGER;
  v_max_open CONSTANT INTEGER := 3;
BEGIN
  IF NEW.status IS DISTINCT FROM 'open' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_open_count
  FROM public.mcn_preorder_drops d
  WHERE d.created_by = NEW.created_by
    AND d.status = 'open'
    AND d.cutoff_at > now()
    AND d.id <> NEW.id;

  IF v_open_count >= v_max_open THEN
    RAISE EXCEPTION 'You can have at most % open menus at the same time. Close or wait for one to reach its cut-off before publishing another.', v_max_open;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Moderation notifications ------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_drop_hidden_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.flagged_for_review_at IS NOT NULL OR NEW.flagged_for_review_at IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.created_by,
    'drop_hidden_host',
    'Your menu was hidden for review',
    '"' || NEW.title || '" is no longer visible to neighbours and cannot take new orders'
      || COALESCE(' — ' || NEW.flagged_reason, '')
      || '. A community lead will review it.',
    jsonb_build_object('drop_id', NEW.id)
  );

  -- Buyers are told the menu was withdrawn, not that it was reported. Whether
  -- the host did something wrong is unresolved at this point, and the buyers
  -- only need to know their order is not going ahead as planned.
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT DISTINCT
    o.buyer_id,
    'drop_hidden_buyer',
    'A pre-order you placed is on hold',
    '"' || NEW.title || '" has been withdrawn pending review. Please contact the host about your order.',
    jsonb_build_object('drop_id', NEW.id)
  FROM public.mcn_preorder_orders o
  WHERE o.drop_id = NEW.id
    AND o.status = 'confirmed'
    AND o.buyer_id <> NEW.created_by;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_drop_report_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auto_hide_threshold CONSTANT INTEGER := 3;
  v_drop_title TEXT;
  v_drop_community_id UUID;
  v_reporter_name TEXT;
  v_pending_count INTEGER;
BEGIN
  SELECT d.title, d.community_id INTO v_drop_title, v_drop_community_id
  FROM public.mcn_preorder_drops d
  WHERE d.id = NEW.drop_id;

  SELECT p.full_name INTO v_reporter_name
  FROM public.profiles p
  WHERE p.id = NEW.reported_by;

  SELECT COUNT(*) INTO v_pending_count
  FROM public.mcn_drop_reports r
  WHERE r.drop_id = NEW.drop_id
    AND r.status = 'pending';

  IF v_pending_count >= v_auto_hide_threshold THEN
    UPDATE public.mcn_preorder_drops
    SET flagged_for_review_at = now(),
        flagged_reason = 'Auto-hidden after ' || v_pending_count || ' resident reports'
    WHERE id = NEW.drop_id
      AND flagged_for_review_at IS NULL;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT
      p.id,
      'drop_auto_hidden',
      'Menu hidden for review',
      '"' || COALESCE(v_drop_title, 'A menu') || '" was hidden after ' || v_pending_count || ' reports. Tap to review it.',
      jsonb_build_object('drop_id', NEW.drop_id)
    FROM public.profiles p
    WHERE p.community_id = v_drop_community_id
      AND p.app_role IN ('president'::public.app_role_type, 'vice_president'::public.app_role_type)
      AND p.removed_at IS NULL;
  ELSE
    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT
      p.id,
      'drop_reported',
      'Menu reported',
      COALESCE(v_reporter_name, 'A resident') || ' reported "' || COALESCE(v_drop_title, 'a menu') || '". Tap to review.',
      jsonb_build_object('drop_id', NEW.drop_id, 'report_id', NEW.id, 'reason', NEW.reason)
    FROM public.profiles p
    WHERE p.community_id = v_drop_community_id
      AND p.app_role IN ('president'::public.app_role_type, 'vice_president'::public.app_role_type)
      AND p.removed_at IS NULL
      AND p.id != NEW.reported_by;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4. Pre-order placement -----------------------------------------------------

CREATE OR REPLACE FUNCTION public.place_mcn_preorder(
  p_drop_id uuid,
  p_items jsonb,
  p_buyer_name text,
  p_buyer_phone text,
  p_flat_number text,
  p_buyer_note text DEFAULT NULL::text,
  p_order_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  PERFORM set_config('app.mcn_preorder_rpc', 'on', true);

  -- Lock the menu so concurrent buyers serialize on the same row the
  -- menu-wide capacity check reads.
  SELECT * INTO v_drop FROM public.mcn_preorder_drops WHERE id = p_drop_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Menu not found';
  END IF;

  IF v_drop.created_by = v_user THEN
    RAISE EXCEPTION 'Hosts cannot place pre-orders on their own menu';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_user AND p.community_id = v_drop.community_id AND p.removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'You are not a member of this community';
  END IF;

  IF v_drop.status <> 'open' THEN
    RAISE EXCEPTION 'Pre-orders are closed for this menu';
  END IF;

  IF v_drop.cutoff_at <= now() THEN
    RAISE EXCEPTION 'The pre-order cut-off for this menu has passed';
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
      RAISE EXCEPTION 'Pre-order does not belong to this menu';
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
      RAISE EXCEPTION 'That item is no longer part of this menu';
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
      RAISE EXCEPTION 'This menu is capped at % items in total — only % left.',
        v_drop.max_orders,
        GREATEST(0, v_drop.max_orders - (v_drop_sold - v_units));
    END IF;
  END IF;

  UPDATE public.mcn_preorder_orders
  SET total_amount = v_total
  WHERE id = v_order_id;

  -- Notify host on new pre-orders
  IF p_order_id IS NULL AND v_drop.created_by IS DISTINCT FROM v_user THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_drop.created_by,
      'preorder_received',
      'New pre-order',
      COALESCE(NULLIF(btrim(p_buyer_name), ''), 'Resident') || ' (' || upper(btrim(p_flat_number)) || ') ordered ' || v_units || ' item(s) — ₹' || v_total || '.',
      jsonb_build_object('drop_id', p_drop_id, 'order_id', v_order_id)
    );
  END IF;

  RETURN v_order_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';
