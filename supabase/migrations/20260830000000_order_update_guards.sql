-- Order update guards, immutability triggers, and atomic business order placement.

-- ---------------------------------------------------------------------------
-- 1. Constrain pre-order updates:
--    Buyer may only transition confirmed -> cancelled.
--    Host may update status across valid states (confirmed/fulfilled/cancelled).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "mcn_preorder_orders_update" ON public.mcn_preorder_orders;
CREATE POLICY "mcn_preorder_orders_update"
  ON public.mcn_preorder_orders FOR UPDATE
  USING (
    (buyer_id = auth.uid() AND status = 'confirmed')
    OR EXISTS (
      SELECT 1 FROM public.mcn_preorder_drops d
      WHERE d.id = drop_id AND d.created_by = auth.uid()
    )
  )
  WITH CHECK (
    (buyer_id = auth.uid() AND status = 'cancelled')
    OR EXISTS (
      SELECT 1 FROM public.mcn_preorder_drops d
      WHERE d.id = drop_id AND d.created_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Trigger: Pre-order amount and ownership immutability outside RPC.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_mcn_preorder_order_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- place_mcn_preorder() sets this for the duration of its transaction.
  IF current_setting('app.mcn_preorder_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.total_amount  IS DISTINCT FROM OLD.total_amount
     OR NEW.buyer_id     IS DISTINCT FROM OLD.buyer_id
     OR NEW.drop_id      IS DISTINCT FROM OLD.drop_id
     OR NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.created_at   IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only place_mcn_preorder() can change the amount or ownership of a pre-order';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mcn_preorder_order_immutable_fields ON public.mcn_preorder_orders;
CREATE TRIGGER trg_mcn_preorder_order_immutable_fields
BEFORE UPDATE ON public.mcn_preorder_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_mcn_preorder_order_immutable_fields();

-- ---------------------------------------------------------------------------
-- 3. Update place_mcn_preorder to set the transaction-local flag.
-- ---------------------------------------------------------------------------
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

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.place_mcn_preorder(uuid, jsonb, text, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_mcn_preorder(uuid, jsonb, text, text, text, text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Business orders update policy and immutability trigger.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "mcn_orders_update" ON public.mcn_orders;
CREATE POLICY "mcn_orders_update"
  ON public.mcn_orders FOR UPDATE
  USING (
    status = 'pending'
    AND (
      buyer_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.mcn_listings l WHERE l.id = listing_id AND l.owner_id = auth.uid())
    )
  )
  WITH CHECK (
    (buyer_id = auth.uid() AND status = 'cancelled')
    OR (
      EXISTS (SELECT 1 FROM public.mcn_listings l WHERE l.id = listing_id AND l.owner_id = auth.uid())
      AND status IN ('fulfilled', 'cancelled')
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_mcn_order_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.mcn_order_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.buyer_id     IS DISTINCT FROM OLD.buyer_id
     OR NEW.listing_id   IS DISTINCT FROM OLD.listing_id
     OR NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.created_at   IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'An order''s buyer, listing, and community cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mcn_order_immutable_fields ON public.mcn_orders;
CREATE TRIGGER trg_mcn_order_immutable_fields
BEFORE UPDATE ON public.mcn_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_mcn_order_immutable_fields();

-- ---------------------------------------------------------------------------
-- 5. Atomic business order placement RPC (Option A1).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_mcn_order(
  p_listing_id UUID,
  p_items JSONB,                      -- [{"product_id": "<uuid>", "quantity": <numeric>}, ...]
  p_buyer_phone TEXT,
  p_buyer_note TEXT DEFAULT NULL,
  p_order_id UUID DEFAULT NULL        -- non-null = edit existing order
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_listing RECORD;
  v_order RECORD;
  v_prod RECORD;
  v_line RECORD;
  v_order_id UUID;
  v_units NUMERIC := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Login required to place an order';
  END IF;

  PERFORM set_config('app.mcn_order_rpc', 'on', true);

  SELECT * INTO v_listing FROM public.mcn_listings WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business listing not found';
  END IF;

  IF v_listing.owner_id = v_user THEN
    RAISE EXCEPTION 'You cannot order from your own business listing';
  END IF;

  IF NOT v_listing.is_active THEN
    RAISE EXCEPTION 'This business listing is currently paused or inactive';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_user AND p.community_id = v_listing.community_id AND p.removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'You are not a member of this community';
  END IF;

  IF COALESCE(btrim(p_buyer_phone), '') = '' THEN
    RAISE EXCEPTION 'Contact phone number is required';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Select at least one item to order';
  END IF;

  IF p_order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.mcn_orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Order not found';
    END IF;
    IF v_order.buyer_id <> v_user THEN
      RAISE EXCEPTION 'You can only edit your own order';
    END IF;
    IF v_order.listing_id <> p_listing_id THEN
      RAISE EXCEPTION 'Order does not belong to this business';
    END IF;
    IF v_order.status <> 'pending' THEN
      RAISE EXCEPTION 'Fulfilled or cancelled orders cannot be edited';
    END IF;

    v_order_id := p_order_id;
    DELETE FROM public.mcn_order_items WHERE order_id = v_order_id;

    UPDATE public.mcn_orders
    SET buyer_phone = btrim(p_buyer_phone),
        buyer_note  = NULLIF(btrim(p_buyer_note), ''),
        updated_at  = now()
    WHERE id = v_order_id;
  ELSE
    INSERT INTO public.mcn_orders (
      listing_id, community_id, buyer_id, buyer_phone,
      buyer_note, status
    ) VALUES (
      p_listing_id, v_listing.community_id, v_user,
      btrim(p_buyer_phone),
      NULLIF(btrim(p_buyer_note), ''),
      'pending'
    )
    RETURNING id INTO v_order_id;
  END IF;

  FOR v_line IN
    SELECT (e->>'product_id')::UUID AS product_id,
           SUM((e->>'quantity')::NUMERIC) AS quantity
     FROM jsonb_array_elements(p_items) e
     WHERE COALESCE((e->>'quantity')::NUMERIC, 0) > 0
     GROUP BY 1
  LOOP
    SELECT * INTO v_prod
    FROM public.mcn_products
    WHERE id = v_line.product_id
    FOR UPDATE;

    IF NOT FOUND OR v_prod.listing_id <> p_listing_id THEN
      RAISE EXCEPTION 'Product % is no longer available from this business', v_line.product_id;
    END IF;

    IF NOT v_prod.is_available THEN
      RAISE EXCEPTION 'Item "%" is currently not available', v_prod.name;
    END IF;

    INSERT INTO public.mcn_order_items (
      order_id, product_id, quantity, unit_price
    ) VALUES (
      v_order_id, v_prod.id, v_line.quantity, v_prod.price
    );

    v_units := v_units + v_line.quantity;
  END LOOP;

  IF v_units <= 0 THEN
    RAISE EXCEPTION 'Select at least one item';
  END IF;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.place_mcn_order(uuid, jsonb, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_mcn_order(uuid, jsonb, text, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
