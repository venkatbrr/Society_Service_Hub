-- Fan-out triggers for Food Drops and Parent Corner, plus Host Pre-order Notifications.

-- 1. Food Drop Published Trigger
CREATE OR REPLACE FUNCTION public.handle_drop_published()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host TEXT;
  v_when TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM 'open' OR NEW.flagged_for_review_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(full_name), ''), 'A neighbour')
  INTO v_host
  FROM public.profiles
  WHERE id = NEW.created_by;

  v_when := TO_CHAR(NEW.fulfillment_date, 'FMDay, FMDD FMMon');

  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    p.id,
    'drop_posted',
    'New food drop',
    COALESCE(v_host, 'A neighbour') || ' is cooking "' || NEW.title || '" for ' || v_when || '.',
    jsonb_build_object('drop_id', NEW.id)
  FROM public.profiles p
  WHERE p.community_id = NEW.community_id
    AND p.id IS DISTINCT FROM NEW.created_by
    AND p.removed_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_preferences np
      WHERE np.user_id = p.id AND np.channel = 'food_drops' AND np.muted
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_drop_published ON public.mcn_preorder_drops;
CREATE TRIGGER on_drop_published
  AFTER INSERT ON public.mcn_preorder_drops
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_drop_published();


-- 2. Pre-order Placed Notification in place_mcn_preorder
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


-- 3. Parent Corner Entry Posted Trigger
CREATE OR REPLACE FUNCTION public.handle_parent_corner_posted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    p.id,
    'parent_corner_posted',
    'New Parent Corner post',
    COALESCE(NULLIF(TRIM(NEW.parent_name), ''), 'A parent') || ' added ' || NEW.student_name || ' (' || NEW.grade_class || ') to Parent Corner.',
    jsonb_build_object('entry_id', NEW.id)
  FROM public.profiles p
  WHERE p.community_id = NEW.community_id
    AND p.id IS DISTINCT FROM NEW.user_id
    AND p.removed_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_preferences np
      WHERE np.user_id = p.id AND np.channel = 'parent_corner' AND np.muted
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_parent_corner_posted ON public.mcn_parent_corner;
CREATE TRIGGER on_parent_corner_posted
  AFTER INSERT ON public.mcn_parent_corner
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_parent_corner_posted();

NOTIFY pgrst, 'reload schema';
