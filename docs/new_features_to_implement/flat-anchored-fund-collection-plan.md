# Flat-anchored fund collection — implementation plan

**Status:** not started
**Written:** 2026-08-15
**Owner:** hand-off doc for an implementing agent

---

## 1. The problem

Fund collectors can only record a contribution against a **signed-up resident**. The contributor picker in `app/funds/add-transaction.tsx` is fed by `list_eligible_contributors_for_collector(...)`, which selects from `public.profiles`. Residents who have not created an account do not exist in `profiles`, so the collector cannot find them and cannot record the cash they just handed over.

Production numbers as of 2026-08-15 (community "IRA Aspiration", the only live community):

| | |
|---|---|
| Flats in `community_flats` | **749** |
| Residents in `profiles` | **1** |
| Rows in `event_transactions` | **0** |

The flat inventory is complete. The resident list is not. Collection must therefore be anchored on the **flat**, not on the person.

## 2. The decision

**The flat is the contributor.** The collector picks a flat, and the name is a free-text label captured at the moment of collection.

Three rules follow, and they are the whole design:

1. **Every income row stamps `contributor_flat_id`** — whether or not a `profiles` row exists for the payer. This is what makes flats the join key.
2. **`contributor_name` is a snapshot, never a live join.** Tenants change and profiles get renamed or removed; a ledger that resolves names at read time would silently rewrite history. Freeze the name at insert.
3. **No mapping table, no reconciliation, no backfill on signup.** When a resident later signs up and picks their flat via the existing `set_my_flat(...)` flow, their past contributions are already reachable with `where contributor_flat_id = <their flat_id>`. There is nothing to link.

Explicitly rejected alternatives, so they don't get re-proposed:

- **Importing residents into `profiles`.** Impossible without fake auth users — `profiles.id` is `UUID PRIMARY KEY REFERENCES auth.users(id)` ([`supabase/migrations/00000_init.sql:14`](../../supabase/migrations/00000_init.sql#L14)). Would also produce a second identity when the real person signs up.
- **Recording residents through the outside-sponsor fields.** Sponsor rows carry no flat, are president/VP-only, and can never reconcile to a resident. Sponsors stay what they are: genuine non-residents.
- **A `community_flat_residents` roster table with a `linked_user_id`.** Solves a mapping problem that anchoring on the flat deletes outright. Not needed.

## 3. Blockers in the current schema (read this before writing SQL)

Three existing guards actively reject an income row that has no `contributor_user_id`. All three must be modified — **skipping any one of them means the feature fails at runtime, not at compile time.**

**a. `event_transactions_payer_shape` CHECK constraint** (from `20260825000000`):
```sql
CASE WHEN type = 'income'
  THEN (contributor_user_id IS NULL) <> (sponsor_name IS NULL)
  ELSE contributor_user_id IS NULL AND sponsor_name IS NULL
END
```
This XOR requires exactly one of member-or-sponsor. An unregistered contribution has neither. **Must be replaced.**

**b. `validate_event_transaction()` trigger** (same migration, fires `BEFORE INSERT OR UPDATE`):
```sql
IF NEW.contributor_user_id IS NULL AND NEW.sponsor_name IS NULL THEN
  RAISE EXCEPTION 'Contributor is required for contributions';
END IF;
```
**Must be replaced.** The same function also does collector block-scoping by reading `profiles.block_id` of the contributor — that lookup returns nothing for an unregistered flat, so **scoping must move to `community_flats.block_id`.**

**c. `unique_income_contribution_per_member`** — a partial unique index on `(event_id, contributor_user_id) WHERE type='income' AND contributor_user_id IS NOT NULL`. Keep it as is; add a **sibling index on the flat**, which is what actually prevents double collection once unregistered rows exist.

**Good news — do not change these:** the RLS policies on `event_transactions` ([`20260418210000_onboarding_approval.sql:568`](../../supabase/migrations/20260418210000_onboarding_approval.sql#L568) and [`20260607160000_treasurer_update_expenses.sql`](../../supabase/migrations/20260607160000_treasurer_update_expenses.sql)) gate on `type` and `get_fund_role(...)` only. They never inspect `contributor_user_id`, so collectors can already insert income rows with a NULL contributor. **No policy changes are required.**

Also note `event_transactions_contributor_user_id_fkey` is `ON DELETE SET NULL`. Under the new model that becomes a feature: if a profile is hard-deleted, the row keeps its flat and its name snapshot, so the ledger survives intact.

## 4. Migration

Create `supabase/migrations/20260815000000_flat_anchored_fund_collection.sql`. Idempotent SQL, ends with `NOTIFY pgrst, 'reload schema';` per [CLAUDE.md](../../CLAUDE.md).

### 4.1 Columns

```sql
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
  'Payer name captured at collection time. A snapshot, never resolved live from profiles — tenants change and the ledger must not.';
```

`ON DELETE RESTRICT` is deliberate: `archive_community_flat(...)` soft-archives, so this never fires in normal operation and blocks a destructive hard delete if one is ever attempted.

### 4.2 Backfill

Zero rows exist today, so this is a no-op — include it anyway so the migration is correct if run against any environment that has data.

```sql
UPDATE public.event_transactions et
SET contributor_flat_id = COALESCE(et.contributor_flat_id, p.flat_id),
    contributor_name    = COALESCE(et.contributor_name, NULLIF(btrim(p.full_name), ''), 'Resident')
FROM public.profiles p
WHERE p.id = et.contributor_user_id
  AND et.type = 'income'
  AND (et.contributor_flat_id IS NULL OR et.contributor_name IS NULL);
```

### 4.3 Replace the payer-shape constraint

```sql
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
```

The `contributor_flat_id IS NOT NULL OR contributor_user_id IS NOT NULL` disjunction is a deliberate graceful degradation: a community whose flat inventory was never seeded can still collect from registered residents the old way instead of being locked out entirely. `NOT VALID` matches how the sibling constraints in `20260825000000` were added.

### 4.4 One contribution per flat per fund

```sql
CREATE UNIQUE INDEX IF NOT EXISTS unique_income_contribution_per_flat
  ON public.event_transactions (event_id, contributor_flat_id)
  WHERE type = 'income' AND contributor_flat_id IS NOT NULL;
```

This is the single highest-value line in the migration. Because registered *and* unregistered rows both stamp the flat, it blocks the cross-path double collection that no client-side check can catch: a collector records "Ramesh, A-101" by hand in the morning, Ramesh signs up that afternoon, and a second collector finds him in the resident list and collects again.

**Product decision baked in:** one payment per flat per fund. That already matches shipped behavior (contributed residents are disabled in the picker). If partial or installment payments are ever wanted, this index is the thing to drop.

### 4.5 Replace `validate_event_transaction()`

`CREATE OR REPLACE` the function. Keep every existing behavior — title required, amount rounding and bounds, `funds_enabled` check, sponsor-is-lead-only, expense nulling — and change only the income branch. Full income branch:

```sql
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
```

Declare `flat_row public.community_flats%ROWTYPE;` alongside the existing `DECLARE` block. Note the block-scoping branch now depends on `flat_row` being populated — when `contributor_flat_id` is NULL (the no-flat-inventory fallback) `flat_row.block_id` is NULL, which correctly fails a block-scoped collector's check.

Re-attach the trigger with the existing `DROP TRIGGER IF EXISTS event_transaction_guard ... CREATE TRIGGER` pair.

### 4.6 New RPC: `list_collection_targets_for_collector`

Flat-first replacement for `list_eligible_contributors_for_collector`. Keep the old function in place (do not drop it) so nothing else breaks.

```sql
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
  -- Auth + role resolution: copy verbatim from
  -- list_eligible_contributors_for_collector in migration 20260816000000,
  -- including the 'Caller does not have access to this fund' guard.
  ...

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
```

Privacy note: this returns only flat numbers plus the names of residents who **have** signed up. It exposes nothing about people who have not — which is exactly why no imported-roster table appears in this plan.

### 4.7 Deploy

Per [CLAUDE.md](../../CLAUDE.md), finish the loop — do not leave the migration unapplied:

```
npm run db:push:prod
npm run types:prod
npx tsc --noEmit
```

## 5. Client changes

### 5.1 `app/funds/add-transaction.tsx`

The contribution branch becomes flat-first. Currently the member path renders a searchable list of `EligibleContributor` rows ([lines 677–755](../../app/funds/add-transaction.tsx#L677-L755)) driven by `list_eligible_contributors_for_collector` ([line 139](../../app/funds/add-transaction.tsx#L139)).

**Replace** the `EligibleContributor` type and its loader with `CollectionTarget` (the RPC row shape above), and:

1. **Flat selector.** Render targets grouped by block with a search box matching on flat number *and* resident name. 749 flats means search is mandatory, not optional — reuse the interaction pattern from [`components/FlatPicker.tsx`](../../components/FlatPicker.tsx) (block chips → floor-grouped flat chips → search) rather than inventing a new one. A block-scoped collector sees only their block, so their list is much shorter.
2. **Rows show contribution state.** Reuse the existing `memberStatus` / `Paid` / `Selected` / `Pending` styling. Rows with `has_contributed` are disabled with the existing "Already paid" toast.
3. **Name field, always visible and always editable.** On selecting a flat, prefill `contributorName` with `resident_name` when the flat has a registered resident, and leave it empty otherwise. Never lock it. A tenant, a parent, or a driver may be the one handing over cash at a flat whose owner is signed up — the name is a receipt label, not an identity claim, and editing it must not clear `resident_user_id`.
4. **Payload.** In `handleSave`, the member branch sends:
   ```ts
   contributor_user_id: selectedTarget.resident_user_id,   // may be null
   contributor_flat_id: selectedTarget.flat_id,
   contributor_name:    contributorName.trim(),
   title:               contributorName.trim(),            // title is the payer name today; keep that
   ```
   Sponsor branch is unchanged and must send `contributor_flat_id: null`.
5. **Validation before save:** a flat must be selected, and `contributorName.trim()` must be non-empty. Map the Postgres unique-violation on `unique_income_contribution_per_flat` to a friendly "This flat has already contributed to this fund" toast.
6. **Empty state.** If the RPC returns zero rows, show "No flats set up for this community yet" and point at the flats screen rather than rendering an empty picker.
7. **Edit mode.** `transaction_id` currently looks the payer up in the members array ([lines 660–676](../../app/funds/add-transaction.tsx#L660-L676)). Change it to read `contributor_name` and `contributor_flat_id` off the loaded transaction — a historical row may reference a flat whose resident has since left, and the ledger must still render.
8. **Block prompt.** The existing `showBlockPrompt` modal ([lines 262–273](../../app/funds/add-transaction.tsx#L262-L273)) stays as is.

### 5.2 `app/funds/[id].tsx`

- Contribution rows currently resolve names through `profileNames` / `profileFlats` maps built from `profiles` ([lines 159, 235–237, 729–750](../../app/funds/[id].tsx#L729-L750)). **Switch to the stored snapshot**: display `contributor_name` and the flat from `contributor_flat_id`, falling back to the profile maps only for legacy rows where the snapshot is null. This is the whole point of §2 rule 2 — do not keep the live join.
- Add a flat label to each row (`A-101`) alongside the date.
- Change the contributions section badge from `{n} entries` to `{n} of {totalFlats} flats collected`. A treasurer chasing a collection wants coverage, not a row count.
- Keep sponsor rows rendering as "Outside sponsor" exactly as today.

### 5.3 Types

`lib/database.types.ts` is generated — do not hand-edit. It picks up the new columns from `npm run types:prod`.

## 6. Verification

```sql
-- 1. Unregistered contribution is accepted (run as a collector)
-- 2. Second contribution for the same flat is rejected by the unique index
-- 3. Sponsor path still works for a president, still rejected for a collector
-- 4. Block-scoped collector rejected on a flat outside their block

-- 5. No income row escapes the flat key:
SELECT count(*) FROM public.event_transactions
WHERE type = 'income' AND sponsor_name IS NULL AND contributor_flat_id IS NULL;
-- expect 0 in any community with a seeded flat inventory

-- 6. Names are snapshots, not joins:
SELECT id, contributor_name, contributor_user_id FROM public.event_transactions
WHERE type = 'income' AND contributor_name IS NULL;
-- expect 0
```

Then `npx tsc --noEmit` — the only validation gate in this repo; there is no test framework and no lint script.

Manual pass: sign up a new account, join the community, pick a flat that already has an unregistered contribution recorded against it, and confirm the fund screen shows that contribution without any linking step. That is the acceptance test for the entire design.

## 7. Docs to update in the same change set

Per the routing table in [CLAUDE.md](../../CLAUDE.md), one owning file per fact:

- [`docs/features.md`](../features.md) §6 — the add-transaction contributor flow is now flat-first with an editable name; fund detail shows flat-based coverage. Do not restate schema columns here.
- [`docs/architecture.md`](../architecture.md) — the two new columns, the replaced `event_transactions_payer_shape` constraint, `unique_income_contribution_per_flat`, the rewritten `validate_event_transaction()` block-scoping rule, and the new `list_collection_targets_for_collector` RPC.
- No `.github/app-summary.md` change — this is not a new module.
- No `docs/cross-community-changelog.md` change — no federation objects are touched.

## 8. Deliberately out of scope

- **Importing the resident spreadsheet.** Optional future convenience: an `owner_name` column on `community_flats` to prefill the typed name so collectors confirm instead of type. It layers cleanly on this design with no rework, and it is opt-in per community — which matters, because that data is names and phone numbers of people who have not joined the app and have not consented to it being stored.
- Partial or installment payments per flat (see §4.4).
- Any change to the outside-sponsor flow.
