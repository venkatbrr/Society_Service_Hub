-- ============================================================
-- Migration: Optional phone on an "other contribution"
-- Date: 2026-10-01
-- ============================================================
--
-- The Outside sponsor tab is being folded into Other contribution. Its one
-- irreplaceable field was `sponsor_phone` — the number you need when you want
-- to thank the shop that paid for the lighting, or ask them again next year.
--
-- `sponsor_phone` cannot carry it: event_transactions_sponsor_shape requires a
-- sponsor_name alongside it, and an other contribution has none. So ad-hoc rows
-- get their own column, on the same terms as contributor_flat_label — present
-- only when purpose_label is, and cleared by the trigger everywhere else.
--
-- Existing sponsor rows keep sponsor_name / sponsor_phone / sponsor_note and
-- keep rendering as "Outside sponsor". Nothing is migrated: the sponsor shape
-- stays a legal, editable payer shape, it simply stops being something the
-- collection form offers to create.

ALTER TABLE public.event_transactions
  ADD COLUMN IF NOT EXISTS contributor_phone TEXT;

COMMENT ON COLUMN public.event_transactions.contributor_phone IS
  'Optional contact number on an ad-hoc "other contribution" — typically an outside business that sponsored something. Display-only and never rendered into the contributions list, which every resident can read. Cleared by the guard trigger on any row that is not an other contribution.';

ALTER TABLE public.event_transactions
  DROP CONSTRAINT IF EXISTS event_transactions_contributor_phone_shape;

ALTER TABLE public.event_transactions
  ADD CONSTRAINT event_transactions_contributor_phone_shape
  CHECK (
    contributor_phone IS NULL
    OR length(btrim(contributor_phone)) BETWEEN 1 AND 20
  )
  NOT VALID;

-- ------------------------------------------------------------
-- Guard trigger
-- ------------------------------------------------------------
--
-- Unchanged from 20260930000000 except for the three contributor_phone lines:
-- trimmed and kept on the ad-hoc branch, cleared on the flat's-share branch,
-- the sponsor branch, and every expense.

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
    NEW.contributor_phone      := NULLIF(btrim(COALESCE(NEW.contributor_phone, '')), '');

    SELECT fr.role, fr.block_id INTO caller_role, caller_block_id
    FROM public.fund_roles fr
    WHERE fr.event_id = NEW.event_id AND fr.user_id = auth.uid()
    LIMIT 1;

    IF NEW.sponsor_name IS NOT NULL THEN
      NEW.contributor_phone := NULL;

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
      NEW.contributor_phone      := NULL;

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
    NEW.contributor_phone         := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS event_transaction_guard ON public.event_transactions;
CREATE TRIGGER event_transaction_guard
BEFORE INSERT OR UPDATE ON public.event_transactions
FOR EACH ROW EXECUTE FUNCTION public.validate_event_transaction();

NOTIFY pgrst, 'reload schema';
