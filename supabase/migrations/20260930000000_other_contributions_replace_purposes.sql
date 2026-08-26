-- ============================================================
-- Migration: "Other contributions" replace the purpose catalog
-- Date: 2026-09-30
-- ============================================================
--
-- 20260928000000 let a household give more than once by making the treasurer
-- first define a named purpose ("Food", "God idol") and then walk the block ->
-- flat -> resident picker to record against it. That is two setup steps and a
-- picker for what is, in practice, someone handing over cash at the door and a
-- collector wanting to write down a name, what it was for, and an amount.
--
-- 20260929000000 added the two free-text columns for that shape. This migration
-- finishes the swap:
--
--   * fund_contribution_purposes and event_transactions.contribution_purpose_id
--     are dropped. Any row that pointed at a named purpose keeps the label —
--     the purpose's name is copied into purpose_label first, so no recorded
--     money loses what it was for.
--
--   * An income row may now name its payer in a third way: an ad-hoc "other
--     contribution" carrying contributor_name and purpose_label, with no flat
--     and no member. event_transactions_payer_shape and the guard trigger both
--     learn that shape.
--
-- The general-contribution invariant, restated because everything depends on
-- it: a flat's share is an income row with purpose_label IS NULL. Ad-hoc rows
-- never set contributor_flat_id or contributor_user_id, so the two unique
-- indexes go back to their pre-20260928 predicates and still mean exactly what
-- they meant then — one share per flat, one per member. Coverage and paid/unpaid
-- rolls key off contributor_flat_id and are therefore correct by construction.

-- ------------------------------------------------------------
-- Section 1 - keep the labels, drop the catalog
-- ------------------------------------------------------------

UPDATE public.event_transactions et
SET purpose_label = LEFT(btrim(p.name), 60)
FROM public.fund_contribution_purposes p
WHERE p.id = et.contribution_purpose_id
  AND et.purpose_label IS NULL;

ALTER TABLE public.event_transactions
  DROP CONSTRAINT IF EXISTS event_transactions_one_purpose_only;

DROP INDEX IF EXISTS public.idx_event_transactions_purpose;

ALTER TABLE public.event_transactions
  DROP COLUMN IF EXISTS contribution_purpose_id;

DROP TABLE IF EXISTS public.fund_contribution_purposes;
DROP FUNCTION IF EXISTS public.validate_fund_contribution_purpose();
DROP FUNCTION IF EXISTS public.touch_fund_contribution_purposes_updated_at();

-- ------------------------------------------------------------
-- Section 2 - unique indexes go back to what they were
-- ------------------------------------------------------------
--
-- No purpose predicate is needed: an ad-hoc row has neither a flat nor a
-- member, so it cannot collide with a flat's share in the first place.

DROP INDEX IF EXISTS public.unique_income_contribution_per_flat;
CREATE UNIQUE INDEX unique_income_contribution_per_flat
  ON public.event_transactions (event_id, contributor_flat_id)
  WHERE type = 'income' AND contributor_flat_id IS NOT NULL;

DROP INDEX IF EXISTS public.unique_income_contribution_per_member;
CREATE UNIQUE INDEX unique_income_contribution_per_member
  ON public.event_transactions (event_id, contributor_user_id)
  WHERE type = 'income' AND contributor_user_id IS NOT NULL;

-- ------------------------------------------------------------
-- Section 3 - a third payer shape
-- ------------------------------------------------------------
--
-- Still no anonymous money: every income row names someone. What changes is
-- that the name no longer has to resolve to a flat or a member.

ALTER TABLE public.event_transactions
  DROP CONSTRAINT IF EXISTS event_transactions_payer_shape;

ALTER TABLE public.event_transactions
  ADD CONSTRAINT event_transactions_payer_shape
  CHECK (
    CASE WHEN type = 'income' THEN
      -- outside sponsor: no member, no flat
      (sponsor_name IS NOT NULL
        AND contributor_user_id IS NULL
        AND contributor_flat_id IS NULL)
      OR
      -- the flat's share: always named, and identified by a flat (normal) or at
      -- least a member (community with no flat inventory)
      (sponsor_name IS NULL
        AND purpose_label IS NULL
        AND contributor_name IS NOT NULL
        AND btrim(contributor_name) <> ''
        AND (contributor_flat_id IS NOT NULL OR contributor_user_id IS NOT NULL))
      OR
      -- ad-hoc other contribution: a name and what it was for, nothing else
      -- required. The flat, if given at all, is free text on
      -- contributor_flat_label and never links to community_flats.
      (sponsor_name IS NULL
        AND purpose_label IS NOT NULL
        AND contributor_name IS NOT NULL
        AND btrim(contributor_name) <> ''
        AND contributor_flat_id IS NULL
        AND contributor_user_id IS NULL)
    ELSE
      contributor_user_id IS NULL
      AND contributor_flat_id IS NULL
      AND contributor_name IS NULL
      AND sponsor_name IS NULL
      AND purpose_label IS NULL
      AND contributor_flat_label IS NULL
    END
  ) NOT VALID;

-- ------------------------------------------------------------
-- Section 4 - guard trigger
-- ------------------------------------------------------------
--
-- Carried over from 20260911000000 with the purpose-catalog block removed and
-- the ad-hoc branch added. See that migration for why each of the older rules
-- is there.

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
  caller_is_community_lead BOOLEAN;
  caller_is_platform_admin BOOLEAN;
  flat_row public.community_flats%ROWTYPE;
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
    NEW.sponsor_name           := NULLIF(btrim(COALESCE(NEW.sponsor_name, '')), '');
    NEW.sponsor_phone          := NULLIF(btrim(COALESCE(NEW.sponsor_phone, '')), '');
    NEW.sponsor_note           := NULLIF(btrim(COALESCE(NEW.sponsor_note, '')), '');
    NEW.contributor_name       := NULLIF(btrim(COALESCE(NEW.contributor_name, '')), '');
    NEW.purpose_label          := NULLIF(btrim(COALESCE(NEW.purpose_label, '')), '');
    NEW.contributor_flat_label := NULLIF(btrim(COALESCE(NEW.contributor_flat_label, '')), '');

    SELECT fr.role, fr.block_id INTO caller_role, caller_block_id
    FROM public.fund_roles fr
    WHERE fr.event_id = NEW.event_id AND fr.user_id = auth.uid()
    LIMIT 1;

    IF NEW.sponsor_name IS NOT NULL THEN
      IF NEW.contributor_user_id IS NOT NULL OR NEW.contributor_flat_id IS NOT NULL THEN
        RAISE EXCEPTION 'A sponsor contribution cannot name a member or a flat';
      END IF;
      IF NOT (caller_is_community_lead OR caller_is_platform_admin) THEN
        RAISE EXCEPTION 'Only the president or vice president can record a sponsor contribution';
      END IF;

    ELSIF NEW.purpose_label IS NOT NULL THEN
      -- Ad-hoc "other contribution": money given for something specific, by
      -- someone the collector identifies by name rather than by flat. It marks
      -- no flat as paid, so it carries no flat key at all — a free-text flat is
      -- a note about where the money came from, nothing more.
      IF NEW.contributor_name IS NULL THEN
        RAISE EXCEPTION 'Contributor name is required';
      END IF;

      NEW.contributor_flat_id := NULL;
      NEW.contributor_user_id := NULL;

      IF caller_role IS NULL AND NOT caller_is_community_lead AND NOT caller_is_platform_admin THEN
        RAISE EXCEPTION 'Only assigned fund members can add contributions';
      END IF;

    ELSE
      -- The flat's share.
      NEW.contributor_flat_label := NULL;

      IF NEW.contributor_flat_id IS NULL AND NEW.contributor_user_id IS NULL THEN
        RAISE EXCEPTION 'A contribution must name a flat or a member';
      END IF;

      -- A registered payer's flat is stamped from their profile when the client
      -- did not send one, so every row lands with the flat key populated.
      IF NEW.contributor_flat_id IS NULL AND NEW.contributor_user_id IS NOT NULL THEN
        SELECT p.flat_id INTO NEW.contributor_flat_id
        FROM public.profiles p WHERE p.id = NEW.contributor_user_id;
      END IF;

      IF NEW.contributor_flat_id IS NOT NULL THEN
        SELECT * INTO flat_row
        FROM public.community_flats WHERE id = NEW.contributor_flat_id;

        IF flat_row.id IS NULL THEN
          RAISE EXCEPTION 'Flat not found';
        END IF;
        IF flat_row.community_id IS DISTINCT FROM fund_community_id THEN
          RAISE EXCEPTION 'Flat must belong to the same community as the fund';
        END IF;
        -- Archived flats may still be edited in history but not collected against.
        IF TG_OP = 'INSERT' AND flat_row.archived_at IS NOT NULL THEN
          RAISE EXCEPTION 'Cannot record a contribution against an archived flat';
        END IF;
      END IF;

      IF NEW.contributor_user_id IS NOT NULL THEN
        SELECT community_id INTO contributor_community_id
        FROM public.profiles WHERE id = NEW.contributor_user_id;

        IF contributor_community_id IS DISTINCT FROM fund_community_id THEN
          RAISE EXCEPTION 'Contributor must belong to the same community';
        END IF;

        IF NEW.contributor_name IS NULL THEN
          SELECT NULLIF(btrim(p.full_name), '') INTO NEW.contributor_name
          FROM public.profiles p WHERE p.id = NEW.contributor_user_id;
        END IF;
      END IF;

      -- Last resort before failing: the flat's known occupant.
      IF NEW.contributor_name IS NULL AND flat_row.id IS NOT NULL THEN
        NEW.contributor_name := NULLIF(btrim(flat_row.occupant_name), '');
      END IF;

      IF NEW.contributor_name IS NULL THEN
        RAISE EXCEPTION 'Contributor name is required';
      END IF;

      -- Block scoping reads the FLAT's block, not the contributor profile's.
      -- An unregistered payer has no profile to scope by. Applies on UPDATE too,
      -- so editing cannot move a contribution outside the caller's block.
      IF caller_role = 'collector' AND caller_block_id IS NOT NULL THEN
        IF flat_row.block_id IS DISTINCT FROM caller_block_id THEN
          RAISE EXCEPTION 'Block in-charge can only record contributions for flats in their block';
        END IF;
      ELSIF caller_role IS NULL AND NOT caller_is_community_lead AND NOT caller_is_platform_admin THEN
        RAISE EXCEPTION 'Only assigned fund members can add contributions';
      END IF;
    END IF;
  ELSE
    NEW.contributor_user_id       := NULL;
    NEW.contributor_flat_id       := NULL;
    NEW.contributor_name          := NULL;
    NEW.sponsor_name              := NULL;
    NEW.sponsor_phone             := NULL;
    NEW.sponsor_note              := NULL;
    -- An expense is money leaving the fund. What it was for is `title`.
    NEW.purpose_label             := NULL;
    NEW.contributor_flat_label    := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS event_transaction_guard ON public.event_transactions;
CREATE TRIGGER event_transaction_guard
BEFORE INSERT OR UPDATE ON public.event_transactions
FOR EACH ROW EXECUTE FUNCTION public.validate_event_transaction();

-- ------------------------------------------------------------
-- Section 5 - collection picker loses the offering columns
-- ------------------------------------------------------------
--
-- Restored to its 20260911000000 shape. Ad-hoc rows carry no flat key, so there
-- is no per-flat offering total left to report.

DROP FUNCTION IF EXISTS public.list_collection_targets_for_collector(UUID);

CREATE FUNCTION public.list_collection_targets_for_collector(p_event_id UUID)
RETURNS TABLE (
  flat_id            UUID,
  block_id           UUID,
  block_name         TEXT,
  flat_number        TEXT,
  floor_label        TEXT,
  flat_label         TEXT,
  resident_user_id   UUID,
  resident_name      TEXT,
  occupant_name      TEXT,
  resident_count     INT,
  has_contributed    BOOLEAN,
  contributed_amount NUMERIC,
  contribution_id    UUID
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
    f.id,
    f.block_id,
    b.name::TEXT,
    f.flat_number::TEXT,
    f.floor_label::TEXT,
    (CASE WHEN b.name IS NOT NULL THEN b.name || '-' || f.flat_number
          ELSE f.flat_number END)::TEXT AS flat_label,
    r.user_id,
    r.full_name::TEXT,
    f.occupant_name::TEXT,
    COALESCE(r.total, 0)::INT,
    (tx.id IS NOT NULL) AS has_contributed,
    tx.amount,
    tx.id
  FROM public.community_flats f
  LEFT JOIN public.community_blocks b
    ON b.id = f.block_id AND b.archived_at IS NULL
  LEFT JOIN LATERAL (
    -- One representative resident per flat: the earliest to join. resident_count
    -- lets the UI say "2 residents" without the RPC returning a row per person.
    SELECT p.id AS user_id, p.full_name,
           COUNT(*) OVER () AS total
    FROM public.profiles p
    WHERE p.flat_id = f.id
      AND p.removed_at IS NULL
      AND p.app_role IN ('resident'::public.app_role_type,
                         'president'::public.app_role_type,
                         'vice_president'::public.app_role_type)
    ORDER BY p.created_at NULLS LAST
    LIMIT 1
  ) r ON TRUE
  LEFT JOIN LATERAL (
    SELECT et.id, et.amount
    FROM public.event_transactions et
    WHERE et.event_id = p_event_id
      AND et.type = 'income'
      AND et.contributor_flat_id = f.id
    LIMIT 1
  ) tx ON TRUE
  WHERE f.community_id = event_community_id
    AND f.archived_at IS NULL
    AND (
      (caller_role = 'collector' AND caller_block_id IS NOT NULL AND f.block_id = caller_block_id)
      OR (caller_role = 'collector' AND caller_block_id IS NULL)
      OR caller_role = 'treasurer'
      OR caller_is_community_lead
      OR caller_is_platform_admin
    )
  ORDER BY b.name NULLS LAST, length(f.flat_number), f.flat_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_collection_targets_for_collector(UUID) TO authenticated;

-- ------------------------------------------------------------
-- Section 6 - public RPCs
-- ------------------------------------------------------------
--
-- contributor_count goes back to counting income rows: with the catalog gone,
-- one row really is one contribution someone made, and an ad-hoc donor is as
-- much a contributor as a flat paying its share. paid_flats stays keyed on
-- contributor_flat_id, which ad-hoc rows never set, so coverage cannot be
-- inflated by them. The DISTINCT is kept — it is correct regardless.

CREATE OR REPLACE FUNCTION public.get_fund_public_summary(p_event_id UUID)
RETURNS TABLE (
  fund_title         TEXT,
  community_name     TEXT,
  is_closed          BOOLEAN,
  collected          NUMERIC,
  spent              NUMERIC,
  balance            NUMERIC,
  contributor_count  INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.title::TEXT,
    c.name::TEXT,
    COALESCE(e.is_closed, false),
    COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'), 0)::NUMERIC,
    COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense'), 0)::NUMERIC,
    (COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'), 0)
      - COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense'), 0))::NUMERIC,
    COUNT(*) FILTER (WHERE t.type = 'income')::INT
  FROM public.events e
  JOIN public.communities c ON c.id = e.community_id
  LEFT JOIN public.event_transactions t ON t.event_id = e.id
  WHERE e.id = p_event_id
    AND COALESCE(c.funds_enabled, false)
  GROUP BY e.title, c.name, e.is_closed;
$$;

COMMENT ON FUNCTION public.get_fund_public_summary(UUID) IS
  'Aggregates only, for the signed-out landing on a shared fund link. Never add a column that names a person, a flat, or a single transaction — the whole point is that a forwarded WhatsApp link cannot reveal who paid what.';

GRANT EXECUTE ON FUNCTION public.get_fund_public_summary(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_fund_public_blocks(p_event_id UUID)
RETURNS TABLE (
  block_name   TEXT,
  total_flats  INT,
  paid_flats   INT,
  collected    NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.name::TEXT,
    COUNT(DISTINCT f.id)::INT,
    COUNT(DISTINCT f.id) FILTER (WHERE t.id IS NOT NULL)::INT,
    COALESCE(SUM(t.amount), 0)::NUMERIC
  FROM public.events e
  JOIN public.communities c      ON c.id = e.community_id AND COALESCE(c.funds_enabled, false)
  JOIN public.community_flats f  ON f.community_id = e.community_id AND f.archived_at IS NULL
  JOIN public.community_blocks b ON b.id = f.block_id AND b.archived_at IS NULL
  LEFT JOIN public.event_transactions t
    ON t.contributor_flat_id = f.id
   AND t.event_id = e.id
   AND t.type = 'income'
  WHERE e.id = p_event_id
  GROUP BY b.name
  ORDER BY b.name;
$$;

COMMENT ON FUNCTION public.get_fund_public_blocks(UUID) IS
  'Per-block totals for the signed-out landing on a shared fund link. Aggregates only — never add contributor names, flat numbers, or transaction rows.';

GRANT EXECUTE ON FUNCTION public.get_fund_public_blocks(UUID) TO anon, authenticated;

-- ------------------------------------------------------------
-- Section 7 - platform coverage RPC
-- ------------------------------------------------------------
--
-- The purpose filter goes with the column. COUNT(DISTINCT) stays: `residents`
-- fanned out across the transaction join even before offerings existed.

CREATE OR REPLACE FUNCTION public.platform_get_fund_collection_coverage(p_event_id UUID)
RETURNS TABLE (
  block_id UUID,
  block_name TEXT,
  residents BIGINT,
  contributors BIGINT,
  collected NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_community_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view fund collection coverage';
  END IF;

  SELECT e.community_id INTO v_community_id FROM public.events e WHERE e.id = p_event_id;
  IF v_community_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.block_id,
    COALESCE(b.name, 'Unassigned') AS block_name,
    COUNT(DISTINCT p.id)::BIGINT AS residents,
    COUNT(DISTINCT p.id) FILTER (WHERE t.id IS NOT NULL)::BIGINT AS contributors,
    COALESCE(SUM(t.amount), 0)::NUMERIC AS collected
  FROM public.profiles p
  LEFT JOIN public.community_blocks b ON b.id = p.block_id
  LEFT JOIN public.event_transactions t
    ON t.contributor_user_id = p.id
   AND t.event_id = p_event_id
   AND t.type = 'income'
  WHERE p.community_id = v_community_id
    AND p.removed_at IS NULL
  GROUP BY p.block_id, b.name
  ORDER BY block_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_fund_collection_coverage(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_fund_collection_coverage(UUID) TO authenticated;

-- ------------------------------------------------------------
-- Section 8 - platform ledger reads the free-text label
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS public.platform_get_fund_ledger(UUID);

CREATE FUNCTION public.platform_get_fund_ledger(p_event_id UUID)
RETURNS TABLE (
  transaction_id UUID,
  entry_kind TEXT,
  type TEXT,
  category TEXT,
  purpose_name TEXT,
  title TEXT,
  description TEXT,
  amount NUMERIC,
  running_balance NUMERIC,
  contributor_id UUID,
  contributor_name TEXT,
  contributor_flat TEXT,
  contributor_block TEXT,
  sponsor_name TEXT,
  sponsor_phone TEXT,
  sponsor_note TEXT,
  image_url TEXT,
  recorded_by_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view fund ledgers';
  END IF;

  RETURN QUERY
  SELECT
    t.id AS transaction_id,
    CASE
      WHEN t.type = 'expense' THEN 'expense'
      WHEN t.purpose_label IS NOT NULL THEN 'other_contribution'
      WHEN t.contributor_user_id IS NOT NULL THEN 'resident_contribution'
      WHEN t.sponsor_name IS NOT NULL THEN 'sponsor_contribution'
      ELSE 'other_income'
    END AS entry_kind,
    t.type,
    t.category,
    t.purpose_label AS purpose_name,
    t.title,
    t.description,
    t.amount,
    SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
      OVER (ORDER BY t.created_at ASC, t.id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::NUMERIC AS running_balance,
    t.contributor_user_id AS contributor_id,
    -- The snapshot name is what an ad-hoc row and an unregistered flat payer
    -- have; the profile join only ever resolves registered members.
    COALESCE(cp.full_name, t.contributor_name) AS contributor_name,
    COALESCE(cp.flat_number, t.contributor_flat_label) AS contributor_flat,
    cb.name AS contributor_block,
    t.sponsor_name,
    t.sponsor_phone,
    t.sponsor_note,
    t.image_url,
    rp.full_name AS recorded_by_name,
    t.created_at
  FROM public.event_transactions t
  LEFT JOIN public.profiles cp ON cp.id = t.contributor_user_id
  LEFT JOIN public.community_blocks cb ON cb.id = cp.block_id
  LEFT JOIN public.profiles rp ON rp.id = t.created_by
  WHERE t.event_id = p_event_id
  ORDER BY t.created_at DESC, t.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_fund_ledger(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_fund_ledger(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
