-- ============================================================
-- Migration: Import Cultural Fund Tracker into Vinayaka Chavithi
-- Date: 2026-09-20
-- ============================================================
-- One-time load of the society's spreadsheet ("Cultural Fund Tracker.xlsx",
-- tab "Funds Tracker", 54 rows) into the Vinayaka Chavithi fund for IRA
-- Aspiration (join code B4UVX8).
--
-- Block A was already entered through the app and stays authoritative for the
-- four rows the sheet does not have (407, 608, 609, 812 — they keep the date
-- they were entered on). For the thirteen Block A rows the sheet does have,
-- the sheet's date is applied. Where the two disagreed on which flat the money
-- came from, the sheet wins (confirmed with the treasurer): G2->207, G5->304,
-- G1->504. G04 in the sheet and G4 in the app are the same flat.
--
-- Blocks B, C, D and E were never entered in the app; their 41 rows are
-- inserted here.
--
-- Payment method: the sheet marks three rows "Received in Cash"; every other
-- row is recorded as online.
--
-- Re-runnable: Block A matches on the destination flat first, so a second run
-- is a no-op, and the inserts are guarded by NOT EXISTS.

-- 1. Who collected the money -------------------------------------------------
ALTER TABLE public.event_transactions
  ADD COLUMN IF NOT EXISTS collected_by_name TEXT;

COMMENT ON COLUMN public.event_transactions.collected_by_name IS
  'Who physically took the money, as a snapshot name — the sheet''s "Collection by". The literal value ''Self'' means the resident paid directly rather than through a collector. NULL means it was not captured. Never resolved live from profiles: collectors change and the audit trail must not.';

-- 2. The import --------------------------------------------------------------
DO $import$
DECLARE
  v_community_id UUID;
  v_event_id     UUID;
  v_actor        UUID;
  v_flat_id      UUID;
  v_txn_id       UUID;
  v_missing      TEXT[] := '{}';
  v_moved        INT := 0;
  v_dated        INT := 0;
  v_inserted     INT := 0;
  r              RECORD;
BEGIN
  SELECT id INTO v_community_id FROM public.communities WHERE code = 'B4UVX8';
  IF v_community_id IS NULL THEN
    RAISE EXCEPTION 'Community with join code B4UVX8 not found';
  END IF;

  SELECT id INTO v_event_id
  FROM public.events
  WHERE community_id = v_community_id
    AND btrim(lower(title)) = 'vinayaka chavithi'
  ORDER BY created_at
  LIMIT 1;
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Fund "Vinayaka chavithi" not found in community %', v_community_id;
  END IF;

  -- created_by is NOT NULL, so imported rows are attributed to the fund's
  -- treasurer (the person who actually holds this money), falling back to a
  -- community lead.
  SELECT fr.user_id INTO v_actor
  FROM public.fund_roles fr
  WHERE fr.event_id = v_event_id AND fr.role = 'treasurer'
  LIMIT 1;

  IF v_actor IS NULL THEN
    SELECT p.id INTO v_actor
    FROM public.profiles p
    WHERE p.community_id = v_community_id
      AND p.app_role IN ('president'::public.app_role_type, 'vice_president'::public.app_role_type)
      AND p.removed_at IS NULL
    ORDER BY p.created_at
    LIMIT 1;
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No treasurer or community lead to attribute imported rows to';
  END IF;

  -- validate_event_transaction() authorises against auth.uid(), which a
  -- migration does not have. Rather than disable the guard (and lose its
  -- amount rounding, flat checks and block scoping on 54 rows of real money),
  -- run as the treasurer for this transaction only. set_config(..., true)
  -- is transaction-local and unwinds on its own.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_actor)::text, true);

  ----------------------------------------------------------------- Block A ---
  FOR r IN
    SELECT * FROM (VALUES
    ('102', '102', NULL, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Madhava'),
    ('110', '110', NULL, '2026-08-21 12:00:00+05:30'::timestamptz, 'online', 'Self'),
    ('202', '202', NULL, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Madhava'),
    ('204', '204', NULL, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Madhava'),
    ('G2', '207', NULL, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Madhava'),
    ('G5', '304', NULL, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Madhava'),
    ('310', '310', NULL, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Madhava'),
    ('317', '317', NULL, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Madhava'),
    ('402', '402', NULL, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Madhava'),
    ('414', '414', NULL, '2026-08-21 12:00:00+05:30'::timestamptz, 'online', 'Self'),
    ('G1', '504', 'Raj Chimata', '2026-08-14 12:00:00+05:30'::timestamptz, 'online', 'Self'),
    ('607', '607', NULL, '2026-08-16 12:00:00+05:30'::timestamptz, 'online', 'Self'),
    ('G4', 'G4', NULL, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Madhava')
    ) AS t(app_flat, sheet_flat, rename_to, paid_at, pay_method, collected_by)
  LOOP
    -- Destination first: makes a second run a no-op instead of a failure.
    SELECT et.id INTO v_txn_id
    FROM public.event_transactions et
    JOIN public.community_flats f ON f.id = et.contributor_flat_id
    JOIN public.community_blocks b ON b.id = f.block_id
    WHERE et.event_id = v_event_id AND et.type = 'income'
      AND b.name = 'A' AND f.flat_number = r.sheet_flat;

    IF v_txn_id IS NULL AND r.app_flat <> r.sheet_flat THEN
      SELECT et.id INTO v_txn_id
      FROM public.event_transactions et
      JOIN public.community_flats f ON f.id = et.contributor_flat_id
      JOIN public.community_blocks b ON b.id = f.block_id
      WHERE et.event_id = v_event_id AND et.type = 'income'
        AND b.name = 'A' AND f.flat_number = r.app_flat;

      IF v_txn_id IS NOT NULL THEN
        SELECT f.id INTO v_flat_id
        FROM public.community_flats f
        JOIN public.community_blocks b ON b.id = f.block_id
        WHERE f.community_id = v_community_id AND f.archived_at IS NULL
          AND b.name = 'A' AND f.flat_number = r.sheet_flat;

        IF v_flat_id IS NULL THEN
          v_missing := v_missing || ('A-' || r.sheet_flat || ' (move target)');
          CONTINUE;
        END IF;

        UPDATE public.event_transactions
        SET contributor_flat_id = v_flat_id,
            contributor_user_id = NULL
        WHERE id = v_txn_id;
        v_moved := v_moved + 1;
      END IF;
    END IF;

    IF v_txn_id IS NULL THEN
      v_missing := v_missing || ('A-' || r.sheet_flat || ' (no contribution found)');
      CONTINUE;
    END IF;

    UPDATE public.event_transactions
    SET created_at        = r.paid_at,
        payment_method    = r.pay_method,
        collected_by_name = r.collected_by,
        contributor_name  = COALESCE(r.rename_to, contributor_name),
        title             = COALESCE(r.rename_to, title)
    WHERE id = v_txn_id;
    v_dated := v_dated + 1;
    v_txn_id := NULL;
  END LOOP;

  --------------------------------------------------------- Blocks B/C/D/E ---
  FOR r IN
    SELECT * FROM (VALUES
    ('B', '104', 'Vinod Babu', 4000, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Anil Ravva'),
    ('B', '114', 'Chaitanya Krishna', 4000, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Anil Ravva'),
    ('B', '201', 'Vinita Gupta', 4000, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Anil Ravva'),
    ('B', '203', 'Shivam', 4000, '2026-08-15 12:00:00+05:30'::timestamptz, 'cash', 'Anil Ravva'),
    ('B', '209', 'Siva & Family', 7000, '2026-08-22 12:00:00+05:30'::timestamptz, 'online', 'Self'),
    ('B', '214', 'Anil Kumar Ravva', 4000, '2026-08-16 12:00:00+05:30'::timestamptz, 'online', 'Anil Ravva'),
    ('B', '304', 'Purushottam Reddy K', 4000, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Anil Ravva'),
    ('B', '309', 'Tanuj Vashan', 4000, '2026-08-16 12:00:00+05:30'::timestamptz, 'online', 'Self'),
    ('B', '409', 'Saran Varma', 4111, '2026-08-22 12:00:00+05:30'::timestamptz, 'online', 'Self'),
    ('B', '411', 'Avinash', 1116, '2026-08-22 12:00:00+05:30'::timestamptz, 'online', 'Anil Ravva'),
    ('B', '413', 'Chaitanya G', 4000, '2026-08-22 12:00:00+05:30'::timestamptz, 'online', 'Anil Ravva'),
    ('B', '511', 'Namrata', 4000, '2026-08-16 12:00:00+05:30'::timestamptz, 'online', 'Self'),
    ('B', '603', 'Venu & Family', 10000, '2026-08-19 12:00:00+05:30'::timestamptz, 'online', 'Self'),
    ('B', '607', 'Naveen Gajavalli', 4000, '2026-08-22 12:00:00+05:30'::timestamptz, 'online', 'Self'),
    ('B', '612', 'Manas Ranjan Sahoo', 4000, '2026-08-22 12:00:00+05:30'::timestamptz, 'online', 'Anil Ravva'),
    ('B', '908', 'Nikesh', 4000, '2026-08-22 12:00:00+05:30'::timestamptz, 'online', 'Anil Ravva'),
    ('B', 'G13', 'Jitesh Singh', 4000, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Anil Ravva'),
    ('C', '103', 'Jitendra Prajapat', 4000, '2026-08-18 12:00:00+05:30'::timestamptz, 'cash', 'Phani Perni'),
    ('C', '108', 'Rohit', 4000, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Phani Perni'),
    ('C', '109', 'Naveen N', 4000, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Phani Perni'),
    ('C', '203', 'Ramya Lakshmi Perni', 4000, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Phani Perni'),
    ('C', '207', 'Brahmananda Reddy', 4000, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Phani Perni'),
    ('C', '209', 'U S Raja Reddy', 3000, '2026-08-16 12:00:00+05:30'::timestamptz, 'online', 'Phani Perni'),
    ('C', '211', 'Prakash', 4000, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Phani Perni'),
    ('C', '213', 'Ravi Kumar', 5116, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Phani Perni'),
    ('C', '302', 'Anil K Sharma', 5100, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Self'),
    ('C', '303', 'Neethu Singh', 5100, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Phani Perni'),
    ('C', '308', 'Narender', 4000, '2026-08-21 12:00:00+05:30'::timestamptz, 'online', 'Suresh'),
    ('C', '312', 'Sunil', 3000, '2026-08-22 12:00:00+05:30'::timestamptz, 'online', 'Self'),
    ('C', '406', 'Kanakaraju', 4000, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Phani Perni'),
    ('C', '415', 'Sandeep', 4000, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Phani Perni'),
    ('C', '508', 'Ch Srikanth', 4000, '2026-08-16 12:00:00+05:30'::timestamptz, 'online', 'Phani Perni'),
    ('C', '512', 'Sai Kiran', 4000, '2026-08-16 12:00:00+05:30'::timestamptz, 'online', 'Phani Perni'),
    ('C', '515', 'Rajesh', 7000, '2026-08-17 12:00:00+05:30'::timestamptz, 'online', 'Phani Perni'),
    ('C', 'G13', 'Prallav', 1100, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Phani Perni'),
    ('D', '512', 'Venkatesh & Keerthi', 5000, '2026-08-19 12:00:00+05:30'::timestamptz, 'online', 'Self'),
    ('D', '706', 'Sharan', 1000, '2026-08-22 12:00:00+05:30'::timestamptz, 'online', 'Self'),
    ('D', '809', 'Manoj Ganapathi', 4000, '2026-08-15 12:00:00+05:30'::timestamptz, 'online', 'Self'),
    ('E', '401', 'MadhuSudan', 4000, '2026-08-14 12:00:00+05:30'::timestamptz, 'online', 'Self'),
    ('E', '502', 'Buchi Babu', 3000, '2026-08-22 12:00:00+05:30'::timestamptz, 'cash', 'Rama Krishna'),
    ('E', '505', 'Vinod', 4000, '2026-08-17 12:00:00+05:30'::timestamptz, 'online', 'Self')
    ) AS t(block_name, flat_no, payer, amount, paid_at, pay_method, collected_by)
  LOOP
    SELECT f.id INTO v_flat_id
    FROM public.community_flats f
    JOIN public.community_blocks b ON b.id = f.block_id
    WHERE f.community_id = v_community_id AND f.archived_at IS NULL
      AND b.name = r.block_name AND f.flat_number = r.flat_no;

    IF v_flat_id IS NULL THEN
      v_missing := v_missing || (r.block_name || '-' || r.flat_no);
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.event_transactions et
      WHERE et.event_id = v_event_id AND et.type = 'income'
        AND et.contributor_flat_id = v_flat_id
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.event_transactions (
      event_id, type, amount, title, description, category,
      contributor_user_id, contributor_flat_id, contributor_name,
      payment_method, collected_by_name, created_by, created_at
    ) VALUES (
      v_event_id, 'income', r.amount, r.payer, NULL, 'Contribution',
      NULL, v_flat_id, r.payer,
      r.pay_method, r.collected_by, v_actor, r.paid_at
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    -- Fail loud and roll the whole thing back rather than land a partial
    -- ledger that nobody can tell is partial.
    RAISE EXCEPTION 'Unmatched flats (nothing imported): %', array_to_string(v_missing, ', ');
  END IF;

  RAISE NOTICE 'Fund import: % moved, % re-dated, % inserted', v_moved, v_dated, v_inserted;
END
$import$;

NOTIFY pgrst, 'reload schema';
