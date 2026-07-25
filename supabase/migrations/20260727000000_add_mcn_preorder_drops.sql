-- Migration to add MCN Pre-Order Drops, Items, Orders, and Order Items

-- 1. Pre-Order Drops Table
CREATE TABLE IF NOT EXISTS public.mcn_preorder_drops (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id        UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  listing_id          UUID REFERENCES public.mcn_listings(id) ON DELETE CASCADE,
  created_by          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,                         -- e.g. "Saturday Woodfired Pizza Drop"
  description         TEXT,                                  -- e.g. "Handcrafted sourdough pizzas"
  fulfillment_date    DATE NOT NULL,                         -- e.g. 2026-07-26
  fulfillment_time    TEXT NOT NULL,                         -- e.g. "1:00 PM - 3:00 PM"
  cutoff_at           TIMESTAMPTZ NOT NULL,                  -- e.g. 2026-07-25 21:00:00+05:30
  max_orders          INTEGER,                               -- optional order limit
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'completed', 'cancelled')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS mcn_preorder_drops_community_idx ON public.mcn_preorder_drops(community_id, status);
CREATE INDEX IF NOT EXISTS mcn_preorder_drops_creator_idx ON public.mcn_preorder_drops(created_by);

-- 2. Drop Items Table
CREATE TABLE IF NOT EXISTS public.mcn_preorder_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id             UUID NOT NULL REFERENCES public.mcn_preorder_drops(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,                         -- e.g. "Farmhouse Pizza"
  description         TEXT,
  unit                TEXT NOT NULL DEFAULT 'piece' CHECK (unit IN ('piece', 'kg', 'box', 'pack', 'portion', 'litre')),
  price               NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  max_quantity        INTEGER,                               -- optional item quantity cap
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcn_preorder_items_drop_idx ON public.mcn_preorder_items(drop_id);

-- 3. Resident Pre-Orders Table
CREATE TABLE IF NOT EXISTS public.mcn_preorder_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id             UUID NOT NULL REFERENCES public.mcn_preorder_drops(id) ON DELETE CASCADE,
  community_id        UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  buyer_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  buyer_name          TEXT NOT NULL,
  buyer_phone         TEXT NOT NULL,
  flat_number         TEXT NOT NULL,
  buyer_note          TEXT,
  total_amount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'fulfilled', 'cancelled')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcn_preorder_orders_drop_idx ON public.mcn_preorder_orders(drop_id, status);
CREATE INDEX IF NOT EXISTS mcn_preorder_orders_buyer_idx ON public.mcn_preorder_orders(buyer_id);

-- 4. Line Items for Resident Pre-Orders
CREATE TABLE IF NOT EXISTS public.mcn_preorder_order_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES public.mcn_preorder_orders(id) ON DELETE CASCADE,
  item_id             UUID NOT NULL REFERENCES public.mcn_preorder_items(id) ON DELETE RESTRICT,
  item_name           TEXT NOT NULL,
  quantity            NUMERIC(8,2) NOT NULL CHECK (quantity > 0),
  unit_price          NUMERIC(10,2) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcn_preorder_order_items_order_idx ON public.mcn_preorder_order_items(order_id);

-- RLS Setup

ALTER TABLE public.mcn_preorder_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcn_preorder_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcn_preorder_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcn_preorder_order_items ENABLE ROW LEVEL SECURITY;

-- Policies for mcn_preorder_drops
DROP POLICY IF EXISTS "mcn_preorder_drops_select" ON public.mcn_preorder_drops;
CREATE POLICY "mcn_preorder_drops_select"
  ON public.mcn_preorder_drops FOR SELECT
  USING (community_id = get_user_community_id());

DROP POLICY IF EXISTS "mcn_preorder_drops_insert" ON public.mcn_preorder_drops;
CREATE POLICY "mcn_preorder_drops_insert"
  ON public.mcn_preorder_drops FOR INSERT
  WITH CHECK (community_id = get_user_community_id() AND created_by = auth.uid());

DROP POLICY IF EXISTS "mcn_preorder_drops_update" ON public.mcn_preorder_drops;
CREATE POLICY "mcn_preorder_drops_update"
  ON public.mcn_preorder_drops FOR UPDATE
  USING (created_by = auth.uid() OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND app_role = 'community_lead' AND community_id = get_user_community_id()
  ));

DROP POLICY IF EXISTS "mcn_preorder_drops_delete" ON public.mcn_preorder_drops;
CREATE POLICY "mcn_preorder_drops_delete"
  ON public.mcn_preorder_drops FOR DELETE
  USING (created_by = auth.uid() OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND app_role = 'community_lead' AND community_id = get_user_community_id()
  ));

-- Policies for mcn_preorder_items
DROP POLICY IF EXISTS "mcn_preorder_items_select" ON public.mcn_preorder_items;
CREATE POLICY "mcn_preorder_items_select"
  ON public.mcn_preorder_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.mcn_preorder_drops d WHERE d.id = drop_id AND d.community_id = get_user_community_id()
  ));

DROP POLICY IF EXISTS "mcn_preorder_items_insert" ON public.mcn_preorder_items;
CREATE POLICY "mcn_preorder_items_insert"
  ON public.mcn_preorder_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.mcn_preorder_drops d WHERE d.id = drop_id AND d.created_by = auth.uid()
  ));

DROP POLICY IF EXISTS "mcn_preorder_items_update" ON public.mcn_preorder_items;
CREATE POLICY "mcn_preorder_items_update"
  ON public.mcn_preorder_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.mcn_preorder_drops d WHERE d.id = drop_id AND d.created_by = auth.uid()
  ));

DROP POLICY IF EXISTS "mcn_preorder_items_delete" ON public.mcn_preorder_items;
CREATE POLICY "mcn_preorder_items_delete"
  ON public.mcn_preorder_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.mcn_preorder_drops d WHERE d.id = drop_id AND d.created_by = auth.uid()
  ));

-- Policies for mcn_preorder_orders
DROP POLICY IF EXISTS "mcn_preorder_orders_select" ON public.mcn_preorder_orders;
CREATE POLICY "mcn_preorder_orders_select"
  ON public.mcn_preorder_orders FOR SELECT
  USING (buyer_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.mcn_preorder_drops d WHERE d.id = drop_id AND d.created_by = auth.uid()
  ));

DROP POLICY IF EXISTS "mcn_preorder_orders_insert" ON public.mcn_preorder_orders;
CREATE POLICY "mcn_preorder_orders_insert"
  ON public.mcn_preorder_orders FOR INSERT
  WITH CHECK (community_id = get_user_community_id() AND buyer_id = auth.uid());

DROP POLICY IF EXISTS "mcn_preorder_orders_update" ON public.mcn_preorder_orders;
CREATE POLICY "mcn_preorder_orders_update"
  ON public.mcn_preorder_orders FOR UPDATE
  USING (buyer_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.mcn_preorder_drops d WHERE d.id = drop_id AND d.created_by = auth.uid()
  ));

DROP POLICY IF EXISTS "mcn_preorder_orders_delete" ON public.mcn_preorder_orders;
CREATE POLICY "mcn_preorder_orders_delete"
  ON public.mcn_preorder_orders FOR DELETE
  USING (buyer_id = auth.uid() AND status = 'confirmed');

-- Policies for mcn_preorder_order_items
DROP POLICY IF EXISTS "mcn_preorder_order_items_select" ON public.mcn_preorder_order_items;
CREATE POLICY "mcn_preorder_order_items_select"
  ON public.mcn_preorder_order_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.mcn_preorder_orders o
    JOIN public.mcn_preorder_drops d ON d.id = o.drop_id
    WHERE o.id = order_id AND (o.buyer_id = auth.uid() OR d.created_by = auth.uid())
  ));

DROP POLICY IF EXISTS "mcn_preorder_order_items_insert" ON public.mcn_preorder_order_items;
CREATE POLICY "mcn_preorder_order_items_insert"
  ON public.mcn_preorder_order_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.mcn_preorder_orders o WHERE o.id = order_id AND o.buyer_id = auth.uid()
  ));

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.touch_mcn_preorder_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mcn_preorder_drops_updated_at ON public.mcn_preorder_drops;
CREATE TRIGGER mcn_preorder_drops_updated_at
  BEFORE UPDATE ON public.mcn_preorder_drops
  FOR EACH ROW EXECUTE FUNCTION public.touch_mcn_preorder_updated_at();

DROP TRIGGER IF EXISTS mcn_preorder_orders_updated_at ON public.mcn_preorder_orders;
CREATE TRIGGER mcn_preorder_orders_updated_at
  BEFORE UPDATE ON public.mcn_preorder_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_mcn_preorder_updated_at();

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
