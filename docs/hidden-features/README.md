# Hidden Features

Features that are **built, deployed, and working** but deliberately not reachable from the UI. They are hidden behind a flag, not removed, and every one of them is expected to come back.

This folder exists so that "we will turn this on later" survives the months in between. Each doc here is the complete re-enable instruction set for one hidden feature: what was hidden, what was left alone, what breaks if you delete the wrong thing, and the exact checklist to bring it back.

---

## What belongs here vs. `disabled-features.md`

| | Goes in `hidden-features/` | Goes in [`../disabled-features.md`](../disabled-features.md) |
|---|---|---|
| Intent | Coming back — the plan is to re-enable | Off, cut, or postponed indefinitely |
| Code | Fully intact behind a flag | May be deleted, may never have shipped |
| Doc size | Its own file with a re-enable checklist | A few lines in a shared list |

`disabled-features.md` stays the single index everyone checks when a feature "seems missing" — every doc in this folder must also have a one-line pointer entry there. The detail lives here; the pointer lives there.

---

## Current inventory

| Feature | Flag | Hidden on | Doc |
|---------|------|-----------|-----|
| Schools catalog & compare | `SCHOOLS_CATALOG_ENABLED` | 2026-08-13 | [`mcn-schools-and-borrow.md`](mcn-schools-and-borrow.md) |
| Borrow & share posts | `BORROW_SHARE_ENABLED` | 2026-08-13 | [`mcn-schools-and-borrow.md`](mcn-schools-and-borrow.md) |

All flags live in [`constants/featureFlags.ts`](../../constants/featureFlags.ts).

---

## Rules for hiding a feature

1. **Flag it, don't delete it.** Add a `const` to `constants/featureFlags.ts` with a comment saying why, and gate the entry points on it. A hidden feature that was ripped out is a rewrite later, not a flag flip.
2. **Gate every entry point, not just the obvious one.** Hub cards, tabs, FABs, deep-link params, and quick actions all count. Grep for the route before you call it hidden.
3. **Leave the routes on disk.** They stay reachable by URL, which is how you QA the feature before flipping the flag back. Keep their `getImmediateParentRoute()` mappings in `lib/navigation.ts` too.
4. **Change nothing in the database.** No dropped tables, no dropped policies, no data migration. Residents' existing rows must survive the hidden period intact.
5. **Skip the dead queries.** A card that no longer renders should not still be counting rows on every focus.
6. **Never leave a dead tap.** If a placeholder stands in for the hidden section, it must not be pressable. Reuse `components/ComingSoonTile.tsx` rather than building another one.
7. **Write the doc in the same change set**, add the pointer line to `disabled-features.md`, and add a row to the inventory table above.
</content>
