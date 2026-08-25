# Saved menus & republish — food drops

**Status:** superseded (2026-08-24) · **Owner module:** `app/mcn/drops/*`

> **What actually shipped**, and where this plan diverges — read `docs/features.md` §4.3 for the current behaviour, not this file:
> - **Republish** on the host's own tiles under **Mine** (and on their drop detail), opening a sheet that asks only for the new closing and delivery time. This is the plan's "quick republish" flow, reached from a drop instead of a template.
> - **No template tables.** Confirmed unnecessary — see the listing-first reasoning below, which is still the right call if named menus are ever wanted.
> - **No recurring schedule.** Built and removed the same day: it depended on a daily reminder notification, and Wooru ships as a web/PWA where that cannot be relied on to arrive. Table and sweep dropped in `20260924000200`.
> - **No preset schedule chips.** Built and reverted: deriving the cut-off hid the closing time, which the host needs to see and set outright.

## The problem

A host who cooks the same thing every Saturday retypes the entire menu every
week: title, description, cover photo, meal slot, and every item with its unit,
price, diet type and quantity cap. Only two things actually change between runs
— the pre-order cut-off and the delivery date/time.

`app/mcn/drops/add.tsx` has exactly one prefill path today: `?dropId=` for
**editing** a live drop. There is no way to start a *new* drop from an old one.

## The answer: no new tables

The first draft of this plan proposed a private `mcn_drop_templates` table. That
was wrong. **The durable saved menu already exists and is already built:**

```
mcn_listings   (the host's business)
  └── mcn_products   name · description · unit · price · image_url · is_available · sort_order
```

`mcn_products` maps almost 1:1 onto `mcn_preorder_items`. It already has RLS, it
already has a management UI at
[app/mcn/listing/manage/[id].tsx](../../app/mcn/listing/manage/%5Bid%5D.tsx), and
`is_available` is already the per-item on/off switch a template would have needed.

And the drop side is **half-wired for it already**:

- `mcn_preorder_drops.listing_id` exists, FK to `mcn_listings`;
- [app/mcn/drops/[id].tsx:163](../../app/mcn/drops/%5Bid%5D.tsx#L163) reads the
  linked listing and renders it;
- [app/mcn/drops/index.tsx:393](../../app/mcn/drops/index.tsx#L393) joins it onto
  every catalog tile;
- but [add.tsx:556](../../app/mcn/drops/add.tsx#L556) hardcodes `listing_id: null`,
  so **nothing ever sets it**. The read path is dead code today.

A private template table would have duplicated `mcn_products` while being strictly
worse: invisible to neighbours, maintained separately, and a second place for the
same menu to drift.

## Three tiers of host

| Tier | Who | How they publish | Needs |
|---|---|---|---|
| **1. One-off** | Cooks extra biryani once | Fills the form, as today | nothing (unchanged) |
| **2. Repeat, no business** | Runs the same menu occasionally | **Host again** — duplicates a past drop | no migration |
| **3. Regular** | Runs a real home kitchen | **Publish from my business** — pick listing → tick today's items → set schedule | one column |

**A listing must stay optional.** Forcing a business listing to sell one batch of
biryani would gut the feature — the whole point of drops is the neighbour who
cooks occasionally. Listings also carry their own spam controls and reports, which
is a lot of ceremony for one Saturday.

Tier 3 is the "saved menu" feature, done properly: one menu, maintained in one
place, feeding both the listing page and every drop published from it — and it
builds the host's visible reputation instead of hiding in a private drawer.

---

## Phase 0 — Extract the shared pieces (no behaviour change)

The cut-off/delivery rules currently live inline in `handleSubmit`
([add.tsx:387-450](../../app/mcn/drops/add.tsx#L387-L450)). Every republish path
below needs the identical rules, and a second hand-written copy would drift.

**`lib/dropSchedule.ts`** (new)

```ts
export interface DropScheduleInput {
  cutoffDate: string;        // YYYY-MM-DD
  cutoffTime: string;        // HH:mm
  fulfillmentDate: string;
  fulfillmentTime: string;
  /** Values as loaded in edit mode; null for create/duplicate/republish. */
  loadedSchedule?: { cutoffDate; cutoffTime; fulfillmentDate; fulfillmentTime } | null;
}

export type DropScheduleResult =
  | { ok: true; cutoffAt: Date; fulfillAt: Date }
  | { ok: false; fieldErrors: Record<string, boolean>; text1: string; text2?: string };

export function validateDropSchedule(input: DropScheduleInput): DropScheduleResult;
```

Rules preserved exactly as they are today:

1. all four fields present;
2. both timestamps parse;
3. cut-off strictly `> now()` — **skipped only for a value the host did not change in edit mode**;
4. delivery strictly `> now()` — same exemption;
5. delivery strictly `> cut-off`.

**`components/DropScheduleFields.tsx`** (new) — the two date and two time picker
rows lifted out of `add.tsx` verbatim, including the `todayStr` floor and the
fulfillment picker's floor-at-cut-off-date behaviour. Consumed by `add.tsx` and
the republish sheet. Token usage unchanged, so this is a `docs/verandah.md`
addition.

`npx tsc --noEmit` must pass with `add.tsx` behaving identically before moving on.

---

## Phase 1 — "Host again" + the republish sheet (no migration)

**`lib/dropDraft.ts`** (new) — the prefill engine, with room for a second source
in Phase 2.

```ts
export interface DropDraft {
  title: string;
  description: string;
  imageUrl: string | null;
  mealType: MealType;
  listingId: string | null;
  items: ItemForm[];              // fresh client-side ids
  defaultCutoffTime?: string;     // HH:mm
  defaultFulfillmentTime?: string;
}

export async function loadDraftFromDrop(dropId: string): Promise<DropDraft>;
export async function loadDraftFromListing(listingId: string, productIds: string[]): Promise<DropDraft>; // Phase 2
```

`add.tsx` gains `?fromDropId=` alongside the existing `?dropId=`. Mutually
exclusive; `dropId` wins if both are somehow present.

**The republish sheet** is the headline, and literally the ask: tapping "Host
again" opens a sheet showing the menu **read-only** (title, cover, items with
prices) and asking for **only** cut-off and delivery via `DropScheduleFields`,
seeded from the source drop's times of day with **the dates left blank**. Then
`validateDropSchedule` with `loadedSchedule: null`, publish, and straight into the
new drop. An "Edit full menu" link escapes into `add.tsx?fromDropId=…` for the run
where something differs.

Read-only prices are not decoration — a menu rerun three months later can carry
stale prices, and the host must see what they are publishing before the whole
community is notified.

**Copied:** title, description, `image_url`, `meal_type`, `listing_id`, and every
item (name, unit, price, description, image, `max_quantity`, `diet_type`).

**Deliberately not copied:** `status` (always `open`), all `flagged_*` columns,
`max_orders`, `cutoff_at`, `fulfillment_date` / `fulfillment_time`, `created_at` /
`updated_at`, and — critically — **orders**. `mcn_preorder_orders` rows stay with
the original drop. New item ids mean the `max_quantity` total-across-all-buyers cap
restarts at zero, which is correct.

**Entry points:** the host action card on
[app/mcn/drops/[id].tsx:874](../../app/mcn/drops/%5Bid%5D.tsx#L874) — shown when
the drop is *not* open — and each of the host's own cards on the **Mine** tab.

---

## Phase 2 — Publish from my business (one column)

### Migration

```sql
ALTER TABLE public.mcn_products
  ADD COLUMN IF NOT EXISTS diet_type TEXT NOT NULL DEFAULT 'veg';
NOTIFY pgrst, 'reload schema';
```

One column, defaulting to `veg` exactly as `mcn_preorder_items.diet_type` did, and
backfilled the same way. It is needed because the drops catalog **filters on
diet** — a product with no diet marking cannot become a drop item. Existing
products land on `veg` and stay wrong until their owner edits them, which is the
same trade already accepted for drop items.

`max_quantity` stays **off** the product and on the drop item. It is per-run
capacity ("5 boxes this Saturday"), not a property of the dish.

Then, per CLAUDE.md: `npm run db:push:prod` → `npm run types:prod` → `npx tsc --noEmit`.

### UI

1. **`add.tsx` stops hardcoding `listing_id: null`.** This is the one-line change
   that brings the existing read path on the detail screen and catalog tiles to
   life.
2. **A "Publish from my business" entry** at the top of the drop form (and on the
   Mine tab) for hosts who own at least one listing: pick listing → tick which
   `mcn_products` are on offer this time (`is_available` products pre-ticked) →
   optionally set a per-item `max_quantity` for this run → schedule → publish.
3. **`diet_type` joins the product editor** in `app/mcn/listing/manage/[id].tsx`,
   reusing `DietDot` and `DIET_META`.
4. **Prices are copyable, not linked.** The drop item takes a **snapshot** of the
   product's price at publish time. Editing the listing price later must never
   move the price under an order that has already been placed.

---

## Interactions to get right

1. **Republishing must not evade moderation.** A drop hidden by leads
   (`flagged_for_review_at IS NOT NULL`) is force-closed and pulled from the
   catalog. "Host again" would let its host republish byte-identical content and
   re-broadcast it to everyone — a one-tap bypass of the review that just
   happened. **`loadDraftFromDrop` must refuse a flagged source drop**, and the
   Host-again affordance must not render on one. Same for a listing that is itself
   flagged. This is new surface that did not exist before this feature.
2. **The 3-open-drop cap will bite.** `enforce_max_open_drops_per_host` raises a
   raw Postgres exception on the 4th concurrently-open drop, and one-tap
   republishing makes hitting it far likelier. The sheet must **count the host's
   open drops up front** and disable the button with the real explanation, rather
   than letting a database exception surface through `err.message`.
3. **Every republish broadcasts.** `on_drop_published` is `AFTER INSERT`, so each
   republish notifies every un-muted resident. This is *correct* — it is a
   genuinely new menu — but one-tap republishing turns it into a plausible spam
   vector. Current brakes: the 3-open cap and the `food_drops` mute channel.
   **Recommendation: change nothing now**, but watch it; a per-host daily fanout
   limit is the fix if it becomes a problem. Flagged so the decision is deliberate
   rather than discovered.
4. **Four traps in the duplicate path:**
   - `isEditMode` must stay `false` (it is derived from `dropId`, so a duplicate
     correctly falls through to CREATE — but every guard keyed on it must be
     re-read once `fromDropId` exists);
   - **`loadedSchedule` must stay `null`** — in edit mode it exempts *unchanged*
     timestamps from the future check so a typo can be fixed after cut-off; a
     duplicate that inherited it would publish a drop nobody can order from,
     because `place_mcn_preorder` rejects every order once `cutoff_at <= now()`;
   - schedule fields start **empty**, never copied, so there is no pre-filled past
     date to accidentally accept;
   - **`mealTouchedRef` must be set `true`** on prefill, as edit mode does, or
     `suggestMealFromTime` silently overrules the copied meal slot the moment the
     host picks a delivery time.
5. **The create path is not atomic.** `handleSubmit` inserts the drop, then inserts
   items in a **second** statement — a failure between them leaves a published,
   item-less drop that has already broadcast to the community. Republishing makes
   that path much hotter. Folding both into one `SECURITY DEFINER` RPC is the fix;
   it is **out of scope here** but should be the next follow-up.
6. **Cover images are safe to reuse.** They live on Cloudinary and are not deleted
   when a drop is deleted, so a republished drop can point at the same URL. No
   re-upload, no orphan risk introduced.
7. **`max_quantity` is a total across all buyers**, not a per-order allowance.
   Copying it into a fresh drop is right — the counter restarts with new item rows.
8. **Deleting the source drop.** Tier 2's menu lives in the drop itself, so a host
   who deletes a past drop loses it. Acceptable: deletion cascades to every
   pre-order and is warned about hard, so it is rare — and tier 3 hosts, the ones
   who rerun menus most, keep theirs in the listing where deletion cannot reach it.

## Docs to update (routing per CLAUDE.md)

| File | What |
|---|---|
| `docs/features.md` §4.3 | Host again, the republish sheet, publish-from-business, the read-only price review |
| `docs/architecture.md` | `mcn_products.diet_type`, and that `mcn_preorder_drops.listing_id` is finally written |
| `docs/CLAUDE.md` §9 | The trap: duplicate mode must keep `loadedSchedule` null and `isEditMode` false; flagged drops are not republishable |
| `docs/verandah.md` | `DropScheduleFields` as a shared component |

No `.github/app-summary.md` change — no new route, no new module.

## Order of work

| Phase | Ships | Migration |
|---|---|---|
| 0 | `lib/dropSchedule.ts`, `components/DropScheduleFields.tsx` — no behaviour change | no |
| 1 | Host again + republish sheet — covers every host | no |
| 2 | `mcn_products.diet_type`, publish-from-business, `listing_id` finally written | one column |
| 3 | Docs | no |

Phase 1 is independently shippable and removes the retyping for everyone. Phase 2
turns the business listing into the durable menu — and revives read-path code that
has been dead since `listing_id` was added.
