-- ============================================================
-- Pre-order food: explicit meal slot on the drop
--
-- The catalog's Meal filter previously bucketed `fulfillment_time` on the
-- client (before 11:00 breakfast, to 15:30 lunch, to 19:00 snacks, else
-- dinner). That is right most of the time and wrong exactly where it matters:
-- a midnight-snack drop delivering at 20:00 files as dinner, a brunch at 11:30
-- files as lunch. The host knows which meal they cooked; the clock guesses.
--
-- Existing rows are backfilled with the same bucketing the client used, so
-- nothing changes category on deploy — hosts can correct theirs by editing.
-- ============================================================

ALTER TABLE public.mcn_preorder_drops
  ADD COLUMN IF NOT EXISTS meal_type TEXT;

-- `fulfillment_time` is TEXT, not TIME — it holds the 'HH:mm' the form writes,
-- but older rows can carry '1:00 PM' shapes that would fail a ::time cast and
-- abort the whole migration. Zero-padded 'HH:MM' compares lexicographically
-- exactly as it does chronologically, so guard on the shape and compare as
-- strings; anything unparseable falls to lunch, which the host can correct.
UPDATE public.mcn_preorder_drops
SET meal_type = CASE
  WHEN fulfillment_time ~ '^[0-9]{2}:[0-9]{2}' THEN
    CASE
      WHEN substring(fulfillment_time FROM 1 FOR 5) < '11:00' THEN 'breakfast'
      WHEN substring(fulfillment_time FROM 1 FOR 5) < '15:30' THEN 'lunch'
      WHEN substring(fulfillment_time FROM 1 FOR 5) < '19:00' THEN 'snacks'
      ELSE 'dinner'
    END
  ELSE 'lunch'
END
WHERE meal_type IS NULL;

ALTER TABLE public.mcn_preorder_drops
  ALTER COLUMN meal_type SET DEFAULT 'lunch';

ALTER TABLE public.mcn_preorder_drops
  ALTER COLUMN meal_type SET NOT NULL;

ALTER TABLE public.mcn_preorder_drops
  DROP CONSTRAINT IF EXISTS mcn_preorder_drops_meal_type_check;

ALTER TABLE public.mcn_preorder_drops
  ADD CONSTRAINT mcn_preorder_drops_meal_type_check
  CHECK (meal_type IN ('breakfast', 'lunch', 'snacks', 'dinner'));

COMMENT ON COLUMN public.mcn_preorder_drops.meal_type IS
  'breakfast | lunch | snacks | dinner. Chosen by the host at publish time; '
  'the form seeds it from fulfillment_time but the host can override.';

-- The catalog filters open drops within one community by meal.
CREATE INDEX IF NOT EXISTS idx_mcn_preorder_drops_community_meal
  ON public.mcn_preorder_drops (community_id, meal_type);

NOTIFY pgrst, 'reload schema';
