# Fund collection — residents who have not signed up cannot be collected from

**Date:** 2026-08-16
**Status:** Diagnosis and design complete. **Nothing in the repo or database was changed by this pass** — this document records the issue and the decision; the implementation steps live in [`docs/new_features_to_implement/flat-anchored-fund-collection-plan.md`](../../new_features_to_implement/flat-anchored-fund-collection-plan.md).
**Scope:** `event_transactions`, `community_flats`, `validate_event_transaction()`, `app/funds/add-transaction.tsx`, `app/funds/[id].tsx`.

**Reported symptom:** A fund collector goes door to door, takes cash from a neighbour, opens the app to record it — and cannot find the person. Most residents have never signed up, so they do not appear in the contributor picker and the contribution cannot be recorded at all.

---

## 1. Root cause

The contributor picker is fed by `list_eligible_contributors_for_collector(...)` (migration `20260816000000`), which selects from `public.profiles`. A `profiles` row only exists for someone who has created an account — `profiles.id` is `UUID PRIMARY KEY REFERENCES auth.users(id)` ([`supabase/migrations/00000_init.sql:14`](../../../supabase/migrations/00000_init.sql#L14)).

So the picker's coverage is exactly the set of signed-up users. Measured in production on 2026-08-16 (community "IRA Aspiration", the only live community):

| | |
|---|---|
| Flats in `community_flats` | **749** |
| Residents in `profiles` | **1** |
| Rows in `event_transactions` | **0** |

The feature is effectively unusable: the picker can reach 1 of 749 flats.

Two facts from that table shaped the fix. The **flat inventory is already complete** — so a usable roster exists, it is just not the one the picker uses. And **no contribution has ever been recorded**, so the data model could be changed with no migration of live money.

## 2. Decision

**Anchor collection on the flat, not on the person.** The collector picks a flat; the name is a label captured at collection time.

The decisive property: when a resident later signs up and picks their flat through the existing `set_my_flat(...)` flow, their past contributions are already reachable via `contributor_flat_id`. **There is no mapping step, no reconciliation screen, and no backfill** — the identity problem dissolves rather than being solved.

Names are handled in two distinct places, and conflating them is the main trap:

| | Purpose | Mutability |
|---|---|---|
| `event_transactions.contributor_name` | who paid, on this row | **immutable snapshot**, frozen at insert |
| `community_flats.occupant_name` | who lives there now, for prefill only | mutable; overwritten whenever a collector types a different name |

This split is what makes the design survive tenant turnover. The prefill self-corrects each collection cycle because the collector at the door is the best available source of truth; the ledger never moves, because it was frozen when the money changed hands.

## 3. Alternatives rejected

- **Import the society's resident spreadsheet into `profiles`.** Impossible without minting fake `auth.users` rows, and it guarantees a duplicate identity when the real person signs up — their past contribution would strand on the ghost profile.
- **Record unregistered residents through the existing outside-sponsor fields.** Sponsor rows carry no flat, are president/VP-only to create, and can never reconcile to a resident. Sponsors stay what they are: genuine non-residents.
- **A `community_flat_residents` roster table with a `linked_user_id` and phone/email matching.** Designed first, then discarded: it exists only to solve the signup-mapping problem, which anchoring on the flat removes. It would also have stored contact details for hundreds of people who never consented. One nullable `occupant_name` column covers the actual need.

## 4. Three schema guards that will reject the fix

Found by auditing the live database. Each one rejects an income row that has no `contributor_user_id`, and **none of them fail at compile time** — an implementation that only adds columns will pass `tsc` and then break on first save in production.

1. **`event_transactions_payer_shape`** — a CHECK requiring `(contributor_user_id IS NULL) <> (sponsor_name IS NULL)` on income rows. An unregistered payer has neither. Must be replaced.
2. **`validate_event_transaction()`** — raises `'Contributor is required for contributions'` on exactly that case. The same function also block-scopes collectors by reading `profiles.block_id` **of the contributor**, which returns nothing when there is no profile; scoping must move to `community_flats.block_id`.
3. **`unique_income_contribution_per_member`** — partial unique index on `(event_id, contributor_user_id)`. It cannot see across the registered and unregistered paths, so it must gain a sibling on `(event_id, contributor_flat_id)`. Without that index, this sequence double-collects: a collector records "Ramesh, A-101" by hand in the morning; Ramesh signs up that afternoon; a second collector finds him in the resident list and collects again.

**Not a blocker, deliberately confirmed:** the RLS policies on `event_transactions` gate on `type` and `get_fund_role(...)` only — they never inspect `contributor_user_id`. Collectors can already insert income rows with a NULL contributor, so **no policy changes are needed**.

## 5. Privacy consequence to be aware of

Storing `occupant_name` means holding names of people who have not signed up. Two mitigations are part of the design, and the second is easy to miss:

- **Names only.** No phone numbers, no emails. `occupant_name` must not grow into a contact record.
- **`community_flats` currently has a blanket `GRANT SELECT ... TO authenticated`.** Adding `occupant_name` under that grant would let any resident enumerate every neighbour's name — turning a collection tool into a directory of non-consenting people. The grant must be narrowed to a column-level one that omits `occupant_name`, leaving it reachable only through the collector-scoped SECURITY DEFINER RPC.

Verified safe to narrow: `grep "from('community_flats')"` returns no matches anywhere in the codebase — every screen already goes through `list_community_flats(...)` or `set_my_flat(...)`, both SECURITY DEFINER.

**Decision taken:** occupant names are visible to collectors, treasurers, and leads only. The fund ledger itself stays visible to the whole community exactly as it is today, so contribution transparency is unaffected.

## 6. What remains

Implementation is specified end to end in [`flat-anchored-fund-collection-plan.md`](../../new_features_to_implement/flat-anchored-fund-collection-plan.md): one migration (two ledger columns, `occupant_name`, the column-level grant, the replaced constraint, the flat-unique index, the rewritten trigger, an occupant write-back trigger, a spreadsheet-import RPC, and a flat-first contributor RPC), then the two fund screens, then `npm run db:push:prod` → `npm run types:prod` → `npx tsc --noEmit`.

Docs to update when it lands are listed in §7 of that plan.
