# Hidden: "Most ordered" sort on the pre-order food catalog

**Flag:** `DROP_SORT_MOST_ORDERED_ENABLED` (`constants/featureFlags.ts`)
**Hidden on:** 2026-08-14
**Screen:** `app/mcn/drops/index.tsx` — the Sort bottom sheet

---

## What is hidden

Exactly one row in the Sort sheet: **Most ordered** ("What the society is already buying"), which sorts drops by descending non-cancelled order count.

That is the whole of it. The sheet still offers Closing soon (default), Delivery soonest, Just added, and Price low→high.

## What is still live

Everything the option depends on:

| Piece | State | Where |
|---|---|---|
| `get_mcn_drop_order_counts(uuid[])` RPC | **Deployed and granted** to `anon` + `authenticated` | migration `20260909000000` |
| The RPC *call site* | Gated on the same flag — skipped while hidden | `fetchDrops()` |
| `order_count` / `item_count` on each tile | Default to `0` while hidden | `fetchDrops()` |
| The `'popular'` comparator | Present in the sort switch | `processedDrops` memo |
| `SortOption` union | Still includes `'popular'` | module scope |

**The call site is gated because this sort is its only consumer.** An earlier revision of the catalog also had a "spots still left" filter that compared `order_count` against `max_orders`, which kept the counts load-bearing; that filter was removed on 2026-08-14, leaving the fetch as a round trip per catalog load for something nothing renders — exactly what [rule 5](README.md#rules-for-hiding-a-feature) forbids. If you add any other consumer of `order_count`, ungate the call.

## Why it was parked

Product call on 2026-08-14: ship the catalog's filter and sort controls without a popularity signal for now. Nothing was wrong with the implementation — the sort works, and it works logged-out, which is the part that took the RPC.

## Re-enable checklist

1. Flip `DROP_SORT_MOST_ORDERED_ENABLED` to `true` in `constants/featureFlags.ts`. This restores both the sheet row **and** the `get_mcn_drop_order_counts` call — the same flag guards each.
2. `npx tsc --noEmit`.
3. Open `/mcn/drops`, tap the sort pill, confirm **Most ordered** appears last and reorders the list.
4. **Check it logged out** — this is the case that was broken before `get_mcn_drop_order_counts` existed. Every drop showing zero orders means the RPC is not being reached, not that the sort is wrong.
5. Move the Most ordered mention in `docs/features.md` §4.3 back into the plain sort list, drop the parked note, and remove this file plus its rows in [`README.md`](README.md) and [`../disabled-features.md`](../disabled-features.md).

Nothing in the database needs changing — the RPC is already granted to `anon` and `authenticated`.
