-- ============================================================
-- Migration: Payment method on fund transactions
-- Date: 2026-09-19
-- ============================================================
-- Records whether money moved as cash or online, on contributions
-- and expenses alike.

ALTER TABLE public.event_transactions
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Deliberately NULLABLE, and deliberately not backfilled to 'cash'.
--
-- Two reasons, both learned the hard way:
--   1. Rows written before this migration have no recorded method. Defaulting
--      them to 'cash' would invent a fact about real money — a treasurer
--      reconciling the sheet must be able to see "not recorded" and go ask.
--   2. A NOT NULL column would reject inserts from any client still running an
--      older bundle. Installed PWAs pick up a deploy on the launch *after* the
--      one that fetched it (service-worker.js is stale-while-revalidate), so
--      there is always a window where old and new clients write concurrently.
--      A fund mid-collection cannot afford that window to be a hard failure.
--
-- The form always sends a value, so new rows are complete without the database
-- having to make old ones fail.
ALTER TABLE public.event_transactions
  DROP CONSTRAINT IF EXISTS event_transactions_payment_method_check;

ALTER TABLE public.event_transactions
  ADD CONSTRAINT event_transactions_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('cash', 'online'));

COMMENT ON COLUMN public.event_transactions.payment_method IS
  'How the money moved: cash | online. NULL means it predates this column or was written by an older client — render that as "Not recorded", never as cash.';

-- Reporting reads the ledger by fund and splits on method.
CREATE INDEX IF NOT EXISTS idx_event_transactions_payment_method
  ON public.event_transactions (event_id, payment_method)
  WHERE payment_method IS NOT NULL;

NOTIFY pgrst, 'reload schema';
