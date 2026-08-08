# My community posts & My Orders — Edge-Case Review & Fix Plan

**Date:** 2026-08-07
**Scope:** `app/mcn/my-posts.tsx`, `app/mcn/my-orders.tsx` (both the **Pre-order food** and **Business Orders** tabs), plus every sibling screen and policy that writes the same rows — `app/mcn/listing/[id].tsx`, `app/mcn/listing/orders/[id].tsx`, `app/mcn/listing/manage/[id].tsx`, `app/mcn/drops/[id].tsx`, `app/mcn/drops/manage/[id].tsx`, `app/(tabs)/network.tsx`, `app/(tabs)/profile.tsx`, `supabase/migrations/20260608010000_mcn_listings.sql`, `supabase/migrations/20260727000000_add_mcn_preorder_drops.sql`, `supabase/migrations/20260824000000_atomic_preorder_placement.sql`, `supabase/migrations/20260826000000_preorder_orders_rpc_only.sql`, `supabase/migrations/20260805000000_allow_food_drop_host_profile_read.sql`
**Method:** Walked both screens as a resident would — open, cancel, edit, refresh, switch tabs — then followed every write back to its RLS policy and RPC, and grepped the whole tree for the counterpart writer of each table.
**Baseline:** `npx tsc --noEmit` is clean before any change.

**Result: 18 issues — 6 blocking, 8 high, 4 minor.** Two of them are product decisions, not bugs; see [Decisions required](#decisions-required).

---

## How to use this document

- Findings are evidence. The **[Fix plan](#fix-plan)** at the end is the work — it is ordered, and each task carries the files to touch, the code to write, and acceptance criteria.
- **Do not start Tasks 6 or 7 until the [Decisions required](#decisions-required) are answered.** Tasks 1–5 and 8–10 are independent of both answers and can be landed immediately.
- Every migration must end with `NOTIFY pgrst, 'reload schema';` and be followed by the deployment loop in `CLAUDE.md`. Do not leave a migration unapplied or types unregenerated.
- `npx tsc --noEmit` is the only automated gate. Several of these defects are **web-only** — verify on the PWA, not just a native build.

---

## Severity summary

| # | Issue | Severity | Area |
|---|-------|----------|------|
| 1 | `mcn_preorder_orders` UPDATE has no `WITH CHECK` — a buyer can self-deliver, un-cancel, or zero the total | **P0** | DB / security |
| 2 | Cancel pre-order has no status guard — a delivered order can be flipped to cancelled | **P0** | Client + DB |
| 3 | Business ordering is dead — nothing in the repo inserts `mcn_orders` | **P0** | Product |
| 4 | My community posts shows no posts; `/mcn/add` is unreachable | **P0** | Product |
| 5 | Delete and pause a listing are no-ops on web | **P0** | Client (web) |
| 6 | `profiles` is world-readable including `phone_number` and `email` | **P0** | DB / security |
| 7 | Both cancel handlers report success when they changed nothing | P1 | Client |
| 8 | Cancelling a business order destroys the seller's record | P1 | Client + DB |
| 9 | My Orders never refreshes after first mount; no pull-to-refresh | P1 | Client |
| 10 | Fetch failures render as "you have no orders" | P1 | Client |
| 11 | WhatsApp buttons broken on the PWA; phone not normalized | P1 | Client (web) |
| 12 | Delete listing fails with a raw FK error when orders exist | P1 | Client + DB |
| 13 | Toggle active/paused swallows trigger messages, can silently no-op | P1 | Client |
| 14 | Seller-side "Orders received" shares three of these defects | P1 | Client |
| 15 | A deleted or cross-community drop renders as a phantom order dated today | P2 | Client |
| 16 | Tab counts include cancelled orders; cancelled not grouped | P2 | Client |
| 17 | Item names drift from what was ordered | P2 | Client |
| 18 | Loading branch drops the header; no in-flight guard on cancel | P2 | Client |

---

# P0 — blocking, data loss, or security

## 1. `mcn_preorder_orders` UPDATE has no `WITH CHECK`

[supabase/migrations/20260727000000_add_mcn_preorder_drops.sql:141-146](supabase/migrations/20260727000000_add_mcn_preorder_drops.sql#L141-L146):

```sql
DROP POLICY IF EXISTS "mcn_preorder_orders_update" ON public.mcn_preorder_orders;
CREATE POLICY "mcn_preorder_orders_update"
  ON public.mcn_preorder_orders FOR UPDATE
  USING (buyer_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.mcn_preorder_drops d WHERE d.id = drop_id AND d.created_by = auth.uid()
  ));
```

There is no `WITH CHECK`. Postgres then reuses the `USING` expression as the check, and that expression constrains only `buyer_id` — **every other column is free**. A buyer calling PostgREST directly can:

- set `status = 'fulfilled'` on their own order, marking it delivered without the host;
- flip a `cancelled` order back to `confirmed`, **bypassing every `max_quantity` cap** — `place_mcn_preorder`'s capacity sums exclude cancelled rows ([20260824000000:170-175](supabase/migrations/20260824000000_atomic_preorder_placement.sql#L170-L175)), so the reinstated quantity was never counted against the item;
- set `total_amount = 0`, corrupting the host's Est. Revenue on the manage dashboard.

This is the same class of hole that [20260826000000_preorder_orders_rpc_only.sql](supabase/migrations/20260826000000_preorder_orders_rpc_only.sql) just closed on the INSERT side. That migration revoked direct INSERT and made placement RPC-only. UPDATE was left wide open.

**Fix:** [Task 1](#task-1--lock-down-order-updates-migration).

---

## 2. Cancel pre-order has no status guard

[my-orders.tsx:183-187](app/mcn/my-orders.tsx#L183-L187) and [drops/[id].tsx:412-416](app/mcn/drops/[id].tsx#L412-L416) both run:

```js
await supabase
  .from('mcn_preorder_orders')
  .update({ status: 'cancelled' })
  .eq('id', orderId)
  .eq('buyer_id', user.id);      // <-- no .eq('status', 'confirmed')
```

No status filter on the client, and no status constraint in RLS (#1). The UI only *hides* the Cancel button, which is not enforcement.

**Concrete failure.** Buyer opens My Orders. Host marks the order delivered on their dashboard in the same minute. The buyer's list is stale ([#9](#9-my-orders-never-refreshes-after-first-mount)) so the Cancel button is still on screen. Buyer taps it → a `fulfilled` order becomes `cancelled`, the host's prep totals and revenue silently drop, and the food has already been delivered.

`place_mcn_preorder` guards this properly (`IF v_order.status <> 'confirmed' THEN RAISE`, [20260824000000:127](supabase/migrations/20260824000000_atomic_preorder_placement.sql#L127)). The direct-table path does not.

Note the asymmetry: business orders get this right — `mcn_orders_delete` is `USING (buyer_id = auth.uid() AND status = 'pending')`.

**Fix:** [Task 1](#task-1--lock-down-order-updates-migration) (server) + [Task 3](#task-3--my-orders-cancel-handlers).

---

## 3. Business ordering is dead — nothing inserts `mcn_orders`

**No code path in the repository inserts into `mcn_orders` or `mcn_order_items`.** A tree-wide grep (`app`, `components`, `lib`, `admin-dashboard`) returns six references, all reads or status updates:

```
app/mcn/listing/manage/[id].tsx:148   read  (pending count)
app/mcn/listing/orders/[id].tsx:52    read
app/mcn/listing/orders/[id].tsx:80    update status
app/mcn/listing/[id].tsx:169          read  (existing pending order)
app/mcn/my-orders.tsx:91              read
app/mcn/my-orders.tsx:153             delete
```

[app/mcn/listing/[id].tsx](app/mcn/listing/[id].tsx) — the screen `docs/features.md` calls *"Listing detail & order"* — still fetches the buyer's pending order and populates `existingOrder`, `quantities`, `buyerNote`, `buyerPhone` ([:167-188](app/mcn/listing/[id].tsx#L167-L188)), but **none of that state is ever rendered or submitted**. The offerings list ([:469-540](app/mcn/listing/[id].tsx#L469-L540)) is a read-only catalogue: no steppers, no cart, no subtotal, no order button. Call and WhatsApp only.

Consequences:

- The **Business Orders** tab can only show pre-existing historical rows. For every new user it is permanently empty.
- [listing/orders/[id].tsx](app/mcn/listing/orders/[id].tsx) ("Orders received") and the **Orders** action on every listing card ([my-posts.tsx:325](app/mcn/my-posts.tsx#L325)) lead to a screen that can never gain a row.
- `docs/features.md` still documents the cart, the 0.5-step quantities for kg/litre, the subtotal, and *"places a new order or updates an existing pending order"*.
- `docs/disabled-features.md` has **no entry** for the removal.

This is the largest single finding. Everything else about business orders is secondary to resolving it.

**Fix:** [Decision A](#decision-a--business-ordering) → [Task 6](#task-6--resolve-business-ordering-decision-a).

---

## 4. My community posts shows no posts; `/mcn/add` is unreachable

[my-posts.tsx:24](app/mcn/my-posts.tsx#L24) hardcodes `const borrowOnlyView = false;` and [:26](app/mcn/my-posts.tsx#L26) initializes `activeSegment = 'business'` with **no call to `setActiveSegment` anywhere in the file**.

```js
// my-posts.tsx:24-26
const borrowOnlyView = false;
const [activeSegment, setActiveSegment] = useState<'business' | 'borrow'>('business');
//                    ^^^^^^^^^^^^^^^^ never called
```

Confirmed consequences:

- `fetchPosts` ([:32-73](app/mcn/my-posts.tsx#L32-L73)) never runs. The `SectionList` branch ([:357-433](app/mcn/my-posts.tsx#L357-L433)), `handleClose`, `handleDelete`, and the `activePosts` / `closedPosts` / `sections` derivations are all unreachable.
- The segment bar ([:256-272](app/mcn/my-posts.tsx#L256-L272)) renders a **single `TouchableOpacity` with no `onPress`** — a tab that looks tappable and does nothing.
- The FAB's borrow branch ([:440-442](app/mcn/my-posts.tsx#L440-L442)) is unreachable, and it is the **only** reference to `/mcn/add` in the codebase. `app/mcn/add.tsx` — the borrow post composer — cannot be opened by any user.
- [network.tsx:35](app/(tabs)/network.tsx#L35) still declares `postCount`, [:71-76](app/(tabs)/network.tsx#L71-L76) still queries borrow posts to fill it, and **nothing renders it**. The Borrow & Share hub card is gone.

Meanwhile [profile.tsx:244](app/(tabs)/profile.tsx#L244) advertises *"Manage your business and borrow listings"*, and `docs/features.md` §4.7 documents borrow-only community-feed mode as live. Both are wrong.

**Fix:** [Decision B](#decision-b--borrow--share) → [Task 7](#task-7--resolve-borrow--share-decision-b).

---

## 5. Delete and pause a listing are no-ops on web

[my-posts.tsx:192](app/mcn/my-posts.tsx#L192) (`handleDeleteListing`) and [:137](app/mcn/my-posts.tsx#L137) (`handleDelete`) use bare `Alert.alert`:

```js
// my-posts.tsx:192
Alert.alert(
  'Delete business listing?',
  'This will permanently remove your business and all its items. This action cannot be undone.',
  [ { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: ... } ]
);
```

`CLAUDE.md` §9 calls this out explicitly: **`Alert.alert` is a no-op on web.** On the PWA, tapping Delete does nothing at all — no dialog, no error, no feedback, no console output.

**This is a gap specific to this screen.** The rest of the feature already handles it:

- [listing/manage/[id].tsx:424-437](app/mcn/listing/manage/[id].tsx#L424-L437) — the *same* delete-listing action, done correctly
- [my-orders.tsx:167-176](app/mcn/my-orders.tsx#L167-L176)
- [drops/[id].tsx:432-445](app/mcn/drops/[id].tsx#L432-L445)

[listing/orders/[id].tsx:94](app/mcn/listing/orders/[id].tsx#L94) has the same defect ([#14](#14-seller-side-orders-received-shares-three-defects)).

**Fix:** [Task 4](#task-4--shared-confirm-helper--web-safe-destructive-actions).

---

## 6. `profiles` is world-readable, including `phone_number` and `email`

Found while tracing where My Orders reads the pre-order host's phone. [supabase/migrations/20260805000000_allow_food_drop_host_profile_read.sql](supabase/migrations/20260805000000_allow_food_drop_host_profile_read.sql):

```sql
CREATE POLICY profiles_select_public_hosts
  ON public.profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.mcn_preorder_drops d WHERE d.created_by = profiles.id)
    OR EXISTS (SELECT 1 FROM public.mcn_listings l  WHERE l.owner_id   = profiles.id)
    OR community_id IS NOT NULL        -- <-- this
  );
```

The stated intent is *"host basic profile info … so shared drop cards show creator name and flat number."* The third clause does something else entirely. The policy is `TO PUBLIC` and PERMISSIVE, so it ORs with the base policy from [00000_init.sql:83](supabase/migrations/00000_init.sql#L83) and makes **every profile row with a community — all columns, including `phone_number` and `email` — readable by every authenticated user in every community, and by `anon`.**

This directly contradicts the app's own model: `get_residents_directory` raises `'Only community leads can view phone numbers'`, and that guard is bypassed by selecting the table.

**Fix:** [Task 10](#task-10--close-the-profiles-read-leak-separate-change-set) — deliberately a **separate change set**, because it changes read access app-wide.

---

# P1 — user-visible defects

## 7. Both cancel handlers report success when they changed nothing

[my-orders.tsx:152-159](app/mcn/my-orders.tsx#L152-L159) (business `.delete()`) and [:183-190](app/mcn/my-orders.tsx#L183-L190) (pre-order `.update()`) neither `.select()` nor inspect affected rows:

```js
const { error } = await supabase.from('mcn_orders').delete().eq('id', orderId).eq('buyer_id', user.id);
if (error) throw error;
Toast.show({ type: 'success', text1: 'Order cancelled' });   // <-- even for 0 rows
```

A row filtered out by RLS — the business order is no longer `pending`, someone else already acted — returns `error: null` with **zero rows touched**. The user gets "Order cancelled", then `fetchMyOrders()` re-renders the order still sitting there.

`handleDelete` in the sibling screen does this correctly with `.select('id').maybeSingle()` ([my-posts.tsx:155](app/mcn/my-posts.tsx#L155)) — the pattern exists, it just wasn't applied here.

**Fix:** [Task 3](#task-3--my-orders-cancel-handlers).

---

## 8. Cancelling a business order destroys the seller's record

[my-orders.tsx:152-156](app/mcn/my-orders.tsx#L152-L156) hard-`DELETE`s the row; `mcn_order_items` cascades.

The seller's Orders-received screen has a **Cancelled** section ([listing/orders/[id].tsx:245-250](app/mcn/listing/orders/[id].tsx#L245-L250)) that a buyer cancellation can never populate — the order simply vanishes mid-transaction with no trace and no notification. `McnOrderStatusBadge` supports `cancelled`, and My Orders' own `order.status === 'pending'` check at [:448](app/mcn/my-orders.tsx#L448) implies a cancelled state buyers can never reach.

`mcn_orders.status` already carries `cancelled` in its CHECK constraint ([20260608010000:42](supabase/migrations/20260608010000_mcn_listings.sql#L42)). The hard delete is gratuitous.

**Fix:** [Task 1](#task-1--lock-down-order-updates-migration) (adds the buyer UPDATE path) + [Task 3](#task-3--my-orders-cancel-handlers).

---

## 9. My Orders never refreshes after first mount

[my-orders.tsx:144-146](app/mcn/my-orders.tsx#L144-L146) uses a plain `useEffect`:

```js
useEffect(() => {
  fetchMyOrders();
}, [fetchMyOrders]);
```

`fetchMyOrders` is keyed on `user?.id`, which does not change while signed in — so this runs **once on mount**. The `ScrollView` at [:510](app/mcn/my-orders.tsx#L510) has **no `RefreshControl`** either.

The screen stays mounted in the expo-router stack, so:

> My Orders → **View Drop** → cancel or edit the pre-order there → back

lands on a stale list showing the order as still Confirmed at its old total, **with a live Cancel button on it** — which is exactly the stale-button half of [#2](#2-cancel-pre-order-has-no-status-guard). There is no way to refresh short of leaving the tab entirely.

Every sibling surface already uses `useFocusEffect` and/or pull-to-refresh: [my-posts.tsx:103](app/mcn/my-posts.tsx#L103), [drops/[id].tsx:214](app/mcn/drops/[id].tsx#L214), [network.tsx](app/(tabs)/network.tsx).

**Fix:** [Task 2](#task-2--my-orders-refresh--error-surfacing).

---

## 10. Fetch failures render as "you have no orders"

[my-orders.tsx:106](app/mcn/my-orders.tsx#L106) and [:130](app/mcn/my-orders.tsx#L130):

```js
if (bErr) console.error('Error fetching business orders:', bErr);
else if (bData) { setBusinessOrders(...); }
```

Neither error reaches the user, and neither clears prior state. A failed business query leaves the tab reading **"You haven't placed any business orders yet"** — indistinguishable from a genuine empty state.

The `catch` with the toast at [:136-139](app/mcn/my-orders.tsx#L136-L139) only fires on a thrown exception, which these `error`-returning calls never produce.

**Fix:** [Task 2](#task-2--my-orders-refresh--error-surfacing).

---

## 11. WhatsApp buttons broken on the PWA; phone not normalized

[my-orders.tsx:220](app/mcn/my-orders.tsx#L220):

```js
Linking.openURL(`whatsapp://send?phone=91${phone}&text=${text}`);
```

The `whatsapp://` scheme is native-only — on web it fails or opens nothing. `https://wa.me/91<phone>?text=…` works on both.

Separately, `91${phone}` blindly prefixes. A number stored as `+91…`, `091…`, or with spaces produces a malformed URL. Business listings normalize to 10 digits on entry, but `profiles.phone_number` — the source for the pre-order host at [my-orders.tsx:244](app/mcn/my-orders.tsx#L244) — is not guaranteed to be.

[lib/phone.ts](lib/phone.ts) already exports `toLast10Digits` and `normalizeIndianMobile`. Neither is used here.

Same defect at [listing/orders/[id].tsx:122](app/mcn/listing/orders/[id].tsx#L122) and [listing/[id].tsx:284](app/mcn/listing/[id].tsx#L284).

**Fix:** [Task 5](#task-5--whatsapp-deep-links).

---

## 12. Delete listing fails with a raw FK error when orders exist

`mcn_order_items.product_id` references `mcn_products` **`ON DELETE RESTRICT`** ([20260608010000:59](supabase/migrations/20260608010000_mcn_listings.sql#L59)), while `mcn_products.listing_id` is `ON DELETE CASCADE` ([:23](supabase/migrations/20260608010000_mcn_listings.sql#L23)).

Deleting a listing cascades into `mcn_products`; the RESTRICT on `mcn_order_items` fires and aborts the whole statement with SQLSTATE `23503`. The user sees a generic toast with no explanation of why or what to do — in both places the action exists:

- [my-posts.tsx:210](app/mcn/my-posts.tsx#L210) — `Toast "Failed to delete listing"`
- [listing/manage/[id].tsx:420](app/mcn/listing/manage/[id].tsx#L420) — same

The manage screen already handles the narrower per-product case (`docs/features.md` § Manage listing: *"Deleting a product is blocked when order items reference it"*). The whole-listing path does not.

**Fix:** [Task 8](#task-8--listing-management-hardening).

---

## 13. Toggle active/paused swallows trigger messages, can silently no-op

[my-posts.tsx:172-189](app/mcn/my-posts.tsx#L172-L189) issues the update with no `.select()` and no ownership filter, and discards `error.message`.

Two server-side triggers can reject it — `enforce_max_active_listings_per_owner` (5-active cap, [20260821000000](supabase/migrations/20260821000000_mcn_listing_spam_controls.sql)) and `enforce_flagged_listing_reactivation` (reported-listing lockout, [20260821000200](supabase/migrations/20260821000200_restrict_flagged_listing_reactivation.sql)) — and **both raise plain-language messages designed to be surfaced verbatim**. `docs/features.md` § Anti-spam rules says so explicitly: *"Each check raises a plain-language error the client surfaces directly (`error.message`), so no separate client-side copy to keep in sync."*

This handler shows `Toast "Failed to update status"` instead, and when RLS matches zero rows it reports **success**.

**Fix:** [Task 8](#task-8--listing-management-hardening).

---

## 14. Seller-side "Orders received" shares three defects

[app/mcn/listing/orders/[id].tsx](app/mcn/listing/orders/[id].tsx):

- [:94](app/mcn/listing/orders/[id].tsx#L94) — `confirmCancel` uses bare `Alert.alert`, dead on web ([#5](#5-delete-and-pause-a-listing-are-no-ops-on-web))
- [:122](app/mcn/listing/orders/[id].tsx#L122) — `whatsapp://` scheme ([#11](#11-whatsapp-buttons-broken-on-the-pwa-phone-not-normalized))
- [:80](app/mcn/listing/orders/[id].tsx#L80) — `handleUpdateStatus` updates by `id` alone, with no status guard and no `.select()` ([#2](#2-cancel-pre-order-has-no-status-guard), [#7](#7-both-cancel-handlers-report-success-when-they-changed-nothing))

It also fetches in a plain `useEffect` ([:73](app/mcn/listing/orders/[id].tsx#L73)) and uses a bare `<Stack.Screen options={{ title }} />` ([:228](app/mcn/listing/orders/[id].tsx#L228)) rather than `buildMcnHeaderOptions` + `goBackSmart`, unlike the rest of `app/mcn/`.

**Fix:** [Tasks 3–5](#fix-plan) cover it; roll the screen into each.

---

# P2 — smaller

## 15. A deleted or cross-community drop renders as a phantom order

[my-orders.tsx:246](app/mcn/my-orders.tsx#L246):

```js
const fulfillDateObj = new Date(drop?.fulfillment_date || Date.now());
```

When the embedded `mcn_preorder_drops` comes back `null`, the card shows **"Food Drop"**, host **"Host"**, and a delivery banner dated **today** — a fabricated date presented as fact. **View Drop** then lands on "Food drop not found."

This is reachable: `mcn_preorder_drops_select` is gated on `community_id = get_user_community_id()`, but `mcn_preorder_orders_select` is gated only on `buyer_id`. A resident who changes communities keeps every old order visible with all its joins nulled.

The business tab has the same shape, falling back to "Deleted business" ([:376](app/mcn/my-orders.tsx#L376)) — plausible-sounding but wrong; the listing exists, it is just out of scope.

Related: [:288](app/mcn/my-orders.tsx#L288) renders `({format12HourTime(drop?.fulfillment_time)})`, which is an empty `()` when the drop is null.

## 16. Tab counts include cancelled orders

[my-orders.tsx:491](app/mcn/my-orders.tsx#L491) and [:505](app/mcn/my-orders.tsx#L505) render `preorderOrders.length` / `businessOrders.length` raw. "Pre-order food (7)" where 5 are cancelled overstates activity.

Cancelled orders also sort inline by `created_at` among live ones rather than sinking to the bottom. The seller-side screen groups by status ([listing/orders/[id].tsx:126-128](app/mcn/listing/orders/[id].tsx#L126-L128)); My Orders does not.

## 17. Item names drift from what was ordered

The pre-order query joins `mcn_preorder_items(name, unit)` ([my-orders.tsx:124](app/mcn/my-orders.tsx#L124)) instead of reading the `item_name` snapshot that `place_mcn_preorder` deliberately writes onto `mcn_preorder_order_items` ([20260824000000:180-184](supabase/migrations/20260824000000_atomic_preorder_placement.sql#L180-L184)).

If the host renames an item, My Orders shows the **new** name while the drop detail screen ([drops/[id].tsx:706](app/mcn/drops/[id].tsx#L706)) correctly shows the snapshot — two screens disagreeing about the same order. The snapshot column exists precisely to prevent this.

## 18. Loading branch drops the header; no in-flight guard

[my-orders.tsx:462-468](app/mcn/my-orders.tsx#L462-L468) returns before `<Stack.Screen>` mounts, so the header briefly has no title and no back handler. [my-posts.tsx:230](app/mcn/my-posts.tsx#L230) does the inverse — it renders a bare `<Stack.Screen options={{ title }} />` that replaces `buildMcnHeaderOptions` and loses the `goBackSmart` handler for the duration of the load.

Neither cancel handler disables its button while the request is in flight, so a double-tap fires two writes.

---

# Decisions required

Both change what gets built. **Tasks 6 and 7 are blocked until these are answered; nothing else is.**

## Decision A — business ordering

[#3](#3-business-ordering-is-dead--nothing-inserts-mcn_orders) established that the ordering UI is gone while the tables, the buyer tab, the seller screen, and the docs all remain.

| Option | Work | Consequence |
|---|---|---|
| **A1 — Restore** the cart/order UI on `app/mcn/listing/[id].tsx` | ~1 day | `docs/features.md` becomes true again. The dormant state at [:167-188](app/mcn/listing/[id].tsx#L167-L188) is already wired for it. |
| **A2 — Retire** the Business Orders tab, Orders-received screen, and the Orders card action | ~half a day + docs | My Orders becomes a single-purpose pre-order screen. Needs a `docs/disabled-features.md` entry and a read-only plan for historical rows. |

## Decision B — Borrow & Share

[#4](#4-my-community-posts-shows-no-posts-mcnadd-is-unreachable) established that `mcn_posts` has no reachable UI at all.

| Option | Work | Consequence |
|---|---|---|
| **B1 — Re-enable** the borrow segment, the `/mcn/add` route, and the hub card | ~half a day | Restores `docs/features.md` §4.7 and the `profile.tsx` promise. All the code already exists — it needs `setActiveSegment` wired to a real second tab and a hub entry point. |
| **B2 — Complete the removal** | ~2 hours + docs | Strip dead code from `my-posts.tsx`, drop `postCount` from `network.tsx`, retitle the screen and the profile row to "My business listings", decide the fate of `app/mcn/add.tsx` and `mcn_posts`. |

---

# Fix plan

Ten tasks. **Land Tasks 1–5 first as one change set** — they are the security hole plus everything a resident hits on day one, and none of them depend on the decisions above.

---

## Task 1 — Lock down order updates (migration)

**Fixes:** #1, #2 (server half), #8 (server half)
**File:** `supabase/migrations/20260827000000_order_update_guards.sql` *(bump the timestamp if a later migration already exists)*

### 1a. Constrain pre-order updates

```sql
-- A buyer may only cancel a confirmed order. A host may move it between any of
-- the three statuses (the manage dashboard supports fulfilled -> confirmed).
-- Everything else about an order — its amount, its owner, its drop — belongs to
-- place_mcn_preorder() alone.
DROP POLICY IF EXISTS "mcn_preorder_orders_update" ON public.mcn_preorder_orders;
CREATE POLICY "mcn_preorder_orders_update"
  ON public.mcn_preorder_orders FOR UPDATE
  USING (
    (buyer_id = auth.uid() AND status = 'confirmed')
    OR EXISTS (
      SELECT 1 FROM public.mcn_preorder_drops d
      WHERE d.id = drop_id AND d.created_by = auth.uid()
    )
  )
  WITH CHECK (
    (buyer_id = auth.uid() AND status = 'cancelled')
    OR EXISTS (
      SELECT 1 FROM public.mcn_preorder_drops d
      WHERE d.id = drop_id AND d.created_by = auth.uid()
    )
  );
```

### 1b. Make money and ownership immutable outside the RPC

RLS `WITH CHECK` cannot compare against `OLD`, so the column guard must be a trigger. `place_mcn_preorder` is `SECURITY DEFINER` and bypasses RLS but **not** triggers, so it announces itself with a transaction-local flag.

```sql
CREATE OR REPLACE FUNCTION public.enforce_mcn_preorder_order_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- place_mcn_preorder() sets this for the duration of its transaction. It is
  -- the only authority on price and ownership.
  IF current_setting('app.mcn_preorder_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.total_amount  IS DISTINCT FROM OLD.total_amount
     OR NEW.buyer_id     IS DISTINCT FROM OLD.buyer_id
     OR NEW.drop_id      IS DISTINCT FROM OLD.drop_id
     OR NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.created_at   IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only place_mcn_preorder() can change the amount or ownership of a pre-order';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mcn_preorder_order_immutable_fields ON public.mcn_preorder_orders;
CREATE TRIGGER trg_mcn_preorder_order_immutable_fields
BEFORE UPDATE ON public.mcn_preorder_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_mcn_preorder_order_immutable_fields();
```

### 1c. Teach `place_mcn_preorder` to set the flag

Re-declare `public.place_mcn_preorder(uuid, jsonb, text, text, text, text, uuid)` by copying its body **verbatim** from [20260824000000_atomic_preorder_placement.sql:41-206](supabase/migrations/20260824000000_atomic_preorder_placement.sql#L41-L206), inserting exactly one line immediately after the `IF v_user IS NULL THEN … END IF;` auth check:

```sql
  PERFORM set_config('app.mcn_preorder_rpc', 'on', true);   -- true = transaction-local
```

Do not change anything else in the function. Re-apply its grants afterwards:

```sql
REVOKE ALL ON FUNCTION public.place_mcn_preorder(uuid, jsonb, text, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_mcn_preorder(uuid, jsonb, text, text, text, text, uuid) TO authenticated;
```

### 1d. Same treatment for business orders, plus a buyer cancel path

```sql
-- Seller: pending -> fulfilled|cancelled. Buyer: pending -> cancelled.
-- The buyer clause replaces the hard DELETE the client used to do, so the
-- seller keeps a record of the cancellation.
DROP POLICY IF EXISTS "mcn_orders_update" ON public.mcn_orders;
CREATE POLICY "mcn_orders_update"
  ON public.mcn_orders FOR UPDATE
  USING (
    status = 'pending'
    AND (
      buyer_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.mcn_listings l WHERE l.id = listing_id AND l.owner_id = auth.uid())
    )
  )
  WITH CHECK (
    (buyer_id = auth.uid() AND status = 'cancelled')
    OR (
      EXISTS (SELECT 1 FROM public.mcn_listings l WHERE l.id = listing_id AND l.owner_id = auth.uid())
      AND status IN ('fulfilled', 'cancelled')
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_mcn_order_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.buyer_id     IS DISTINCT FROM OLD.buyer_id
     OR NEW.listing_id   IS DISTINCT FROM OLD.listing_id
     OR NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.created_at   IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'An order''s buyer, listing, and community cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mcn_order_immutable_fields ON public.mcn_orders;
CREATE TRIGGER trg_mcn_order_immutable_fields
BEFORE UPDATE ON public.mcn_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_mcn_order_immutable_fields();
```

Leave `mcn_orders_delete` in place — it is harmless once the client stops calling it, and removing it is a separate decision.

End the file with:

```sql
NOTIFY pgrst, 'reload schema';
```

### Then finish the loop per `CLAUDE.md`

```
npm run db:push
npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj
npx tsc --noEmit
```

### Acceptance criteria

- [ ] Placing, **editing**, and cancelling a pre-order from `app/mcn/drops/[id].tsx` all still work end to end. The edit path is the one most at risk — it goes through `place_mcn_preorder(p_order_id => …)` and must not trip the immutability trigger.
- [ ] The host's Mark delivered / Reset to confirmed toggle on `app/mcn/drops/manage/[id].tsx` still works.
- [ ] As a signed-in buyer, a direct PostgREST `PATCH` setting `status='fulfilled'` on your own order is **rejected**.
- [ ] Same for `total_amount=0`, and for `cancelled → confirmed`.
- [ ] `npx tsc --noEmit` clean.

> These cannot be exercised through the app UI — the app's own code paths already respect the intended transitions. Verify with a REST client using a real user JWT.

---

## Task 2 — My Orders: refresh & error surfacing

**Fixes:** #9, #10
**File:** [app/mcn/my-orders.tsx](app/mcn/my-orders.tsx)

1. Import `useFocusEffect` from `expo-router` (as [drops/[id].tsx:3](app/mcn/drops/[id].tsx#L3) does) and replace the `useEffect` at [:144-146](app/mcn/my-orders.tsx#L144-L146):

```js
useFocusEffect(
  useCallback(() => {
    fetchMyOrders();
  }, [fetchMyOrders])
);
```

2. Add `refreshing` state and a `RefreshControl` on the `ScrollView` at [:510](app/mcn/my-orders.tsx#L510), mirroring [network.tsx](app/(tabs)/network.tsx). Give `fetchMyOrders` an `isRefresh = false` parameter so a pull does not blank the list behind the full-screen spinner.

3. Replace the swallowed errors at [:106](app/mcn/my-orders.tsx#L106) and [:130](app/mcn/my-orders.tsx#L130) with a per-tab error state:

```js
const [businessError, setBusinessError] = useState<string | null>(null);
const [preorderError, setPreorderError] = useState<string | null>(null);
```

Set it from `bErr.message` / `pErr.message`, clear it on success, and render an error state — *"Couldn't load your orders"* plus a Retry button — **instead of** the empty state whenever it is non-null. Do not leave stale rows on screen alongside an error.

### Acceptance criteria

- [ ] My Orders → View Drop → cancel there → back: the list reflects the cancellation with no manual action.
- [ ] Pull-to-refresh works on native and web.
- [ ] With the network disabled, the tab reads as an error with a Retry affordance — **not** "You haven't placed any … yet."

---

## Task 3 — My Orders: cancel handlers

**Fixes:** #2 (client half), #7, #8 (client half), #18 (in-flight guard)
**Files:** [app/mcn/my-orders.tsx](app/mcn/my-orders.tsx), [app/mcn/drops/[id].tsx](app/mcn/drops/[id].tsx), [app/mcn/listing/orders/[id].tsx](app/mcn/listing/orders/[id].tsx)

Add `const [cancellingId, setCancellingId] = useState<string | null>(null);` and rewrite both handlers on the pattern below. **Task 1 must be deployed first** — the `mcn_orders` update path does not exist until then.

```js
const handleCancelPreorder = (orderId: string) => {
  const doCancel = async () => {
    if (!user?.id || cancellingId) return;
    setCancellingId(orderId);
    try {
      const { data, error } = await supabase
        .from('mcn_preorder_orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId)
        .eq('buyer_id', user.id)
        .eq('status', 'confirmed')      // #2 — never touch a delivered order
        .select('id')
        .maybeSingle();                 // #7 — know whether anything changed

      if (error) throw error;
      if (!data) {
        Toast.show({
          type: 'info',
          text1: 'Nothing to cancel',
          text2: 'This pre-order was already delivered or cancelled.',
        });
      } else {
        Toast.show({ type: 'success', text1: 'Pre-order cancelled' });
      }
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to cancel pre-order', text2: error?.message });
    } finally {
      setCancellingId(null);
      fetchMyOrders();                  // resync either way
    }
  };

  confirmAction({                       // Task 4
    title: 'Cancel pre-order?',
    message: 'Are you sure you want to cancel your food pre-order?',
    confirmLabel: 'Yes, cancel',
    onConfirm: doCancel,
  });
};
```

For `handleCancelBusinessOrder`, use the identical shape but swap the hard delete for a soft cancel:

```js
.from('mcn_orders')
.update({ status: 'cancelled' })
.eq('id', orderId)
.eq('buyer_id', user.id)
.eq('status', 'pending')
.select('id')
.maybeSingle();
```

Apply the same `.eq('status', 'pending')` + `.select('id').maybeSingle()` treatment to `handleUpdateStatus` in [listing/orders/[id].tsx:77-91](app/mcn/listing/orders/[id].tsx#L77-L91), and to `handleCancelOrder` in [drops/[id].tsx:409-430](app/mcn/drops/[id].tsx#L409-L430).

Disable the cancel button and swap its label for a spinner while `cancellingId === order.id` ([my-orders.tsx:356](app/mcn/my-orders.tsx#L356), [:448](app/mcn/my-orders.tsx#L448)).

### Acceptance criteria

- [ ] Cancelling a business order leaves a `cancelled` row that appears in the seller's Cancelled section on Orders received.
- [ ] Cancelling an order that a host delivered a moment earlier shows *"Nothing to cancel"* and the list resyncs to Delivered. No success toast.
- [ ] Double-tapping Cancel fires exactly one write.

---

## Task 4 — Shared confirm helper + web-safe destructive actions

**Fixes:** #5, #14 (confirm half)
**Files:** new `lib/confirm.ts`; [app/mcn/my-posts.tsx](app/mcn/my-posts.tsx), [app/mcn/my-orders.tsx](app/mcn/my-orders.tsx), [app/mcn/listing/orders/[id].tsx](app/mcn/listing/orders/[id].tsx)

There are 19 hand-rolled `Platform.OS` confirm splits across the app today. Create one helper and use it for the sites in scope:

```ts
// lib/confirm.ts
import { Alert, Platform } from 'react-native';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

/**
 * Alert.alert is a no-op on web (see docs/CLAUDE.md §9), so every confirmation
 * has to split on platform. Use this instead of calling Alert.alert directly.
 */
export function confirmAction({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
}: ConfirmOptions): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
```

Convert these call sites:

| Site | Currently |
|---|---|
| [my-posts.tsx:137](app/mcn/my-posts.tsx#L137) `handleDelete` | bare `Alert.alert` |
| [my-posts.tsx:192](app/mcn/my-posts.tsx#L192) `handleDeleteListing` | bare `Alert.alert` |
| [listing/orders/[id].tsx:94](app/mcn/listing/orders/[id].tsx#L94) `confirmCancel` | bare `Alert.alert` |
| [my-orders.tsx:167](app/mcn/my-orders.tsx#L167), [:198](app/mcn/my-orders.tsx#L198) | correct already — collapse into the helper |

Do **not** sweep the other 15 call sites in this change set. Keep the diff reviewable; note the helper in `docs/CLAUDE.md` so new code picks it up.

### Acceptance criteria

- [ ] On the **PWA**: Delete listing, Pause/Activate, and the seller's Cancel all show a browser confirm and complete the action.
- [ ] On native: identical `Alert.alert` behavior to before, destructive styling intact.

---

## Task 5 — WhatsApp deep links

**Fixes:** #11, #14 (link half)
**Files:** new helper in [lib/phone.ts](lib/phone.ts); [app/mcn/my-orders.tsx:215-221](app/mcn/my-orders.tsx#L215-L221), [app/mcn/listing/orders/[id].tsx:113-123](app/mcn/listing/orders/[id].tsx#L113-L123), [app/mcn/listing/[id].tsx:280-286](app/mcn/listing/[id].tsx#L280-L286)

Add to `lib/phone.ts`, next to the existing `toLast10Digits`:

```ts
/**
 * wa.me works on native and web; the whatsapp:// scheme is native-only and
 * silently fails in the PWA. Returns null when the number isn't usable.
 */
export function buildWhatsAppUrl(phone: string | null | undefined, text: string): string | null {
  const last10 = toLast10Digits(phone || '');
  if (last10.length !== 10) return null;
  return `https://wa.me/91${last10}?text=${encodeURIComponent(text)}`;
}
```

At each call site, bail out when it returns `null` rather than opening a malformed URL, and hide the WhatsApp button when the number cannot be normalized. Also fix the empty items line for business orders at [my-orders.tsx:439](app/mcn/my-orders.tsx#L439), which passes `''` and leaves a blank line in the message.

### Acceptance criteria

- [ ] WhatsApp opens with the message pre-filled from the PWA and from native.
- [ ] A host phone stored as `+91 98765 43210` produces `https://wa.me/919876543210?text=…`.
- [ ] A listing with a junk phone hides the button instead of opening a broken link.

---

## Task 6 — Resolve business ordering (Decision A)

**Fixes:** #3
**Blocked on:** [Decision A](#decision-a--business-ordering)

**If A1 (restore):** rebuild the cart on [app/mcn/listing/[id].tsx](app/mcn/listing/[id].tsx) against the state already being populated at [:167-188](app/mcn/listing/[id].tsx#L167-L188). Quantity steps are 0.5 for kg/litre and 1 for piece/dozen/box/pack per `docs/features.md`. Submission must insert `mcn_orders` + `mcn_order_items` in one round trip — prefer a `place_mcn_order` RPC mirroring `place_mcn_preorder`, so the item-less-order class of bug closed by [20260826000000](supabase/migrations/20260826000000_preorder_orders_rpc_only.sql) cannot reappear on this table. Owner must not be able to order from their own listing.

**If A2 (retire):** remove the Business Orders tab from `my-orders.tsx` (making it a single-list screen, no segmented control), remove the Orders action from the listing card at [my-posts.tsx:323-329](app/mcn/my-posts.tsx#L323-L329), delete `app/mcn/listing/orders/[id].tsx` and its parent mapping in [lib/navigation.ts:158-161](lib/navigation.ts#L158-L161), and strip the dormant order state from `listing/[id].tsx`. Add a **Removed** entry to `docs/disabled-features.md` recording that the tables remain with historical rows.

### Acceptance criteria

- [ ] `docs/features.md` §4.2 and §4.8 describe what the code actually does.
- [ ] `docs/disabled-features.md` has an entry if anything was retired.
- [ ] No route in `app/mcn/` lacks a `getImmediateParentRoute()` mapping (`CLAUDE.md` §9).

---

## Task 7 — Resolve Borrow & Share (Decision B)

**Fixes:** #4
**Blocked on:** [Decision B](#decision-b--borrow--share)

**If B1 (re-enable):** wire the second segment button in [my-posts.tsx:256-272](app/mcn/my-posts.tsx#L256-L272) to `setActiveSegment('borrow')`, restore the Borrow & Share hub card in `network.tsx` (`postCount` is already being fetched at [:71-76](app/(tabs)/network.tsx#L71-L76)), and confirm `/mcn/add` renders and saves. Delete the `borrowOnlyView` constant — it is a dead flag either way.

**If B2 (remove):** delete `fetchPosts`, the `posts` state, `handleClose`, `handleDelete`, the `SectionList` branch, the segment bar, and the `borrowOnlyView` flag from `my-posts.tsx`; drop `postCount` and its query from `network.tsx`; retitle the screen and [profile.tsx:243-245](app/(tabs)/profile.tsx#L243-L245) to "My business listings"; decide the fate of `app/mcn/add.tsx` and the `mcn_posts` table. Update `docs/features.md` §4.7 and add a `docs/disabled-features.md` entry.

### Acceptance criteria

- [ ] No unreachable branches remain in `my-posts.tsx`.
- [ ] The profile row's subtitle matches what the screen actually shows.
- [ ] `docs/features.md` §4.7 is true.

---

## Task 8 — Listing management hardening

**Fixes:** #12, #13, #18 (header half)
**Files:** [app/mcn/my-posts.tsx](app/mcn/my-posts.tsx), [app/mcn/listing/manage/[id].tsx](app/mcn/listing/manage/[id].tsx)

1. `handleToggleListingActive` ([my-posts.tsx:172](app/mcn/my-posts.tsx#L172)) — add `.eq('owner_id', user.id)`, `.select('id').maybeSingle()`, and surface `error.message` **verbatim** as `text2`. The anti-spam triggers write user-facing copy on purpose; do not paraphrase it. Toast an info state when zero rows come back.

2. `handleDeleteListing` ([my-posts.tsx:191](app/mcn/my-posts.tsx#L191)) and [listing/manage/[id].tsx:407](app/mcn/listing/manage/[id].tsx#L407) — catch SQLSTATE `23503` and map it to plain language:

```js
if (error?.code === '23503') {
  Toast.show({
    type: 'error',
    text1: 'Cannot delete this business',
    text2: 'It has orders in its history. Pause it instead.',
  });
  return;
}
```

Consider offering Pause as the inline next step, since it is what the resident actually wants.

3. Move `<Stack.Screen>` above the loading early-return in [my-posts.tsx:227-234](app/mcn/my-posts.tsx#L227-L234) so `buildMcnHeaderOptions` and its `goBackSmart` handler apply during load, and do the same in [my-orders.tsx:462-468](app/mcn/my-orders.tsx#L462-L468).

### Acceptance criteria

- [ ] Pausing a listing while 5 are already active shows the trigger's own sentence, not "Failed to update status".
- [ ] Deleting a listing that has orders explains why and suggests Pause.
- [ ] The back chevron is present and correct throughout the load on both screens.

---

## Task 9 — My Orders presentation

**Fixes:** #15, #16, #17
**File:** [app/mcn/my-orders.tsx](app/mcn/my-orders.tsx)

1. **Phantom drops (#15).** Delete the `|| Date.now()` fallback at [:246](app/mcn/my-orders.tsx#L246). When `order.mcn_preorder_drops` is `null`, render a distinct card — *"This food drop is no longer available in your community"* — showing the items and total but hiding the delivery banner, View Drop, Call Host, and WhatsApp. Do the same for `mcn_listings` being `null` on the business tab; replace the "Deleted business" copy at [:376](app/mcn/my-orders.tsx#L376), which asserts something untrue.

2. **Counts and grouping (#16).** Count only non-cancelled orders in the tab labels at [:491](app/mcn/my-orders.tsx#L491) and [:505](app/mcn/my-orders.tsx#L505). Sort each list so cancelled orders sink below live ones while keeping `created_at DESC` within each group.

3. **Item names (#17).** Add `item_name` to the select at [:122-125](app/mcn/my-orders.tsx#L122-L125), add it to the `PreorderItem` interface, and render `item.item_name` with `item.mcn_preorder_items?.name` only as a fallback at [:299](app/mcn/my-orders.tsx#L299) and in `itemsSummary` at [:258](app/mcn/my-orders.tsx#L258).

### Acceptance criteria

- [ ] An order whose drop is out of scope shows an honest message and no fabricated delivery date.
- [ ] Tab counts match the number of live orders.
- [ ] Renaming an item host-side does not change the name on an already-placed order in either screen.

---

## Task 10 — Close the `profiles` read leak (separate change set)

**Fixes:** #6
**File:** new migration replacing `profiles_select_public_hosts`

Drop the `OR community_id IS NOT NULL` clause. The two `EXISTS` clauses above it already cover the policy's stated purpose (drop hosts and listing owners), so the third may simply be deletable — verify that first.

Then confirm, logged **out**, that these still resolve host identity: `app/mcn/drops/index.tsx`, `app/mcn/drops/[id].tsx`, `api/share-drop.ts`, `app/mcn/business.tsx`, `app/mcn/listing/[id].tsx`. If any break, narrow the policy to the specific columns needed (`full_name`, `flat_number`) via a view or a `SECURITY DEFINER` RPC rather than restoring a blanket clause.

Run `/security-review` on the diff.

### Acceptance criteria

- [ ] An `anon` client cannot select `phone_number` or `email` for an arbitrary community member.
- [ ] An authenticated member of community A cannot read community B's profiles.
- [ ] Shared drop links still render the host's name and flat number logged out.

---

# Docs — part of the change set, not a follow-up

Route each update to exactly **one** owning file, per `CLAUDE.md`:

| File | Update |
|---|---|
| `docs/architecture.md` | The new RLS policies and the two immutability triggers from Task 1; the `place_mcn_preorder` flag; any Task 10 policy change |
| `docs/features.md` | §4.2 "Listing detail & order", §4.7 Borrow & share, §4.8 My orders — reconcile with the Decision A / B outcomes; note that a cancelled business order is now soft-cancelled and visible to the seller |
| `docs/disabled-features.md` | Entries for anything retired under Task 6 or 7 |
| `docs/CLAUDE.md` | New convention: **use `confirmAction` from `lib/confirm.ts`**, alongside the existing `Alert.alert` trap in §9; and **use `buildWhatsAppUrl`, never the `whatsapp://` scheme** |
| `.github/app-summary.md` | Only if a whole tab or module is removed |

---

# Verification

`npx tsc --noEmit` is the only automated gate — there is no test framework (`docs/disabled-features.md` § Never existed).

**Manual matrix.** Several defects are invisible in a native build:

| Check | Web/PWA | Native |
|---|---|---|
| Delete / Pause a listing (#5) | **required** | required |
| WhatsApp deep link (#11) | **required** | required |
| Seller cancel confirm (#14) | **required** | required |
| Focus refresh & pull-to-refresh (#9) | required | required |
| Cancel a delivered order (#2) | required | required |

**Task 1 needs a REST client, not the app.** The app's own code paths already respect the intended transitions, so a UI pass proves nothing about the policy. Use a real user JWT and attempt each forbidden `PATCH` listed in the Task 1 acceptance criteria.

**Regression watch after Task 1:** the pre-order **edit** path is the highest-risk change in this plan. `place_mcn_preorder` updates `total_amount` on every edit and now depends on `set_config` being reached before the trigger fires. Test edit before, not after, shipping.
