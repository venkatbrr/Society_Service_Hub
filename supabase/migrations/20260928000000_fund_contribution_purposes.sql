-- ============================================================
-- Migration: Named contribution purposes (offerings) per fund
-- Date: 2026-09-28
-- ============================================================
--
-- A household's giving to a festival fund is not one number. They pay the
-- flat's share, and then the same household separately offers money for the
-- food, the idol, the prasadam. Until now the ledger could hold only the first
-- of those: unique_income_contribution_per_flat gave each flat exactly one
-- income row per fund, so the second offering came back as "already paid".
--
-- The shape this adds:
--
--   * fund_contribution_purposes — a short, per-fund list of named purposes the
--     treasurer or lead maintains ("Food", "God idol", "Prasadam"). Per fund
--     rather than per community: a Ganesh Chaturthi fund and a lift-repair fund
--     have nothing in common worth inheriting.
--
--   * event_transactions.contribution_purpose_id — NULL means the general
--     contribution: still exactly one per flat, still what the paid / unpaid
--     roll counts. Non-NULL means an earmarked offering, and a flat may have as
--     many of those as it likes.
--
-- That NULL is load-bearing. Every count that means "how many flats have paid"
-- now filters on it — the collection picker, the public summary, and the
-- platform coverage RPC all counted raw income rows, and would otherwise report
-- a flat that made three offerings as three paid flats.
--
-- Deliberately unchanged:
--   * Who may record what. Collectors and treasurers record contributions of
--     any purpose; only a lead brings in an outside sponsor. A sponsor may
--     sponsor a purpose — "Sharma Electricals paid for the lighting" is exactly
--     the entry a treasurer needs.
--   * Amount bounds, payer shape, block scoping — all still enforced by
--     event_transaction_guard.
--   * Purposes are archived, never deleted while money points at them
--     (ON DELETE RESTRICT), because the ledger has to keep reading correctly.

-- ------------------------------------------------------------
-- Section 1 - the per-fund purpose list
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fund_contribution_purposes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  -- A purpose outlives the person who typed it; deleting them must not take
  -- the ledger's labels with it.
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fund_contribution_purposes_name_shape
    CHECK (length(btrim(name)) BETWEEN 1 AND 40)
);

COMMENT ON TABLE public.fund_contribution_purposes IS
  'Named things a resident can contribute towards inside one fund, beyond the general contribution — food, god idol, prasadam. Maintained by the fund treasurer or a community lead.';
COMMENT ON COLUMN public.fund_contribution_purposes.archived_at IS
  'Archived purposes disappear from the collection form but keep rendering on the rows already recorded against them. Purposes are never deleted while money points at them.';

-- Case-insensitive, so "Food" and "food" cannot both sit in the same picker.
-- Partial on archived_at so a purpose can be archived and a fresh one created
-- under the same name later.
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_purpose_name_per_fund
  ON public.fund_contribution_purposes (event_id, lower(btrim(name)))
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fund_contribution_purposes_event
  ON public.fund_contribution_purposes (event_id);

CREATE OR REPLACE FUNCTION public.touch_fund_contribution_purposes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fund_contribution_purposes_touch ON public.fund_contribution_purposes;
CREATE TRIGGER fund_contribution_purposes_touch
BEFORE UPDATE ON public.fund_contribution_purposes
FOR EACH ROW EXECUTE FUNCTION public.touch_fund_contribution_purposes_updated_at();

-- ------------------------------------------------------------
-- Section 2 - purpose guard: fund must be open, list must stay short
-- ------------------------------------------------------------
--
-- The cap is a usability limit, not a security one. The purpose picker sits
-- inline on the collection form a collector uses standing at a door; past a
-- dozen chips it stops being a picker and starts being a search problem.

CREATE OR REPLACE FUNCTION public.validate_fund_contribution_purpose()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  fund_community_id UUID;
  community_funds_enabled BOOLEAN;
  fund_is_closed BOOLEAN;
  active_count INT;
BEGIN
  NEW.name := NULLIF(btrim(COALESCE(NEW.name, '')), '');

  IF NEW.name IS NULL THEN
    RAISE EXCEPTION 'Purpose name is required';
  END IF;

  SELECT e.community_id, c.funds_enabled, COALESCE(e.is_closed, false)
  INTO fund_community_id, community_funds_enabled, fund_is_closed
  FROM public.events e
  JOIN public.communities c ON c.id = e.community_id
  WHERE e.id = NEW.event_id;

  IF fund_community_id IS NULL THEN
    RAISE EXCEPTION 'Fund not found';
  END IF;

  IF NOT COALESCE(community_funds_enabled, false) THEN
    RAISE EXCEPTION 'Funds are not active in this community';
  END IF;

  -- Archiving stays available on a closed fund; adding to it does not.
  IF fund_is_closed AND NEW.archived_at IS NULL THEN
    RAISE EXCEPTION 'This fund is closed';
  END IF;

  IF NEW.archived_at IS NULL THEN
    SELECT COUNT(*) INTO active_count
    FROM public.fund_contribution_purposes p
    WHERE p.event_id = NEW.event_id
      AND p.archived_at IS NULL
      AND p.id <> NEW.id;

    IF active_count >= 12 THEN
      RAISE EXCEPTION 'A fund can have at most 12 contribution purposes';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fund_contribution_purpose_guard ON public.fund_contribution_purposes;
CREATE TRIGGER fund_contribution_purpose_guard
BEFORE INSERT OR UPDATE ON public.fund_contribution_purposes
FOR EACH ROW EXECUTE FUNCTION public.validate_fund_contribution_purpose();

-- ------------------------------------------------------------
-- Section 3 - RLS: everyone in the community reads, admins and
--             treasurers write
-- ------------------------------------------------------------
--
-- Read is community-wide for the same reason the block summary is: a resident
-- must be able to see what the fund is collecting for without asking the
-- treasurer. Write is the treasurer's, matching who owns expenses — a collector
-- records against the list but does not get to invent entries on it.

ALTER TABLE public.fund_contribution_purposes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Community members can view fund contribution purposes" ON public.fund_contribution_purposes;
CREATE POLICY "Community members can view fund contribution purposes"
  ON public.fund_contribution_purposes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = fund_contribution_purposes.event_id
        AND e.community_id = public.get_user_community_id()
    )
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Treasurers can add fund contribution purposes" ON public.fund_contribution_purposes;
CREATE POLICY "Treasurers can add fund contribution purposes"
  ON public.fund_contribution_purposes
  FOR INSERT
  WITH CHECK (
    public.get_fund_role(event_id, auth.uid()) = ANY (ARRAY['admin'::text, 'treasurer'::text])
    AND public.is_user_approved(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = fund_contribution_purposes.event_id
        AND e.community_id = public.get_user_community_id()
    )
  );

DROP POLICY IF EXISTS "Treasurers can update fund contribution purposes" ON public.fund_contribution_purposes;
CREATE POLICY "Treasurers can update fund contribution purposes"
  ON public.fund_contribution_purposes
  FOR UPDATE
  USING (
    public.get_fund_role(event_id, auth.uid()) = ANY (ARRAY['admin'::text, 'treasurer'::text])
    AND public.is_user_approved(auth.uid())
  )
  WITH CHECK (
    public.get_fund_role(event_id, auth.uid()) = ANY (ARRAY['admin'::text, 'treasurer'::text])
    AND public.is_user_approved(auth.uid())
  );

-- DELETE exists for the "added it by mistake, nothing recorded yet" case only.
-- The FK below is ON DELETE RESTRICT, so a purpose with money against it can
-- only ever be archived.
DROP POLICY IF EXISTS "Treasurers can delete unused fund contribution purposes" ON public.fund_contribution_purposes;
CREATE POLICY "Treasurers can delete unused fund contribution purposes"
  ON public.fund_contribution_purposes
  FOR DELETE
  USING (
    public.get_fund_role(event_id, auth.uid()) = ANY (ARRAY['admin'::text, 'treasurer'::text])
    AND public.is_user_approved(auth.uid())
  );

-- ------------------------------------------------------------
-- Section 4 - the ledger column
-- ------------------------------------------------------------

ALTER TABLE public.event_transactions
  ADD COLUMN IF NOT EXISTS contribution_purpose_id UUID
    REFERENCES public.fund_contribution_purposes(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.event_transactions.contribution_purpose_id IS
  'NULL on an income row means the general contribution — one per flat, and what the paid/unpaid roll counts. Non-NULL earmarks the row to a fund_contribution_purposes entry, and a flat may have any number of those. Always NULL on expense rows.';

CREATE INDEX IF NOT EXISTS idx_event_transactions_purpose
  ON public.event_transactions (contribution_purpose_id)
  WHERE contribution_purpose_id IS NOT NULL;

-- ------------------------------------------------------------
-- Section 5 - one general contribution per flat, offerings unbounded
-- ------------------------------------------------------------
--
-- Both indexes gain the same predicate. Earmarked offerings sit outside them,
-- which is the entire point; the general contribution stays exactly as
-- constrained as it was.

DROP INDEX IF EXISTS public.unique_income_contribution_per_flat;
CREATE UNIQUE INDEX unique_income_contribution_per_flat
  ON public.event_transactions (event_id, contributor_flat_id)
  WHERE type = 'income'
    AND contributor_flat_id IS NOT NULL
    AND contribution_purpose_id IS NULL;

DROP INDEX IF EXISTS public.unique_income_contribution_per_member;
CREATE UNIQUE INDEX unique_income_contribution_per_member
  ON public.event_transactions (event_id, contributor_user_id)
  WHERE type = 'income'
    AND contributor_user_id IS NOT NULL
    AND contribution_purpose_id IS NULL;

-- ------------------------------------------------------------
-- Section 6 - transaction guard learns about purposes
-- ------------------------------------------------------------
--
-- Everything before the purpose block is carried over unchanged from
-- 20260911000000; see that migration for why each rule is there.

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
  purpose_row public.fund_contribution_purposes%ROWTYPE;
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
    NEW.sponsor_name     := NULLIF(btrim(COALESCE(NEW.sponsor_name, '')), '');
    NEW.sponsor_phone    := NULLIF(btrim(COALESCE(NEW.sponsor_phone, '')), '');
    NEW.sponsor_note     := NULLIF(btrim(COALESCE(NEW.sponsor_note, '')), '');
    NEW.contributor_name := NULLIF(btrim(COALESCE(NEW.contributor_name, '')), '');

    -- An earmarked offering has to point at a purpose belonging to this fund.
    -- An archived purpose keeps its history editable but takes no new money.
    IF NEW.contribution_purpose_id IS NOT NULL THEN
      SELECT * INTO purpose_row
      FROM public.fund_contribution_purposes
      WHERE id = NEW.contribution_purpose_id;

      IF purpose_row.id IS NULL THEN
        RAISE EXCEPTION 'Contribution purpose not found';
      END IF;

      IF purpose_row.event_id IS DISTINCT FROM NEW.event_id THEN
        RAISE EXCEPTION 'Contribution purpose belongs to a different fund';
      END IF;

      IF TG_OP = 'INSERT' AND purpose_row.archived_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot record a contribution against an archived purpose';
      END IF;
    END IF;

    IF NEW.sponsor_name IS NOT NULL THEN
      IF NEW.contributor_user_id IS NOT NULL OR NEW.contributor_flat_id IS NOT NULL THEN
        RAISE EXCEPTION 'A sponsor contribution cannot name a member or a flat';
      END IF;
      IF NOT (caller_is_community_lead OR caller_is_platform_admin) THEN
        RAISE EXCEPTION 'Only the president or vice president can record a sponsor contribution';
      END IF;
    ELSE
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

      SELECT fr.role, fr.block_id INTO caller_role, caller_block_id
      FROM public.fund_roles fr
      WHERE fr.event_id = NEW.event_id AND fr.user_id = auth.uid()
      LIMIT 1;

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
    -- An expense is money leaving the fund. It has no contributor and no
    -- purpose to be earmarked to; expense purpose is what `title` is for.
    NEW.contribution_purpose_id   := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS event_transaction_guard ON public.event_transactions;
CREATE TRIGGER event_transaction_guard
BEFORE INSERT OR UPDATE ON public.event_transactions
FOR EACH ROW EXECUTE FUNCTION public.validate_event_transaction();

-- ------------------------------------------------------------
-- Section 7 - the collection picker counts flats, not rows
-- ------------------------------------------------------------
--
-- has_contributed / contributed_amount / contribution_id describe the general
-- contribution only, so a flat that has offered for the food still shows as
-- "not yet paid" on the roll. offering_count / offering_total sit alongside so
-- the collector can see that the household has already given something.
--
-- Dropped rather than replaced: the return type gains two columns.

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
  contribution_id    UUID,
  offering_count     INT,
  offering_total     NUMERIC
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
    tx.id,
    COALESCE(off.entries, 0)::INT,
    COALESCE(off.total, 0)::NUMERIC
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
      AND et.contribution_purpose_id IS NULL
    LIMIT 1
  ) tx ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INT AS entries, COALESCE(SUM(et.amount), 0)::NUMERIC AS total
    FROM public.event_transactions et
    WHERE et.event_id = p_event_id
      AND et.type = 'income'
      AND et.contributor_flat_id = f.id
      AND et.contribution_purpose_id IS NOT NULL
  ) off ON TRUE
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
-- Section 8 - public summary: contributors are payers, not rows
-- ------------------------------------------------------------
--
-- Still aggregates only. contributor_count now counts general contributions,
-- which is what "N residents have paid" meant before offerings existed; without
-- the filter one generous household would read as four contributors.

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
    COUNT(*) FILTER (
      WHERE t.type = 'income' AND t.contribution_purpose_id IS NULL
    )::INT
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

-- ------------------------------------------------------------
-- Section 9 - public block-wise: paid flats are distinct flats
-- ------------------------------------------------------------
--
-- `collected` keeps every income row, offerings included — that is genuinely
-- what the block has given. `paid_flats` counts flats with a general
-- contribution, so the x/y coverage figure still means what it says.

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
    COUNT(DISTINCT f.id) FILTER (
      WHERE t.id IS NOT NULL AND t.contribution_purpose_id IS NULL
    )::INT,
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
-- Section 10 - platform coverage RPC counts distinct people
-- ------------------------------------------------------------
--
-- Two bugs, one of them pre-existing: `residents` used COUNT(p.id) across a
-- join that could already fan out, and `contributors` counted income rows. With
-- offerings both would over-report, so both now count distinct rows of the
-- thing they are named after.

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
    COUNT(DISTINCT p.id) FILTER (
      WHERE t.id IS NOT NULL AND t.contribution_purpose_id IS NULL
    )::BIGINT AS contributors,
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
-- Section 11 - platform ledger names the purpose
-- ------------------------------------------------------------
--
-- entry_kind gains 'purpose_contribution' so a platform admin auditing a fund
-- can tell the flat's share from money given for the food, and purpose_name
-- carries the label rather than making them join it themselves.

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
      WHEN t.contribution_purpose_id IS NOT NULL THEN 'purpose_contribution'
      WHEN t.contributor_user_id IS NOT NULL THEN 'resident_contribution'
      WHEN t.sponsor_name IS NOT NULL THEN 'sponsor_contribution'
      ELSE 'other_income'
    END AS entry_kind,
    t.type,
    t.category,
    fp.name AS purpose_name,
    t.title,
    t.description,
    t.amount,
    SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
      OVER (ORDER BY t.created_at ASC, t.id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::NUMERIC AS running_balance,
    t.contributor_user_id AS contributor_id,
    cp.full_name AS contributor_name,
    cp.flat_number AS contributor_flat,
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
  LEFT JOIN public.fund_contribution_purposes fp ON fp.id = t.contribution_purpose_id
  WHERE t.event_id = p_event_id
  ORDER BY t.created_at DESC, t.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_fund_ledger(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_fund_ledger(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
