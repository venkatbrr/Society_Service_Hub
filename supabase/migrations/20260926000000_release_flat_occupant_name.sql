-- ============================================================
-- Migration: Release community_flats.occupant_name when a
--            contribution moves off a flat or is deleted
-- Date: 2026-09-26
-- ============================================================
-- sync_flat_occupant_name() only ever wrote forward: recording a contribution
-- stamped the payer's name onto the flat, but correcting that contribution to
-- a different flat left the name stranded on the first one. The collection
-- picker then showed the payer against a flat they never paid from (A-G2 kept
-- "Sourabh pare" after the contribution was corrected to A-207).
--
-- The trigger now also releases the flat a contribution leaves, and fires on
-- DELETE. It clears a name only when this row is what put it there and no other
-- income row on that flat still vouches for it, so a name typed by a second
-- collector or seeded by platform_set_flat_occupant_names survives.

CREATE OR REPLACE FUNCTION public.sync_flat_occupant_name()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  old_flat_id UUID;
  old_name    TEXT;
BEGIN
  -- Release the flat this contribution just left.
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    old_flat_id := OLD.contributor_flat_id;
    old_name    := OLD.contributor_name;

    IF old_flat_id IS NOT NULL
       AND old_name IS NOT NULL
       AND (TG_OP = 'DELETE' OR NEW.contributor_flat_id IS DISTINCT FROM old_flat_id)
    THEN
      UPDATE public.community_flats cf
      SET occupant_name = NULL,
          updated_at    = now()
      WHERE cf.id = old_flat_id
        AND cf.occupant_name = old_name
        AND NOT EXISTS (
          SELECT 1
          FROM public.event_transactions et
          WHERE et.type = 'income'
            AND et.contributor_flat_id = old_flat_id
            AND et.contributor_name = old_name
            AND et.id <> OLD.id
        );
    END IF;
  END IF;

  -- Stamp the flat this contribution now belongs to.
  IF TG_OP <> 'DELETE'
     AND NEW.type = 'income'
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
AFTER INSERT OR DELETE OR UPDATE OF contributor_name, contributor_flat_id
ON public.event_transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_flat_occupant_name();

-- One-off cleanup of names already stranded by the old forward-only trigger.
-- Every occupant_name in this database was written by that trigger, so a name
-- with no matching income row on its own flat is an orphan by definition.
UPDATE public.community_flats cf
SET occupant_name = NULL,
    updated_at    = now()
WHERE cf.occupant_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.event_transactions et
    WHERE et.type = 'income'
      AND et.contributor_flat_id = cf.id
      AND et.contributor_name = cf.occupant_name
  );

NOTIFY pgrst, 'reload schema';
