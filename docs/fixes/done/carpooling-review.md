# Community Carpooling — Detailed Review, Bug Report & Fix Plan

**Date:** 2026-08-07
**Scope:** `app/mcn/carpools/index.tsx`, `app/mcn/carpools/add.tsx`, `app/mcn/carpools/[id].tsx`, `app/(tabs)/network.tsx` (carpool tile), `lib/navigation.ts`, `supabase/migrations/20260810000000_add_mcn_carpools.sql`, `20260811000000_add_carpool_pricing.sql`, `20260812000000_add_carpool_contact_phone.sql`, `20260814000000_mcn_deletion_permissions.sql`, `20260822000000_repoint_dead_community_lead_checks.sql`, `20260822000100_platform_admin_override_on_mcn_deletes.sql`
**Baseline:** `npx tsc --noEmit` passes clean before any change. There is no test framework in this repo.

**Method — read this before acting on the findings.** This is a code-and-schema walkthrough: every user path (list → filter → search → publish → detail → request → accept/reject → pause/cancel/delete) was traced through the three screens against the live RLS policies and CHECK constraints in the migrations, and cross-read against `docs/CLAUDE.md` conventions and `docs/features.md` §4.4 claims. I did **not** run the Expo app or execute statements against the Supabase project. Each finding below is tagged:

- **[code]** — provable from the source and schema as written; no runtime step needed to believe it.
- **[runtime]** — high-confidence inference that should be confirmed with a live click-through before it is closed.

**Result: 27 findings — 5 blocking, 10 high, 12 medium/minor.** Plus a gap analysis against standard carpooling platforms (§B) showing the feature is currently a *classifieds board with a request inbox*, not a booking system.

---

## Severity summary

| # | Finding | Sev | Area | Tag |
|---|---------|-----|------|-----|
| 1 | Accepting the last seat silently fails — CHECK `available_seats >= 1` vs `Math.max(0, …)`, error never read | **P0** | Client + DB | code |
| 2 | Seat accounting destroys capacity; cancel/reject **inflates** seats above the original | **P0** | Client + DB | code |
| 3 | "Seeking" rides have no owner controls at all — cannot pause, cancel, or delete | **P0** | Client | code |
| 4 | Deleted / foreign / bad-id ride ⇒ infinite spinner with **no back button** | **P0** | Client | code |
| 5 | A rider can self-accept their own join request via the API | **P0** | DB (RLS) | code |
| 6 | Edit is documented and does not exist | P1 | Client + docs | code |
| 7 | Zero notifications in the entire flow, though the infra exists and is used elsewhere | P1 | DB / UX | code |
| 8 | A rejected rider is permanently locked out of re-requesting | P1 | Client | code |
| 9 | "One open request per rider per ride" is unenforced — duplicates are reachable | P1 | DB | code |
| 10 | Server accepts requests on cancelled/paused/seeking rides, over capacity, and from the owner | P1 | DB | code |
| 11 | Cancelling a trip leaves accepted bookings `accepted`; riders never told | P1 | Client + DB | code |
| 12 | "Confirmed Co-Passengers" is RLS-blind — the count is wrong for everyone but the host | P1 | Client | code |
| 13 | Native time entry is an unvalidated raw `TextInput` — `99:88 AM` and `":30 AM"` save | P1 | Client | code |
| 14 | No trip date — outstation rides inexpressible; nothing expires; `completed` unreachable | P1 | Model | code |
| 15 | Phones never normalized; rider phone unvalidated; `wa.me` link breaks on some formats | P1 | Client | code |
| 16 | `price_per_seat` is TEXT with a baked-in `₹` and the magic string `'Free'` | P2 | Model | code |
| 17 | Pricing UI renders on "seeking" posts — a ride *request* shows a green "Free Ride" badge | P2 | Client | code |
| 18 | A seeking post's seats are labelled "Capacity" on the detail screen | P2 | Copy | code |
| 19 | Profile prefill races `AuthContext` phase 2 ⇒ blank contact / name / flat | P2 | Client | runtime |
| 20 | List and request-fetch errors are swallowed to `console`; empty state masks failure | P2 | Client | code |
| 21 | Join modal has no `onRequestClose` — Android hardware back does nothing | P2 | Client | runtime |
| 22 | A community lead sees Host Controls plus a "Request to join" button, and an unreadable request list | P2 | Client | code |
| 23 | Verandah violations throughout; nothing logged in the out-of-register appendix | P2 | UI | code |
| 24 | Unbounded fetch, client-only search, no sort by departure, search misses notes/host | P2 | Client | code |
| 25 | "My Carpools" excludes rides I have *joined* | P2 | Client | code |
| 26 | No women-only option, no ratings, no report/block — vs the India-market norm | P2 | Product | code |
| 27 | Carpools UPDATE policy does not pin `community_id` | P2 | DB (RLS) | code |

---

# P0 — blocks real use

## 1. Accepting the last seat silently fails, and nobody finds out

`supabase/migrations/20260810000000_add_mcn_carpools.sql:15`

```sql
available_seats INTEGER NOT NULL DEFAULT 1 CHECK (available_seats >= 1),
```

[`[id].tsx:227-233`](../../app/mcn/carpools/[id].tsx#L227-L233)

```ts
if (seatAdjustment !== 0) {
  const newSeats = Math.max(0, carpool.available_seats + seatAdjustment);
  await supabase
    .from('mcn_carpools')
    .update({ available_seats: newSeats })
    .eq('id', carpool.id);
}
```

The clamp floor is `0`. The CHECK floor is `1`. A one-seat ride accepting a one-seat request computes `newSeats = 0`, Postgres rejects the row with a check-constraint violation — and the call is `await`ed **without destructuring `error`**, so the rejection is discarded.

Two compounding problems:

- The request status update at line 212 is a **separate statement** that already committed. The rider is now `accepted` while the ride still advertises a free seat. The host sees a success toast either way.
- This is exactly the trap in `docs/CLAUDE.md` §9: *"Destructuring only `data` from a Supabase call — a silent failure then looks like real empty data."* Here not even `data` is destructured.

Reachable on the most ordinary path in the feature: a neighbour offers 1 seat, one rider asks for it, the host taps Accept.

## 2. Seat accounting mutates published capacity and inflates it on cancellation

`available_seats` is the **advertised capacity**, set once at publish time ([`add.tsx:118`](../../app/mcn/carpools/add.tsx#L118)) and shown as "Capacity" on the detail screen. `handleUpdateRequestStatus` treats it as a live *remaining* counter and mutates it destructively. There is no separate booked-seats column and no derived count.

Consequences, all reachable through the UI:

**a. The original capacity is unrecoverable.** After two acceptances on a 4-seat ride the row says `2`. Nothing anywhere records that the car seats 4. The host cannot answer "how full am I?" and the rider cannot see "2 of 4 left" the way the drops module already does for item stock.

**b. Cancellation inflates capacity above the original.** The clamp at `0` swallows over-acceptance, but the give-back at line 224 does not:

| Step | `available_seats` |
|---|---|
| Publish 2-seat ride | 2 |
| Accept rider A (2 seats) | 0 |
| Accept rider B (2 seats) — clamped | 0 |
| Rider A cancels | 2 |
| Rider B cancels | **4** |

The ride now advertises four seats in a car that seats two. Every subsequent cycle widens the drift.

**c. No capacity check on accept.** Nothing — client or server — stops the host from accepting requests summing past capacity. Combined with (b) this is unbounded.

**d. Lost update / double-tap.** The write is a client-side read-modify-write against `carpool.available_seats` captured at last fetch. The Accept button has no `disabled` guard (unlike the modal's submit at line 708), and `requests` is not optimistically updated, so a double tap re-reads `prevStatus === 'pending'` and decrements twice for one request. Two devices, or host-plus-lead, race the same way.

**e. It is UI-only enforcement**, which `docs/CLAUDE.md` §9 names as a trap the food-drops module was already burned by (`20260823000000`). Drops enforce item caps with a `SECURITY DEFINER` trigger; carpools enforce nothing.

## 3. A "seeking" ride can never be paused, cancelled, or deleted

[`[id].tsx:482`](../../app/mcn/carpools/[id].tsx#L482)

```tsx
{carpool.role_type === 'offering' && (isOwner || isCommunityLead) && (
  <BaseCard …>  {/* Host Controls: Pause · Cancel · Delete */}
```

The Host Controls card is the **only** affordance for pause, cancel, and delete anywhere in the feature. Gating it on `role_type === 'offering'` means a resident who posts "I need a ride to Gachibowli" has no way to take it down once they have found one. It sits `active` in the All Rides tab and in the network tab's active count forever. Their only escape is asking a president/VP — who cannot help either, because the same `offering` gate hides the card from leads too.

Roughly half of all posts in this feature are of a type that cannot be withdrawn.

## 4. A deleted or foreign ride strands the user on a spinner with no way out

[`[id].tsx:81`](../../app/mcn/carpools/[id].tsx#L81) uses `.single()`, which `docs/CLAUDE.md` §2 rule 4 forbids for single-row reads:

```ts
.eq('id', id)
.single();          // throws on zero rows
```

The query is also not scoped by `communityId` — RLS covers the leak, but it turns a cross-community id into a zero-row result rather than a clean "not found".

On throw, `carpool` stays `null`, and the guard at line 267 is:

```tsx
if (loading || !carpool) {
  return (
    <View …>
      <Stack.Screen options={{ title: 'Carpool Details' }} />
      <ActivityIndicator size="large" … />
```

That `Stack.Screen` is a bare title — it does **not** go through `buildMcnHeaderOptions`, so it has no `headerLeft`, so there is **no back button**. The user gets a permanent spinner on a screen they cannot leave except via the global bottom nav. Triggers on: a shared link to a ride the host has since deleted, a link forwarded to a neighbour in a different society, a stale browser tab, or any transient network failure during the fetch.

## 5. A rider can accept their own join request

`20260810000000_add_mcn_carpools.sql:88-93`

```sql
CREATE POLICY "mcn_carpool_requests_update"
  ON public.mcn_carpool_requests FOR UPDATE
  USING (rider_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.mcn_carpools c WHERE c.id = carpool_id AND c.created_by = auth.uid()
  ));
```

There is no `WITH CHECK` clause, so Postgres reuses `USING` for the new row, and the policy is **column-blind**. The app only ever offers a rider the "Cancel My Request" button, but the policy permits any `PATCH /mcn_carpool_requests?id=eq.…` from the rider, including:

- `status → 'accepted'` — self-approval onto someone else's ride. The rider then renders in the host's Join Requests panel as already accepted, and in the public "Confirmed Co-Passengers" card.
- `seats_requested → 6` **after** the host accepted a 1-seat request.
- `rider_name` / `flat_number` → anything, after acceptance.

Same shape on `mcn_carpools_update` (see finding 27). The anon key is in the client bundle, so this is reachable from any browser console by a logged-in resident.

---

# P1 — high

## 6. Edit is documented but not implemented

`docs/features.md` §4.4 states: *"**Creator or lead** can edit, change status, and delete."*

There are three route files (`index`, `add`, `[id]`). `add.tsx` reads no `id` param and has no edit branch; the detail screen offers Pause / Cancel / Delete and no Edit. **There is no edit path.** A typo in the destination, a changed departure time, or a wrong phone number can only be fixed by deleting the ride and republishing — which cascades away every join request (`ON DELETE CASCADE`, line 30) and every accepted booking with it.

Either build the edit screen or correct the doc. Given the rest of MCN has edit flows, build it.

## 7. The entire flow is silent — no notifications

`context/NotificationContext.tsx`, `app/notifications.tsx`, and the `notifications` table exist and are wired for visits (`20260607113000_notify_visit_reschedule.sql`), provider reports, and onboarding. Carpools use none of it.

So: a rider submits a request and the host learns about it only if they happen to reopen that specific ride's detail screen. A host accepts, and the rider learns only by reopening the same screen. Nobody is told when a trip is paused or cancelled. There is no badge, no push, no inbox row.

For a commute feature this is close to fatal — the whole value is next-morning coordination, and the coordination signal never arrives. Every standard platform notifies on all six transitions (request, accept, reject, rider-cancel, ride-cancel, departure reminder).

## 8. A rejected rider is locked out forever

[`[id].tsx:61`](../../app/mcn/carpools/[id].tsx#L61)

```ts
const myExistingRequest = requests.find((r) => r.rider_id === user?.id && r.status !== 'cancelled');
```

`rejected` is not excluded. Once a host rejects, the rider's booking card permanently reads **"Your Booking Status: REJECTED"** with a "Cancel My Request" button, and the "Request to Join" button never returns. If the host rejected in error, or circumstances changed, or the rider mis-entered their flat number, they can never ask again. Tapping "Cancel My Request" flips it to `cancelled` and *does* restore the join button — an accidental escape hatch, not a designed one, and it wrongly credits seats back (finding 2).

## 9. "One open request per rider per ride" is not enforced anywhere but the render

`docs/features.md` §4.4 claims *"one open request per rider per ride"*. The only thing implementing it is the `myExistingRequest` lookup above. There is no unique index and no trigger. Duplicates are reachable by: cancelling then re-requesting (leaves a `cancelled` row plus a new `pending` row — benign), racing two devices, or one direct API insert. The host then sees the same neighbour twice in the requests panel and can accept both, double-decrementing seats.

## 10. The server accepts join requests the UI would never send

`20260810000000_add_mcn_carpools.sql:83-86`

```sql
CREATE POLICY "mcn_carpool_requests_insert"
  ON public.mcn_carpool_requests FOR INSERT
  WITH CHECK (community_id = get_user_community_id() AND rider_id = auth.uid());
```

Community and identity are checked. Nothing else is. Every one of these is server-accepted:

| Attack / accident | Why the UI "prevents" it | Why the server does not |
|---|---|---|
| Request a **cancelled** or **paused** ride | `carpool.status === 'active'` at line 590 | No status predicate |
| Request a **seeking** post | `role_type === 'offering'` at line 590 | No role predicate |
| Request **more seats than exist** | stepper capped at line 688 | No capacity predicate |
| Host requests **their own ride** | `!isOwner` at line 590 | No `rider_id <> created_by` |
| Request a ride in **another community** | n/a | `community_id` is *supplied by the client* and only compared to the caller's own community — it is never compared to `mcn_carpools.community_id`, so a mismatched pair inserts cleanly |

The last row is the sharpest: nothing joins the request's `community_id` to its carpool's. It is a client-supplied field trusted on its own.

Also note the plain staleness case — a rider with the detail screen open when the host cancels can still submit, because the guard is a render-time snapshot.

## 11. Cancelling a trip abandons its riders

`handleUpdateStatus('cancelled')` writes one column on one row. Accepted requests stay `accepted`. The "Confirmed Co-Passengers" card keeps listing them. No rider is told (finding 7). The next morning three people wait at the main gate for a ride that was cancelled two days earlier.

Standard platforms cascade: cancelling a ride cancels its bookings, notifies every confirmed passenger, and records the cancellation against the driver.

## 12. "Confirmed Co-Passengers" shows a count that is wrong for almost everyone

[`[id].tsx:455-479`](../../app/mcn/carpools/[id].tsx#L455-L479) renders a public card headed `Confirmed Co-Passengers (N)` from the `requests` array. But that array is filtered by RLS:

```sql
USING (rider_id = auth.uid() OR EXISTS (… c.created_by = auth.uid()))
```

You can read a request row only if you are the rider or the host. So:

| Viewer | What the card shows |
|---|---|
| Host | Correct — all accepted riders |
| An accepted rider | **"Confirmed Co-Passengers (1)"** — themselves alone, on a ride with three others |
| Any other resident | Card hidden entirely, even on a fully-booked ride |

A prospective rider evaluating whether to ask for a seat sees no co-passengers and a capacity number that has been silently decremented (finding 2). The two wrong signals point in opposite directions.

This is a genuine design fork, not a one-line fix: either the roster is public (names + flat numbers visible to the society, which is defensible in a gated community and is what the card's title promises), or it is host-only and the card must be gated on `isOwner`. Pick one — today it does neither.

## 13. Native time entry accepts impossible times

[`add.tsx:285-291`](../../app/mcn/carpools/add.tsx#L285-L291), and three more identical blocks:

```tsx
<TextInput
  value={depHour}
  onChangeText={(val) => setDepHour(val.slice(0, 2))}
  keyboardType="number-pad"
  maxLength={2}
/>
```

No range clamp, no pad, no empty guard. On Android/iOS a resident can save `departure_time = "99:88 AM"`, or clear the field and save `":30 AM"`, or `"7:5 PM"`. The column is free `TEXT`, so all of it persists and renders verbatim on the card and the detail grid.

Web uses `<select>` and is safe — so the two platforms accept different value sets from the same form, and web is additionally restricted to 5-minute steps that native does not enforce.

`docs/CLAUDE.md` §3 is explicit: *"Always use `@react-native-community/datetimepicker`, never a raw `TextInput`."* The dependency is already used by visits, reminders, and drops.

## 14. There is no trip date, so half the advertised use case cannot be expressed

The list screen's own subtitle sells the feature as *"Share daily office commutes, weekend intercity travel & outstation trips"*, and the network tile says *"City & Outstation"*. But the schema carries only `departure_time TEXT` (a clock time) and `recurring_days TEXT[]` (weekday labels). **There is no date column.**

- A one-off trip to Vijayawada on 15 September can only be recorded by typing it into the title or notes. It is unsearchable, unsortable, and invisible to any future filter.
- Recurring and one-off rides are the same shape, so a Saturday-only outstation trip is indistinguishable from a weekly Saturday commute.
- Nothing ever expires. A ride posted in August is still `active` in December, still counted in the network tab's "N active rides" tile, still in the All Rides tab.
- `status = 'completed'` exists in the CHECK constraint and **nothing in the app ever writes it**. There is no "mark trip completed" control. Worse, `renderStatusBadge` ([`index.tsx:113`](../../app/mcn/carpools/index.tsx#L113)) has no `completed` case and falls through to `return null`, so such a row would render with no status badge at all; the detail screen's ternary would paint it in the red *cancelled* palette.
- Sorting is `created_at DESC` only. The list cannot answer "what leaves tomorrow morning?", which is the only question a commuter has.

## 15. Phone numbers bypass `lib/phone.ts` everywhere

`docs/CLAUDE.md` §3: *"Phone numbers — normalize with `lib/phone.ts` (`normalizeIndianMobile`, `isValidIndianMobile`)."* Neither is imported by any carpool file.

- **Publish** ([`add.tsx:87`](../../app/mcn/carpools/add.tsx#L87)) hand-rolls `contactPhone.trim().replace(/[^0-9]/g,'').length < 10`. That accepts `0000000000` and `1234567890`; `isValidIndianMobile` (`/^[6-9]\d{9}$/`) rejects both.
- **Join request** ([`[id].tsx:171`](../../app/mcn/carpools/[id].tsx#L171)) validates only `!riderPhone.trim()`. A single character passes. The host's only channel to their rider is then a junk string, and the rider is already in the accepted roster.
- **Storage** is raw — `contact_phone: contactPhone.trim()`, no normalization.
- **Consequence in `handleWhatsAppHost`** ([`[id].tsx:258`](../../app/mcn/carpools/[id].tsx#L258)):

  ```ts
  const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  ```

  `9876543210` → `919876543210` ✓ · `+91 98765 43210` → `919876543210` ✓ · **`09876543210` → `09876543210` ✗** (11 digits, passed through, `wa.me` rejects it). Also **`98765 43210 / 98765 43211`** (a resident entering two numbers) → 20 digits, passed through. Both are formats residents type, and both are accepted at save time by the loose validator above.

- Flat number in the join modal is not uppercased or space/hyphen-stripped on blur, contrary to the same section of `docs/CLAUDE.md`. The placeholder is `"e.g. Tower 2 - 402"` — a hyphenated example the convention explicitly forbids.

---

# P2 — medium and minor

## 16. `price_per_seat` is a TEXT field with a currency symbol baked in

[`add.tsx:120`](../../app/mcn/carpools/add.tsx#L120)

```ts
price_per_seat: pricingType === 'paid'
  ? (pricePerSeat.trim() ? (pricePerSeat.trim().startsWith('₹') ? pricePerSeat.trim() : `₹${pricePerSeat.trim()}`) : 'Paid')
  : 'Free',
```

The column stores presentation, not data: `"₹50"`, `"Paid"`, or the magic string `"Free"` in a *price* column. Nothing can sort by fare, filter "under ₹100", or compute a total. A rider requesting 3 seats at ₹50 is never shown ₹150 — the number is a string with a rupee glyph in front of it.

The placeholder invites free text (`"e.g. 50 / seat or 100 / day"`) while `keyboardType="numeric"` only *hints* numeric on native and does nothing on web. And `docs/CLAUDE.md` §4 lists `Rupees` under "Reuse instead of re-implementing" — it is not used.

## 17. Ride *requests* display pricing they cannot charge

The pricing toggle in `add.tsx` is rendered for both role types, and both the card and the detail grid show a cost row unconditionally. A "I need a ride to Gachibowli" post therefore renders a green **"Free Ride"** badge — the seeker announcing they will not charge the driver. Vehicle details are correctly gated on `role_type === 'offering'` (line 600); pricing should be too, or reframed as "what I'm willing to contribute".

## 18. A seeking post's seats are labelled "Capacity"

[`[id].tsx:368`](../../app/mcn/carpools/[id].tsx#L368) hardcodes `Capacity` / `N seats`. The list screen gets this right (`avail` vs `needed`, line 351); the detail screen does not. "Capacity: 2 seats" on a ride request reads as though the seeker is driving.

## 19. Profile prefill races the second AuthContext phase

`add.tsx:35` and `[id].tsx:53-55` seed state from `profile?.…` in `useState` initializers, which run **once**. `docs/CLAUDE.md` §9 warns that `AuthContext` loads part of its data in a second, non-blocking phase. If the screen mounts before `profile` resolves — cold open, deep link, slow network — contact phone, rider name, and flat number are blank and stay blank, and the user retypes what the app already knows. Needs a runtime check to confirm ordering, but the pattern is the one the trap describes.

## 20. Fetch failures are indistinguishable from empty results

- [`index.tsx:84`](../../app/mcn/carpools/index.tsx#L84) — `catch { console.error(…) }`, no toast. A failed list load renders **"No carpools found — Be the first resident to offer or request a carpool!"**
- [`[id].tsx:93`](../../app/mcn/carpools/[id].tsx#L93) — `if (!reqErr) setRequests(…)`. A failed request load leaves the array empty, so the host sees **"No join requests from residents yet"** while three people wait for an answer.

Both need a toast and a distinguishable state.

## 21. Join modal ignores the Android back button

[`[id].tsx:634`](../../app/mcn/carpools/[id].tsx#L634) — `<Modal visible transparent animationType="slide">` with no `onRequestClose`. On Android the hardware back gesture does nothing (RN also warns in dev). The only exit is the ✕. Also, tapping the dimmed overlay does not dismiss, which every other sheet in the app allows.

## 22. Community leads get a confusing, half-functional detail screen

The Host Controls card is gated `(isOwner || isCommunityLead)`, and the RLS update/delete policies do grant leads that power (`20260822000000`, `20260822000100`) — correct. But on the *same* screen a non-owning lead also sees:

- the **Join Requests** panel gated on `isOwner` only, so it is absent — while the lead can pause and delete the ride they cannot see who is booked on it; and RLS would block them from reading those rows anyway.
- the **"Request to Join Carpool"** button, since it is gated on `!isOwner`. A lead can moderate and book the same ride from one screen.

Decide whether leads are moderators (controls yes, booking no, roster read-only via an RPC) and make the three gates agree.

## 23. Verandah violations throughout, none logged

`docs/CLAUDE.md` §4 and `docs/verandah.md` forbid these outright. All three files break them, and `docs/verandah.md`'s Out-of-Register Appendix says *"None recorded in this revision."*

| Violation | Where |
|---|---|
| Raw hex colors (`#D1FAE5`, `#059669`, `#FEF3C7`, `#D97706`, `#DBEAFE`, `#1D4ED8`, `#FEE2E2`, `#DC2626`, `#10B981`, `#EF4444`, `#16A34A`, `#DCFCE7`, `#FFFFFF`) | all three files, ~40 sites |
| `shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius`/`elevation` | `index.tsx:604-608` (`fab`), `add.tsx:679-682` (`roleBtnActive`) |
| `textTransform: 'uppercase'` on non-`sectionLabel` text | `index.tsx:499`, `add.tsx:708`, `[id].tsx:776`, `1027`, plus inline at `554` and `599` |
| `.toUpperCase()` on rendered status | `[id].tsx:321` |
| Font weight ≥ 600 (`'700'`) | `index.tsx:462`, `[id].tsx:470`, `554`, `599`, `786`, `854`, and others |
| Decorative emoji in chrome | `[id].tsx:429` — `📞` interpolated into the host line instead of an `Ionicons` glyph |
| Title Case user-facing copy (rule is sentence case) | "Route Title / Summary", "Publish Ride Offer", "Missing Start Point", "Request Carpool Seat", "Host Controls", "Your Booking Status", … |
| Ad-hoc font sizes where a `VerandahType` token fits | `10`/`11`/`12`/`13`/`15` literals throughout |

## 24. List query and search will not scale, and search misses the obvious fields

- No `.limit()` and no pagination — every active and paused ride in the community is fetched on every focus, with a joined profile each.
- Search is a pure client-side `Array.filter` over the current tab's rows. It covers `title`, `start_point`, `end_point`, `vehicle_info` — and **not** `notes` or the host's name, though the placeholder ("Search by city, outstation destination or office location…") implies broad coverage.
- Because it is client-side, the 300 ms debounce rule in `docs/CLAUDE.md` §3 does not strictly bind — but the moment this is moved server-side for scale, it will.
- Ordering is `created_at DESC` on every tab. There is no way to sort or filter by departure time, day, price, or seats — see finding 14.

## 25. "My Carpools" means "rides I posted", not "my rides"

`activeTab === 'my'` filters `created_by = user.id`. A resident who has been *accepted onto* four commutes sees an empty tab. Their bookings live only inside each ride's detail screen, which they must find again through the All Rides list. Every comparable product treats "My rides" as the union of hosted and joined.

The tab also applies no status filter, so cancelled and completed rides mix into it with no visual separation beyond the badge.

## 26. Missing the trust and safety layer the Indian market expects

Not a bug — a scope observation, sharpened by the fact that this ships to gated societies where residents are semi-known to each other but not vetted:

- **No women-only / gender-preference flag.** Quick Ride and sRide both ship this; it is table stakes for early-morning and late-evening commutes.
- **No ratings or ride history between neighbours.** The app already has `hire_feedback` for service providers; carpools have no equivalent, so a repeatedly-cancelling host carries no signal.
- **No report or block.** `mcn_listings` got spam controls (`20260821000000`); carpools did not.
- **Vehicle info is optional free text**, so a ride can be published with no plate number and no vehicle description at all.
- **Contact details are public before booking.** The host's phone renders in plain text to every resident who opens the ride (`[id].tsx:426-431`), regardless of whether they have requested a seat. Standard practice is to reveal contact on confirmation. In a gated community this may be an acceptable trade — but it should be a decision, and today it is a default.

## 27. The carpools UPDATE policy does not pin `community_id`

`20260822000000_repoint_dead_community_lead_checks.sql:71-78` — `USING (created_by = auth.uid() OR is_community_lead(…) OR is_platform_admin(…))`, no `WITH CHECK`. As in finding 5, `USING` is reused for the new row, so an owner cannot reassign `created_by`, but **can** update `community_id` to any other community's UUID — moving their ride out of the society. Also unconstrained: `role_type`, `status`, and `available_seats` can be set to any CHECK-passing value directly.

Same class as finding 5; fold into the same hardening migration.

---

# B. Comparison with standard carpooling platforms

Baseline: BlaBlaCar (intercity), Quick Ride / sRide (Indian corporate commute), and the residual Waze Carpool model.

| Capability | Industry standard | Wooru today | Gap |
|---|---|---|---|
| **Ride identity** | A dated departure instance; recurring templates spawn per-day instances | Clock time + weekday labels, **no date** | Findings 14 · **critical** |
| **Seat inventory** | `total_seats` fixed, `booked_seats` derived, atomic server-side reservation | One mutable column serving both roles, client-side arithmetic | 1, 2 · **critical** |
| **Overbooking** | Impossible — DB constraint or transactional decrement | Unchecked; clamps silently and inflates on release | 1, 2 · **critical** |
| **Booking lifecycle** | request → approve/decline → confirmed → completed / no-show, with cancellation windows | pending → accepted/rejected/cancelled; `completed` unreachable; no cutoff | 8, 11, 14 |
| **Cancellation cascade** | Cancelling a ride cancels bookings and notifies every passenger | Status flips; bookings orphaned; nobody told | 11 |
| **Notifications** | Push + in-app on all six transitions, plus a departure reminder | **None**, though the infra exists and is used elsewhere in this app | 7 · **critical** |
| **Search & discovery** | Route + date + radius match, sorted by departure, detour-aware | Client-side substring over four fields, sorted by post date | 24 |
| **Expiry** | Past rides auto-archive | Rides live forever and keep counting as "active" | 14 |
| **Route model** | Structured geo with coordinates, map preview, en-route pickup points | Two free-text strings | — (acceptable at this scale; note for later) |
| **Fare** | Numeric per-seat, total computed, cost-sharing cap to bar commercial use | TEXT with `₹` baked in; `'Free'` as a price; no total | 16 |
| **Identity & trust** | Verified profile, two-way ratings, ride history, report/block | Community membership only | 26 |
| **Safety** | Women-only filter, vehicle + plate on record, SOS, trusted-contact share | Optional free-text vehicle; no gender option; no report | 26 |
| **Privacy** | Contact revealed on confirmation | Host phone public to the whole society | 26 |
| **Passenger roster** | Visible to driver; co-passengers visible to confirmed riders | Card claims to be public, RLS makes it host-only | 12 |
| **Edit** | Full edit until the first booking; restricted after | Does not exist | 6 |
| **Two-sided matching** | Seat requests and ride requests both actionable in-app | "Seeking" posts are dead ends — no response flow, no owner controls | 3 |

**Where this lands.** The classifieds half — post a route, browse routes, call the host — works. The booking half does not: seat counts drift and can exceed the vehicle, acceptance is invisible to the rider, and half the posts cannot be withdrawn. Findings 1, 2, 3, 7 are what separate the current state from a usable coordination tool.

---

# C. Test matrix walked

Every row below was traced through the source. **Pass** = behaves as `docs/features.md` §4.4 describes; **Fail** = does not, with the finding number.

### Happy paths

| # | Path | Result |
|---|---|---|
| H1 | Network tab → carpool tile shows count of `status='active'` rides | Pass |
| H2 | List loads active + paused, newest first, with host name and flat | Pass |
| H3 | Offering / Seeking tabs filter by role **and** `status='active'` | Pass |
| H4 | My Carpools tab lists rides I created, any status | Pass — but see 25 |
| H5 | Client-side search over title / start / end / vehicle | Pass — see 24 |
| H6 | Publish an offering ride, all fields | Pass |
| H7 | Publish a seeking ride | Pass — **unwithdrawable**, 3 |
| H8 | Weekday / Daily / Clear presets | Pass |
| H9 | Seat stepper clamps 1–6 on publish | Pass |
| H10 | Free / Paid toggle; Free clears the price field | Pass — see 16, 17 |
| H11 | Post-save `router.replace('/mcn/carpools')`, list refreshes on focus | Pass |
| H12 | Detail renders route, timings, seats, cost, vehicle, days, notes, host | Pass — see 18 |
| H13 | Call / WhatsApp the host | Partial — 15 |
| H14 | Non-owner requests a seat on an active offering ride | Pass |
| H15 | Host sees the request and accepts | **Fail — 1, 2** |
| H16 | Host rejects | Pass — but 2, 8 |
| H17 | Rider cancels their own request | Pass — but 2 |
| H18 | Host pauses, then resumes | Pass |
| H19 | Host cancels the trip | **Fail — 11** |
| H20 | Host deletes; requests cascade; redirect to list | Pass |
| H21 | Lead moderates someone else's ride | Partial — 22 |
| H22 | Back navigation from list / add / detail | Pass — mappings present at `lib/navigation.ts:149-151`; **except 4** |
| H23 | Web pull-to-refresh and native `RefreshControl` on the list | Pass |
| H24 | Mark a ride completed | **Fail — no such control (14)** |
| H25 | Edit a published ride | **Fail — 6** |

### Negative scenarios

| # | Scenario | Expected | Actual |
|---|---|---|---|
| N1 | Publish with empty title / start / end | Blocked with a toast | Pass |
| N2 | Publish with a whitespace-only title | Blocked | Pass — `.trim()` before the check |
| N3 | Publish with a 9-digit phone | Blocked | Pass |
| N4 | Publish with `0000000000` | Blocked | **Fail — 15** |
| N5 | Publish with `+91 98765 43210` | Accepted and normalized | Accepted, **not** normalized — 15 |
| N6 | Native: hour `99`, minute `88` | Blocked or clamped | **Fail — saves — 13** |
| N7 | Native: clear the hour field, save | Blocked | **Fail — saves `":30 AM"` — 13** |
| N8 | Publish with zero recurring days | Allowed (one-off) | Pass — but no date to pin it to, 14 |
| N9 | Return time earlier than departure | Warned or blocked | No validation — accepted silently |
| N10 | Paid ride, price left blank | Sensible fallback | Stores the literal `"Paid"` — 16 |
| N11 | Paid ride, price `"abc"` (web) | Blocked | Stores `"₹abc"` — 16 |
| N12 | Double-tap Publish | One row | Guarded by `disabled={submitting}` — Pass |
| N13 | Request a seat with an empty name / phone / flat | Blocked | Pass |
| N14 | Request with phone `"1"` | Blocked | **Fail — 15** |
| N15 | Request more seats than available (UI) | Stepper caps | Pass |
| N16 | Request more seats than available (API) | Rejected | **Fail — 10** |
| N17 | Request a cancelled or paused ride (API) | Rejected | **Fail — 10** |
| N18 | Request a *seeking* post (API) | Rejected | **Fail — 10** |
| N19 | Owner requests their own ride (API) | Rejected | **Fail — 10** |
| N20 | Request with a foreign `community_id` (API) | Rejected | **Fail — never joined to the carpool — 10** |
| N21 | Rider PATCHes their request to `accepted` | Rejected | **Fail — 5** |
| N22 | Rider raises `seats_requested` after acceptance | Rejected | **Fail — 5** |
| N23 | Owner PATCHes `community_id` on their ride | Rejected | **Fail — 27** |
| N24 | Accept a request when 1 seat remains | Seats → 0, or a clean "full" | **Fail — CHECK violation, silently swallowed — 1** |
| N25 | Accept past capacity | Rejected | **Fail — clamps to 0 — 2** |
| N26 | Accept two, then both cancel | Seats return to the original | **Fail — inflates above it — 2** |
| N27 | Double-tap Accept on one request | One decrement | **Fail — decrements twice — 2d** |
| N28 | Rejected rider re-requests | Allowed | **Fail — locked out — 8** |
| N29 | Two riders request simultaneously, one seat | One succeeds | **Fail — both accepted, no guard — 2c, 10** |
| N30 | Open a deleted ride's link | "Not found" + back | **Fail — infinite spinner, no back — 4** |
| N31 | Open a ride from another community | "Not found" + back | **Fail — same — 4** |
| N32 | Malformed `[id]` in the URL | Handled | **Fail — same — 4** |
| N33 | List query errors | Toast + retry | Renders "No carpools found" — 20 |
| N34 | Requests query errors (host) | Toast | Renders "No join requests yet" — 20 |
| N35 | Android hardware back inside the join modal | Closes the modal | **Fail — 21** |
| N36 | Cold-open the add screen before `profile` resolves | Phone prefilled | Blank — 19 (runtime) |
| N37 | Seeking-post owner tries to delete it | Deletable | **Fail — no control — 3** |
| N38 | A ride whose `status = 'completed'` renders in a list | Badge shown | No badge at all — 14 |
| N39 | Rider keeps the detail open while the host cancels, then submits | Rejected | **Fail — insert succeeds — 10** |

---

# D. Implementation plan

> **This section is an executable brief.** It is written to be handed to an implementing agent with no prior context on this feature. Read §D.0 first — it contains the rules that make the difference between a change that lands and one that silently does nothing.

## D.0 — Ground rules for the implementing agent

### Read before you edit
`docs/CLAUDE.md` (mandatory, whole file) · `docs/architecture.md` §4.7, §6, §7, §9 · `docs/features.md` §4.4 · `docs/verandah.md`. Do not read the whole doc set; `docs/README.md` is the routing table.

### The validation loop — run it after **every** task, not at the end
```bash
npm run db:push                                                        # only if you added a migration
npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj    # only if you added a migration
# then re-append the hand-maintained enriched-types block to the bottom of lib/database.types.ts
npx tsc --noEmit                                                       # ALWAYS — this is the only gate
```
`npx tsc --noEmit` is clean on the current tree. If it is not clean after your change, you broke it.

### Traps that will bite you on this specific task
1. **`gen types` overwrites `lib/database.types.ts` entirely**, wiping the hand-maintained `ProviderWithInteraction` / `VisitWithJoinerData` / `VisitJoinerWithProfile` block at the bottom. Copy it out before regenerating and paste it back after. Never hand-edit anything else in that file.
2. **Editing an already-applied migration file does nothing.** `db push` tracks by *filename*. All six existing carpool migrations are applied. Every change below is a **new** migration file.
3. **Check timestamps before naming files.** Run `npx supabase migration list --linked`; a row with an empty `remote` column is unapplied. The highest local timestamp today is `20260826000000`. Use `20260828000000`, `20260828000100`, … and confirm they are free.
4. **A constraint-enforcing trigger MUST be `SECURITY DEFINER`.** Without it, the trigger's own `SELECT`s run under the caller's RLS, so any aggregate over *other users'* rows silently under-counts and the constraint never fires. This exact bug cost the food-drops module its cross-buyer caps (`20260823000000`). Every trigger in D.1 aggregates over other riders' requests, so every one of them needs it, plus `SET search_path = public`.
5. **RLS `WITH CHECK` cannot see `OLD`.** Anything that needs an old-vs-new comparison (column immutability, legal status transitions) goes in a `BEFORE UPDATE` trigger, not in a policy.
6. **A platform admin has no RLS grant on community-scoped tables** — `is_platform_admin()` requires `community_id IS NULL`, so any `WITH CHECK` keyed on `get_user_community_id()` matches nothing for them. Every such clause needs an `OR public.is_platform_admin(auth.uid())` escape.
7. **`RETURNS TABLE` OUT parameters shadow column names**, raising *"column reference is ambiguous"* at **call** time, not creation time. The RPCs below deliberately name their OUT params (`total_seats`, `booked_seats`, `remaining_seats`) differently from the column (`available_seats`). Keep it that way, alias every table, and qualify every column.
8. **End every schema-changing migration with `NOTIFY pgrst, 'reload schema';`** and write idempotent SQL (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`, `CREATE OR REPLACE FUNCTION`).
9. **`Alert.alert` is a no-op on web.** Any new confirmation splits on `Platform.OS` and uses `window.confirm` on web.
10. **Do not add a route file for the edit screen.** Two route files resolving to one URL breaks browser history silently. Edit reuses `/mcn/carpools/add?id=…`.

### Conventions this feature currently violates and your changes must not
- Scope every community query by `communityId` from `useAuth()`.
- `.maybeSingle()`, never `.single()`.
- Forward navigation is `router.push()`; `router.replace()` only for post-save redirects; header back is `goBackSmart()`.
- Verandah tokens only — no raw hex, no shadow/elevation, no `textTransform: 'uppercase'` outside `sectionLabel`, sentence-case copy.
- Phone numbers through `lib/phone.ts`. Flat numbers uppercased and stripped on blur.
- Always check the `error` from a Supabase call, including on fire-and-forget updates.

### Definition of done for the whole plan
`npx tsc --noEmit` clean · every migration applied and types regenerated · every §C row currently marked **Fail** now passes · `docs/features.md` §4.4 and `docs/architecture.md` §4.7 updated in the same change set (see §D.5).

---

## D.1 — Phase 1: correctness and integrity (release blocker)

**Closes findings 1, 2, 5, 9, 10, 27.** These are corrupting rows today and finding 5 is exploitable from a browser console by any logged-in resident. Ship this phase alone, before anything else.

### Task 1.1 — Audit the existing damage *before* changing anything

Run this and save the output into the migration file as a comment. It is the only record of pre-repair state.

```sql
SELECT c.id,
       c.title,
       c.available_seats                                   AS current_column_value,
       COALESCE(SUM(r.seats_requested) FILTER (WHERE r.status = 'accepted'), 0) AS accepted_seats,
       COUNT(r.id) FILTER (WHERE r.status = 'accepted')     AS accepted_requests,
       COUNT(r.id) FILTER (WHERE r.status = 'cancelled')    AS cancelled_requests,
       COUNT(r.id) FILTER (WHERE r.status = 'rejected')     AS rejected_requests
FROM public.mcn_carpools c
LEFT JOIN public.mcn_carpool_requests r ON r.carpool_id = c.id
GROUP BY c.id, c.title, c.available_seats
HAVING COUNT(r.id) > 0
ORDER BY c.created_at;
```

**Read the result before writing the repair.** Rows with `cancelled_requests > 0` or `rejected_requests > 0` have been through a release cycle and their `available_seats` may already be inflated above the true vehicle capacity — that number is not recoverable from the data (see finding 2b). Rows where the accept hit the CHECK-constraint failure (finding 1) never decremented at all, so adding `accepted_seats` back would *over*-correct them.

**Therefore the repair is best-effort, and you must say so.** If the audit returns a small number of rows (likely — this feature is young), prefer listing the affected carpool ids in the change-set notes and asking the product owner to confirm capacities with the hosts, rather than trusting the arithmetic.

### Task 1.2 — Migration `20260828000000_carpool_seat_integrity.sql`

```sql
-- Carpool seat integrity.
--
-- Before this migration, app/mcn/carpools/[id].tsx mutated mcn_carpools.available_seats
-- on every accept/reject/cancel, treating the published capacity column as a live
-- remaining-seats counter. That (a) destroyed the original capacity, (b) inflated it above
-- the original on release because the decrement clamped at 0 while the increment did not,
-- (c) had no capacity check at all, and (d) hit the CHECK (available_seats >= 1) constraint
-- when accepting the last seat, with the error discarded client-side.
--
-- After this migration available_seats is IMMUTABLE CAPACITY. Occupancy is derived.
-- The client must stop writing it (see app/mcn/carpools/[id].tsx).
--
-- Pre-repair audit output:
--   <paste the Task 1.1 result here>

-- ---------------------------------------------------------------------------
-- 1. Best-effort repair of drifted capacities.
--    Restores capacity = current value + seats currently held by accepted requests.
--    Imprecise for carpools that went through an accept->release cycle; those ids are
--    listed in the audit above and were reviewed manually.
-- ---------------------------------------------------------------------------
UPDATE public.mcn_carpools c
SET available_seats = LEAST(6, c.available_seats + a.booked)
FROM (
  SELECT r.carpool_id, SUM(r.seats_requested)::INT AS booked
  FROM public.mcn_carpool_requests r
  WHERE r.status = 'accepted'
  GROUP BY r.carpool_id
) a
WHERE a.carpool_id = c.id;
-- LEAST(6, …) matches the publish-form stepper ceiling and stops a runaway value.

-- ---------------------------------------------------------------------------
-- 2. Derived seat availability. OUT params are deliberately named differently from
--    the available_seats column to avoid the RETURNS TABLE shadowing trap.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_mcn_carpool_seats(p_carpool_id UUID)
RETURNS TABLE (total_seats INT, booked_seats INT, remaining_seats INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.available_seats AS total_seats,
    COALESCE(SUM(r.seats_requested) FILTER (WHERE r.status = 'accepted'), 0)::INT AS booked_seats,
    GREATEST(
      c.available_seats
        - COALESCE(SUM(r.seats_requested) FILTER (WHERE r.status = 'accepted'), 0),
      0
    )::INT AS remaining_seats
  FROM public.mcn_carpools c
  LEFT JOIN public.mcn_carpool_requests r ON r.carpool_id = c.id
  WHERE c.id = p_carpool_id
    AND (
      c.community_id = public.get_user_community_id()
      OR public.is_platform_admin(auth.uid())
    )
  GROUP BY c.id, c.available_seats;
$$;

GRANT EXECUTE ON FUNCTION public.get_mcn_carpool_seats(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Server-side validity + capacity enforcement on join requests.
--    SECURITY DEFINER is mandatory: the aggregate below spans OTHER riders' rows,
--    which the caller cannot see under mcn_carpool_requests_select.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_mcn_carpool_request_validity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carpool   public.mcn_carpools%ROWTYPE;
  v_booked    INT;
  v_remaining INT;
BEGIN
  SELECT * INTO v_carpool FROM public.mcn_carpools WHERE id = NEW.carpool_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This ride no longer exists.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_carpool.role_type <> 'offering' THEN
      RAISE EXCEPTION 'You can only request a seat on a ride that is offering seats.';
    END IF;
    IF v_carpool.status <> 'active' THEN
      RAISE EXCEPTION 'This ride is % and is not accepting requests.', v_carpool.status;
    END IF;
    IF NEW.rider_id = v_carpool.created_by THEN
      RAISE EXCEPTION 'You cannot request a seat on your own ride.';
    END IF;
    IF NEW.community_id <> v_carpool.community_id THEN
      RAISE EXCEPTION 'This ride belongs to a different community.';
    END IF;
  END IF;

  IF NEW.seats_requested > v_carpool.available_seats THEN
    RAISE EXCEPTION 'This ride has only % seat(s) in total.', v_carpool.available_seats;
  END IF;

  -- Capacity is only consumed by acceptance.
  IF NEW.status = 'accepted'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'accepted') THEN

    SELECT COALESCE(SUM(r.seats_requested), 0)::INT
      INTO v_booked
    FROM public.mcn_carpool_requests r
    WHERE r.carpool_id = NEW.carpool_id
      AND r.status = 'accepted'
      AND r.id <> NEW.id;

    v_remaining := v_carpool.available_seats - v_booked;

    IF NEW.seats_requested > v_remaining THEN
      RAISE EXCEPTION
        'Only % seat(s) left on this ride, but % were requested.',
        v_remaining, NEW.seats_requested;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mcn_carpool_request_validity ON public.mcn_carpool_requests;
CREATE TRIGGER mcn_carpool_request_validity
  BEFORE INSERT OR UPDATE ON public.mcn_carpool_requests
  FOR EACH ROW EXECUTE FUNCTION public.check_mcn_carpool_request_validity();

-- ---------------------------------------------------------------------------
-- 4. Column-level authorization on requests.
--    The RLS UPDATE policy is column-blind (no WITH CHECK), so a rider could PATCH
--    their own row to status='accepted'. RLS cannot see OLD, so the rules live here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_mcn_carpool_request_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host   UUID;
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT c.created_by INTO v_host
  FROM public.mcn_carpools c
  WHERE c.id = OLD.carpool_id;

  -- Nobody may re-parent a request or move it between communities or riders.
  IF NEW.id           IS DISTINCT FROM OLD.id
     OR NEW.carpool_id   IS DISTINCT FROM OLD.carpool_id
     OR NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.rider_id     IS DISTINCT FROM OLD.rider_id THEN
    RAISE EXCEPTION 'A join request cannot be re-assigned.';
  END IF;

  IF v_caller = v_host THEN
    -- Host: may only move status, and only along legal edges.
    IF NEW.rider_name      IS DISTINCT FROM OLD.rider_name
       OR NEW.rider_phone     IS DISTINCT FROM OLD.rider_phone
       OR NEW.flat_number     IS DISTINCT FROM OLD.flat_number
       OR NEW.seats_requested IS DISTINCT FROM OLD.seats_requested
       OR NEW.note            IS DISTINCT FROM OLD.note THEN
      RAISE EXCEPTION 'A host may only change the status of a request.';
    END IF;

    IF NOT (
         OLD.status = NEW.status
      OR (OLD.status = 'pending'  AND NEW.status IN ('accepted', 'rejected'))
      OR (OLD.status = 'accepted' AND NEW.status = 'cancelled')
    ) THEN
      RAISE EXCEPTION 'A host cannot move a request from % to %.', OLD.status, NEW.status;
    END IF;

  ELSIF v_caller = OLD.rider_id THEN
    -- Rider: may edit their own details while still pending, and may only ever cancel.
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'A rider may only cancel their own request.';
    END IF;

    IF OLD.status <> 'pending'
       AND (NEW.rider_name      IS DISTINCT FROM OLD.rider_name
         OR NEW.rider_phone     IS DISTINCT FROM OLD.rider_phone
         OR NEW.flat_number     IS DISTINCT FROM OLD.flat_number
         OR NEW.seats_requested IS DISTINCT FROM OLD.seats_requested
         OR NEW.note            IS DISTINCT FROM OLD.note) THEN
      RAISE EXCEPTION 'A request can only be edited while it is pending.';
    END IF;

  ELSE
    RAISE EXCEPTION 'Only the rider or the ride host can change this request.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mcn_carpool_request_transition ON public.mcn_carpool_requests;
CREATE TRIGGER mcn_carpool_request_transition
  BEFORE UPDATE ON public.mcn_carpool_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_mcn_carpool_request_transition();

-- ---------------------------------------------------------------------------
-- 5. Make "one open request per rider per ride" real (docs/features.md 4.4 claims it).
--    Cancelled and rejected rows are excluded so a rider can re-apply.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS mcn_carpool_requests_one_open_idx
  ON public.mcn_carpool_requests (carpool_id, rider_id)
  WHERE status IN ('pending', 'accepted');

-- ---------------------------------------------------------------------------
-- 6. Pin carpool ownership and community on UPDATE.
--    The existing policy has no WITH CHECK, so the owner could move the ride to
--    another community. Ownership needs OLD, so it goes in a trigger.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "mcn_carpools_update" ON public.mcn_carpools;
CREATE POLICY "mcn_carpools_update"
  ON public.mcn_carpools FOR UPDATE
  USING (
    created_by = auth.uid()
    OR public.is_community_lead(auth.uid())
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    community_id = public.get_user_community_id()
    OR public.is_platform_admin(auth.uid())
  );

CREATE OR REPLACE FUNCTION public.enforce_mcn_carpool_immutables()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booked INT;
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'The owner of a ride cannot be changed.';
  END IF;
  IF NEW.community_id IS DISTINCT FROM OLD.community_id THEN
    RAISE EXCEPTION 'A ride cannot be moved to another community.';
  END IF;

  -- Capacity may not drop below what is already booked (matters once edit ships).
  IF NEW.available_seats < OLD.available_seats THEN
    SELECT COALESCE(SUM(r.seats_requested), 0)::INT
      INTO v_booked
    FROM public.mcn_carpool_requests r
    WHERE r.carpool_id = OLD.id
      AND r.status = 'accepted';

    IF NEW.available_seats < v_booked THEN
      RAISE EXCEPTION
        'Cannot reduce capacity to % — % seat(s) are already confirmed.',
        NEW.available_seats, v_booked;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mcn_carpools_immutables ON public.mcn_carpools;
CREATE TRIGGER mcn_carpools_immutables
  BEFORE UPDATE ON public.mcn_carpools
  FOR EACH ROW EXECUTE FUNCTION public.enforce_mcn_carpool_immutables();

NOTIFY pgrst, 'reload schema';
```

### Task 1.3 — `app/mcn/carpools/[id].tsx`: stop writing `available_seats`

**Delete lines 219-234 entirely** — the whole `if (carpool) { … seatAdjustment … }` block, including the `targetReq` / `prevStatus` lookups at 209-210 that exist only to feed it. Capacity is now fixed and occupancy is derived.

**Rewrite `handleUpdateRequestStatus` to surface the server's message.** The trigger's `RAISE EXCEPTION` text is written to be shown to a host verbatim ("Only 1 seat(s) left on this ride, but 2 were requested."). That is how the host learns the truth instead of getting a false success toast:

```ts
const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);

const handleUpdateRequestStatus = async (
  requestId: string,
  newStatus: 'accepted' | 'rejected' | 'cancelled'
) => {
  if (pendingRequestId) return;          // closes the double-tap race (finding 2d)
  setPendingRequestId(requestId);
  try {
    const { error } = await supabase
      .from('mcn_carpool_requests')
      .update({ status: newStatus })
      .eq('id', requestId);

    if (error) throw error;

    Toast.show({
      type: 'success',
      text1:
        newStatus === 'accepted' ? 'Request accepted'
        : newStatus === 'rejected' ? 'Request declined'
        : 'Request cancelled',
    });
    await fetchDetails();
  } catch (err: any) {
    Toast.show({
      type: 'error',
      text1: 'Could not update the request',
      text2: err?.message ?? undefined,     // the trigger message lands here
    });
  } finally {
    setPendingRequestId(null);
  }
};
```

Wire `disabled={pendingRequestId !== null}` onto both the Accept and Reject buttons (lines 569-580) and onto "Cancel My Request" (line 609).

### Task 1.4 — `app/mcn/carpools/[id].tsx`: show real seat availability

Fetch `get_mcn_carpool_seats` inside `fetchDetails` (alongside the two existing reads, batched with `Promise.all` per the convention), hold it in a `seats` state, and re-read on focus — another rider's acceptance makes it stale, exactly as the drops module's item stock does.

Replace the "Capacity" grid item (lines 365-373) with `remaining_seats of total_seats seats left`, turning `Verandah.danger`-toned at zero with "Ride full". Cap the join modal's stepper on `remaining_seats`, not `carpool.available_seats` (line 688). Update the list card's seat line (`index.tsx:347-353`) the same way — either add the RPC per row or, better, fetch the accepted-seat totals for the current page's carpool ids in one batched query (scope joins tightly; never select the whole table).

### Phase 1 acceptance criteria

| Check | Expected |
|---|---|
| §C N24 — accept the last seat | Succeeds; `remaining_seats` reads 0; `available_seats` unchanged |
| §C N25 — accept past capacity | Rejected with the trigger's message shown in a toast |
| §C N26 — accept two, both cancel | `available_seats` identical to publish time |
| §C N27 — double-tap Accept | One state change; second tap is a no-op |
| §C N16-N20 — direct API inserts | All five rejected by `check_mcn_carpool_request_validity` |
| §C N21, N22 — rider self-accept / seat inflation | Rejected by `enforce_mcn_carpool_request_transition` |
| §C N23 — owner PATCHes `community_id` | Rejected by policy `WITH CHECK` + `enforce_mcn_carpool_immutables` |
| §C N29 — two riders race one seat | Exactly one acceptance succeeds |
| Duplicate open request | Rejected by `mcn_carpool_requests_one_open_idx` |
| `npx tsc --noEmit` | Clean |

**How to test the triggers without the app:** `npx supabase db query --linked` runs as a non-authenticated connection, so `auth.uid()` is null and `enforce_mcn_carpool_request_transition` will raise 'Not authenticated.' — that proves the trigger fires but not the branch logic. Test the branches through the app with two real accounts, or replicate the trigger body's inner queries manually with a hardcoded uid.

---

## D.2 — Phase 2: make the feature usable end to end

**Closes findings 3, 4, 6, 7, 8, 11, 12, 20.**

### Task 2.1 — Not-found state (finding 4) · `[id].tsx`

Three coupled changes:

1. Line 81: `.single()` → `.maybeSingle()`, and add `.eq('community_id', communityId)` to the carpool query. Add `communityId` to the `useCallback` dependency array.
2. Add a `notFound` state, set when `maybeSingle()` returns `data === null`.
3. Split the guard at line 267 into two branches. The loading branch keeps the spinner; the not-found branch renders an `EmptyState`. **Both must use `buildMcnHeaderOptions({ title, onBack: handleBack })`** — the current bare `<Stack.Screen options={{ title: 'Carpool Details' }} />` has no `headerLeft`, which is what strands the user:

```tsx
if (notFound) {
  return (
    <View style={[styles.center, { backgroundColor: colors.surface }]}>
      <Stack.Screen options={buildMcnHeaderOptions({ title: 'Ride not found', onBack: handleBack })} />
      <EmptyState
        ionicon="car-sport-outline"
        title="Ride not found"
        message="This ride may have been removed by the host, or it belongs to another community."
        actionLabel="Back to all rides"
        onAction={() => router.replace('/mcn/carpools' as any)}
      />
    </View>
  );
}
```

`EmptyState`'s props are `{ icon, title?, message, ionicon?, actionLabel?, onAction? }` — `icon` is required, so pass `icon="car-sport-outline"` or supply both.

### Task 2.2 — Owner controls on every ride (finding 3) · `[id].tsx:482`

```diff
-{carpool.role_type === 'offering' && (isOwner || isCommunityLead) && (
+{(isOwner || isCommunityLead) && (
```

Pause / Cancel / Delete now work for seeking posts. Leave the *Join Requests* panel gated on `offering` — seeking posts have no request flow (finding N in §B stays open until Phase 4). Verify a seeking-post owner can delete their own post (§C N37).

### Task 2.3 — Edit flow (finding 6) · `add.tsx` + `[id].tsx`

`add.tsx` becomes create-or-edit on a **query param**, not a new route file:

- `const { id } = useLocalSearchParams<{ id?: string }>();` and `const isEditing = Boolean(id);`
- When editing, load the row in a `useEffect` (scoped by `communityId`, `.maybeSingle()`) and hydrate all state, including parsing `departure_time` / `return_time` back into hour / minute / AM-PM. **Write that parse defensively** — existing rows may hold `"99:88 AM"` or `":30 AM"` (finding 13); fall back to the current defaults rather than crashing.
- Submit branches to `.update({...}).eq('id', id)` and `router.replace(\`/mcn/carpools/${id}\`)`; create keeps `router.replace('/mcn/carpools')`.
- Header title: `isEditing ? 'Edit ride' : (roleType === 'offering' ? 'Offer a ride' : 'Request a ride')`.
- `[id].tsx`: add `headerRight` to `buildMcnHeaderOptions` (it already accepts one) with a pencil `Ionicons`, shown when `isOwner || isCommunityLead`, pushing `/mcn/carpools/add?id=${carpool.id}`.

No `getImmediateParentRoute()` change is needed — `/mcn/carpools/add` already maps at `lib/navigation.ts:150`.

**Guard:** the immutables trigger from 1.2(6) will reject a capacity reduction below confirmed seats. Surface that message rather than swallowing it.

### Task 2.4 — Notifications (finding 7) · migration `20260828000100_carpool_notifications.sql`

Follow `handle_visit_rescheduled_notification` in `20260607113000_notify_visit_reschedule.sql` exactly — same `SECURITY DEFINER` + direct `INSERT INTO public.notifications (user_id, type, title, body, data)` shape.

Three triggers:

| Trigger | Fires on | Notifies | `type` |
|---|---|---|---|
| `on_mcn_carpool_request_created` | `AFTER INSERT ON mcn_carpool_requests` | `mcn_carpools.created_by` | `carpool_request` |
| `on_mcn_carpool_request_status` | `AFTER UPDATE … WHEN (OLD.status IS DISTINCT FROM NEW.status)` | the *other* party — rider if the host acted, host if the rider cancelled | `carpool_request_accepted` / `_rejected` / `_cancelled` |
| `on_mcn_carpool_status` | `AFTER UPDATE ON mcn_carpools … WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('cancelled','paused'))` | every rider holding an `accepted` request | `carpool_cancelled` / `carpool_paused` |

`data` carries `jsonb_build_object('carpool_id', …, 'request_id', …)` so the notification screen can deep-link to `/mcn/carpools/<id>`. Check `app/notifications.tsx` for how existing types are routed and add the new ones there.

Body copy, sentence case, naming the ride: *"Priya (B-1104) asked for 2 seats on Daily ride to Mindspace."* · *"Your seat on Daily ride to Mindspace is confirmed."* · *"Daily ride to Mindspace has been cancelled by the host."*

**Do not** notify the whole community the way the visits trigger does — carpool notifications are strictly point-to-point between host and rider.

### Task 2.5 — Cancellation cascade (finding 11) · same migration

In `on_mcn_carpool_status`, before inserting notifications, cascade the bookings so the state change and the notice land in one transaction:

```sql
UPDATE public.mcn_carpool_requests r
SET status = 'cancelled'
WHERE r.carpool_id = NEW.id
  AND r.status IN ('pending', 'accepted');
```

**This will fire `enforce_mcn_carpool_request_transition` from 1.2(4)**, which raises for any caller who is neither rider nor host. When the *host* cancels their own ride, `auth.uid() = v_host` and `accepted → cancelled` is a legal host edge, so it passes. When a **community lead or platform admin** cancels someone else's ride it will raise. Add a lead/admin branch to `enforce_mcn_carpool_request_transition` permitting `pending|accepted → cancelled` — or, cleaner, have the cascade set a session flag the transition trigger honours. Pick one and note it in `docs/architecture.md`. **This interaction is the single most likely thing to break in this phase; test lead-initiated cancellation explicitly.**

Only cascade on `cancelled`. A `paused` ride keeps its bookings — pausing is reversible.

### Task 2.6 — Rejected riders can re-apply (finding 8) · `[id].tsx:61`

```diff
-const myExistingRequest = requests.find((r) => r.rider_id === user?.id && r.status !== 'cancelled');
+const myOpenRequest = requests.find(
+  (r) => r.rider_id === user?.id && (r.status === 'pending' || r.status === 'accepted')
+);
+const myLastDeclined = requests.find((r) => r.rider_id === user?.id && r.status === 'rejected');
```

Render the booking-status card only for `myOpenRequest`. When there is none, render the join button; if `myLastDeclined` exists, show a quiet one-line note above it ("The host declined an earlier request.") rather than blocking. The partial unique index from 1.2(5) guarantees only one open request survives, so this is safe.

### Task 2.7 — Resolve the co-passenger roster (finding 12)

**This needs a product decision before code.** Recommendation: make the roster visible to the whole community, which is what the card's title already promises and what makes sense inside a gated society.

Migration, same file as 2.4:

```sql
CREATE OR REPLACE FUNCTION public.get_mcn_carpool_passengers(p_carpool_id UUID)
RETURNS TABLE (passenger_name TEXT, passenger_flat TEXT, seats INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.rider_name, r.flat_number, r.seats_requested
  FROM public.mcn_carpool_requests r
  JOIN public.mcn_carpools c ON c.id = r.carpool_id
  WHERE r.carpool_id = p_carpool_id
    AND r.status = 'accepted'
    AND c.community_id = public.get_user_community_id()
  ORDER BY r.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_mcn_carpool_passengers(UUID) TO authenticated;
```

Note what it deliberately omits: **`rider_phone` is not returned.** Names and flat numbers are the coordination signal; phone numbers are not, and leaking them past the host would be a real regression. OUT params are again named to avoid shadowing.

Then drive the "Confirmed Co-Passengers" card (lines 455-479) from this RPC instead of the RLS-filtered `requests` array.

If the product decision goes the other way, delete the card's public framing and gate the whole block on `isOwner`.

### Task 2.8 — Surface fetch failures (finding 20)

- `index.tsx:84` — add `Toast.show({ type: 'error', text1: 'Could not load rides' })` and a `loadError` state so the empty list can say "Something went wrong" with a retry, not "Be the first resident to offer a carpool!".
- `[id].tsx:93` — replace `if (!reqErr)` with a real error branch and a toast. A host must never see "No join requests yet" because a query failed.

### Phase 2 acceptance criteria

§C rows H7, H19, H24 (partially), H25, N30, N31, N32, N33, N34, N37 flip to pass. Additionally: a rider receives a notification within seconds of acceptance; cancelling a ride cancels its bookings **and** notifies every confirmed rider; a lead cancelling someone else's ride does not raise.

---

## D.3 — Phase 3: model, validation, and data quality

**Closes findings 13, 14, 15, 16, 17, 18, 19, 21, 25.**

### Task 3.1 — Trip dates and expiry (finding 14) — the largest item, give it its own change set

Migration `20260829000000_carpool_trip_dates.sql`:

```sql
ALTER TABLE public.mcn_carpools
  ADD COLUMN IF NOT EXISTS trip_date DATE;   -- NULL = recurring, driven by recurring_days

COMMENT ON COLUMN public.mcn_carpools.trip_date IS
  'Local calendar date for a one-off trip. NULL means the ride recurs on recurring_days.';

CREATE INDEX IF NOT EXISTS mcn_carpools_trip_date_idx
  ON public.mcn_carpools (community_id, trip_date) WHERE trip_date IS NOT NULL;
```

- Store as a **local calendar date (`YYYY-MM-DD`)**, never a timestamp — `docs/CLAUDE.md` §3 exists because timestamps roll back a day across timezones.
- Publish form: a "Recurring / one-off" toggle. One-off reveals a `@react-native-community/datetimepicker` date field and hides the weekday chips; recurring does the reverse. Reject a past date.
- List: order by trip date then departure time, not `created_at`. Add a "Departing soon" grouping or at minimum a date chip on one-off cards.
- Add a **"Mark trip completed"** control to Host Controls, writing `status = 'completed'` — today nothing in the app can produce that status even though the CHECK constraint allows it.
- Add an expiry job flipping past-dated non-recurring `active` rides to `completed`. Model it on `supabase/functions/check_due_services/`.
- **`renderStatusBadge` (`index.tsx:113`) has no `completed` case and returns `null`.** Add one in a neutral grey. On the detail screen, the ternary at lines 315-322 paints anything that is not active/paused in the *cancelled* red — give `completed` its own branch.
- Exclude `completed` from the network tab's active count (`app/(tabs)/network.tsx:58-62`).

### Task 3.2 — Time entry (finding 13) · `add.tsx`

Replace all four raw `TextInput`s (lines 285-291, 318-324, 385-391, 418-424) with `@react-native-community/datetimepicker`, already a dependency used by visits, reminders, and drops. Keep the web `<select>` path or extract a shared `TimePicker12` component with a `.web.tsx` sibling — `docs/CLAUDE.md` §3 prefers a platform-specific file over branching inside a render tree.

Until the picker lands, at minimum clamp on blur: hour to 01-12, minute to 00-59, zero-padded, never empty.

Consider migrating `departure_time` / `return_time` from `TEXT` to `TIME` once entry is guaranteed valid. **Only after** you have cleaned the existing rows — the audit in 1.1 will show whether any are malformed.

### Task 3.3 — Phones and flat numbers (finding 15)

Import `isValidIndianMobile` and `normalizeIndianMobile` from `lib/phone.ts` in both `add.tsx` and `[id].tsx`.

- `add.tsx:87` — replace the hand-rolled `replace(/[^0-9]/g,'').length < 10` with `isValidIndianMobile(contactPhone)`. Store `normalizeIndianMobile(contactPhone)`.
- `[id].tsx:171` — add the same check for `riderPhone`; today any single character passes. Store normalized.
- `[id].tsx:258` — delete the `cleanPhone.length === 10 ? …` special case. Normalize first, then always prefix `91`. That is what fixes `09876543210` and multi-number strings.
- Flat number in the join modal: uppercase and strip spaces/hyphens on blur. Change the placeholder from `"e.g. Tower 2 - 402"` to `A101` — the hyphenated example is explicitly against convention.

Add a backfill to a migration normalizing existing `mcn_carpools.contact_phone` and `mcn_carpool_requests.rider_phone` to bare 10-digit form where they parse, leaving the rest untouched and listed in the migration comment.

### Task 3.4 — Pricing (findings 16, 17) · migration + `add.tsx` + `[id].tsx` + `index.tsx`

```sql
ALTER TABLE public.mcn_carpools
  ADD COLUMN IF NOT EXISTS price_per_seat_amount NUMERIC(10,2);

UPDATE public.mcn_carpools
SET price_per_seat_amount = NULLIF(regexp_replace(price_per_seat, '[^0-9.]', '', 'g'), '')::NUMERIC
WHERE pricing_type = 'paid'
  AND price_per_seat IS NOT NULL
  AND price_per_seat !~ '^[^0-9]*$';

ALTER TABLE public.mcn_carpools
  ADD CONSTRAINT mcn_carpools_price_positive
  CHECK (price_per_seat_amount IS NULL OR price_per_seat_amount >= 0);
```

Keep the old TEXT column for one release, then drop it in a follow-up. Migrating in two steps avoids a window where the deployed client reads a column that no longer exists.

- Render with the **`Rupees`** component (`components/Rupees.tsx`, props `{ amount: number, size?, tone?, showSign? }`) — `docs/CLAUDE.md` §4 lists it under "reuse instead of re-implementing" and it handles `en-IN` comma grouping.
- Show the computed total in the join modal: `₹50 × 3 seats = ₹150`. Today a rider is never shown what the ride costs them.
- Stop writing `'Free'` and `'Paid'` as magic strings into a price column; `pricing_type` already carries that.
- **Hide the entire pricing block for `role_type === 'seeking'`** in `add.tsx` (mirror the `roleType === 'offering' &&` gate already on vehicle details at line 600), and on the cards and detail grid. A ride *request* showing a green "Free Ride" badge is nonsense.

### Task 3.5 — Small correctness (findings 18, 19, 21, 25)

| Finding | File | Change |
|---|---|---|
| 18 | `[id].tsx:368` | Role-aware label: `Capacity` for offering, `Seats needed` for seeking — the list screen already does this at line 351 |
| 19 | `add.tsx:35`, `[id].tsx:53-55` | `useState` initializers run once and `AuthContext` loads `profile` in a second phase. Add a `useEffect` backfilling contact phone / rider name / flat when `profile` arrives **and the field is still untouched** — do not clobber typing in progress |
| 21 | `[id].tsx:634` | Add `onRequestClose={() => setShowJoinModal(false)}` for the Android hardware back button, plus a `Pressable` overlay that dismisses on tap |
| 25 | `index.tsx:72-75` | "My Carpools" = created **or** joined. Read the user's `mcn_carpool_requests` rows (`rider_id = user.id`, status `pending`/`accepted`), then `.or()` on `created_by` plus `id.in.(…)`. Badge joined rides distinctly from hosted ones |

Also finding 22 (leads): make the three gates agree. Recommended split — Host Controls `isOwner || isCommunityLead`; Join Requests panel `isOwner` only (a lead cannot read those rows under RLS anyway, so showing the panel would render a permanent false empty); join button `!isOwner && !isCommunityLead`, so a lead moderating a ride is not also offered a seat on it.

---

## D.4 — Phase 4: Verandah conformance and product gaps

### Task 4.1 — Verandah pass (finding 23)

Work file by file; this is mechanical but touches ~40 sites.

1. **Colors.** Every hex in §A finding 23 binds to a `Verandah` token from `constants/Colors.ts`. The status and role palettes want proper soft `success` / `warning` / `danger` tokens rather than a dozen literals — check whether `constants/Colors.ts` already exposes them and add them there if not. **Do not** invent per-screen color constants.
2. **Shadows.** Delete `shadowColor` / `shadowOffset` / `shadowOpacity` / `shadowRadius` / `elevation` from `index.tsx:604-608` (`fab`) and `add.tsx:679-682` (`roleBtnActive`). Replace with a `0.5px` hairline border in `Verandah.border`.
3. **Uppercase.** Remove `textTransform: 'uppercase'` from `index.tsx:499`, `add.tsx:708`, `[id].tsx:776`, `[id].tsx:1027`, and the inline styles at `[id].tsx:554` and `599`. Remove `.toUpperCase()` at `[id].tsx:321`. Only `sectionLabel` is uppercase.
4. **Font weights.** Reduce `'700'` occurrences to the `VerandahType` token weights.
5. **Emoji.** `[id].tsx:429` interpolates `📞` into the host line — replace with an `Ionicons` `call-outline` glyph at `Verandah.textTertiary`.
6. **Copy.** Rewrite all user-facing strings to sentence case: "Route title / summary", "Publish ride offer", "Missing start point", "Request a seat", "Host controls", "Your booking status", "Confirmed co-passengers".
7. **Font sizes.** Replace `10`/`11`/`12`/`13`/`15` literals with `VerandahType` tokens where one fits.
8. Anything that genuinely cannot conform gets an entry in the **Out-of-Register Appendix** of `docs/verandah.md` with path, deviation, reason, and follow-up owner. That appendix currently reads "None recorded in this revision" while this feature has ~40 deviations.

### Task 4.2 — Scale (finding 24) · `index.tsx`

Add `.limit()` and pagination. Extend search to `notes` and the host's name. When row counts justify moving search server-side, it **must** debounce 300 ms into a separate `debouncedSearchQuery` state, and *that* state goes in the fetch dependency array — never the raw input. Add sort and filter controls (departure, day, price, seats remaining) once `trip_date` exists from 3.1.

### Task 4.3 — Trust and safety (finding 26) — product decision required first

Do not build these without a product call. Listed so they are not lost:

- **Women-only / gender-preference flag** — table stakes for Quick Ride and sRide in this market, and this app is India-targeted (₹, TS plates).
- **Two-way ride ratings** — reuse the `hire_feedback` shape.
- **Report / block** — reuse the listing spam controls from `20260821000000`.
- **Require vehicle details on offering rides** — currently optional free text, so a ride can be published with no plate and no description.
- **Contact-detail privacy** — the host's phone renders in plain text to every resident who opens the ride (`[id].tsx:426-431`), regardless of booking status. Standard practice reveals it on confirmation. In a gated community, public may be the right answer — but make it a decision rather than a default.

---

## D.5 — Documentation updates (same change set, non-negotiable)

`docs/CLAUDE.md` §7: route each fact to exactly **one** owning file. Duplicating across files is what caused the last round of drift. Do not restate schema columns in `features.md`.

| What changed | Goes in |
|---|---|
| `available_seats` is now immutable capacity; `get_mcn_carpool_seats`, `get_mcn_carpool_passengers`; the four new triggers; the `WITH CHECK` on `mcn_carpools_update`; `mcn_carpool_requests_one_open_idx`; `trip_date`; `price_per_seat_amount`; the three notification triggers | `docs/architecture.md` §4.7 (tables), §6 (RPCs), §7 (triggers/RLS) |
| Edit flow; not-found state; seeking-post controls; re-request after decline; roster visibility; seat "N of M left"; trip dates and completion; pricing display and totals | `docs/features.md` §4.4 |
| New traps discovered — at minimum *"Carpool capacity is trigger-enforced; never adjust `available_seats` from the client"* and *"Cascading a ride cancellation fires the request-transition trigger; leads need an explicit branch"* | `docs/CLAUDE.md` §9 |
| Any Verandah deviation that survives Phase 4 | `docs/verandah.md` appendix |
| No new routes expected — edit uses `?id=` on the existing `/mcn/carpools/add` | `docs/architecture.md` §9 only if that changes |

**Two corrections are needed in `docs/features.md` §4.4 regardless of what gets built**, because they describe behavior that does not exist:
1. *"**Creator or lead** can edit"* — there is no edit path today (finding 6). Either build it in 2.3 or strike the claim.
2. *"one open request per rider per ride"* — unenforced until 1.2(5) lands (finding 9).

No federation objects are touched, so `docs/cross-community-changelog.md` needs no entry.

---

## D.6 — Sequencing and risk

| Phase | Ship | Risk if deferred | Risk of the change itself |
|---|---|---|---|
| **1** | Immediately, alone | Rows are being corrupted now; finding 5 is exploitable from a browser console today | Medium — the repair in 1.2(1) is best-effort and imprecise for carpools that went through a release cycle. Run the 1.1 audit and archive it first |
| **2** | Next | The feature cannot be used for coordination: half of posts cannot be withdrawn, riders are never told they were accepted, and a deleted link strands the user | Medium — the cascade in 2.5 interacts with the transition trigger from 1.2(4). Test lead-initiated cancellation explicitly |
| **3** | Own change set for 3.1; the rest can ride along | Outstation trips remain inexpressible and nothing ever expires | Low, except the `price_per_seat` type change — migrate in two steps and keep the old column for one release |
| **4** | With the next design sweep; 4.3 needs a product call first | Cosmetic and strategic, not functional | Low |

**Do not reorder.** Phase 2's edit flow writes `available_seats`, which is only safe once Phase 1's immutables trigger is guarding it. Phase 3's date model changes the list ordering that Phase 2's notifications deep-link into.
