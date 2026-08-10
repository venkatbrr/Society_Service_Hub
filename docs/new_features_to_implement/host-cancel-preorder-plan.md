# Plan — Host cancels a resident's pre-order

**Goal:** the food-drop host can cancel a placed pre-order from the Food Drop Dashboard, up until that order has been marked delivered. The Cancel button sits to the **left of "Mark delivered"** in the order footer.

**Screen:** [app/mcn/drops/manage/[id].tsx](../../app/mcn/drops/manage/%5Bid%5D.tsx) — "Active Pre-Orders" section, `orderFooter` (currently line ~490).

---

## 1. What already works (no backend change needed)

The `mcn_preorder_orders_update` RLS policy from [20260830000000_order_update_guards.sql](../../supabase/migrations/20260830000000_order_update_guards.sql) already allows the drop owner to write **any** status:

```sql
USING (... OR EXISTS (SELECT 1 FROM mcn_preorder_drops d WHERE d.id = drop_id AND d.created_by = auth.uid()))
WITH CHECK (... OR EXISTS (same))
```

So `update({ status: 'cancelled' })` from the host succeeds today. `enforce_mcn_preorder_order_immutable_fields` only blocks amount/ownership changes, so a status-only update passes.

Knock-on effects that are already correct and need no work:

- **Capacity is freed automatically.** Every cap check in `place_mcn_preorder()` sums `WHERE o.status <> 'cancelled'`, so cancelling returns those units to the item cap and the drop-wide `max_orders`.
- **Dashboard totals already exclude cancelled.** The aggregation loop at [manage/[id].tsx:122](../../app/mcn/drops/manage/%5Bid%5D.tsx#L122) skips `status === 'cancelled'`, so revenue, prep counts, and the Pending/Delivered metric cards all fix themselves on refetch.
- **A cancelled section already exists** on the dashboard (collapsible, line ~583) and in the resident's [my-orders.tsx](../../app/mcn/my-orders.tsx) list, where cancelled orders sort to the bottom and lose their edit/cancel actions.

**Gap worth closing (Step 4):** the RLS `USING` clause does not stop a host from cancelling an order that is already `fulfilled`. The UI will hide the button, but the guard should be enforced in the query too.

---

## 2. Scope (confirmed)

- **Per-order.** The Cancel button appears only for orders in the `Active Pre-Orders` list (`status === 'confirmed'`). **Once an order is delivered, no Cancel button** — not on the delivered card, not on the cancelled card.
- **Hidden when `drop.status === 'completed'`.** Once the whole drop is closed out, its order ledger is final.
- **Resident sees who cancelled.** A host-cancelled order must read differently from a self-cancelled one in the resident's my-orders list. This is Step 5 — in scope, and the only part that needs a migration.
- **The host leaves a cancellation note**, prompted when they tap Cancel. **Optional** — an empty note never blocks the cancel. Entry is **quick-pick chips + editable free text**. The resident sees the note on their cancelled order.
- Because the note needs text capture — which neither `confirmAction` nor `window.confirm` can do — the Cancel flow uses a **modal**, not `confirmAction`. The modal *is* the confirmation; there is no second confirm step.

---

## 3. UI changes — `app/mcn/drops/manage/[id].tsx`

### 3a. Cancel modal — note capture and confirmation in one step

**Not `confirmAction`.** That helper is yes/no only; a note needs a text field, and `window.confirm` cannot host one. The modal carries the confirmation copy itself, so tapping "Cancel order" inside it is the confirmation — no second dialog.

Follow the **existing modal pattern on this screen's sibling**, the carpool join modal at [carpools/[id].tsx:946-1064](../../app/mcn/carpools/%5Bid%5D.tsx#L946-L1064): a `transparent` `Modal` with `animationType="slide"`, an outer `Pressable` overlay that dismisses, and an inner `Pressable` with `onPress={(e) => e.stopPropagation()}` so taps inside don't close it. Reuse its `modalOverlay` / `modalContent` / `modalHeader` / `modalTitle` / `modalInput` style shapes rather than inventing new ones.

State on the manage screen:

```tsx
const [cancelTarget, setCancelTarget] = useState<DropOrder | null>(null);
const [cancelNote, setCancelNote] = useState('');
const [cancelling, setCancelling] = useState(false);

const QUICK_REASONS = ['Sold out', "Couldn't deliver", 'Ingredients ran out'];
```

Tapping Cancel on a card sets `cancelTarget` and clears `cancelNote` — it does **not** write anything yet.

Modal body, in brief:

- Title: **Cancel this pre-order?**
- A read-only recap line so the host is certain which order they're killing: `Flat {flat_number} · {buyer_name}`, the item lines, and the total.
- Consequence copy: *"The items go back into the available count. This cannot be undone."*
- Label **Note to resident (optional)**.
- The three `QUICK_REASONS` as tappable chips. Tapping one calls `setCancelNote(reason)` — it **fills the text box, and the box stays editable**. A chip renders "selected" when `cancelNote === reason`, which naturally turns off as soon as the host edits the text.
- A `TextInput` bound to `cancelNote`, `multiline`, `maxLength={200}`, placeholder *"Anything the resident should know"*.
- Footer: **Keep order** (dismiss) and **Cancel order** (destructive). "Cancel order" is **always enabled** — the note is optional.

Naming caution: "Cancel" means two different things in this modal. The dismiss button must read **Keep order**, never "Cancel", or the host cannot tell which button abandons the operation and which performs it.

### 3b. Submit handler

```tsx
const handleConfirmCancelOrder = async () => {
  if (!cancelTarget) return;
  const order = cancelTarget;
  const note = cancelNote.trim();

  setCancelling(true);
  try {
    const { data, error } = await supabase
      .from('mcn_preorder_orders')
      .update({
        status: 'cancelled',
        cancellation_note: note || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .eq('status', 'confirmed')   // no cancelling something already delivered
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      Toast.show({
        type: 'info',
        text1: 'Nothing to cancel',
        text2: 'This pre-order was already delivered or cancelled.',
      });
    } else {
      Toast.show({
        type: 'success',
        text1: 'Pre-order cancelled',
        text2: `Flat ${order.flat_number} — let the resident know.`,
      });
    }
    setCancelTarget(null);
    setCancelNote('');
    fetchDropManagerData();
  } catch (err: any) {
    console.error(err);
    Toast.show({ type: 'error', text1: 'Failed to cancel pre-order', text2: err?.message });
  } finally {
    setCancelling(false);
  }
};
```

`note || null` stores a genuinely empty note as `NULL`, not `''` — so the resident-side "is there a note" test is a simple null check rather than also having to test for blank strings.

The `.eq('status', 'confirmed')` filter is the concurrency guard **and** the enforcement of "no cancel once delivered": if the host taps Cancel on a stale card that another device already delivered, the update matches zero rows and the info toast fires instead of silently reverting a delivery. Per docs/CLAUDE.md §9, a Supabase update matching zero rows returns `{ error: null }` — hence the `.select('id')` + `maybeSingle()` to tell "cancelled" from "matched nothing".

### 3c. Button, placed before "Mark delivered"

In the active-order `orderFooter` (~line 490), wrap the two buttons in a row so they sit side by side:

```tsx
<View style={styles.footerActions}>
  {drop.status !== 'completed' ? (
    <TouchableOpacity
      style={styles.cancelOrderBtn}
      onPress={() => { setCancelNote(''); setCancelTarget(order); }}
    >
      <XCircle size={15} color="#DC2626" aria-hidden={true} />
      <Text style={styles.cancelOrderBtnText}>Cancel</Text>
    </TouchableOpacity>
  ) : null}

  <TouchableOpacity style={styles.fulfillmentBtn} onPress={() => handleToggleFulfillment(order.id, order.status)}>
    …unchanged…
  </TouchableOpacity>
</View>
```

`XCircle` is already imported (line 9) for the cancelled section — no new icon import. The in-flight state lives on the modal's own "Cancel order" button (`cancelling`), not on the card, so the card button needs no `disabled` handling.

### 3d. Styles

```ts
footerActions: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
},
cancelOrderBtn: {
  backgroundColor: '#FEE2E2',
  borderWidth: 0.5,
  borderColor: '#F87171',
  paddingHorizontal: 12,
  paddingVertical: 7,
  borderRadius: VerandahRadius.pill,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
},
cancelOrderBtnText: {
  fontSize: 12,
  fontWeight: '600',
  color: '#DC2626',
},
```

Same soft-red / pill treatment as the existing Delete-drop button (line ~383), so it reads as destructive without competing with the primary green "Mark delivered".

**Layout note:** `fulfillmentBtn` currently has `minWidth: 122` and `alignSelf: 'flex-end'`. Inside the new row, drop `alignSelf` (or leave it — it is harmless in a row) and give `orderTotalWrap` `flexShrink: 1` so the ₹ total does not push the two pills off a narrow screen. On the narrowest phones, verify "Collect on Delivery ₹1,750" + Cancel + Mark delivered still fit; if not, let `footerActions` wrap to its own line under the total (`orderFooter: { flexWrap: 'wrap' }`).

---

## 4. Why the RLS policy is deliberately left alone

The obvious hardening — restrict the host's `USING` branch to `status = 'confirmed'` so a delivered order can't be touched via a direct PostgREST call — **would break existing behaviour**. `handleToggleFulfillment` relies on toggling `fulfilled → confirmed`: the green "Delivered" pill on a delivered card is a tap-to-undo ([manage/[id].tsx:567-573](../../app/mcn/drops/manage/%5Bid%5D.tsx#L567-L573)). Locking the host out of delivered rows removes that undo.

So the `.eq('status', 'confirmed')` filter in the client query is the guard for the cancel path, exactly as the resident's own cancel is written. Revisit only if the undo-delivery affordance is dropped, in which case the policy and `handleToggleFulfillment` change together.

---

## 5. Resident sees "cancelled by host" and the note — migration + UI

Today a host-cancelled order is indistinguishable from a self-cancelled one in [my-orders.tsx](../../app/mcn/my-orders.tsx) — both just say "Cancelled". There is no in-app notification system wired to MCN orders, so the resident finds out by opening the app; the card itself has to carry the story.

### 5a. Migration — `supabase/migrations/2026XXXXXXXXXX_preorder_cancellation_attribution.sql`

Check the timestamp isn't already taken (`npx supabase migration list --linked`) before naming the file.

```sql
ALTER TABLE public.mcn_preorder_orders
  ADD COLUMN IF NOT EXISTS cancelled_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_note TEXT;

-- Attribution is stamped by the database, never accepted from the client.
-- The UPDATE policy's buyer branch lets a resident write arbitrary columns on
-- their own row, so a client-supplied cancelled_by could forge "the host did
-- this". Deriving it from auth.uid() closes that off.
CREATE OR REPLACE FUNCTION public.stamp_mcn_preorder_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    NEW.cancelled_by := auth.uid();
    NEW.cancelled_at := now();
  ELSIF NEW.status <> 'cancelled' AND OLD.status = 'cancelled' THEN
    NEW.cancelled_by      := NULL;
    NEW.cancelled_at      := NULL;
    NEW.cancellation_note := NULL;
  ELSE
    -- No status transition: attribution is immutable.
    NEW.cancelled_by := OLD.cancelled_by;
    NEW.cancelled_at := OLD.cancelled_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mcn_preorder_stamp_cancellation ON public.mcn_preorder_orders;
CREATE TRIGGER trg_mcn_preorder_stamp_cancellation
BEFORE UPDATE ON public.mcn_preorder_orders
FOR EACH ROW EXECUTE FUNCTION public.stamp_mcn_preorder_cancellation();

NOTIFY pgrst, 'reload schema';
```

Notes:

- `SECURITY DEFINER` is per docs/CLAUDE.md §9 — a constraint trigger without it runs its reads under the caller's RLS. This one reads nothing, but the convention holds and costs nothing.
- `cancellation_note` is deliberately **not** stamped by the trigger on the cancel transition — the host's UPDATE supplies it in the same statement and the trigger leaves it as written. It is only cleared on un-cancel, so an undone-then-redone cancel cannot resurrect a stale note.
- **The note is host-authored but not host-only-writable.** The buyer branch of the UPDATE policy lets a resident set `cancellation_note` on their own cancel too. That is acceptable — it is their own order and the resident-side UI only surfaces the note when `cancelled_by` is the host, which the trigger controls. If a resident-authored note should ever reach the host's view, revisit this.
- Trigger ordering: `trg_mcn_preorder_order_immutable_fields` also fires `BEFORE UPDATE`. Postgres fires same-timing row triggers in **name order**, so `…immutable_fields` runs first. Neither touches the other's columns, so the order is harmless either way — but the immutability trigger does **not** list the new columns, so it won't reject them.
- Existing cancelled rows keep `cancelled_by = NULL`. The UI treats NULL as "unknown / self-cancelled" and shows the plain "Cancelled" label, so no backfill is needed.
- **Deploy loop** (docs/CLAUDE.md §6, note the env suffixes — there is no unsuffixed `db:push`):
  1. `npm run db:push:preprod`
  2. `npm run types:preprod`
  3. **Re-append the hand-maintained enriched-types block** at the bottom of `lib/database.types.ts` (`ProviderWithInteraction`, `VisitWithJoinerData`, `VisitJoinerWithProfile`) — step 2 overwrites the whole file.
  4. `npx tsc --noEmit`
  5. After merge to `main`: `npm run db:push:prod`, then `npm run types:prod`.

### 5b. Resident's card — `app/mcn/my-orders.tsx`

The select at [my-orders.tsx:88-98](../../app/mcn/my-orders.tsx#L88-L98) is an **explicit column list**, not `select('*')`, so the new columns are silently absent unless added:

```
id, status, buyer_note, total_amount, created_at, drop_id,
cancelled_by, cancelled_at, cancellation_note,
```

Extend the `PreorderOrder` interface ([my-orders.tsx:46-53](../../app/mcn/my-orders.tsx#L46-L53)) to match, then in `renderPreorderCard`:

```tsx
const cancelledByHost = order.status === 'cancelled'
  && !!order.cancelled_by
  && order.cancelled_by !== user?.id;
```

Render on the cancelled card:

- `cancelledByHost` → label **"Cancelled by host"**; otherwise the existing plain "Cancelled".
- When `cancelledByHost && order.cancellation_note` → the note beneath the label, quoted, in the same treatment the card already uses for `buyer_note` (`buyerNote` style — italic, `textSecondary`, small). That style exists on both screens already, so the note needs no new visual vocabulary.

Show the note **only** when the host cancelled. A resident reading back their own note on their own cancellation is noise.

Use the muted `textSecondary` treatment already on cancelled cards; this is information, not an alarm. Sentence case, Verandah tokens, no raw hex.

### 5c. Host's own cancelled section

The dashboard's cancelled card ([manage/[id].tsx:640](../../app/mcn/drops/manage/%5Bid%5D.tsx#L640)) shows a bare "Cancelled" pill.

- Swap the pill for **"You cancelled"** when `cancelled_by === drop.created_by`, leaving "Cancelled" for a resident withdrawal — the host otherwise cannot tell the two apart when reconciling.
- Render `cancellation_note` on that card too, same italic `buyerNote` treatment. The host needs to see what they told the resident, especially days later when the resident rings to ask.

---

## 6. Verification

1. `npx tsc --noEmit` — the only validation gate in this repo.
2. Manual, as host on a drop with one confirmed order:
   - Cancel → modal opens showing the right flat, items, and total → "Cancel order" → order moves from "Active Pre-Orders" into the collapsible "Cancelled Orders" section.
   - Tap a quick-reason chip → the text box fills with it → edit the text freely → the edited text is what gets saved.
   - Cancel with the note left **empty** → it still succeeds, and the stored `cancellation_note` is `NULL`, not `''`.
   - "Keep order" and the overlay tap both dismiss without writing anything; reopening the modal on another order shows an empty note, not the previous one.
   - "Pending Delivery" metric drops by one; "Est. Revenue" drops by the order total.
   - Kitchen Prep Aggregation counts drop by the cancelled quantities; an item that was `max 6 · full` becomes available again.
   - Re-place the same order as the resident — it succeeds, proving the cap was freed.
   - Delivered orders and the cancelled section show **no** Cancel button.
   - Mark an order delivered, then confirm the Cancel button is gone from that card.
   - Set `drop.status = 'completed'` → Cancel disappears from all remaining active orders.
   - Web **and** native: the modal renders and the keyboard doesn't cover the note field. The modal is a real component, so unlike `Alert.alert` it cannot silently no-op on web — but verify anyway, since this screen has no other modal.
3. Cross-device: cancel on device A after device B marked delivered → "Nothing to cancel" info toast, no state corruption.
4. Attribution and note, as the resident in my-orders:
   - Host-cancelled order reads "Cancelled by host" with the note beneath it.
   - Host-cancelled with no note → "Cancelled by host" alone, no empty quote marks or stray blank line.
   - An order the resident cancelled themselves still reads plain "Cancelled" — `cancelled_by === user.id` — with no note shown.
   - A pre-existing cancelled row (`cancelled_by IS NULL`) also reads plain "Cancelled", not "by host".
5. Forgery check — as a resident, attempt `update({ status: 'cancelled', cancelled_by: '<host uuid>' })` on your own order via the client. The trigger must overwrite `cancelled_by` with your own uid, so the card still reads plain "Cancelled".

## 7. Docs to update in the same change set

- [docs/features.md](../features.md) — Food Drop host dashboard: host can cancel an active pre-order until it is delivered, leaving an optional note; capacity returns to the pool; resident sees "cancelled by host" plus the note.
- [docs/architecture.md](../architecture.md) — the three new `mcn_preorder_orders` columns and the `stamp_mcn_preorder_cancellation` trigger. `architecture.md` owns schema; do not restate the columns in `features.md`.
- No `.github/app-summary.md` entry — no new module, tab, or role. Nothing federation-related, so no `cross-community-changelog.md` entry.
