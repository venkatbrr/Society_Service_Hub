-- Funds: ad-hoc "other contribution" rows.
--
-- Recording money that is not a flat's general share currently means either
-- creating a named purpose up front (`fund_contribution_purposes`) or walking
-- the block -> flat -> resident picker. Both are too heavy for the common case:
-- someone handed over cash for a specific thing and the collector wants to note
-- their name, maybe their flat, what it was for, and move on.
--
-- Two nullable text columns carry that:
--
--   purpose_label           free text for what the money was for, when the
--                           treasurer has not made a named purpose for it
--   contributor_flat_label  free text flat, when no real flat was picked
--
-- IMPORTANT — the general-contribution invariant.
-- `contribution_purpose_id IS NULL` has meant "this is the flat's share" and
-- every paid/unpaid roll and coverage percentage depends on it. An ad-hoc row
-- also has no purpose id, so it MUST be excluded by `purpose_label IS NOT NULL`
-- or it would silently count as a flat's general contribution. `lib/fundLedger.ts`
-- owns that rule for readers; this migration only supplies the columns.

ALTER TABLE public.event_transactions
  ADD COLUMN IF NOT EXISTS purpose_label          TEXT,
  ADD COLUMN IF NOT EXISTS contributor_flat_label TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.event_transactions'::regclass
      AND conname  = 'event_transactions_other_contribution_labels'
  ) THEN
    ALTER TABLE public.event_transactions
      ADD CONSTRAINT event_transactions_other_contribution_labels CHECK (
        (purpose_label IS NULL OR length(btrim(purpose_label)) BETWEEN 1 AND 60)
        AND (contributor_flat_label IS NULL OR length(btrim(contributor_flat_label)) BETWEEN 1 AND 20)
      );
  END IF;

  -- A free-text purpose and a named purpose are two answers to the same
  -- question. Allowing both would make the reporting bucket ambiguous.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.event_transactions'::regclass
      AND conname  = 'event_transactions_one_purpose_only'
  ) THEN
    ALTER TABLE public.event_transactions
      ADD CONSTRAINT event_transactions_one_purpose_only CHECK (
        purpose_label IS NULL OR contribution_purpose_id IS NULL
      );
  END IF;
END $$;

COMMENT ON COLUMN public.event_transactions.purpose_label IS
  'Free-text purpose for an ad-hoc contribution, when no fund_contribution_purposes row exists for it. Mutually exclusive with contribution_purpose_id. A row with this set is NOT a general contribution and must never be counted in a flat''s paid/unpaid roll.';

COMMENT ON COLUMN public.event_transactions.contributor_flat_label IS
  'Free-text flat for an ad-hoc contribution where no real flat was picked. Display only — it never links to community_flats and never marks a flat as having paid its share.';

-- Reporting groups ad-hoc rows by their label, so the same text typed twice
-- lands in one bucket.
CREATE INDEX IF NOT EXISTS event_transactions_purpose_label_idx
  ON public.event_transactions (event_id, purpose_label)
  WHERE purpose_label IS NOT NULL;

NOTIFY pgrst, 'reload schema';
