-- ============================================================
-- Migration: Fund ledger amount bounds + outside-sponsor contributions
-- Date: 2026-08-25
-- ============================================================
--
-- 1. AMOUNT SHAPE. event_transactions.amount was bounded only by
--    CHECK (amount > 0): unlimited precision, unlimited magnitude. It now
--    carries a money shape — 2 decimal places and a ceiling of 10,00,000 per
--    transaction — enforced both in the guard trigger (which rounds, so a
--    third decimal is normalised rather than rejected) and by a CHECK
--    constraint as a backstop against direct SQL.
--
--    Both constraints are added NOT VALID: new and updated rows are checked,
--    existing rows are grandfathered. Recorded money is not silently
--    rewritten by a migration. Find pre-existing offenders with:
--      SELECT id, event_id, type, amount FROM public.event_transactions
--      WHERE scale(amount) > 2 OR amount > 1000000;
--
-- 2. OUTSIDE SPONSORS. A president / vice president can now record a
--    contribution from a named sponsor who is not a member of the community.
--    Sponsor rows leave contributor_user_id NULL and carry sponsor_name
--    (required), sponsor_phone and sponsor_note.
--
--    Unchanged by design:
--      * One member, one payment. unique_income_contribution_per_member is
--        partial on contributor_user_id IS NOT NULL, so sponsor rows never
--        collide with it and members still get exactly one row per fund.
--      * No anonymous money. A contribution still has to name its payer —
--        either a member profile or a sponsor name. There is no third case.
--      * Treasurers and collectors still record member contributions; only
--        the lead can bring in an outside sponsor.
--
-- 3. Block scoping and the "assigned fund members only" rule now apply on
--    UPDATE as well as INSERT. They were previously wrapped in
--    IF TG_OP = 'INSERT', which let a block in-charge insert a contribution
--    for their own block and then repoint contributor_user_id at a resident
--    of another block.
-- ============================================================

-- ------------------------------------------------------------
-- Section 1 - amount bounds
-- ------------------------------------------------------------

ALTER TABLE public.event_transactions
  DROP CONSTRAINT IF EXISTS event_transactions_amount_bounds;

ALTER TABLE public.event_transactions
  ADD CONSTRAINT event_transactions_amount_bounds
  CHECK (amount > 0 AND amount <= 1000000 AND scale(amount) <= 2)
  NOT VALID;

-- ------------------------------------------------------------
-- Section 2 - sponsor columns and payer shape
-- ------------------------------------------------------------

ALTER TABLE public.event_transactions
  ADD COLUMN IF NOT EXISTS sponsor_name  TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_phone TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_note  TEXT;

COMMENT ON COLUMN public.event_transactions.sponsor_name IS
  'Outside sponsor who is not a community member. Set only on income rows, and only by a president / vice president. Mutually exclusive with contributor_user_id.';

ALTER TABLE public.event_transactions
  DROP CONSTRAINT IF EXISTS event_transactions_sponsor_shape;

ALTER TABLE public.event_transactions
  ADD CONSTRAINT event_transactions_sponsor_shape
  CHECK (
    (sponsor_name IS NULL OR length(btrim(sponsor_name)) BETWEEN 1 AND 80)
    AND (sponsor_phone IS NULL OR length(btrim(sponsor_phone)) BETWEEN 1 AND 20)
    AND (sponsor_note IS NULL OR length(sponsor_note) <= 280)
    -- phone / note are details about a sponsor; they cannot exist without one
    AND (sponsor_name IS NOT NULL OR (sponsor_phone IS NULL AND sponsor_note IS NULL))
  )
  NOT VALID;

-- Every income row names exactly one payer. Every expense row names none.
ALTER TABLE public.event_transactions
  DROP CONSTRAINT IF EXISTS event_transactions_payer_shape;

ALTER TABLE public.event_transactions
  ADD CONSTRAINT event_transactions_payer_shape
  CHECK (
    CASE
      WHEN type = 'income'
        THEN (contributor_user_id IS NULL) <> (sponsor_name IS NULL)
      ELSE contributor_user_id IS NULL AND sponsor_name IS NULL
    END
  )
  NOT VALID;

CREATE INDEX IF NOT EXISTS idx_event_transactions_event_type
  ON public.event_transactions (event_id, type);

-- ------------------------------------------------------------
-- Section 3 - guard trigger
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_event_transaction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  fund_community_id UUID;
  contributor_community_id UUID;
  community_funds_enabled BOOLEAN;
  caller_role TEXT;
  caller_block_id UUID;
  contributor_block_id UUID;
  caller_is_community_lead BOOLEAN;
  caller_is_platform_admin BOOLEAN;
BEGIN
  IF COALESCE(NULLIF(NEW.title, ''), '') = '' THEN
    RAISE EXCEPTION 'Transaction title is required';
  END IF;

  -- Money reaches the ledger in one shape: 2 decimals, positive, capped.
  -- Rounding rather than rejecting keeps a third decimal from being a dead
  -- end for the person entering it.
  IF NEW.amount IS NULL THEN
    RAISE EXCEPTION 'Amount is required';
  END IF;

  NEW.amount := round(NEW.amount, 2);

  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;

  IF NEW.amount > 1000000 THEN
    RAISE EXCEPTION 'Amount cannot exceed 10,00,000 in a single transaction';
  END IF;

  SELECT e.community_id, c.funds_enabled
  INTO fund_community_id, community_funds_enabled
  FROM public.events e
  JOIN public.communities c ON c.id = e.community_id
  WHERE e.id = NEW.event_id;

  IF fund_community_id IS NULL THEN
    RAISE EXCEPTION 'Fund not found';
  END IF;

  IF NOT COALESCE(community_funds_enabled, false) THEN
    RAISE EXCEPTION 'Funds are not active in this community';
  END IF;

  caller_is_platform_admin := public.is_platform_admin(auth.uid());

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.community_id = fund_community_id
      AND p.app_role IN (
        'president'::public.app_role_type,
        'vice_president'::public.app_role_type
      )
      AND p.removed_at IS NULL
  ) INTO caller_is_community_lead;

  IF NEW.type = 'income' THEN
    NEW.sponsor_name  := NULLIF(btrim(COALESCE(NEW.sponsor_name, '')), '');
    NEW.sponsor_phone := NULLIF(btrim(COALESCE(NEW.sponsor_phone, '')), '');
    NEW.sponsor_note  := NULLIF(btrim(COALESCE(NEW.sponsor_note, '')), '');

    IF NEW.contributor_user_id IS NOT NULL AND NEW.sponsor_name IS NOT NULL THEN
      RAISE EXCEPTION 'A contribution is either from a member or from a sponsor, not both';
    END IF;

    IF NEW.contributor_user_id IS NULL AND NEW.sponsor_name IS NULL THEN
      RAISE EXCEPTION 'Contributor is required for contributions';
    END IF;

    IF NEW.sponsor_name IS NOT NULL THEN
      -- Treasurers and collectors collect from members. Money from outside
      -- the community is the lead's call, and stays attached to a name.
      IF NOT (caller_is_community_lead OR caller_is_platform_admin) THEN
        RAISE EXCEPTION 'Only the president or vice president can record a sponsor contribution';
      END IF;
    ELSE
      SELECT community_id
      INTO contributor_community_id
      FROM public.profiles
      WHERE id = NEW.contributor_user_id;

      IF contributor_community_id IS DISTINCT FROM fund_community_id THEN
        RAISE EXCEPTION 'Contributor must belong to the same community';
      END IF;

      SELECT fr.role, fr.block_id
      INTO caller_role, caller_block_id
      FROM public.fund_roles fr
      WHERE fr.event_id = NEW.event_id
        AND fr.user_id = auth.uid()
      LIMIT 1;

      -- Applies on UPDATE too: editing a row must not be a way to move a
      -- contribution to a resident the caller could not have collected from.
      IF caller_role = 'collector' AND caller_block_id IS NOT NULL THEN
        SELECT p.block_id
        INTO contributor_block_id
        FROM public.profiles p
        WHERE p.id = NEW.contributor_user_id;

        IF contributor_block_id IS DISTINCT FROM caller_block_id THEN
          RAISE EXCEPTION 'Block in-charge can only record contributions for residents of their block';
        END IF;
      ELSIF caller_role IS NULL AND NOT caller_is_community_lead AND NOT caller_is_platform_admin THEN
        -- Keep validation strict for direct SQL usage where RLS may not run first.
        RAISE EXCEPTION 'Only assigned fund members can add contributions';
      END IF;
    END IF;
  ELSE
    NEW.contributor_user_id := NULL;
    NEW.sponsor_name := NULL;
    NEW.sponsor_phone := NULL;
    NEW.sponsor_note := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS event_transaction_guard ON public.event_transactions;
CREATE TRIGGER event_transaction_guard
BEFORE INSERT OR UPDATE ON public.event_transactions
FOR EACH ROW EXECUTE FUNCTION public.validate_event_transaction();

NOTIFY pgrst, 'reload schema';
