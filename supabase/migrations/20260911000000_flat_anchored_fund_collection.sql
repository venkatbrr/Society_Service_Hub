-- ============================================================
-- Migration: Flat-anchored fund collection
-- Date: 2026-09-11
-- ============================================================

-- 4.1 Ledger columns
ALTER TABLE public.event_transactions
  ADD COLUMN IF NOT EXISTS contributor_flat_id UUID
    REFERENCES public.community_flats(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS contributor_name TEXT;

CREATE INDEX IF NOT EXISTS idx_event_transactions_contributor_flat
  ON public.event_transactions (contributor_flat_id)
  WHERE contributor_flat_id IS NOT NULL;

COMMENT ON COLUMN public.event_transactions.contributor_flat_id IS
  'The flat the money came from. Stamped on every income row, registered payer or not. Flats are soft-archived, never deleted, so ON DELETE RESTRICT protects the ledger.';
COMMENT ON COLUMN public.event_transactions.contributor_name IS
  'Payer name captured at collection time. An immutable snapshot — never resolved live from profiles or community_flats.occupant_name, because tenants change and the ledger must not.';

-- 4.2 Occupant name on the flat
ALTER TABLE public.community_flats
  ADD COLUMN IF NOT EXISTS occupant_name TEXT
    CHECK (occupant_name IS NULL OR length(btrim(occupant_name)) BETWEEN 1 AND 80);

COMMENT ON COLUMN public.community_flats.occupant_name IS
  'Best-known current occupant name, used only to prefill the fund collection form. Mutable and self-correcting — a collector who types a different name overwrites it. Never rendered into the ledger; event_transactions.contributor_name is the record.';

-- 4.3 Lock down who can read the occupant name
REVOKE SELECT ON public.community_flats FROM authenticated;
GRANT SELECT (
  id, community_id, block_id, flat_number, floor_label,
  archived_at, created_at, updated_at
) ON public.community_flats TO authenticated;

-- 4.4 Backfill the ledger columns
UPDATE public.event_transactions et
SET contributor_flat_id = COALESCE(et.contributor_flat_id, p.flat_id),
    contributor_name    = COALESCE(et.contributor_name, NULLIF(btrim(p.full_name), ''), 'Resident')
FROM public.profiles p
WHERE p.id = et.contributor_user_id
  AND et.type = 'income'
  AND (et.contributor_flat_id IS NULL OR et.contributor_name IS NULL);

-- 4.5 Replace the payer-shape constraint
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
      -- community payer, registered or not: always named, and identified by
      -- a flat (normal) or at least a member (community with no flat inventory)
      (sponsor_name IS NULL
        AND contributor_name IS NOT NULL
        AND btrim(contributor_name) <> ''
        AND (contributor_flat_id IS NOT NULL OR contributor_user_id IS NOT NULL))
    ELSE
      contributor_user_id IS NULL
      AND contributor_flat_id IS NULL
      AND contributor_name IS NULL
      AND sponsor_name IS NULL
    END
  ) NOT VALID;

-- 4.6 One contribution per flat per fund
CREATE UNIQUE INDEX IF NOT EXISTS unique_income_contribution_per_flat
  ON public.event_transactions (event_id, contributor_flat_id)
  WHERE type = 'income' AND contributor_flat_id IS NOT NULL;

-- 4.7 Replace validate_event_transaction()
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
    NEW.sponsor_name     := NULLIF(btrim(COALESCE(NEW.sponsor_name, '')), '');
    NEW.sponsor_phone    := NULLIF(btrim(COALESCE(NEW.sponsor_phone, '')), '');
    NEW.sponsor_note     := NULLIF(btrim(COALESCE(NEW.sponsor_note, '')), '');
    NEW.contributor_name := NULLIF(btrim(COALESCE(NEW.contributor_name, '')), '');

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

      -- Block scoping now reads the FLAT's block, not the contributor profile's.
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
    NEW.contributor_user_id := NULL;
    NEW.contributor_flat_id := NULL;
    NEW.contributor_name    := NULL;
    NEW.sponsor_name        := NULL;
    NEW.sponsor_phone       := NULL;
    NEW.sponsor_note        := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS event_transaction_guard ON public.event_transactions;
CREATE TRIGGER event_transaction_guard
BEFORE INSERT OR UPDATE ON public.event_transactions
FOR EACH ROW EXECUTE FUNCTION public.validate_event_transaction();

-- 4.8 Write the name back to the flat
CREATE OR REPLACE FUNCTION public.sync_flat_occupant_name()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'income'
     AND NEW.contributor_flat_id IS NOT NULL
     AND NEW.contributor_name IS NOT NULL THEN
    UPDATE public.community_flats
    SET occupant_name = NEW.contributor_name,
        updated_at    = now()
    WHERE id = NEW.contributor_flat_id
      AND occupant_name IS DISTINCT FROM NEW.contributor_name;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS event_transaction_occupant_sync ON public.event_transactions;
CREATE TRIGGER event_transaction_occupant_sync
AFTER INSERT OR UPDATE OF contributor_name, contributor_flat_id
ON public.event_transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_flat_occupant_name();

-- 4.9 Seed from the society spreadsheet
CREATE OR REPLACE FUNCTION public.platform_set_flat_occupant_names(
  p_community_id UUID,
  p_rows JSONB   -- [{"block_name":"A","flat_number":"101","occupant_name":"Ramesh Kumar"}, ...]
)
RETURNS TABLE (matched INT, unmatched TEXT[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rec JSONB;
  clean_num TEXT;
  target_flat UUID;
  matched_count INT := 0;
  missing TEXT[] := '{}';
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can import occupant names';
  END IF;

  FOR rec IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    clean_num := upper(regexp_replace(COALESCE(rec->>'flat_number', ''), '[^A-Za-z0-9]', '', 'g'));

    SELECT f.id INTO target_flat
    FROM public.community_flats f
    LEFT JOIN public.community_blocks b ON b.id = f.block_id
    WHERE f.community_id = p_community_id
      AND f.archived_at IS NULL
      AND f.flat_number = clean_num
      AND (rec->>'block_name' IS NULL OR b.name = rec->>'block_name')
    LIMIT 1;

    IF target_flat IS NULL THEN
      missing := missing || (COALESCE(rec->>'block_name','') || '-' || clean_num);
    ELSE
      UPDATE public.community_flats
      SET occupant_name = NULLIF(btrim(rec->>'occupant_name'), ''),
          updated_at    = now()
      WHERE id = target_flat;
      matched_count := matched_count + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT matched_count, missing;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_set_flat_occupant_names(UUID, JSONB) TO authenticated;

-- 4.10 New RPC: list_collection_targets_for_collector
CREATE OR REPLACE FUNCTION public.list_collection_targets_for_collector(p_event_id UUID)
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

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
