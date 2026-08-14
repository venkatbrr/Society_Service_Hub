-- ============================================================
-- Pre-order food: diet labelling + anon-safe order counts
--
-- Supports the filter/sort controls on the Pre-order Food catalog:
--
-- 1. `diet_type` on menu items, so residents can filter a drop down to what
--    they actually eat. Per item rather than per drop because a single drop's
--    menu is routinely mixed (veg curry alongside a chicken biryani), and the
--    same column drives the green/red dot on the menu screen.
--
-- 2. `get_mcn_drop_order_counts` — the catalog sorts by popularity, but
--    `mcn_preorder_orders` is deliberately NOT publicly readable (rows carry
--    buyer name, phone, and flat). A SECURITY DEFINER aggregate hands out
--    counts alone, so logged-out browsers sort correctly without any buyer
--    identity leaving the table.
-- ============================================================

-- ---------- 1. Diet type ----------

ALTER TABLE public.mcn_preorder_items
  ADD COLUMN IF NOT EXISTS diet_type TEXT NOT NULL DEFAULT 'veg';

-- Idempotent: a re-run must not fail on the existing constraint.
ALTER TABLE public.mcn_preorder_items
  DROP CONSTRAINT IF EXISTS mcn_preorder_items_diet_type_check;

ALTER TABLE public.mcn_preorder_items
  ADD CONSTRAINT mcn_preorder_items_diet_type_check
  CHECK (diet_type IN ('veg', 'egg', 'non_veg'));

COMMENT ON COLUMN public.mcn_preorder_items.diet_type IS
  'veg | egg | non_veg. Defaults to veg — items published before this column '
  'existed were backfilled to veg and rely on the host editing them.';

-- Filtering the catalog scans items for the drops currently on screen.
CREATE INDEX IF NOT EXISTS idx_mcn_preorder_items_drop_diet
  ON public.mcn_preorder_items (drop_id, diet_type);

-- ---------- 2. Anon-safe order counts ----------

CREATE OR REPLACE FUNCTION public.get_mcn_drop_order_counts(p_drop_ids UUID[])
RETURNS TABLE (
  drop_id UUID,
  order_count BIGINT,
  item_count NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    o.drop_id,
    COUNT(DISTINCT o.id) AS order_count,
    COALESCE(SUM(oi.quantity), 0) AS item_count
  FROM public.mcn_preorder_orders o
  LEFT JOIN public.mcn_preorder_order_items oi ON oi.order_id = o.id
  WHERE o.drop_id = ANY(p_drop_ids)
    AND o.status <> 'cancelled'
  GROUP BY o.drop_id;
$$;

REVOKE ALL ON FUNCTION public.get_mcn_drop_order_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mcn_drop_order_counts(uuid[]) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
