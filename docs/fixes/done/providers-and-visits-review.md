# Providers & Visits (Help tab) — Detailed Review, Bug Report & Fix Plan

**Date:** 2026-08-08
**Status:** Audit complete. Nothing in the repo was changed by this pass — this document is the only file created.

**Scope (every file the feature touches):**
`app/(tabs)/index.tsx` (the Help tab — both segments) · `app/provider/add.tsx` · `app/provider/[id].tsx` · `app/visits/add.tsx` · `app/visits/[id].tsx` · `components/ProviderCard.tsx` · `components/VisitCard.tsx` · `components/ProviderSelector.tsx` · `components/CategoryFilter.tsx` · `components/VisitStatusBadge.tsx` · `components/JoinerListItem.tsx` · `components/Rupees.tsx` · `lib/navigation.ts` · `lib/phone.ts` · `lib/supabase.ts` · `context/AuthContext.tsx` · `app/notifications.tsx` · `constants/categories.ts` · `constants/providerDetails.ts` · migrations `00000_init.sql`, `20260415000000_enhance_trust_and_funds.sql`, `20260416100000_add_service_visits.sql`, `20260417000000_add_notifications.sql`, `20260417100000_visits_show_cancelled.sql`, `20260417300000_fix_provider_rating_trigger.sql`, `20260418000000_visits_past_support.sql`, `20260418100000_fix_visits_overload.sql`, `20260418210000_onboarding_approval.sql`, `20260427000000_fraud_detection.sql`, `20260429113000_enforce_unique_provider_phone_per_community.sql`, `20260503120000_fix_trigger_security_definer.sql`, `20260503120100_fix_ratings_select_policy.sql`, `20260507000000_cross_community_foundation.sql`, `20260606170000_provider_reports.sql`, `20260606181000_fix_is_community_lead.sql`, `20260606193000_provider_personal_notes.sql`, `20260606194500_allow_residents_view_reports.sql`, `20260607113000_notify_visit_reschedule.sql`, `20260607194000_fix_provider_insert_policy.sql`, `20260822000000_repoint_dead_community_lead_checks.sql`

**Baseline:** `npx tsc --noEmit` **passes clean** before any change (verified 2026-08-08). There is no test framework and no lint script in this repo.

**Method.** Every user path (list → filter → search → add provider → provider detail → rate → report → delete → plan visit → visit detail → join → leave → change status → share) was traced from the input control through client validation, through the network call, into the live RLS policy and trigger, and back out to the re-render. In addition to reading code and migrations in filename order, I ran **read-only** diagnostics against the live Supabase project (`mbzvcaoulawdugfearmj`) — `pg_policies`, `pg_proc`, `pg_constraint`, `pg_trigger`, row counts — and **signed in over the REST API as the resident test account and as no account at all** to reproduce behaviour. No `INSERT`/`UPDATE`/`DELETE`/DDL was executed, and `supabase db push` was never run.

Each finding is tagged:

- **[live]** — reproduced against the running Supabase project during this audit; the actual output is pasted in.
- **[code]** — provable from the source and the live schema as written; no runtime step needed to believe it.
- **[runtime]** — high-confidence inference that should be confirmed with a click-through before it is closed.

**Result: 26 findings — 4 blocking, 16 high, 6 minor.**

---

## READ THIS FIRST — rules for the implementing agent

1. **Read [`CLAUDE.md`](../../CLAUDE.md) and [`docs/CLAUDE.md`](../CLAUDE.md) before you touch anything.** §9 of the latter names five of the traps in this document by name; you are about to walk into them again if you skip it.

2. **`npx tsc --noEmit` is the only automated gate, and it will not catch a single finding in this document.** Every issue here is a runtime, RLS, platform, or data-shape defect that type-checks perfectly today. The [VERIFICATION](#verification) checklist is not optional — it is the only thing standing between this plan and a regression.

3. **After touching `supabase/migrations/`, finish the loop yourself:**
   ```
   npm run db:push
   npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj
   # then RE-APPEND the hand-maintained enriched-types block at the bottom of
   # lib/database.types.ts (ProviderWithInteraction / VisitWithJoinerData /
   # VisitJoinerWithProfile) — gen types overwrites the whole file. See docs/CLAUDE.md §6.
   npx tsc --noEmit
   ```
   Skipping step 3 wipes `ProviderWithInteraction`, `VisitWithJoinerData`, and `VisitJoinerWithProfile`, and every screen in this feature imports at least one of them.

4. **The SQL in this document is a specification, not tested code.** It was written against the live schema read out of `pg_policies` / `pg_proc` / `pg_constraint`, but it has never been executed. Read it before you run it.

5. **Two steps rewrite live resident data. Run them dry-run-first.**
   - **M2 §3** back-fills stale `service_visits.status`. The `SELECT` that shows you exactly which rows will change is written out immediately above the `UPDATE`. Run it, eyeball the count (it was **4** on 2026-08-08), then run the `UPDATE`.
   - **M2 §1** adds `CHECK (max_joiners >= 1)`. The pre-flight `SELECT` for violating rows is written out above it. If it returns rows, fix them before adding the constraint or the `ALTER TABLE` will fail.

6. **Scope boundary — shared files you may touch only narrowly.**
   - `lib/navigation.ts` — **add two route mappings inside `getImmediateParentRoute()` and nothing else.** Do not restructure the function, do not touch `goBackSmart()`, `useSyncedBackNavigation()`, or the stack helpers. Other features depend on all of them.
   - `app/notifications.tsx` — **add two `case` labels and one `if` block.** Do not reorganise the routing chain.
   - `lib/database.types.ts` — **regenerate only.** Never hand-edit (`docs/CLAUDE.md` §2.3).
   - `components/Rupees.tsx`, `components/Avatar.tsx`, `components/BaseCard.tsx` — **do not modify.** Issue 18 is fixed at the call site, not in `Rupees`.
   - Do not touch `app/services/*`, `app/mcn/*`, or the funds module. They are cited here only as examples of what "right" already looks like.

7. **Federation is deferred, NOT removed. Do not delete any of it.** The cross-community backend is live, deliberately retained for a future implementation, and every object below must survive this change set intact. Read [`cross-community.md`](../cross-community.md) and [`decisions/0001-additive-rls-for-cross-community.md`](../decisions/0001-additive-rls-for-cross-community.md) before touching anything in the table.

   **Inventory this feature intersects — all verified live on 2026-08-08. Preserve every row.**

   | Object | Kind | Must survive as |
   |---|---|---|
   | `service_visits_select_cross_community` | RLS policy (`SELECT`, `USING can_user_see_visit(id)`) | Untouched. It is **permissive and additive** — it unions with `Community members can view visits`. Never fold the two together. |
   | `service_providers_select_cross_community` | RLS policy (`SELECT`, `USING can_user_see_provider(id)`) | Untouched |
   | `can_user_see_visit(p_visit_id, p_user_id DEFAULT auth.uid())` | `STABLE SECURITY DEFINER`, `search_path` pinned | Untouched — **and M1 now calls it** (see D17) |
   | `can_user_see_provider(p_provider_id, p_user_id DEFAULT auth.uid())` | `STABLE SECURITY DEFINER`, `search_path` pinned | Untouched |
   | `get_user_partner_community_ids(p_capability, p_user_id)` | `STABLE SECURITY DEFINER`, returns `SETOF uuid` | Untouched — **and M1 now calls it** |
   | `service_visits.is_cross_community` | column | Untouched. M2's `community_id` pin does **not** affect it — a cross-community visit is still *owned* by one community and *shared* through `service_visit_communities`. |
   | `service_visit_communities`, `provider_shares`, `community_partnerships`, `community_groups`, `community_group_members` | tables | Untouched |
   | `service_providers.visibility`, `service_providers.shared_by_community_id` | columns | Untouched |

   **The three rules that govern any change you make near these:**
   - **Additive only.** Add permissive `SELECT` policies that union with existing ones; never rewrite a single-community policy into a federation-aware one.
   - **Never modify `get_user_community_id()` for federation behaviour** — use `get_user_partner_community_ids()` (`docs/CLAUDE.md` §5).
   - **M1 and M2 both touch federation-visible behaviour**, so an entry in [`cross-community-changelog.md`](../cross-community-changelog.md) is **mandatory in the same change set**. See [DOCUMENTATION UPDATES](#documentation-updates) for the exact text.

   Nothing in this plan deletes, disables, or narrows any federation object. M1 makes the two visit RPCs *more* federation-aware than they are today; M2 only replaces the two **single-community** `UPDATE`/`DELETE` policies, which have no federation counterpart.

---

## Severity summary

| # | Finding | Sev | Area | Tag | Fixed by |
|---|---------|-----|------|-----|----------|
| 1 | `get_community_visits` / `get_visit_joiners` hand every visit, provider phone, neighbour name and flat number to **anyone on the internet**, no login | **P0** | DB (RPC) | live | [M1](#m1--lock-down-the-two-visit-rpcs-issues-1-4) |
| 2 | `auto_complete_past_visits()` is a **write** endpoint executable by `anon` | **P0** | DB (RPC) | live | [M1](#m1--lock-down-the-two-visit-rpcs-issues-1-4) |
| 3 | Delete provider is completely inert on the PWA — `Alert.alert` is a web no-op | **P0** | Client | code | [C2](#c2--appproviderid-tsx) |
| 4 | A deleted / foreign / mistyped provider id strands the user on an **infinite spinner with no back button** | **P0** | Client | code | [C2](#c2--appproviderid-tsx) |
| 5 | Reschedule is fully built, documented, and **has no button** — the notification trigger is dead with it | P1 | Client + docs | code | [C4](#c4--appvisitsidtsx) |
| 6 | Visits are never completed server-side; a past visit can never be marked complete by its host | P1 | DB + Client | live | [M2](#m2--visit-capacity-lifecycle-and-integrity-issues-6-7-19-20), [C4](#c4--appvisitsidtsx) |
| 7 | `max_joiners` is enforced **only in the UI** — no trigger, no constraint | P1 | DB | live | [M2](#m2--visit-capacity-lifecycle-and-integrity-issues-6-7-19-20) |
| 8 | Visit detail loses "have I joined?", offers Join to someone already joined, then shows a raw Postgres error | P1 | Client | live | [C4](#c4--appvisitsidtsx) |
| 9 | Every WhatsApp link is malformed — bare 10-digit numbers, no country code | P1 | Client | code | [C2](#c2--appproviderid-tsx), [C4](#c4--appvisitsidtsx) |
| 10 | A visit created from an existing provider **never** carries a WhatsApp number (no such column) | P1 | Client | code | [C3](#c3--appvisitsaddtsx--componentsproviderselectortsx) |
| 11 | Provider search 400s on a comma, and cannot search by phone at all | P1 | Client | live | [C1](#c1--apptabsindextsx) |
| 12 | Community leads cannot moderate visits at all; visit `UPDATE` does not pin `community_id` | P1 | DB (RLS) | live | [M2](#m2--visit-capacity-lifecycle-and-integrity-issues-6-7-19-20), [C4](#c4--appvisitsidtsx) |
| 13 | Header back arrow is dead on any deep-linked provider or visit; Android back lands on the MCN hub | P1 | Client + nav | code | [C5](#c5--libnavigationts-narrow-edit) |
| 14 | Favorite toggles never roll back on failure — the `catch` is unreachable | P1 | Client | code | [C1](#c1--apptabsindextsx), [C2](#c2--appproviderid-tsx) |
| 15 | A failed fetch renders as "No Providers Found — be the first!" | P1 | Client | code | [C1](#c1--apptabsindextsx) |
| 16 | Cancel Visit and Mark as completed fire on one tap, no confirm, no undo | P1 | Client | code | [C4](#c4--appvisitsidtsx) |
| 17 | Share on the visit detail is a silent no-op on desktop web | P1 | Client | code | [C4](#c4--appvisitsidtsx) |
| 18 | "₹300-500" is rendered to neighbours as **₹3,00,500** | P1 | Client | live | [C4](#c4--appvisitsidtsx) |
| 19 | `provider_reported` says "Tap to review" and routes nowhere; `visit_rescheduled` likewise | P1 | Client | live | [C6](#c6--appnotificationstsx-narrow-edit) |
| 20 | "Homes used" counts button taps, not homes — every Call/WhatsApp tap inserts a hire | P1 | Client | code | [C2](#c2--appproviderid-tsx) |
| 21 | `visit_time_slot` is unvalidated free text; live data contains `08:50 am - 07:50 am` | P2 | DB + Client | live | [M2](#m2--visit-capacity-lifecycle-and-integrity-issues-6-7-19-20) |
| 22 | A negative `max_joiners` locks a visit as "Visit Full" forever | P2 | Client + DB | code | [M2](#m2--visit-capacity-lifecycle-and-integrity-issues-6-7-19-20), [C3](#c3--appvisitsaddtsx--componentsproviderselectortsx) |
| 23 | A resident with no `full_name` cannot create a visit at all | P2 | DB | code | [M2](#m2--visit-capacity-lifecycle-and-integrity-issues-6-7-19-20) |
| 24 | Unbounded queries: all visits, all joiners, all 171 providers; search filters client-side | P2 | Client | live | [C7](#c7--scale-and-hygiene) |
| 25 | The visit provider picker shows fraud-flagged providers the Help tab hides | P2 | Client | code | [C3](#c3--appvisitsaddtsx--componentsproviderselectortsx) |
| 26 | Verandah violations — raw hex, shadows, `fontWeight: 700`, uppercase body titles | P2 | UI | code | [C8](#c8--verandah-cleanup) |

---

# PART 1 — FINDINGS

# P0 — blocks real use

## 1. Two `SECURITY DEFINER` RPCs hand every visit — and every neighbour's flat number — to anyone on the internet

**[live]** This is the most serious finding in the document, and it needs no login at all.

`supabase/migrations/20260418100000_fix_visits_overload.sql` (the final definition):

```sql
CREATE OR REPLACE FUNCTION get_community_visits(
  p_community_id UUID,          -- <- caller-supplied, never checked against auth.uid()
  p_user_id UUID,               -- <- caller-supplied, never checked against auth.uid()
  ...
  WHERE sv.community_id = p_community_id
  ...
$$ LANGUAGE plpgsql SECURITY DEFINER;   -- no SET search_path, no authorization
```

`supabase/migrations/20260416100000_add_service_visits.sql` does the same for `get_visit_joiners(p_visit_id UUID)`.

Both are `SECURITY DEFINER`, so they run as the owner and **bypass RLS entirely**. Neither performs a single authorization check. Postgres grants `EXECUTE` on new functions to `PUBLIC` by default, and Supabase exposes every `public` function over PostgREST — so both are reachable with nothing but the anon key, which ships inside the public web bundle.

Live catalogue read (`pg_proc`, 2026-08-08):

| function | `prosecdef` | `search_path` | grantees |
|---|---|---|---|
| `get_community_visits(uuid,uuid,text,text)` | **true** | **(none)** | `PUBLIC, anon, authenticated, postgres, service_role` |
| `get_visit_joiners(uuid)` | **true** | **(none)** | `PUBLIC, anon, authenticated, postgres, service_role` |

Reproduced with **no session — anon key only, exactly what a stranger with devtools has**:

```
--- ANON: GET /service_visits (direct table) ---
{ "status": 200, "body": [] }                      <-- RLS works. The table is safe.

--- ANON: RPC get_community_visits(IRA Aspiration, time_scope=past) ---
{ "status": 200, "count": 6, "rows": [
    { "title": "Electrician", "provider_name": "Raju Electrician Kollur",
      "provider_phone": "7070708208", "creator_name": "ira",
      "creator_flat": "A123", "visit_date": "2026-07-31", "status": "completed" },
    ... 5 more ...
]}

--- ANON: RPC get_visit_joiners(Electrician) ---
{ "status": 200, "rows": [
    { "user_name": "Ira3", "flat_number": "A113", "note": null,
      "joined_at": "2026-07-30T17:02:31.155449+00:00" }
]}
```

The direct table read returns `[]` — RLS is doing its job. **The entire leak is the two RPCs.**

What escapes: for every visit in every community — the service provider's name and **mobile number**, the host's **full name and flat number**, the title, description, date, time and estimated cost; and for every visit — each joiner's **full name, flat number, free-text note, and join timestamp**.

Two multipliers make this worse than a single-tenant leak:

- **`p_community_id` is a parameter, not a derived value.** The function will happily serve any community you name.
- **`communities` is still `FOR SELECT USING (true)`** — verified live in `pg_policies`, and reproduced anonymously above: the anon key returns every community's `id`, `name`, and **join `code`**. So the caller does not need to guess anything. Today the pilot database holds exactly **1** community, which bounds the blast radius *right now*; the moment a second community exists, one anonymous HTTP call per community dumps the lot.

Resident impact, in plain language: a stranger who opens the PWA, presses F12, and copies one key out of the JavaScript bundle can print a list of which flat in which gated society is having a plumber visit on which date, who else is joining, and the plumber's phone number. For a gated-community product this is the single thing residents would least expect to be public.

**How the rest of the codebase already does this correctly.** `20260830000100_fix_profiles_select_leak.sql` closed exactly this class of hole on `profiles` eight days ago. And `docs/CLAUDE.md` §5 already says every `SECURITY DEFINER` function must be pinned with `SET search_path` — both of these predate that rule and were never revisited.

## 2. `auto_complete_past_visits()` is a mass-update endpoint that any anonymous caller can fire

**[live]** From the same `pg_proc` read:

| function | `prosecdef` | `search_path` | grantees |
|---|---|---|---|
| `auto_complete_past_visits()` | **true** | **(none)** | `PUBLIC, anon, authenticated, postgres, service_role` |

`supabase/migrations/20260416100000_add_service_visits.sql`:

```sql
CREATE OR REPLACE FUNCTION auto_complete_past_visits()
RETURNS void AS $$
BEGIN
  UPDATE service_visits
  SET status = 'completed', updated_at = now()
  WHERE status = 'upcoming' AND visit_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

This is not a read. It is an unconditional `UPDATE` across **every community on the platform**, running as the function owner with RLS bypassed, exposed at `POST /rest/v1/rpc/auto_complete_past_visits` to `anon`.

I did **not** invoke it — that would have mutated live rows, which rule 3 of this audit forbids. The finding rests on the catalogue read above plus the fact that PostgREST exposes every `public` schema function; both are independently checkable.

It is also **dead**: `pg_cron` is not installed on this project (`SELECT count(*) FROM pg_extension WHERE extname='pg_cron'` → **0**), nothing in `supabase/functions/` calls it, and nothing in `app/` calls it. So it does no work for the product and exists purely as an attack surface. See issue 6 for the consequence of it never running.

## 3. On the PWA, "Delete provider" does nothing at all — and on native it reports success even when it fails

**[code]** [`app/provider/[id].tsx:563-577`](../../app/provider/[id].tsx#L563-L577):

```tsx
const handleDelete = () => {
  if (!provider || !canDelete) return;
  Alert.alert('Delete Provider', 'Are you sure you want to delete this provider? …', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
       try {
         await supabase.from('service_providers').delete().eq('id', provider.id);
         Toast.show({ type: 'success', text1: 'Deleted successfully' });
         router.back();
       } catch(e) {
         Toast.show({ type: 'error', text1: 'Delete failed' });
       }
    } }
  ]);
};
```

Two independent defects in nine lines.

**(a) `Alert.alert` is a no-op on web.** This is trap #4 in `docs/CLAUDE.md` §9, verbatim: *"`Alert.alert` for a web confirmation → No-op on web. Split on `Platform.OS`."* A president opens the PWA, taps **Delete provider**, and **nothing happens** — no dialog, no toast, no error, no console warning. There is no other delete affordance anywhere in the feature. Deleting a spam or fraudulent provider is the single moderation power a community lead has over this module, and on the surface they are most likely to use it from (a laptop, reviewing reports), it is completely inert.

The same file already knows how to do this properly — [`app/visits/[id].tsx:278-293`](../../app/visits/[id].tsx#L278-L293) branches on `Platform.OS` and uses `window.confirm` for "Leave visit". The pattern exists; the delete path just never got it.

**(b) The delete result is never read.** `supabase-js` **returns** errors in `{ data, error }`; it does not throw. So `catch` is unreachable and the success toast fires unconditionally. This is trap *"Destructuring only `data` from a Supabase call"* in `docs/CLAUDE.md` §9 — here not even `data` is destructured. If RLS matches zero rows (a resident who reaches this by any means, an unapproved lead, a cross-community id) the user sees **"Deleted successfully"**, is navigated away, and the provider is still there when they scroll back.

Live RLS confirms the *policy* is correct — `Leads and admins can delete providers` USING `is_user_approved(auth.uid()) AND (is_platform_admin(auth.uid()) OR (is_community_lead(auth.uid()) AND community_id = get_user_community_id()))`, and `is_community_lead('50d837bf-…')` → `true` for the president test account. So the failure mode is entirely client-side reporting, not permissions.

## 4. A deleted, foreign, or mistyped provider id strands the resident on an infinite spinner with no way out

**[code]** [`app/provider/[id].tsx:112-116`](../../app/provider/[id].tsx#L112-L116):

```tsx
const providerQuery = supabase
  .from('service_providers')
  .select('*')
  .eq('id', id)
  .single();          // <- throws on zero rows
```

[`app/provider/[id].tsx:153-159`](../../app/provider/[id].tsx#L153-L159):

```tsx
} catch (error: any) {
  Toast.show({ type: 'error', text1: 'Error', text2: 'Provider not found' });
  router.back();
} finally {
  setLoading(false);
}
```

[`app/provider/[id].tsx:579-585`](../../app/provider/[id].tsx#L579-L585):

```tsx
if (loading || !provider) {
  return (<View …><ActivityIndicator size="large" … /></View>);
}
```

Chain it together. `.single()` throws (`docs/CLAUDE.md` §9: *"`.single()` on a possibly-absent row → Throws. Use `.maybeSingle()`"*). The catch fires `router.back()` — which is **a no-op when there is no history to pop**, i.e. exactly the deep-link case. `loading` becomes `false`, `provider` stays `null`, and the guard on line 579 renders **a spinner forever**, with no back button, no message, and no explanation.

This is reachable on the most ordinary path in the feature: **the app itself shares `/provider/<id>` links.** [`components/ProviderCard.tsx:22-25`](../../components/ProviderCard.tsx#L22-L25) and [`app/provider/[id].tsx:237-240`](../../app/provider/[id].tsx#L237-L240) both build a shareable provider URL and put it in a WhatsApp message. A neighbour taps that link a week after a lead deleted the provider, or a resident of another society taps it — and gets a permanent spinner.

`app/visits/[id].tsx` has the same `.single()` at [line 190](../../app/visits/[id].tsx#L190); it degrades slightly better (a "Visit not found" string at [lines 361-367](../../app/visits/[id].tsx#L361-L367)) but still offers no back button and no navigation.

The global bottom nav (`components/GlobalBottomNav.tsx`, rendered once in `app/_layout.tsx`) is the only escape, and on the provider screen the spinner covers the whole viewport above it.

---

# P1 — high

## 5. Rescheduling a visit is fully built, fully documented — and has no button

**[code]** [`app/visits/[id].tsx:110-118`](../../app/visits/[id].tsx#L110-L118) defines `handleOpenReschedule`, the only thing that ever calls `setShowRescheduleModal(true)`. A repo-wide search for its call sites:

```
$ grep -rn "handleOpenReschedule|showRescheduleModal|rescheduleBtn" app/ components/
app/visits/[id].tsx:72:   const [showRescheduleModal, setShowRescheduleModal] = useState(false);
app/visits/[id].tsx:110:  const handleOpenReschedule = () => {
app/visits/[id].tsx:608:  <Modal visible={showRescheduleModal} …>
app/visits/[id].tsx:1098: rescheduleBtn: {
app/visits/[id].tsx:1105: rescheduleBtnText: {
```

`handleOpenReschedule` is **never invoked**. `styles.rescheduleBtn` and `styles.rescheduleBtnText` are **never applied**. The 190-line reschedule modal at [lines 608-795](../../app/visits/[id].tsx#L608-L795) — with its full web/native date and time picker split, its `endMins <= startMins` validation, and its `handleReschedule` writer — is unreachable dead code.

Three things fall over together:

- **Residents cannot reschedule.** A host whose plumber pushes to Thursday has exactly two options: cancel and re-create the visit (losing every joiner, since `visit_joiners` cascades on delete), or leave the wrong date up.
- **`docs/features.md` §2 documents it as working**: *"Only the creator changes status … **or reschedules an upcoming visit**. Rescheduling updates date/time and emits a `visit_rescheduled` notification to other residents. Mark-complete, reschedule, and cancel are visible only while the visit is `upcoming`."* None of the reschedule half is true.
- **A whole migration is dead with it.** `20260607113000_notify_visit_reschedule.sql` creates `handle_visit_rescheduled_notification()` and the `on_service_visit_rescheduled` trigger. The trigger is live on the table (confirmed in `pg_trigger`: `on_service_visit_created, on_service_visit_rescheduled`) and has never fired — the live `notifications` table contains `new_visit` and `provider_reported` rows but **no `visit_rescheduled` row at all**.

## 6. Visits are never actually completed, and a host can never mark a past one done

**[live]** Two halves of the same hole.

**Server side:** `auto_complete_past_visits()` (issue 2) is the only thing that would move `status` from `upcoming` to `completed` on the date rolling over. **`pg_cron` is not installed** (`SELECT count(*) FROM pg_extension WHERE extname='pg_cron'` → `0`), nothing schedules it, and nothing calls it. Live consequence:

```
visits_status_breakdown         completed=1, cancelled=1, upcoming=4
visits_stale_upcoming_in_past   4
```

**Four of the six visits in the database are `status='upcoming'` with a `visit_date` in the past** — permanently, since nothing will ever change them.

**Client side:** the UI papers over it. [`app/(tabs)/index.tsx:263-268`](../../app/(tabs)/index.tsx#L263-L268) computes a display-only `adjustedStatus`, and [`app/visits/[id].tsx:376-379`](../../app/visits/[id].tsx#L376-L379) does the same with `displayStatus`. The badge reads "Completed"; the row still says `upcoming`.

**And the host cannot fix it manually**, because the entire footer is gated on `!isPast` — [`app/visits/[id].tsx:516`](../../app/visits/[id].tsx#L516):

```tsx
{!isPast && (
<View style={styles.footer}>
  {isCreator ? (
      <View style={styles.creatorActions}>
          {visit.status === 'upcoming' && ( … Mark as completed … )}
          {visit.status === 'upcoming' && ( … Cancel Visit … )}
```

Once the date passes there is no **Mark as completed** button anywhere. So the only two paths to a `completed` row — the cron that never runs and the button that disappears — are both closed.

Why a resident cares: the stale `upcoming` status is what `visit_joiners`' INSERT policy keys on (`AND sv.status = 'upcoming'`), so **a stranger can still join a visit that happened six weeks ago**. It also means "how many visits actually happened here" is unanswerable from the data.

## 7. `max_joiners` is enforced only in the UI

**[live]** Live catalogue reads:

```
visit_joiners_check_constraints   one_join_per_user_per_visit :: UNIQUE (visit_id, user_id)
triggers_on_visit_joiners         (none)
service_visits_check_constraints  service_visits_status_check :: CHECK (status = ANY (…))
```

There is **no** `CHECK` on `max_joiners`, **no** trigger on `visit_joiners`, and the INSERT policy checks only community and `status = 'upcoming'` — never capacity. The cap exists in exactly two places, both render-time:

- [`app/visits/[id].tsx:370`](../../app/visits/[id].tsx#L370) — `const isFull = visit.max_joiners ? visit.joiner_count! >= visit.max_joiners : false;`
- [`components/VisitCard.tsx:108`](../../components/VisitCard.tsx#L108) — the identical expression.

Two neighbours on the last seat of a 3-person AC-servicing visit, tapping **Join** within the same few seconds, both succeed. `joiner_count` comes from a fetch that predates both writes, so neither client sees the other. There is no upper bound at all — a host who capped at 3 can end up with 9.

This is trap *"Enforcing capacity only in the UI"* in `docs/CLAUDE.md` §9, which explicitly names the food-drops module as the one that already got burned by it and fixed it with a `SECURITY DEFINER` trigger in `20260823000000`. Visits never got the same treatment.

The related invariant *is* protected: `one_join_per_user_per_visit UNIQUE (visit_id, user_id)` stops double-joining at the database. See issue 8 for how that rejection reaches the resident.

## 8. The visit screen forgets you already joined, offers you Join, and answers with a raw Postgres error

**[live]** [`app/visits/[id].tsx:162-215`](../../app/visits/[id].tsx#L162-L215):

```tsx
const [visitsResult, joinersResult] = await Promise.all([
  supabase.rpc('get_community_visits', {
    p_community_id: profile?.community_id || '',     // <- '' when profile hasn't loaded
    p_user_id: user.id
  }),
  supabase.rpc('get_visit_joiners', { p_visit_id: id })
]);

if (joinersResult.error) throw joinersResult.error;   // <- visitsResult.error is NEVER checked
…
const currentVisit = (visitsResult.data as VisitWithJoinerData[] || []).find(v => v.id === id);

if (!currentVisit) {
  // Fallback: direct fetch
  …
  setVisit({
    ...directData,
    creator_name: …, creator_flat: …, creator_avatar_url: …,
    joiner_count: joinersData.length          // <- has_user_joined is NEVER set here
  });
}
```

`has_user_joined` is produced **only** by the RPC. The fallback branch omits it entirely, so it lands as `undefined`.

Two routes into the fallback, both ordinary:

**(a) The profile race.** [`context/AuthContext.tsx:289`](../../context/AuthContext.tsx#L289) sets `user` from the auth-state listener; `setProfile` does not happen until [line 206](../../context/AuthContext.tsx#L206), after an async profile load. `fetchVisitData` guards only on `user?.id`, so during that window it sends `p_community_id: ''`. Reproduced live:

```
args {"p_community_id":"","p_user_id":"37a8b2f5-…"}
  -> HTTP 400 {"code":"22P02","message":"invalid input syntax for type uuid: \"\""}
```

HTTP 400. `visitsResult.error` is never read, so the failure is silently discarded, `data` is `null`, and execution falls into the fallback.

**(b) Any visit the RPC does not return.** The client calls it with the **defaults** `p_status='upcoming'`, `p_time_scope='upcoming'`. Every cancelled visit, every completed visit, and every past-dated visit therefore misses and takes the fallback. Live, `get_community_visits` with defaults returns **0 rows** for this community even though six visits exist — every single one is past-dated.

What the resident sees: they open a visit they already joined (typically by hard-loading the URL, or from the shared link the app itself generates), and instead of **Leave this visit** they get **Join this visit**. They tap it, and [`app/visits/[id].tsx:256`](../../app/visits/[id].tsx#L256) puts the database's own words in a toast:

```
Error joining
duplicate key value violates unique constraint "one_join_per_user_per_visit"
```

A secondary consequence: on a future-dated **cancelled** visit, the joiner sees no button at all (`has_user_joined` falsy, `status !== 'upcoming'`), so **they cannot leave** and stay on the roster indefinitely.

## 9. Every WhatsApp button in the feature builds a malformed link

**[code]** Phone numbers are stored as **bare 10 digits, no country code**. That is enforced server-side by `20260429113000_enforce_unique_provider_phone_per_community.sql`:

```sql
WHEN RIGHT(regexp_replace(p_value, '\D', '', 'g'), 10) ~ '^[6-9][0-9]{9}$'
  THEN RIGHT(regexp_replace(p_value, '\D', '', 'g'), 10)
```

and client-side by [`lib/phone.ts:15-18`](../../lib/phone.ts#L15-L18) (`normalizeIndianMobile` → last 10 digits). Live sample confirms it: `"phone": "9043629614"`, `"phone": "9392034156"`.

[`app/provider/[id].tsx:221-232`](../../app/provider/[id].tsx#L221-L232):

```tsx
const cleanPhone = provider.phone.replace(/[^0-9]/g, '');   // -> "9876543210"
const url = `whatsapp://send?phone=${cleanPhone}`;
const supported = await Linking.canOpenURL(url);
if (supported) { await Linking.openURL(url); }
else { await Linking.openURL(`https://wa.me/${cleanPhone}`); }
```

[`app/visits/[id].tsx:463`](../../app/visits/[id].tsx#L463):

```tsx
onPress={() => Linking.openURL(`https://wa.me/${visit.provider_whatsapp}`)}
```

`wa.me` and the `whatsapp://` scheme both require a **full international number**. `https://wa.me/9876543210` lands on WhatsApp's *"Phone number shared via url is invalid"* page. The country code `91` is never prepended anywhere in this feature.

Resident impact: WhatsApp is the primary way an Indian resident contacts a service provider, and the green WhatsApp button — on the provider detail and on every visit — takes them to an error page instead. The `tel:` path is unaffected: a bare 10-digit number dials correctly in India.

## 10. A visit created from an existing provider never carries a WhatsApp number, because the column does not exist

**[code]** [`app/visits/add.tsx:169-171`](../../app/visits/add.tsx#L169-L171):

```tsx
const normalizedExistingWhatsapp = selectedProvider?.whatsapp
  ? (normalizeIndianMobile(selectedProvider.whatsapp) ?? selectedProvider.whatsapp)
  : null;
```

**`service_providers` has no `whatsapp` column.** Verified in the generated `lib/database.types.ts:2310-2329` — the full column list is `avg_rating, category, community_id, created_at, created_by, description, details, flat_block, fraud_status, id, is_trending, is_verified, name, phone, rating_count, shared_by_community_id, updated_at, visibility`.

And even the columns that *do* exist are not fetched: [`components/ProviderSelector.tsx:59-63`](../../components/ProviderSelector.tsx#L59-L63) selects only `id, name, phone`.

So `selectedProvider?.whatsapp` is `undefined` on every code path, `provider_whatsapp` is written as `NULL` for **every visit created the recommended way** ("Select existing provider" is the default mode), and the WhatsApp button at [`app/visits/[id].tsx:462`](../../app/visits/[id].tsx#L462) — gated on `visit.provider_whatsapp` — never renders.

The manual-entry branch works, because the resident types the number by hand. The result is backwards: picking a known, community-vetted provider gives you *fewer* contact options than typing a stranger's name.

## 11. Searching providers breaks on a comma, and cannot search by phone number at all

**[live]** [`app/(tabs)/index.tsx:158-160`](../../app/(tabs)/index.tsx#L158-L160):

```tsx
if (debouncedSearchQuery) {
  query = query.or(`name.ilike.%${debouncedSearchQuery}%,category.ilike.%${debouncedSearchQuery}%`);
}
```

The search string is interpolated straight into PostgREST's `or=` logic tree, where **`,` is the delimiter between conditions**. Live results against the real endpoint, community `IRA Aspiration`:

| What the resident types | HTTP | What happens |
|---|---|---|
| `raju` | 200 | 4 rows — works |
| `raju, electrician` | **400** | `PGRST100 — "failed to parse logic tree ((name.ilike.%raju, electrician%,category.ilike.%raju, electrician%))"` |
| `%` | 200 | **all 171 providers** — wildcard injection |
| `a\b` | 200 | 11 rows — the backslash is consumed as an `ilike` escape, so `a\b` silently matches `ab` |
| `raju (kollur)` | 200 | 0 rows |
| `9392034156` (a real stored number) | 200 | **0 rows** |
| `93920 34156` | 200 | 0 rows |

Two distinct defects:

**(a) The comma 400s.** The error throws at [line 173](../../app/(tabs)/index.tsx#L173), the catch at [line 198](../../app/(tabs)/index.tsx#L198) fires, and the resident gets a red **"Failed to load providers"** toast. `"Ramesh, plumber"` is an entirely natural thing to type into a search box.

**(b) Phone search does not exist.** The `or` covers `name` and `category` only, and the placeholder is `"Search help..."` ([line 515](../../app/(tabs)/index.tsx#L515)). `docs/CLAUDE.md` §3 is explicit: *"When searching providers by phone, strip non-digits from both sides (`replace(/\D/g, '')`) and use the placeholder `"Search by name or phone number..."`."*

**The codebase already does this correctly.** [`app/services/add.tsx:415-422`](../../app/services/add.tsx#L415-L422):

```tsx
.filter((p) => {
  if (!providerSearch.trim()) return true;
  const q = providerSearch.toLowerCase().replace(/\D/g, '');
  const qRaw = providerSearch.toLowerCase();
  return (
    p.name.toLowerCase().includes(qRaw) ||
    (q.length > 0 && (p.phone ?? '').replace(/\D/g, '').includes(q))
  );
})
```

with the mandated placeholder at [`app/services/add.tsx:389`](../../app/services/add.tsx#L389). The reminder screen finds a provider by phone; the main Help tab cannot.

## 12. Community leads cannot moderate visits at all, and a resident can move their visit into another community

**[live]** The complete live policy set on `service_visits`:

| cmd | policy | `USING` | `WITH CHECK` |
|---|---|---|---|
| SELECT | Community members can view visits | own community + approved | — |
| SELECT | `service_visits_select_cross_community` | `can_user_see_visit(id)` (federation, inert) | — |
| INSERT | Users can create visits | — | `created_by = auth.uid()` **and** `community_id = (own)` **and** approved |
| UPDATE | Creators can update their visits | `created_by = auth.uid()` and approved | `created_by = auth.uid()` and approved |
| DELETE | Creators can delete their visits | `created_by = auth.uid()` and approved | — |

**(a) No lead or platform-admin override on UPDATE or DELETE.** A president or vice-president cannot cancel, correct, or remove a visit — not an abandoned one, not one with an abusive title, not one whose author has left the community. Nor can a platform admin. Contrast with `service_providers`, where `Leads and admins can delete providers` exists, and with `docs/CLAUDE.md` §5, which states the house rule for exactly this: *"owner = auth.uid() OR public.is_community_lead(auth.uid()) OR public.is_platform_admin(auth.uid())"*. Every MCN table follows it (`20260822000000`); `service_visits` was never included. The UI matches the gap — [`app/visits/[id].tsx:518`](../../app/visits/[id].tsx#L518) branches on `isCreator` alone, with no `isCommunityLead` path.

**(b) The UPDATE `WITH CHECK` does not pin `community_id`.** The INSERT policy carefully forces `community_id = (SELECT community_id FROM profiles WHERE id = auth.uid())`; the UPDATE `WITH CHECK` re-asserts only `created_by` and approval. So a resident who creates a legitimate visit can then `PATCH /rest/v1/service_visits?id=eq.<theirs>` with a different `community_id` and land the row — plus its `on_service_visit_rescheduled` notification fan-out — inside someone else's society.

I did **not** execute this write (rule 3, and it would corrupt live data). It also cannot be demonstrated on this project today, because there is exactly **1** community (`communities_count = 1`). The finding rests on the policy text read out of `pg_policies`, quoted above. The identical gap was flagged and treated as real in the carpooling audit (`carpooling-review.md` §27).

## 13. The header back arrow is dead on any deep-linked provider or visit, and Android back lands on the wrong tab

**[code]** [`lib/navigation.ts:122-190`](../../lib/navigation.ts#L122-L190) maps every sub-route to its parent: Parent Corner, Schools, Food drops, Carpools, Business listings, MCN, Personal reminders, Community funds. There is **no entry for `/provider/*` and no entry for `/visits/*`**. Both fall through to [line 189](../../lib/navigation.ts#L189):

```ts
  // Default: the MCN hub.
  return '/network';
```

Two consequences, both named as traps in `docs/CLAUDE.md` §9.

**(a) Android hardware back goes to the wrong place.** `useSyncedBackNavigation` ([lines 236-258](../../lib/navigation.ts#L236-L258)) calls `getImmediateParentRoute(pathname)` when there is nothing to pop, so a resident who opens a shared provider link and presses back lands on the **MCN hub**, a completely unrelated tab.

**(b) The header arrow does nothing at all.** None of these four screens uses `goBackSmart()`. They all call raw `router.back()`:

| screen | line |
|---|---|
| `app/provider/[id].tsx` | [591](../../app/provider/[id].tsx#L591) |
| `app/provider/add.tsx` | [350](../../app/provider/add.tsx#L350) |
| `app/visits/add.tsx` | [222](../../app/visits/add.tsx#L222) |
| `app/visits/[id].tsx` (when `returnTo` is absent) | [329](../../app/visits/[id].tsx#L329) |

`router.back()` is a **silent no-op** with no history to pop. The trap text: *"Adding an `app/mcn/*` or `app/funds/*` route without a parent mapping, or using plain `router.back()` in its header → Falls through to the MCN hub, or silently does nothing on a deep-linked/fresh-loaded screen."*

This is not hypothetical: **the feature's own share buttons generate these deep links.** [`components/VisitCard.tsx:77-80`](../../components/VisitCard.tsx#L77-L80) and [`components/ProviderCard.tsx:22-25`](../../components/ProviderCard.tsx#L22-L25) put `/visits/<id>` and `/provider/<id>` URLs into WhatsApp messages. A neighbour taps the link, reads the visit, taps the back arrow — and the arrow is dead.

**(c) A separate violation in the same handler.** [`app/visits/[id].tsx:320-330`](../../app/visits/[id].tsx#L320-L330):

```tsx
const handleBack = () => {
  if (returnTo === 'visits') {
    router.replace({ pathname: '/', params: { segment: 'visits', visitTab: visitTab === 'past' ? 'past' : 'upcoming' } });
    return;
  }
  router.back();
};
```

`docs/CLAUDE.md` §3: *"**Never use `router.replace()` for back navigation.** Replace overwrites the current entry rather than popping it, which makes browser-back skip a level and kills the forward button."* Also note `visitTab === 'past' ? 'past' : 'upcoming'` — a resident who was on the **Archived** sub-tab is returned to **Upcoming**.

## 14. Favorite toggles never roll back when the write fails

**[code]** [`app/(tabs)/index.tsx:380-402`](../../app/(tabs)/index.tsx#L380-L402):

```tsx
setProviders(current => current.map(p => p.id === providerId ? { ...p, is_favorite: !isCurrentlyFavorite } : p));
try {
  if (isCurrentlyFavorite) {
    await supabase.from('favorites').delete().match({ user_id: user?.id, provider_id: providerId });
  } else {
    await supabase.from('favorites').insert({ user_id: user?.id as string, provider_id: providerId });
  }
} catch (error) {
  setProviders(current => current.map(p => p.id === providerId ? { ...p, is_favorite: isCurrentlyFavorite } : p));
  Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to update favorites' });
}
```

The same shape at [`app/provider/[id].tsx:272-286`](../../app/provider/[id].tsx#L272-L286).

`supabase-js` **returns** `{ data, error }`; it does not throw. `error` is never destructured, so the `catch` block — the rollback and the toast — is unreachable code. Every failure (offline, RLS mismatch, expired JWT) leaves the bookmark icon filled in while nothing was written.

Resident impact: the resident taps the bookmark, sees it turn solid, navigates to the **Saved** tab, and the provider is not there. Because the optimistic state is never reconciled, the Help tab keeps showing it as saved until the next full refetch.

## 15. A failed fetch is presented as "you have nothing here"

**[code]** Neither segment has a loading or error state. [`app/(tabs)/index.tsx:198-201`](../../app/(tabs)/index.tsx#L198-L201) catches, toasts, and leaves `providers` at whatever it was — `[]` on first load. The list then renders [lines 527-534](../../app/(tabs)/index.tsx#L527-L534):

> **No Providers Found**
> Be the first to add a trusted service provider!

The same for visits at [lines 643-661](../../app/(tabs)/index.tsx#L643-L661) ("Be the first to share when a provider is coming!"). A resident whose network dropped, whose JWT expired, or who typed a comma (issue 11) is told their society has no service providers at all — in a community that has **171**. The toast is transient; the empty state persists.

There is also a subtler variant: [`app/(tabs)/index.tsx:176-181`](../../app/(tabs)/index.tsx#L176-L181) only special-cases the *missing-relation* error on the hires query, so **any other** hires error silently yields `hire_count: 0` for every provider — the community-trust signal reads zero with no indication anything went wrong.

## 16. Cancel Visit and Mark as completed fire on a single tap, with no confirmation and no undo

**[code]** [`app/visits/[id].tsx:520-531`](../../app/visits/[id].tsx#L520-L531):

```tsx
{visit.status === 'upcoming' && (
    <TouchableOpacity style={styles.primaryBtn} onPress={() => updateStatus('completed')}>
      … Mark as completed …
{visit.status === 'upcoming' && (
  <TouchableOpacity style={styles.cancelBtn} onPress={() => updateStatus('cancelled')}>
    … Cancel Visit …
```

`updateStatus` ([lines 295-309](../../app/visits/[id].tsx#L295-L309)) writes immediately. No dialog, no `disabled` guard while in flight, and — because both buttons are gated on `status === 'upcoming'` — **no way back**. One mis-tap on **Cancel Visit** and the visit is permanently cancelled: it drops out of Upcoming for every joiner, the joiners are never told (nothing notifies them), and the host cannot reinstate it.

Compare **Leave this visit** three lines away, which *does* confirm ([lines 278-293](../../app/visits/[id].tsx#L278-L293)) with a proper `Platform.OS` split — for a far less destructive action.

## 17. Sharing a visit silently does nothing on desktop web

**[code]** [`app/visits/[id].tsx:332-351`](../../app/visits/[id].tsx#L332-L351):

```tsx
const handleShare = async () => {
  …
  await Share.share({ message, title: visit.title });
} catch (error: any) {
  console.error('Error sharing:', error);       // <- console only
}
```

React Native Web's `Share` delegates to `navigator.share`, which does not exist on desktop Chrome, Firefox, or Edge. The rejection goes to `console.error` and the resident gets **no toast, no dialog, no clipboard fallback — nothing**.

**The rest of the codebase already handles this.** [`components/VisitCard.tsx:95-102`](../../components/VisitCard.tsx#L95-L102), [`components/ProviderCard.tsx:43-47`](../../components/ProviderCard.tsx#L43-L47), and [`app/provider/[id].tsx:258-262`](../../app/provider/[id].tsx#L258-L262) all branch first:

```tsx
if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).share) {
  await (navigator as any).share({ title, text: message });
} else {
  await Share.share({ message, title });
}
```

The visit **detail** screen is the one place that never got the branch — and it is the screen a host is most likely to share from. `handleShare` there also omits the deep link that `VisitCard` includes, so even where it works the recipient gets no URL.

## 18. "₹300-500" is shown to neighbours as ₹3,00,500

**[live]** `estimated_cost` is a free-text `TEXT` column (`20260416100000_add_service_visits.sql`), and the input invites prose — [`app/visits/add.tsx:462`](../../app/visits/add.tsx#L462) placeholder: `"e.g. 400 / unit"`. The detail screen then tries to read a number out of it, [`app/visits/[id].tsx:160`](../../app/visits/[id].tsx#L160):

```tsx
const parsedEstimatedCost = visit?.estimated_cost
  ? Number(String(visit.estimated_cost).replace(/[^0-9.]/g, ''))
  : NaN;
```

and renders it through `<Rupees>` at [lines 440-444](../../app/visits/[id].tsx#L440-L444). Stripping every non-digit **concatenates the two halves of a range**. Measured output:

| Typed by the resident | Help-tab card shows | Visit detail shows |
|---|---|---|
| `400` | ~400 | ₹400 |
| `400 / unit` | ~400 / unit | ₹400 |
| **`300-500`** | ~300-500 | **₹3,00,500** |
| **`₹300-500`** | ~₹300-500 | **₹3,00,500** |
| `1,200` | ~1,200 | ₹1,200 |
| `₹1,200 approx` | ~₹1,200 approx | ₹1,200 |
| **`2.5k`** | ~2.5k | **₹2** |
| `500 per AC` | ~500 per AC | ₹500 |
| `Free` | ~Free | Free |

Two problems at once: the detail screen shows a **wildly wrong number** for the most natural way to express an estimate, and the card and the detail screen for the same visit **disagree** — the card faithfully echoes `~300-500` while the detail says `₹3,00,500`. A resident deciding whether to join a shared visit is looking at a cost that is off by three orders of magnitude.

## 19. "Provider reported — tap to review" routes nowhere

**[live]** `handle_provider_report_notification()` (repointed correctly in `20260822000000`) writes a notification whose body ends with the literal words **"Tap to review."** Live `notifications` rows confirm the type is in active use:

```
notification_types   community_approved, community_lead_appointed, community_lead_removed,
                     funds_access_requested, new_community_request, new_visit, provider_reported
```

[`app/notifications.tsx:30-66`](../../app/notifications.tsx#L30-L66) has no `case 'provider_reported'` (it renders the generic bell) and [`handleNotificationPress`](../../app/notifications.tsx#L69-L100) has no branch for it. The president taps a notification that tells them to tap it, and **nothing happens**. The `provider_id` needed to route is already sitting in `notification.data`.

`visit_rescheduled` has the same gap — no icon case, no route — though it is currently unreachable anyway (issue 5). Fixing issue 5 without fixing this ships a second dead notification.

By contrast `new_visit` routes correctly at [line 87-89](../../app/notifications.tsx#L87-L89).

## 20. "Homes used" counts button taps, not homes

**[code]** [`app/provider/[id].tsx:209-232`](../../app/provider/[id].tsx#L209-L232) — both `handleCall` and `handleWhatsApp` begin with `await logHire();`. `logHire` ([lines 162-207](../../app/provider/[id].tsx#L162-L207)) inserts an unconditional row into `provider_hires`. There is no unique constraint on that table (confirmed: only the two policies, no constraints) and no dedupe.

So one resident who taps **Call**, gets no answer, taps **WhatsApp**, then taps **Call** again tomorrow has logged **three hires**. That number is surfaced as a trust signal in three places, two of which name households:

- [`app/provider/[id].tsx:632-633`](../../app/provider/[id].tsx#L632-L633) — the stat tile literally reads **"Homes used"**
- [`app/provider/[id].tsx:614-618`](../../app/provider/[id].tsx#L614-L618) — the `N hires` pill
- [`app/provider/[id].tsx:249`](../../app/provider/[id].tsx#L249) — the share message: `Community Hires: N homes`

`docs/features.md` §2 describes the intent as *"Contact actions log a hire"*, so the write itself is deliberate. The defect is the **label**: `COUNT(*)` over taps is presented as a count of distinct households, and it is trivially inflated by one persistent resident. A resident choosing between two electricians is reading a number that measures dialling, not hiring.

Each `logHire` also schedules a 24-hour local feedback notification ([lines 181-199](../../app/provider/[id].tsx#L181-L199)) on native — so the same three taps queue three separate "How was your visit?" reminders.

---

# P2 — smaller

## 21. `visit_time_slot` is unvalidated free text, and the live data proves it

**[live]** `visit_time_slot TEXT NOT NULL` with no constraint. The value is assembled by string concatenation at [`app/visits/add.tsx:183`](../../app/visits/add.tsx#L183) — `` `${formatTime(startTime)} - ${formatTime(endTime)}` `` — and re-parsed with a regex at [`app/visits/[id].tsx:85-108`](../../app/visits/[id].tsx#L85-L108). Every distinct value currently in the database:

```
06:34 pm - 07:34 pm | 08:50 am - 07:50 am | 09:00 am - 10:00 am | 11:37 pm - 12:37 am
```

**`08:50 am - 07:50 am`** ends an hour before it starts. **`11:37 pm - 12:37 am`** crosses midnight. Both violate the `endMins <= startMins` guard that exists today in *both* writers ([`app/visits/add.tsx:173-181`](../../app/visits/add.tsx#L173-L181) and [`app/visits/[id].tsx:123-131`](../../app/visits/[id].tsx#L123-L131)) — so they predate that guard and nothing has ever stopped them from persisting. Nothing at the database level stops a new one either. Neighbours read the raw string on the card and the detail screen.

## 22. A negative `max_joiners` locks a visit as "Visit Full" forever

**[code]** [`app/visits/add.tsx:201`](../../app/visits/add.tsx#L201): `max_joiners: maxJoiners ? parseInt(maxJoiners) : null`, with no validation and no `CHECK` in the database (confirmed live).

- `-5` → stored as `-5`. `isFull = maxJoiners ? joinerCount >= maxJoiners : false` → `0 >= -5` → **true** from the moment the visit is created. The card and the detail screen both show **"Visit Full"** and nobody, ever, can join. `keyboardType="numeric"` does not block `-` on web.
- `0` → `"0"` is a truthy *string*, so `parseInt` runs and stores `0`; but at read time the numeric `0` is falsy, so `isFull` is `false` and the cap silently means "unlimited".
- Non-numeric text → `parseInt` yields `NaN`, which `JSON.stringify` serialises to `null` — harmlessly "unlimited", but by accident rather than design.

## 23. A resident with no name cannot create a visit at all

**[code]** `handle_new_visit_notification()` (`20260417000000_add_notifications.sql`):

```sql
INSERT INTO public.notifications (user_id, type, title, body, data)
SELECT p.id, 'new_visit', 'New Planned Visit',
  (SELECT full_name FROM profiles WHERE id = NEW.created_by) || ' scheduled a ' || NEW.category || ' visit.',
  …
```

`profiles.full_name` is nullable (`00000_init.sql:15`), and `handle_new_user()` copies it straight from `raw_user_meta_data->>'full_name'`, which is absent for OAuth identities that do not supply one. In SQL, `NULL || 'text'` is `NULL`, and `notifications.body` is `NOT NULL` — so the trigger raises, and because it is an `AFTER INSERT` trigger in the same transaction, **the entire visit insert rolls back**. The resident taps **Share visit** and gets a raw constraint error, with no way to work out that their missing display name is the cause.

Not reproduced live: `profiles_null_full_name` is currently **0**, so no account in the pilot data can trigger it today. The mechanism is nevertheless certain from the SQL, and the fix already exists one migration later — `handle_visit_rescheduled_notification()` in `20260607113000` wraps the identical lookup in `COALESCE(…, 'A neighbor')`. Somebody hit this and patched only the new trigger.

## 24. Unbounded queries and client-side filtering

**[live]** No query in this feature paginates.

| query | site | live volume |
|---|---|---|
| all providers in the community | [`app/(tabs)/index.tsx:146-150`](../../app/(tabs)/index.tsx#L146-L150) | **171** rows, every focus |
| all favorites, all hires | [`app/(tabs)/index.tsx:165-171`](../../app/(tabs)/index.tsx#L165-L171) | 3 hires |
| all visits in the community | [`app/(tabs)/index.tsx:210-214`](../../app/(tabs)/index.tsx#L210-L214) | 6 |
| all providers again, for the picker | [`components/ProviderSelector.tsx:59-63`](../../components/ProviderSelector.tsx#L59-L63) | **171** rows |

Visit search is entirely client-side ([`app/(tabs)/index.tsx:313-322`](../../app/(tabs)/index.tsx#L313-L322)) over the full set, and the provider picker filters 171 rows in JS on every keystroke ([`components/ProviderSelector.tsx:74-76`](../../components/ProviderSelector.tsx#L74-L76), not debounced). Fine at pilot scale; the provider list is already the largest table in the feature and grows monotonically.

## 25. The visit provider picker shows fraud-flagged providers that the Help tab hides

**[code]** The Help tab filters them out ([`app/(tabs)/index.tsx:185-190`](../../app/(tabs)/index.tsx#L185-L190)):

```tsx
.filter((provider: any) => {
  const status = provider.fraud_status;
  return !status || status === 'pass' || status === 'queued_low';
})
```

[`components/ProviderSelector.tsx:59-63`](../../components/ProviderSelector.tsx#L59-L63) applies no such filter. A provider whose `fraud_status` is `hidden` or `blocked` is invisible in the directory but **selectable when planning a visit** — and once selected, their name and phone are copied onto the visit row and broadcast to the whole community by the `new_visit` notification.

Related: reviews are not fraud-filtered either. [`app/provider/[id].tsx:440-444`](../../app/provider/[id].tsx#L440-L444) selects every `ratings` row for the provider regardless of `fraud_status`, and `update_provider_rating()` (`20260503120000`) averages **all** of them — so a review the fraud pipeline marked `hidden` still moves the public star rating and still appears in "Community Reviews".

## 26. Verandah violations

**[code]** Against [`docs/verandah.md`](../verandah.md) and `docs/CLAUDE.md` §4:

| Violation | Location |
|---|---|
| Raw hex `'#FFFFFF'` | [`components/VisitCard.tsx:288`](../../components/VisitCard.tsx#L288), [`app/provider/[id].tsx:684`](../../app/provider/[id].tsx#L684), [`app/provider/[id].tsx:688`](../../app/provider/[id].tsx#L688) |
| `shadowColor` / `shadowOffset` / `shadowOpacity` / `shadowRadius` / `elevation` | [`app/provider/[id].tsx:1279-1283`](../../app/provider/[id].tsx#L1279-L1283) (report modal) |
| Raw `rgba(0,0,0,0.5)` overlay | [`app/provider/[id].tsx:1268`](../../app/provider/[id].tsx#L1268) |
| `fontWeight: '600'` / `'700'` (forbidden: ≥600) | [`app/provider/[id].tsx:677`](../../app/provider/[id].tsx#L677), [`:1264`](../../app/provider/[id].tsx#L1264), [`:1287`](../../app/provider/[id].tsx#L1287), [`:1362`](../../app/provider/[id].tsx#L1362), [`:1372`](../../app/provider/[id].tsx#L1372), [`app/visits/[id].tsx:1007`](../../app/visits/[id].tsx#L1007), [`:1018`](../../app/visits/[id].tsx#L1018), [`:1033`](../../app/visits/[id].tsx#L1033), [`:1044`](../../app/visits/[id].tsx#L1044) |
| `textTransform: 'uppercase'` on a body title | [`app/provider/[id].tsx:1096`](../../app/provider/[id].tsx#L1096) (`sectionTitle`), [`:1159`](../../app/provider/[id].tsx#L1159) |
| Title Case copy where sentence case is mandated | "Community Reviews", "Rate this Provider", "Report Provider", "Join Visit", "Reschedule Visit", "Cancel Visit", "Visit Full" |
| `Verandah.borderStrong` used as a modal scrim | [`app/visits/[id].tsx:1048`](../../app/visits/[id].tsx#L1048) |

None of these are logged in the out-of-register appendix of `verandah.md`.

---

# PART 2 — RESOLVED DESIGN DECISIONS

Every open question this analysis raised, decided. Do not re-open these.

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Fix the visit RPC leak by adding an authorization check, or by deleting the RPCs and reading the tables directly under RLS? | **Add authorization inside the functions and revoke `anon`/`PUBLIC`.** Keep both signatures. | The RPCs do real work RLS cannot: `get_community_visits` aggregates `joiner_count` and computes `has_user_joined` in one round trip. Deleting them means rewriting two screens for no security gain. Keep the signature identical so `CREATE OR REPLACE` works and no client change is forced. |
| D2 | Should the fixed `get_community_visits` ignore `p_community_id` entirely, or validate it? | **Validate: raise unless the caller may read that community (see D17) or is a platform admin.** | Silently substituting the caller's community would make a wrong call *look* like it worked, which is how bugs like issue 8 hide. A hard `RAISE EXCEPTION` surfaces the empty-string bug in issue 8 loudly instead of silently. Keep the parameter so no client signature changes. |
| D3 | Same question for `p_user_id`. | **Force it to `auth.uid()` inside the function; ignore whatever is passed.** | `has_user_joined` is a statement about the caller. There is no legitimate reason to ask it about someone else, and honouring the parameter lets a resident probe which neighbours joined which visit. |
| D4 | Keep `auto_complete_past_visits()` and schedule it, or drop it? | **Drop the function.** | `pg_cron` is not installed and installing it is a platform change well outside this fix. The function is an anon-executable mass `UPDATE` that has never run. M2 back-fills the stale rows once, and the client already derives the display status correctly. Fold the drop into M1 — there is no call site in `app/` or `supabase/functions/` to remove. |
| D5 | Should past visits become `completed` automatically going forward? | **No automatic transition. Restore the manual control instead**: show **Mark as completed** to the creator on a past visit whose status is still `upcoming`. | Only the host knows whether the plumber actually came. An automatic sweep would mark no-shows as completed, which is worse than a stale badge. The client-side `displayStatus` already keeps the badge honest for everyone else. |
| D6 | Enforce `max_joiners` with a trigger or a `CHECK`? | **A `BEFORE INSERT` trigger on `visit_joiners`, `SECURITY DEFINER`, `SET search_path = public`.** | A `CHECK` cannot see sibling rows. `SECURITY DEFINER` is mandatory here — `docs/CLAUDE.md` §9: a constraint trigger without it runs its `SELECT` under the caller's RLS and under-counts, which is exactly what cost the food-drop caps their enforcement (`20260823000000`). |
| D7 | Add `CHECK (max_joiners >= 1)`, or clamp in the client? | **Both.** `CHECK` in M2, plus client validation in C3. | The `CHECK` is the real invariant; the client message is what stops a resident submitting a form and getting a Postgres error string. Note the trap: `CHECK` constraints reject non-`IMMUTABLE` functions, so keep the expression to a bare numeric comparison. |
| D8 | Should the country code be added at write time (store `+91…`) or at link time? | **At link time.** Build `91${phone}` where the `wa.me` URL is constructed; do not change stored data. | `service_providers.phone` is normalised to 10 digits by a `BEFORE INSERT/UPDATE` trigger and backed by a uniqueness rule keyed on that exact form. Changing the storage format means rewriting the trigger, the index, the duplicate check, and back-filling 171 rows — a much larger change for the same user-visible result. |
| D9 | Add a `whatsapp` column to `service_providers` (issue 10)? | **No. Fall back to `phone`.** When a visit is created from an existing provider, write `provider_whatsapp = provider.phone`. | Every provider phone in the system is an Indian mobile, and in India the mobile *is* the WhatsApp number. A new column means a new form field on `provider/add.tsx`, a migration, and a back-fill, to capture a value that is the same as `phone` in essentially every case. Also delete the dead `selectedProvider?.whatsapp` read. |
| D10 | Fix the provider search by escaping the input, or by moving to two `ilike` filters? | **Escape the input and add phone matching**: strip `,`, `(`, `)`, `%`, `\`, `.` from the value before interpolation, and add `phone.ilike.%<digits>%` when the query contains digits. | Rewriting to `.filter()` chains changes OR to AND semantics. Escaping is a three-line change that fixes the 400, kills the `%` wildcard injection, and leaves the query shape alone. |
| D11 | Where should the estimated-cost fix live — parse harder, or stop parsing? | **Stop parsing. Render `estimated_cost` as the text it is**, on both the card and the detail screen, and drop the `<Rupees>` branch from the visit detail. | The column is `TEXT` and the placeholder invites prose (`"400 / unit"`). Any digit-extraction heuristic is wrong for ranges, wrong for `2.5k`, and wrong for `Free`. Showing exactly what the host typed is both correct and consistent with the card. `components/Rupees.tsx` is **not** to be modified. |
| D12 | Should community leads be able to edit visits, or only cancel/delete them? | **Cancel and delete only** — add `is_community_lead()` / `is_platform_admin()` to the `UPDATE` and `DELETE` policies, and show the lead a **Cancel visit** and **Delete visit** control. | This is moderation, not co-hosting. Rewriting a neighbour's visit details would be confusing and is not asked for anywhere. Matches the uniform MCN delete rule in `docs/CLAUDE.md` §5. |
| D13 | Should the notification fan-out narrow from "whole community" to "joiners only"? | **Out of scope. Leave both triggers fanning out to the community.** | `new_visit` is a discovery mechanism — telling only existing joiners about a *new* visit is nonsense. `visit_rescheduled` has a genuine argument for narrowing, but changing notification audience is a product decision with its own migration and no finding here requires it. Note it in the docs and move on. |
| D14 | Should the reschedule modal be wired up, or deleted? | **Wire it up.** Add a **Reschedule** button to the creator's action group. | It is complete, correct, platform-split, validated, and already documented in `docs/features.md` §2. Its notification trigger is deployed and waiting. Deleting it would mean also deleting a live trigger and amending the docs; wiring it costs one `TouchableOpacity`. |
| D15 | Fix the `communities` `FOR SELECT USING (true)` policy that leaks every society's join code? | **Out of scope for this change set — but record it.** | It is a real, live, anonymous leak (`code` is the join credential) and it is what turns issue 1 from "one community" into "all communities". But it belongs to the onboarding/join flow, not to Providers & Visits: the join-by-code screen reads it, and narrowing it needs its own audit of `community-select.tsx`, `community-request.tsx`, and the admin console. **M1 removes this feature's dependence on it.** File it as the next audit. |
| D17 | The visit RPCs need authorization. Hand-roll a `community_id` comparison, or build it from the federation helpers? | **Build it from the federation helpers.** `get_community_visits` gates the community argument with `get_user_partner_community_ids('visits', auth.uid())` and filters rows with `can_user_see_visit(sv.id, auth.uid())`; `get_visit_joiners` gates entirely on `can_user_see_visit(p_visit_id, auth.uid())`. | **This is the decision that keeps the deferred cross-community work alive.** A hand-rolled `profiles.community_id = p_community_id` check closes the leak today and silently locks every partner community out the day the federation UI ships — the fix would then have to be unpicked and rewritten. The helpers cost nothing now: `get_user_partner_community_ids` already UNIONs the caller's **home** community, and the `'visits'` capability key appears in no `community_partnerships.scope` JSONB yet, so both predicates resolve to exactly "the caller's own community" and behaviour is **identical** to the single-community RLS policies. It also guarantees the RPC can never be more permissive than the table — `can_user_see_visit()` is literally the same function the additive `service_visits_select_cross_community` policy uses. Verified live 2026-08-08: all three helpers exist, are `STABLE SECURITY DEFINER`, and are `search_path`-pinned. |
| D18 | Does M2's `community_id` pin on the visit `UPDATE` policy break cross-community visits? | **No. Keep the pin.** | A cross-community visit is still **owned** by exactly one community (`service_visits.community_id`) and **shared** through `service_visit_communities` rows plus the `is_cross_community` flag. The pin stops a visit being *moved* between owners; it does not touch sharing. M2 replaces only the two **single-community** `UPDATE`/`DELETE` policies, which have no federation counterpart — the additive `service_visits_select_cross_community` `SELECT` policy is not dropped, recreated, or referenced. |
| D16 | Migration filenames. | `ls supabase/migrations/ \| sort \| tail` → latest is **`20260830000100_fix_profiles_select_leak.sql`**. Use **`20260831000000_secure_visit_rpcs.sql`** (M1) and **`20260831000100_visit_capacity_and_lifecycle.sql`** (M2). | Both sort strictly after every applied migration. A too-early timestamp sorts before already-applied files and breaks `db push`. Re-check with `npx supabase migration list --linked` before writing — concurrent sessions collide. |

---

# PART 3 — IMPLEMENTATION PLAN

## Sequencing

| Set | Contains | Ends with |
|---|---|---|
| **A — Security** (do first, ship alone) | M1, C2 (delete-confirm + delete-error halves only) | `npm run db:push` → `gen types` → **re-append enriched types** → `npx tsc --noEmit` clean, then the **Database** and **Security regression** rows of the checklist |
| **B — Correctness** | M2, C1, C2 (remainder), C3, C4, C5, C6 | `npx tsc --noEmit` clean, then the **Web (PWA)**, **Native**, and **Timezone/lifecycle** rows |
| **C — Hygiene** | C7, C8, documentation updates | `npx tsc --noEmit` clean, then the **Regression sweep** rows |

Set A closes an active, unauthenticated data leak. Do not batch it behind anything.

---

## Database tasks

### M1 — Lock down the two visit RPCs (issues 1, 2, 4)

**File:** `supabase/migrations/20260831000000_secure_visit_rpcs.sql`

Traps this task walks past, named so you do not rediscover them:
- `CREATE OR REPLACE FUNCTION` **cannot change a `RETURNS TABLE` signature**. The definitions below keep both signatures byte-identical. If you decide to add a column, you must `DROP FUNCTION` first (`docs/CLAUDE.md` §9).
- Revoking from `PUBLIC` is required; revoking from `anon` alone leaves the `PUBLIC` grant in place and changes nothing.
- Both functions get `SET search_path = public`, which they have always lacked.
- **The authorization is federation-aware by construction (D17).** It is built from `get_user_partner_community_ids()` and `can_user_see_visit()` — the two canonical helpers — rather than a hand-rolled `community_id` comparison. Today both resolve to "the caller's own community", so behaviour is identical to the RLS policies; when the federation UI ships, these RPCs already honour partnerships and `service_visit_communities` with **no rewrite**. Do not simplify them back to a direct comparison.

```sql
-- ============================================================
-- Secure the two visit RPCs.
--
-- Both were SECURITY DEFINER with no authorization and no search_path pin,
-- and both were EXECUTE-able by anon. Reproduced 2026-08-08: an unauthenticated
-- caller holding only the public anon key could read every visit in every
-- community (provider phone numbers, host name + flat number) and every
-- joiner (name, flat number, note).
--
-- Also drops auto_complete_past_visits(), an anon-executable mass UPDATE that
-- was never scheduled (pg_cron is not installed on this project) and has no
-- call site in app/ or supabase/functions/.
--
-- FEDERATION: deliberately preserved and deliberately honoured. The new
-- authorization is built from get_user_partner_community_ids() and
-- can_user_see_visit() rather than a hand-rolled community comparison, so it
-- matches the additive cross-community RLS policies instead of contradicting
-- them. Nothing federation-related is dropped, disabled, or narrowed here.
-- Today both helpers resolve to "the caller's own community", so behaviour is
-- identical to the single-community policies. See docs/cross-community.md.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Verification BEFORE you change anything. Run this first and
--    keep the output — it is your before/after evidence.
-- ------------------------------------------------------------
-- SELECT p.proname,
--        pg_get_function_identity_arguments(p.oid) AS args,
--        p.prosecdef,
--        COALESCE(array_to_string(p.proconfig, ','), '(no search_path)') AS config
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('get_community_visits','get_visit_joiners','auto_complete_past_visits');
--
-- Expected before: all three prosecdef = true, all three config = '(no search_path)'.

-- ------------------------------------------------------------
-- 1. get_community_visits — authorize, pin search_path.
--    Signature is UNCHANGED so CREATE OR REPLACE succeeds and no
--    client call site needs editing.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_community_visits(
  p_community_id UUID,
  p_user_id UUID,
  p_status TEXT DEFAULT 'upcoming',
  p_time_scope TEXT DEFAULT 'upcoming'
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  category TEXT,
  provider_id UUID,
  provider_name TEXT,
  provider_phone TEXT,
  provider_whatsapp TEXT,
  visit_date DATE,
  visit_time_slot TEXT,
  estimated_cost TEXT,
  max_joiners INTEGER,
  status TEXT,
  created_by UUID,
  creator_name TEXT,
  creator_flat TEXT,
  creator_avatar_url TEXT,
  joiner_count BIGINT,
  has_user_joined BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- D2 + D17: validate the caller-supplied community rather than substituting it,
  -- so a wrong argument fails loudly instead of returning plausible rows.
  --
  -- FEDERATION-AWARE BY CONSTRUCTION. get_user_partner_community_ids() already
  -- UNIONs the caller's HOME community with active partnerships and group peers,
  -- so this single predicate covers both the single-community present and the
  -- federated future. Do NOT replace it with a bare
  --   (SELECT community_id FROM profiles WHERE id = v_caller) = p_community_id
  -- comparison: that would work today and silently lock partner communities out
  -- the day the federation UI ships.
  --
  -- The 'visits' capability key does not appear in any community_partnerships.scope
  -- JSONB yet, so the partner CTE yields nothing and this resolves to exactly
  -- "the caller's own community" today — i.e. behaviour identical to the
  -- "Community members can view visits" policy. Adding {"visits": true} to a
  -- partnership scope later turns it on with no code change.
  IF NOT public.is_platform_admin(v_caller)
     AND p_community_id NOT IN (
       SELECT public.get_user_partner_community_ids('visits', v_caller)
     ) THEN
    RAISE EXCEPTION 'Not authorized to read visits for this community';
  END IF;

  RETURN QUERY
  SELECT
    sv.id, sv.title, sv.description, sv.category, sv.provider_id,
    sv.provider_name, sv.provider_phone, sv.provider_whatsapp,
    sv.visit_date, sv.visit_time_slot, sv.estimated_cost, sv.max_joiners,
    sv.status, sv.created_by,
    p.full_name  AS creator_name,
    p.flat_number AS creator_flat,
    p.avatar_url AS creator_avatar_url,
    COUNT(DISTINCT vj.id) AS joiner_count,
    EXISTS (
      SELECT 1 FROM public.visit_joiners vj2
      -- D3: always the caller. p_user_id is deliberately ignored.
      WHERE vj2.visit_id = sv.id AND vj2.user_id = v_caller
    ) AS has_user_joined,
    sv.created_at
  FROM public.service_visits sv
  JOIN public.profiles p ON p.id = sv.created_by
  LEFT JOIN public.visit_joiners vj ON vj.visit_id = sv.id
  WHERE sv.community_id = p_community_id
    -- Row-level federation check, mirroring the additive
    -- service_visits_select_cross_community policy exactly. For the caller's own
    -- community this is true for every row (no behaviour change today); for a
    -- partner community it correctly returns only the visits explicitly shared
    -- via service_visit_communities. Keeping this here is what stops the RPC
    -- from ever being more permissive than the RLS policy it stands in for.
    AND public.can_user_see_visit(sv.id, v_caller)
    AND sv.status = ANY(string_to_array(p_status, ','))
    AND (
      (p_time_scope = 'upcoming' AND sv.visit_date >= CURRENT_DATE)
      OR
      (p_time_scope = 'past'     AND sv.visit_date <  CURRENT_DATE)
    )
  GROUP BY sv.id, p.full_name, p.flat_number, p.avatar_url
  ORDER BY
    CASE WHEN p_time_scope = 'upcoming' THEN sv.visit_date END ASC,
    CASE WHEN p_time_scope = 'past'     THEN sv.visit_date END DESC,
    sv.created_at DESC;
END;
$$;

-- ------------------------------------------------------------
-- 2. get_visit_joiners — authorize against the visit's community.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_visit_joiners(p_visit_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_name TEXT,
  flat_number TEXT,
  avatar_url TEXT,
  note TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Unknown visit id returns an empty set rather than confirming existence.
  IF NOT EXISTS (SELECT 1 FROM public.service_visits sv WHERE sv.id = p_visit_id) THEN
    RETURN;
  END IF;

  -- D17: reuse the canonical federation predicate instead of hand-rolling a
  -- community comparison. can_user_see_visit() is the SAME function the additive
  -- service_visits_select_cross_community policy uses, so this RPC can never be
  -- more permissive than the table it reads — and it already understands
  -- cross-community shares for the day the federation UI ships.
  IF NOT (public.is_platform_admin(v_caller)
          OR public.can_user_see_visit(p_visit_id, v_caller)) THEN
    RAISE EXCEPTION 'Not authorized to read joiners for this visit';
  END IF;

  RETURN QUERY
  SELECT
    vj.id,
    vj.user_id,
    p.full_name AS user_name,
    COALESCE(vj.flat_number, p.flat_number) AS flat_number,
    p.avatar_url,
    vj.note,
    vj.created_at AS joined_at
  FROM public.visit_joiners vj
  JOIN public.profiles p ON p.id = vj.user_id
  WHERE vj.visit_id = p_visit_id
  ORDER BY vj.created_at ASC;
END;
$$;

-- ------------------------------------------------------------
-- 3. Grants. Revoke PUBLIC as well as anon — revoking anon alone
--    leaves the PUBLIC grant and changes nothing.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_community_visits(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_visit_joiners(UUID)                      FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_community_visits(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_visit_joiners(UUID)                      TO authenticated;

-- ------------------------------------------------------------
-- 4. Drop the anon-executable mass UPDATE (D4).
--    No call site exists in app/ or supabase/functions/ — verify with:
--      grep -rn "auto_complete_past_visits" app/ components/ lib/ supabase/functions/
--    Expected: no matches. If there IS a match, delete it in the same commit.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.auto_complete_past_visits();

NOTIFY pgrst, 'reload schema';
```

**Post-apply proof (run these; both must change):**

```bash
# 1. Anonymous call must now fail. Substitute your anon key and project URL.
curl -s -X POST "$URL/rest/v1/rpc/get_community_visits" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
  -d '{"p_community_id":"3eb9c25b-70a6-405e-a988-5ae32a07a795","p_user_id":"00000000-0000-0000-0000-000000000000"}'
# Expected: HTTP 404 "function ... does not exist" (grant revoked) — NOT a 200 with rows.

# 2. Catalogue re-read: all remaining functions pinned, auto_complete gone.
```

### M2 — Visit capacity, lifecycle, and integrity (issues 6, 7, 12, 21, 22, 23)

**File:** `supabase/migrations/20260831000100_visit_capacity_and_lifecycle.sql`

```sql
-- ============================================================
-- Visit integrity: capacity enforcement, lead moderation,
-- community pinning, time-slot sanity, and a one-time status backfill.
--
-- FEDERATION: nothing here removes or narrows cross-community functionality.
-- Section 4 replaces ONLY the two single-community UPDATE/DELETE policies.
-- The additive SELECT policy service_visits_select_cross_community is NOT
-- dropped and NOT referenced — leave it exactly as it is. The community_id pin
-- in the UPDATE WITH CHECK constrains ownership, not sharing: a cross-community
-- visit is owned by one community and shared through service_visit_communities
-- plus service_visits.is_cross_community, none of which this migration touches
-- (D18). See docs/cross-community.md.
-- ============================================================

-- ------------------------------------------------------------
-- 1. max_joiners sanity.
--
--    PRE-FLIGHT — run this FIRST. If it returns any row, fix those rows
--    before adding the constraint or the ALTER TABLE will fail.
-- ------------------------------------------------------------
-- SELECT id, title, community_id, max_joiners
-- FROM public.service_visits
-- WHERE max_joiners IS NOT NULL AND max_joiners < 1;
--
-- Expected on 2026-08-08: 0 rows.
--
-- TRAP: a CHECK constraint may not call a non-IMMUTABLE function. Keep this
-- to a bare numeric comparison — do not be tempted to reference joiner counts here.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.service_visits'::regclass
      AND conname  = 'service_visits_max_joiners_positive'
  ) THEN
    ALTER TABLE public.service_visits
      ADD CONSTRAINT service_visits_max_joiners_positive
      CHECK (max_joiners IS NULL OR max_joiners >= 1);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Server-side capacity enforcement on join (D6).
--
--    TRAP (docs/CLAUDE.md §9): a constraint trigger WITHOUT SECURITY DEFINER
--    runs its own SELECT under the caller's RLS, silently under-counts other
--    users' rows, and never fires. That is what cost the food-drop caps their
--    cross-buyer enforcement (20260823000000). SECURITY DEFINER is mandatory.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_visit_joiner_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max     INTEGER;
  v_current INTEGER;
BEGIN
  SELECT sv.max_joiners INTO v_max
  FROM public.service_visits sv
  WHERE sv.id = NEW.visit_id
  FOR UPDATE;                       -- serialises concurrent joins on one visit

  IF v_max IS NULL THEN
    RETURN NEW;                     -- unlimited
  END IF;

  SELECT count(*) INTO v_current
  FROM public.visit_joiners vj
  WHERE vj.visit_id = NEW.visit_id;

  IF v_current >= v_max THEN
    RAISE EXCEPTION 'This visit is already full (% of % neighbours joined)', v_current, v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS visit_joiner_capacity_guard ON public.visit_joiners;
CREATE TRIGGER visit_joiner_capacity_guard
  BEFORE INSERT ON public.visit_joiners
  FOR EACH ROW EXECUTE FUNCTION public.enforce_visit_joiner_capacity();

GRANT EXECUTE ON FUNCTION public.enforce_visit_joiner_capacity() TO authenticated;

-- ------------------------------------------------------------
-- 3. One-time status backfill (issue 6).
--
--    *** THIS REWRITES LIVE RESIDENT DATA. DRY RUN FIRST. ***
--
--    Step 3a — run this SELECT alone and read the output:
--
--      SELECT id, community_id, title, visit_date, status
--      FROM public.service_visits
--      WHERE status = 'upcoming' AND visit_date < CURRENT_DATE
--      ORDER BY visit_date;
--
--    Expected on 2026-08-08: 4 rows (titles 'ac' x3 dated 2026-06-22/25, plus one more).
--    If the count is wildly different from 4, STOP and re-read this section.
--
--    Step 3b — only then run the UPDATE. It is naturally re-run safe: after it
--    runs once, the WHERE clause matches nothing.
-- ------------------------------------------------------------
UPDATE public.service_visits
SET status = 'completed', updated_at = now()
WHERE status = 'upcoming'
  AND visit_date < CURRENT_DATE;

-- ------------------------------------------------------------
-- 4. Lead / platform-admin moderation + community pinning (issue 12, D12).
--
--    SCOPE: these two DROP/CREATE pairs touch ONLY the single-community
--    UPDATE and DELETE policies. Do NOT add
--      DROP POLICY ... service_visits_select_cross_community
--    to this migration. That policy is permissive, additive, and deliberately
--    retained for the future federation UI (D18).
--
--    Confirm it is still standing after this migration runs:
--      SELECT policyname, cmd FROM pg_policies
--      WHERE tablename = 'service_visits' ORDER BY cmd, policyname;
--    Expected: BOTH 'Community members can view visits' AND
--              'service_visits_select_cross_community' present under SELECT.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Creators can update their visits" ON public.service_visits;
CREATE POLICY "Creators can update their visits"
  ON public.service_visits FOR UPDATE
  USING (
    public.is_user_approved(auth.uid())
    AND (
      created_by = auth.uid()
      OR public.is_community_lead(auth.uid())
      OR public.is_platform_admin(auth.uid())
    )
  )
  WITH CHECK (
    public.is_user_approved(auth.uid())
    AND (
      created_by = auth.uid()
      OR public.is_community_lead(auth.uid())
      OR public.is_platform_admin(auth.uid())
    )
    -- Pin the tenant: an UPDATE must not move a visit into another community.
    AND community_id = (SELECT pr.community_id FROM public.profiles pr WHERE pr.id = auth.uid())
  );

DROP POLICY IF EXISTS "Creators can delete their visits" ON public.service_visits;
CREATE POLICY "Creators can delete their visits"
  ON public.service_visits FOR DELETE
  USING (
    public.is_user_approved(auth.uid())
    AND (
      created_by = auth.uid()
      OR public.is_community_lead(auth.uid())
      OR public.is_platform_admin(auth.uid())
    )
  );

-- NOTE on the WITH CHECK above: a platform admin has community_id IS NULL, so the
-- pin would block them. That is deliberate and matches docs/CLAUDE.md §5 — a platform
-- admin has no RLS grant on community-scoped tables and must go through a platform_* RPC.
-- They retain DELETE (no WITH CHECK on DELETE policies) which is the moderation power
-- the admin console actually needs.

-- ------------------------------------------------------------
-- 5. Time-slot sanity (issue 21). Format-only; the ordering rule stays
--    in the client, where it can produce a readable message.
-- ------------------------------------------------------------
-- PRE-FLIGHT — rows that would violate the new constraint:
--   SELECT id, title, visit_time_slot FROM public.service_visits
--   WHERE visit_time_slot !~* '^\s*\d{1,2}:\d{2}\s*(am|pm)\s*-\s*\d{1,2}:\d{2}\s*(am|pm)\s*$';
--   Expected on 2026-08-08: 0 rows (all four live formats match).
--   The two nonsensical live values ('08:50 am - 07:50 am', '11:37 pm - 12:37 am')
--   are correctly FORMATTED, so this constraint does not reject them. C3/C4 stop
--   new ones; these two are pilot data and are left alone.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.service_visits'::regclass
      AND conname  = 'service_visits_time_slot_format'
  ) THEN
    ALTER TABLE public.service_visits
      ADD CONSTRAINT service_visits_time_slot_format
      CHECK (visit_time_slot ~* '^\s*\d{1,2}:\d{2}\s*(am|pm)\s*-\s*\d{1,2}:\d{2}\s*(am|pm)\s*$');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 6. A resident with no display name must still be able to create a visit
--    (issue 23). Mirrors the COALESCE that handle_visit_rescheduled_notification()
--    already has, and adds the search_path pin it has always lacked.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_visit_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    p.id,
    'new_visit',
    'New planned visit',
    COALESCE(
      (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = NEW.created_by),
      'A neighbour'
    ) || ' scheduled a ' || NEW.category || ' visit.',
    jsonb_build_object('visit_id', NEW.id)
  FROM public.profiles p
  WHERE p.community_id = NEW.community_id
    AND p.id <> NEW.created_by
    AND p.removed_at IS NULL;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
```

---

## Client tasks

### C1 — `app/(tabs)/index.tsx`

**Closes: 11, 14, 15.**

**1. Escape and extend the provider search (issue 11).** Replace [lines 158-160](../../app/(tabs)/index.tsx#L158-L160):

```tsx
if (debouncedSearchQuery) {
  // PostgREST's `or=` uses ',' as its delimiter and '%' as a wildcard, so the raw
  // input cannot be interpolated: a comma 400s (PGRST100) and a bare '%' matches
  // every row. Strip the logic-tree metacharacters, then match name, category,
  // and — per docs/CLAUDE.md §3 — phone, digits-stripped on both sides.
  const safe = debouncedSearchQuery.replace(/[,()%\\.]/g, ' ').trim();
  const digits = debouncedSearchQuery.replace(/\D/g, '');
  if (safe || digits) {
    const clauses: string[] = [];
    if (safe)   clauses.push(`name.ilike.%${safe}%`, `category.ilike.%${safe}%`);
    if (digits) clauses.push(`phone.ilike.%${digits}%`);
    query = query.or(clauses.join(','));
  }
}
```

Change the placeholder at [line 515](../../app/(tabs)/index.tsx#L515) from `"Search help..."` to the mandated `"Search by name or phone number..."`.

**2. Read the error on favourite writes (issue 14).** [Lines 380-402](../../app/(tabs)/index.tsx#L380-L402) — `supabase-js` returns errors rather than throwing, so replace the `try/catch` with an explicit check:

```tsx
const { error } = isCurrentlyFavorite
  ? await supabase.from('favorites').delete().match({ user_id: user?.id, provider_id: providerId })
  : await supabase.from('favorites').insert({ user_id: user?.id as string, provider_id: providerId });

if (error) {
  setProviders(current => current.map(p => p.id === providerId ? { ...p, is_favorite: isCurrentlyFavorite } : p));
  Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to update favorites' });
}
```

**3. Distinguish failure from emptiness (issue 15).** Add `const [loadError, setLoadError] = useState<string | null>(null);` and a `loading` flag. Set `loadError` in both `catch` blocks ([line 198](../../app/(tabs)/index.tsx#L198), [line 327](../../app/(tabs)/index.tsx#L327)), clear it on success. Then branch `ListEmptyComponent`:

- `loading` → `<ActivityIndicator>`
- `loadError` → `<EmptyState ionicon="cloud-offline-outline" title="Couldn't load providers" message="Check your connection and pull down to retry." />`
- otherwise → today's empty state

Apply the same to the visits `ListEmptyComponent` ([lines 643-661](../../app/(tabs)/index.tsx#L643-L661)). Also surface a non-missing-relation hires error at [lines 176-181](../../app/(tabs)/index.tsx#L176-L181) rather than silently zeroing every `hire_count`.

### C2 — `app/provider/[id].tsx`

**Closes: 3, 4, 9, 14, 20.** Part of set A, part of set B — split the commit as noted.

**1. [SET A] Platform-split the delete confirmation and read the delete error (issue 3).** Replace [lines 563-577](../../app/provider/[id].tsx#L563-L577):

```tsx
const performDelete = async () => {
  if (!provider) return;
  const { error } = await supabase.from('service_providers').delete().eq('id', provider.id);
  if (error) {
    Toast.show({ type: 'error', text1: 'Delete failed', text2: error.message });
    return;
  }
  Toast.show({ type: 'success', text1: 'Provider deleted' });
  goBackSmart(router, '/provider/' + provider.id);
};

const handleDelete = () => {
  if (!provider || !canDelete) return;
  const prompt = 'Delete this provider? This cannot be undone.';
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(prompt)) void performDelete();
  } else {
    Alert.alert('Delete provider', prompt, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: performDelete },
    ]);
  }
};
```

Note that a `.delete()` matching zero rows returns **no error** — so also treat "no error but the row is still visible" as a failure by re-checking, or use `.select('id')` on the delete and assert a row came back. Use the latter: `.delete().eq('id', provider.id).select('id')` and fail if `data?.length !== 1`.

**2. [SET B] `.maybeSingle()` and a real not-found state (issue 4).** Change [line 116](../../app/provider/[id].tsx#L116) `.single()` → `.maybeSingle()`, and handle the `null` case explicitly. Replace the guard at [lines 579-585](../../app/provider/[id].tsx#L579-L585):

```tsx
if (loading) {
  return (<View style={styles.centerContainer}><ActivityIndicator size="large" color={colors.primary} /></View>);
}

if (!provider) {
  return (
    <View style={styles.centerContainer}>
      <Text style={{ color: colors.textMuted, marginBottom: 12 }}>
        This provider is no longer available.
      </Text>
      <TouchableOpacity onPress={() => goBackSmart(router, '/provider/x')}>
        <Text style={{ color: colors.primary }}>Back to providers</Text>
      </TouchableOpacity>
    </View>
  );
}
```

Remove the `router.back()` from the `catch` at [line 156](../../app/provider/[id].tsx#L156) — the not-found state replaces it.

**3. [SET B] Fix the WhatsApp link (issue 9).** [Lines 221-232](../../app/provider/[id].tsx#L221-L232) — phones are stored as bare 10 digits (D8), so prefix the country code at link time:

```tsx
const cleanPhone = provider.phone.replace(/[^0-9]/g, '');
// Stored numbers are bare 10-digit Indian mobiles; wa.me requires the country code.
const intlPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
const url = `whatsapp://send?phone=${intlPhone}`;
…
else { await Linking.openURL(`https://wa.me/${intlPhone}`); }
```

**4. [SET B] Roll back the favourite on failure (issue 14).** Same treatment as C1 §2, at [lines 272-286](../../app/provider/[id].tsx#L272-L286).

**5. [SET B] Relabel the hire count (issue 20).** `provider_hires` counts contact taps, not households. Change the stat tile at [line 632](../../app/provider/[id].tsx#L632) from **"Homes used"** to **"Contacts"**, the pill at [lines 614-618](../../app/provider/[id].tsx#L614-L618) from `N hires` to `contacted N times`, the share line at [line 249](../../app/provider/[id].tsx#L249) from `Community Hires: N homes` to `Contacted by neighbours: N times`, and the card meta in [`components/ProviderCard.tsx:91-93`](../../components/ProviderCard.tsx#L91-L93) from `N hires` / `0 homes` to `N contacts` / `no contacts yet`. Do not change the write.

**6. [SET B] Give leads the report affordance too (issue 26-adjacent).** [Lines 831-858](../../app/provider/[id].tsx#L831-L858) are an either/or: leads get Delete *instead of* Report. Render both for a lead.

### C3 — `app/visits/add.tsx` + `components/ProviderSelector.tsx`

**Closes: 10, 22, 25.**

**1. Carry the provider's phone into `provider_whatsapp` (issue 10, D9).** In `ProviderSelector`, widen the select at [line 61](../../components/ProviderSelector.tsx#L61) to `'id, name, phone, fraud_status'`. In `visits/add.tsx`, **delete** the dead `selectedProvider?.whatsapp` read at [lines 169-171](../../app/visits/add.tsx#L169-L171) — `service_providers` has no such column — and replace it:

```tsx
// service_providers has no `whatsapp` column; in India the mobile IS the
// WhatsApp number, so reuse the (already normalised) provider phone.
const normalizedExistingWhatsapp = normalizedExistingPhone;
```

**2. Hide fraud-flagged providers from the picker (issue 25).** Apply the Help tab's filter in `ProviderSelector.fetchProviders`:

```tsx
setProviders((data || []).filter((p: any) =>
  !p.fraud_status || p.fraud_status === 'pass' || p.fraud_status === 'queued_low'));
```

**3. Validate `max_joiners` before submit (issue 22).** In `handleSave`, before the insert:

```tsx
const parsedMaxJoiners = maxJoiners.trim() ? Number.parseInt(maxJoiners.trim(), 10) : null;
if (parsedMaxJoiners !== null && (!Number.isFinite(parsedMaxJoiners) || parsedMaxJoiners < 1)) {
  return Toast.show({
    type: 'error',
    text1: 'Invalid max joiners',
    text2: 'Enter 1 or more, or leave it empty for unlimited.',
  });
}
```

and use `parsedMaxJoiners` at [line 201](../../app/visits/add.tsx#L201).

**4. Use `goBackSmart` for the header arrow (issue 13).** [Line 222](../../app/visits/add.tsx#L222): `onPress={() => goBackSmart(router, '/visits/add')}`.

### C4 — `app/visits/[id].tsx`

**Closes: 5, 6, 8, 9, 12, 13, 16, 17, 18.** The largest client task.

**1. Wire up Reschedule (issue 5, D14).** In the creator action group at [lines 519-532](../../app/visits/[id].tsx#L519-L532), add between Mark-as-completed and Cancel:

```tsx
{visit.status === 'upcoming' && (
  <TouchableOpacity style={[styles.rescheduleBtn, { borderColor: colors.border }]} onPress={handleOpenReschedule}>
    <Text style={[styles.rescheduleBtnText, { color: colors.primary }]}>Reschedule</Text>
  </TouchableOpacity>
)}
```

`styles.rescheduleBtn` and `styles.rescheduleBtnText` already exist at [lines 1098-1108](../../app/visits/[id].tsx#L1098-L1108) and are currently unused. This single addition also revives the deployed `on_service_visit_rescheduled` trigger — which makes C6 §2 mandatory in the same change set.

**2. Let a host complete a past visit (issue 6, D5).** The footer is gated on `!isPast` at [line 516](../../app/visits/[id].tsx#L516). Change the gate so a *creator* still sees actions on a past visit:

```tsx
{(!isPast || isCreator) && (
```

and inside, for the past case, show only **Mark as completed** and **Delete visit** (a past visit cannot meaningfully be "cancelled"). Keep the join/leave controls hidden when `isPast`.

**3. Add lead moderation controls (issue 12, D12).** Pull `isCommunityLead` and `isPlatformAdmin` from `useAuth()` and render a **Cancel visit** / **Delete visit** pair for `isCommunityLead || isPlatformAdmin` when they are not the creator. Both must read the returned `error` and both must confirm — reuse the `Platform.OS` split that `handleLeave` already has at [lines 278-293](../../app/visits/[id].tsx#L278-L293).

**4. Never lose `has_user_joined` (issue 8).** Three changes in `fetchVisitData` ([lines 162-223](../../app/visits/[id].tsx#L162-L223)):

- **Guard the RPC on a real community id.** Do not call it with `''`. Return early (keep `loading` true) until `profile?.community_id` is available, or gate the whole effect on it.
- **Check `visitsResult.error`.** [Line 178](../../app/visits/[id].tsx#L178) checks only `joinersResult.error`. After M1 an unauthorized call *raises*, so swallowing it would hide a real failure.
- **Derive `has_user_joined` in the fallback** from data you already have:

```tsx
setVisit({
  ...directData,
  creator_name: creatorResult.data?.full_name || 'Neighbour',
  creator_flat: creatorResult.data?.flat_number,
  creator_avatar_url: creatorResult.data?.avatar_url,
  joiner_count: joinersData.length,
  has_user_joined: joinersData.some((j: VisitJoinerWithProfile) => j.user_id === user.id),
});
```

Also widen the RPC call to `p_status: 'upcoming,in_progress,completed,cancelled'` so the fallback is the exception rather than the rule.

**5. Confirm destructive status changes and disable in flight (issue 16).** Wrap `updateStatus('cancelled')` and `updateStatus('completed')` in the same `Platform.OS`-split confirm as `handleLeave`, add an `isUpdatingStatus` state, and set `disabled={isUpdatingStatus}` on both buttons. Have `updateStatus` read the returned `error` (it currently relies on `throw`, which `supabase-js` does not do — [lines 297-302](../../app/visits/[id].tsx#L297-L302) destructures `error` correctly, so only the button guard is missing).

**6. Fix the WhatsApp link (issue 9).** [Line 463](../../app/visits/[id].tsx#L463):

```tsx
onPress={() => {
  const digits = (visit.provider_whatsapp || '').replace(/\D/g, '');
  const intl = digits.length === 10 ? `91${digits}` : digits;
  void Linking.openURL(`https://wa.me/${intl}`);
}}
```

**7. Branch share on `navigator.share` (issue 17).** [Lines 332-351](../../app/visits/[id].tsx#L332-L351) — copy the branch from [`components/VisitCard.tsx:95-102`](../../components/VisitCard.tsx#L95-L102), include the `/visits/<id>` deep link that `VisitCard` builds, and replace `console.error` with a toast (ignoring `AbortError`, as [`app/(tabs)/index.tsx:133-139`](../../app/(tabs)/index.tsx#L133-L139) already does).

**8. Stop inventing a rupee figure (issue 18, D11).** Delete `parsedEstimatedCost` at [line 160](../../app/visits/[id].tsx#L160) and the `<Rupees>` branch at [lines 440-444](../../app/visits/[id].tsx#L440-L444); render `visit.estimated_cost || 'Not specified'` as text, exactly as the card does. Do **not** modify `components/Rupees.tsx`.

**9. Fix back navigation (issue 13).** Replace `handleBack` at [lines 320-330](../../app/visits/[id].tsx#L320-L330) with `goBackSmart(router, \`/visits/${id}\`)`, which — once C5 lands — resolves to the Help tab and pops properly instead of replacing. If the `returnTo`/`visitTab` round-trip must be preserved, keep it but note that `visitTab === 'past' ? 'past' : 'upcoming'` currently loses **Archived**; carry the value through unchanged.

### C5 — `lib/navigation.ts` (narrow edit)

**Closes: 13.** Add exactly these two blocks to `getImmediateParentRoute`, immediately before the `// 7. Personal service reminders` comment at [line 175](../../lib/navigation.ts#L175). Change nothing else in the file.

```ts
  // 6b. Providers & visits (Help tab)
  if (cleanPath === '/provider/add') return '/';
  if (cleanPath.startsWith('/provider/')) return '/';
  if (cleanPath === '/visits/add') return '/';
  if (cleanPath.startsWith('/visits/')) return '/';
```

`/` is the Help tab (`app/(tabs)/index.tsx`); `normalizeRoute` already strips the `(tabs)` group, so `/` is the correct literal.

Then switch the four raw `router.back()` header handlers to `goBackSmart(router, <path>)`: [`app/provider/[id].tsx:591`](../../app/provider/[id].tsx#L591), [`app/provider/add.tsx:350`](../../app/provider/add.tsx#L350), [`app/visits/add.tsx:222`](../../app/visits/add.tsx#L222), [`app/visits/[id].tsx:329`](../../app/visits/[id].tsx#L329).

### C6 — `app/notifications.tsx` (narrow edit)

**Closes: 19.** Two `case` labels and one `if`. Change nothing else.

**1.** In `getNotificationIcon` ([lines 30-66](../../app/notifications.tsx#L30-L66)):

```ts
      case 'provider_reported':
        return 'flag';
      case 'visit_rescheduled':
        return 'calendar';
```

**2.** In `handleNotificationPress`, beside the existing `new_visit` branch ([lines 87-89](../../app/notifications.tsx#L87-L89)):

```ts
    if (notification.type === 'provider_reported' && notification.data?.provider_id) {
      router.push(`/provider/${notification.data.provider_id}`);
      return;
    }

    if (notification.type === 'visit_rescheduled' && notification.data?.visit_id) {
      router.push(`/visits/${notification.data.visit_id}`);
      return;
    }
```

`provider_id` and `visit_id` are already present in `data` for both types — see `handle_provider_report_notification()` in `20260822000000` and `handle_visit_rescheduled_notification()` in `20260607113000`.

### C7 — Scale and hygiene

**Closes: 24.**

- Add `.limit(100)` to the provider query at [`app/(tabs)/index.tsx:146-150`](../../app/(tabs)/index.tsx#L146-L150) and to the visits query at [lines 210-214](../../app/(tabs)/index.tsx#L210-L214). Full pagination is a larger project; a bound plus a "showing first 100" note is the right size for now.
- Debounce the `ProviderSelector` search input 300 ms into a separate state before filtering ([`components/ProviderSelector.tsx:74-76`](../../components/ProviderSelector.tsx#L74-L76)), per `docs/CLAUDE.md` §3.

### C8 — Verandah cleanup

**Closes: 26.** Bind every raw hex to a `Verandah` token, delete the `shadow*`/`elevation` block from the report modal, drop every `fontWeight` of 600 or above to `'500'`, remove `textTransform: 'uppercase'` from the two body-title styles, and convert the Title Case strings listed in issue 26 to sentence case. Anything that genuinely cannot conform must be logged in the out-of-register appendix of [`docs/verandah.md`](../verandah.md) with path, reason, and follow-up.

---

# VERIFICATION

**`npx tsc --noEmit` catches none of the 26 findings.** Every one of them type-checks cleanly today and will type-check cleanly if you fix it wrongly. `tsc` passing means nothing here except that you did not break the build. This checklist is the actual gate.

**Test accounts** (the app is pre-production; the Supabase project holds pilot data only):

| Role | Email | Password |
|---|---|---|
| `president` | `ira@gmail.com` | `123456` |
| `resident` | `ira3@gmail.com` | `123456` |

There is **no platform-`admin` test account on this project**. Every `admin` row below is reasoned from RLS and the `platform_*` RPCs and could **not** be exercised live during this audit. Do not change these accounts' passwords, roles, or community membership, and do not delete data you did not create. Start with `npm run web` for the fastest loop — it is also the only way to see the web-only defects (issues 3, 17).

## Database

| # | Check | Account / method | Expected |
|---|---|---|---|
| 1 | `POST /rest/v1/rpc/get_community_visits` with **only the anon key**, no session | curl / fetch | **Fails** (404 "function does not exist" — the grant is gone). **Observed before the fix: HTTP 200 with all 6 visits, provider phones, host name and flat number.** |
| 1 | `POST /rest/v1/rpc/get_visit_joiners` with only the anon key | curl / fetch | **Fails.** **Observed before the fix: HTTP 200 returning `user_name: "Ira3", flat_number: "A113"`.** |
| 1 | `get_community_visits` with a `p_community_id` that is not the caller's | resident `ira3@gmail.com` | `RAISE EXCEPTION 'Not authorized…'`. Cannot be exercised on this project today — `communities_count = 1`. Note it as untested and re-run when a second community exists. |
| 1 | `get_community_visits` with `p_user_id` set to another resident's uuid | resident | `has_user_joined` reflects **the caller**, not the argument |
| 1, 2 | `SELECT proname, prosecdef, proconfig FROM pg_proc … WHERE proname IN ('get_community_visits','get_visit_joiners','auto_complete_past_visits')` | `npx supabase db query --linked` | Two rows, both `proconfig = {search_path=public}`; `auto_complete_past_visits` **absent**. **Observed before: three rows, all `(no search_path)`, all granted to `anon`.** |
| 7 | Two browser sessions (president + resident) join the **last seat** of a `max_joiners = 1` visit within a second of each other | both accounts, two windows | Exactly one succeeds; the other sees **"This visit is already full (1 of 1 neighbours joined)"**. Before the fix both succeed — **there is no trigger on `visit_joiners`** (verified in `pg_trigger`). |
| 6 | `SELECT count(*) FROM service_visits WHERE status='upcoming' AND visit_date < CURRENT_DATE` | db query | `0` after the M2 §3 backfill. **Observed before: 4.** |
| 12 | President cancels a visit created by `ira3@gmail.com` | president | Succeeds. Before the fix the `UPDATE` matches zero rows. |
| 12 | Resident `PATCH`es their own visit's `community_id` to another uuid | resident, REST | Rejected by the `WITH CHECK` pin. Not exercisable today (1 community) — re-test when a second exists. |
| 22 | Create a visit with `max_joiners = -5` | resident | Client blocks it with "Enter 1 or more…"; a direct REST insert is blocked by `service_visits_max_joiners_positive` |
| 21 | Direct REST insert with `visit_time_slot = 'whenever'` | resident | Rejected by `service_visits_time_slot_format` |
| 23 | Reasoned only — no live account has a NULL `full_name` (`profiles_null_full_name = 0`) | — | Confirm by reading the new `COALESCE` in `handle_new_visit_notification()`. State plainly that it was not reproduced. |

### Federation preservation (D17, D18) — run every row; a failure here means cross-community work was destroyed

| Check | Method | Expected |
|---|---|---|
| Both `SELECT` policies still stand on `service_visits` | `SELECT policyname, cmd FROM pg_policies WHERE tablename='service_visits' ORDER BY cmd, policyname;` | **Both** `Community members can view visits` **and** `service_visits_select_cross_community` present. If the federation one is missing, M2 was written wrong — revert and re-read D18. |
| Same on `service_providers` | same query, `tablename='service_providers'` | Both `Users can view providers in their community` and `service_providers_select_cross_community` present |
| The three federation helpers survive, `SECURITY DEFINER`, `search_path` pinned | `SELECT proname, prosecdef, proconfig FROM pg_proc WHERE proname IN ('can_user_see_visit','can_user_see_provider','get_user_partner_community_ids');` | 3 rows, all `prosecdef = t`, all `proconfig = {search_path=public}` — **unchanged from before the migration** |
| Federation tables and columns intact | `SELECT to_regclass('public.service_visit_communities'), to_regclass('public.provider_shares'), to_regclass('public.community_partnerships'), to_regclass('public.community_groups'), to_regclass('public.community_group_members');` | All five non-null |
| `service_visits.is_cross_community` and `service_providers.visibility` / `shared_by_community_id` still exist | `\d public.service_visits` / `\d public.service_providers`, or read `lib/database.types.ts` after regeneration | All three columns present |
| M1 did not make the RPC more permissive than RLS | Compare, as `ira3@gmail.com`: `SELECT count(*) FROM service_visits;` (RLS path) vs `get_community_visits(<own community>, <uid>, 'upcoming,in_progress,completed,cancelled', 'past')` + the `'upcoming'` scope | The RPC returns a **subset of or equal to** the RLS count. Never more. Observed pre-fix: RLS 6, RPC (anon, no session) **6** — the whole point of M1. |
| The `'visits'` capability is inert today, as designed | `SELECT scope FROM community_partnerships;` | No row contains a `"visits"` key, so `get_user_partner_community_ids('visits', …)` returns the caller's home community only, and M1 behaves exactly like the single-community policy. Zero partnership rows today is also a pass. |
| Cross-community read path, when federation ships | **Not exercisable today** — `communities_count = 1` and there are no active partnerships | Record as untested. Re-run when a second community and an `active` partnership with `{"visits": true}` exist: a partner resident must see only visits with a matching `service_visit_communities` row. |

## Web (PWA) — `npm run web`

| # | Check | Account | Expected |
|---|---|---|---|
| 3 | Provider detail → **Delete provider** | **president** | A `window.confirm` appears; confirming deletes and the provider is gone from the Help tab. **Before the fix: absolutely nothing happens — `Alert.alert` is a web no-op.** |
| 3 | Same button | **resident** | The button is not rendered at all (`canDelete` false). If it is reachable by any means and reports success, that is a P0 regression. |
| 4 | Hard-load `/provider/00000000-0000-0000-0000-000000000000` in a fresh tab | resident | "This provider is no longer available" **plus a working back link**. **Before the fix: an infinite spinner with no back button.** |
| 4 | Hard-load `/visits/00000000-0000-0000-0000-000000000000` | resident | A not-found state with a working back control |
| 5 | Open a future visit you created → **Reschedule** | president | The modal opens, `<input type="date">` and both `<input type="time">` render and accept input, saving updates the card. **Before the fix there is no button at all.** |
| 5, 19 | After rescheduling, sign in as `ira3@gmail.com` → notifications | resident | A **"Visit Rescheduled"** row exists **and tapping it opens that visit**. Before: the notification never existed; had it existed, the tap would do nothing. |
| 11 | Type `Ramesh, plumber` into the Help-tab provider search | resident | Results, or a clean empty state. **Before the fix: a red "Failed to load providers" toast — reproduced live, HTTP 400 `PGRST100`.** |
| 11 | Type `9392034156` (a real stored number) | resident | The matching provider appears. **Before the fix: 0 results — reproduced live.** |
| 11 | Type `%` | resident | Not all 171 providers. **Before the fix: exactly 171 — reproduced live.** |
| 15 | Kill the network (devtools offline), pull to refresh the Help tab | resident | "Couldn't load providers — check your connection", **not** "Be the first to add a trusted service provider!" |
| 17 | Visit detail → share icon, on **desktop Chrome** | resident | Either a share sheet or a visible fallback/toast. **Before the fix: silent no-op, `console.error` only.** |
| 18 | Create a visit with estimated cost `300-500`, open the detail | resident | The detail reads **`300-500`**, matching the card. **Before the fix: `₹3,00,500` — measured.** |
| 13 | Paste `/visits/<id>` into a fresh tab, then tap the header back arrow | resident | Lands on the Help tab, Visits segment. **Before the fix: the arrow does nothing.** |
| 13 | Same for `/provider/<id>` | resident | Lands on the Help tab, Providers segment |
| 8 | Join a visit, then **hard-reload** the visit URL | resident | **Leave this visit**, not **Join this visit**. **Before the fix a reload during the profile-load window shows Join, and tapping it produces `duplicate key value violates unique constraint "one_join_per_user_per_visit"` in a toast.** |
| 16 | Tap **Cancel visit** | president | A `window.confirm` first; the button is disabled while the write is in flight |
| 14 | Devtools offline → tap a bookmark on a provider card | resident | The icon reverts and an error toast appears. **Before the fix it stays filled and the Saved tab does not contain it.** |

## Native — `npm run android`

| # | Check | Account | Expected |
|---|---|---|---|
| 3 | Provider detail → **Delete provider** | president | `Alert.alert` appears and still works — the web branch must not have broken native |
| 5 | **Reschedule** → date and time pickers | president | `@react-native-community/datetimepicker` opens for all three fields |
| 9 | Provider detail → **WhatsApp** | resident | WhatsApp opens **on the correct contact**. **Before the fix: `wa.me/9876543210` → WhatsApp's "Phone number shared via url is invalid" page.** |
| 9 | Visit detail → the WhatsApp icon on a **manually entered** provider | resident | Same |
| 10 | Create a visit via **Select existing provider**, open the detail | resident | The WhatsApp icon **is present**. **Before the fix it never rendered — `service_providers` has no `whatsapp` column.** |
| 13 | Deep-link `/visits/<id>`, then Android **hardware back** | resident | Help tab. **Before the fix: the MCN hub, because `getImmediateParentRoute` falls through to `/network`.** |
| 16 | Tap **Cancel visit** | president | `Alert.alert` confirm |
| 20 | Tap **Call**, then **WhatsApp**, on the same provider | resident | The stat tile reads **"Contacts"**, not "Homes used" |

## Timezone and lifecycle (the awkward ones)

| # | Check | How | Expected |
|---|---|---|---|
| 6 | **At 01:00 IST** (UTC is still the previous day), open the Help tab → Visits | Set the device clock to 01:00 IST with a visit dated *today* | The visit stays in **Upcoming**, not Recent. `parseLocalDateOnly` ([`app/(tabs)/index.tsx:41-45`](../../app/(tabs)/index.tsx#L41-L45)) is already local-date-only and correct — this row guards against a regression, not a known bug. |
| 6 | At 01:00 IST, confirm the server agrees | `get_community_visits` with `p_time_scope='upcoming'` | Between 00:00 and 05:30 IST the server's `CURRENT_DATE` (UTC) lags the resident's date, so the RPC is **more** inclusive than the client. Confirm the client's own filter still owns the bucketing and no visit appears in two tabs. |
| 6 | Create a visit dated **today**, then set the clock to tomorrow and reopen it | creator | **Mark as completed** is still offered (C4 §2). Before the fix the whole footer vanished. |
| — | **Cascade:** president deletes a provider that a visit references | president | The visit survives with `provider_id` NULL (`ON DELETE SET NULL`) and still shows `provider_name` text. Confirm the **View profile** link is hidden — it is already gated on `visit.provider_id` at [`app/visits/[id].tsx:470`](../../app/visits/[id].tsx#L470). |
| — | **Cascade:** creator deletes a visit that has joiners | creator | `visit_joiners` rows cascade away; the joiner's UI shows a clean not-found state, not a spinner |
| — | **Notification cadence:** create one visit | resident | Exactly **one** `new_visit` row per other community member — not one per joiner, not duplicates. Confirm the count matches `community members − 1`. |
| — | **Empty state:** a brand-new community with zero providers | any | "No providers found — be the first" (the *genuine* empty state, distinct from the new error state) |

## Regression sweep

| Area | Check |
|---|---|
| Saved tab | `app/(tabs)/favorites.tsx` still lists bookmarked providers; the C1/C2 favourite change did not alter its query |
| Reminders | `app/services/add.tsx` provider picker still searches by name **and phone** — it is the reference implementation for C1 §1 and must not have been "unified" into the broken version |
| MCN | `/network` and every `/mcn/*` header arrow still resolves correctly after the C5 edit to `getImmediateParentRoute` |
| Funds | `/funds/*` parent mappings unchanged |
| Notifications | `new_visit`, carpool, funds, and community-approval taps all still route (C6 must not have reordered the chain) |
| Federation | Covered in full by the [Federation preservation](#federation-preservation-d17-d18--run-every-row-a-failure-here-means-cross-community-work-was-destroyed) block above — run every row of it |
| Types | `lib/database.types.ts` still ends with the hand-maintained `ProviderWithInteraction` / `VisitWithJoinerData` / `VisitJoinerWithProfile` block after `gen types` |
| Build | `npx tsc --noEmit` clean |

---

# DOCUMENTATION UPDATES

Each fact goes to exactly **one** owning file. Do not restate schema columns in `features.md`.

### [`docs/architecture.md`](../architecture.md) — schema, RLS, RPCs, triggers, routes

- **`get_community_visits`** — now requires an authenticated caller; validates `p_community_id` against `get_user_partner_community_ids('visits', auth.uid())` (platform admins exempt) and filters rows with `can_user_see_visit()`; **ignores `p_user_id`** and always answers `has_user_joined` for `auth.uid()`; pinned with `SET search_path = public`; granted to `authenticated` only (`anon` and `PUBLIC` revoked).
- **`get_visit_joiners`** — same model, gated entirely on `can_user_see_visit(p_visit_id, auth.uid())`; unknown visit ids return an empty set.
- **Both RPCs are federation-aware by construction** and reuse the canonical helpers rather than a direct `community_id` comparison, so the deferred cross-community work needs no rewrite when its UI ships (D17). Record the **new `visits` capability key** for `community_partnerships.scope` alongside the existing `providers` key — it is currently unused, which is what makes the change behaviourally inert today.
- **`auto_complete_past_visits()`** — **dropped.** Record why: it was `SECURITY DEFINER`, granted to `anon`, and never scheduled (`pg_cron` is not installed on this project). Visit completion is now a manual host action.
- **New trigger `visit_joiner_capacity_guard`** on `visit_joiners` (`BEFORE INSERT`, `SECURITY DEFINER`, `SET search_path`) enforcing `max_joiners`.
- **New constraints** `service_visits_max_joiners_positive` and `service_visits_time_slot_format`.
- **`service_visits` UPDATE/DELETE policies** now include `is_community_lead()` and `is_platform_admin()`; the UPDATE `WITH CHECK` pins `community_id` so a visit cannot be moved between communities. Note the deliberate consequence: a platform admin retains DELETE but not UPDATE, per the §5 rule that they have no RLS grant on community-scoped tables.
- **`handle_new_visit_notification()`** — `full_name` is now `COALESCE`d and `search_path` is pinned.
- **Route parents**: `/provider/*` and `/visits/*` map to `/` (the Help tab) in `getImmediateParentRoute()`.
- **Notification routing**: `provider_reported` → `/provider/[id]`, `visit_rescheduled` → `/visits/[id]`.

### [`docs/features.md`](../features.md) — user-visible behaviour (§2, Help tab)

- **Provider detail**: Delete provider now confirms on both platforms and reports real failures. The hire counter is relabelled **"Contacts"** — it counts contact taps, not households. Community leads now see **Report provider** as well as **Delete provider**.
- **Visit detail**: **Reschedule** is now reachable from the creator's action group (it was documented as working and was not). The creator can **Mark as completed** on a past visit. Community leads and platform admins can cancel or delete a visit. Cancel and Mark-as-completed now confirm before writing. Estimated cost is displayed as the text the host typed, on both the card and the detail screen — no rupee re-formatting.
- **Visits are no longer auto-completed by the server.** A past visit keeps its stored status; the badge is derived client-side, and only the host can mark it completed.
- **Providers segment**: search now matches name, category, **and phone number** (digits stripped on both sides), with the placeholder `"Search by name or phone number..."`. A failed fetch now shows an error state instead of the empty state.
- **Add visit**: **Max joiners** must be 1 or more, or empty for unlimited. A visit created from an existing provider now carries that provider's number as the WhatsApp contact.

### [`docs/CLAUDE.md`](../CLAUDE.md) — conventions and traps (§9)

Add these rows to the trap table:

| Trap | Reality |
|---|---|
| A `SECURITY DEFINER` RPC that takes `community_id` or `user_id` as a **parameter** | It is an RLS bypass with a caller-controlled scope. `get_community_visits` and `get_visit_joiners` shipped this way and were readable by `anon`. Always derive scope from `auth.uid()`, always `REVOKE ... FROM PUBLIC, anon`, always `SET search_path`. |
| Interpolating user text into a PostgREST `.or()` filter | `,` is the delimiter and `%` is a wildcard. A comma returns **HTTP 400 `PGRST100`**; a bare `%` matches every row. Strip `,()%\.` before interpolating. |
| Assuming a `.delete()` that matched zero rows is an error | It is not. `supabase-js` returns `{ error: null }`. Chain `.select('id')` and assert a row came back. |
| A `wa.me` / `whatsapp://` link built from a stored Indian mobile | Numbers are stored as **bare 10 digits** (`normalize_indian_mobile`). `wa.me` needs the country code — prefix `91` at link time, never at write time. |
| `Share.share` on desktop web | Rejects when `navigator.share` is absent. Branch on `Platform.OS === 'web' && navigator.share` first, and toast the failure — do not `console.error` it. |

Also add to §1/§3: **`pg_cron` is not installed on this project.** Do not write a migration that assumes a scheduled job will run.

### [`docs/verandah.md`](../verandah.md)

Log anything from issue 26 that genuinely cannot conform in the out-of-register appendix, with path, reason, and follow-up.

### [`docs/disabled-features.md`](../disabled-features.md)

- **Automatic visit completion — removed.** `auto_complete_past_visits()` existed but was never scheduled and has been dropped; visit completion is a manual host action. Record the reason (no `pg_cron`) and what re-enabling would require.

### [`docs/cross-community-changelog.md`](../cross-community-changelog.md) — **mandatory entry, same change set**

M1 changes federation-visible behaviour (the two visit RPCs now call `can_user_see_visit()` and `get_user_partner_community_ids()`), so an append-only entry is required. Suggested text:

> **2026-08-31 — Visit RPCs became federation-aware while closing an anonymous read leak.**
> `get_community_visits` and `get_visit_joiners` were `SECURITY DEFINER` with no authorization and were `EXECUTE`-able by `anon`, so any caller holding the public anon key could read every visit and joiner in any community. Both are now pinned with `SET search_path = public`, revoked from `PUBLIC`/`anon`, and granted to `authenticated` only.
> The new authorization is deliberately built from the canonical federation helpers rather than a direct `community_id` comparison: `get_community_visits` gates its `p_community_id` argument on `get_user_partner_community_ids('visits', auth.uid())` and filters rows with `can_user_see_visit(sv.id, auth.uid())`; `get_visit_joiners` gates entirely on `can_user_see_visit(p_visit_id, auth.uid())`. `p_user_id` is now ignored and `has_user_joined` always answers for `auth.uid()`.
> **No federation object was removed or narrowed.** `service_visits_select_cross_community`, `service_providers_select_cross_community`, `can_user_see_visit`, `can_user_see_provider`, `get_user_partner_community_ids`, `service_visit_communities`, `provider_shares`, and `service_visits.is_cross_community` are all unchanged. The `service_visits` `UPDATE`/`DELETE` policies were widened to community leads and platform admins and the `UPDATE WITH CHECK` now pins `community_id`; both are single-community policies with no federation counterpart, and the pin constrains ownership, not sharing.
> **New capability key: `visits`.** It appears in no `community_partnerships.scope` JSONB yet, so partner reads of visits are inert and current behaviour is identical to the single-community policies. Adding `{"visits": true}` to an active partnership scope enables partner visit reads with no code change.

Also note the new capability key in the capability list in [`cross-community.md`](../cross-community.md) alongside `providers`.

### [`.github/app-summary.md`](../../.github/app-summary.md)

No change — no new module, tab, or role.

---

## Out of scope (raised by this audit, deliberately not fixed here)

| Item | Why it is out of scope | Effect on this feature |
|---|---|---|
| **`communities` is `FOR SELECT USING (true)`** — verified live; an anonymous caller reads every society's `id`, `name`, and **join `code`** | Belongs to onboarding/join, not Providers & Visits. Narrowing it needs its own audit of `community-select.tsx`, `community-request.tsx`, and the admin console. | It is the multiplier that turns issue 1 from a one-community leak into a platform-wide one. **M1 removes this feature's dependence on it**, but the policy remains open. **This should be the next audit.** |
| **No edit path for a provider** — RLS has a creator `UPDATE` policy, but no screen uses it | Building an edit screen is a feature, not a fix; no finding requires it. | A provider added with a typo can only be deleted by a lead and re-added. Worth a product decision. |
| **Notification fan-out breadth** (D13) — `new_visit` and `visit_rescheduled` notify every resident | A product decision about audience, with its own migration. | Residents with no connection to a visit are notified about it. |
| **Full pagination** for providers and visits | A separate project. C7 adds a bound as an interim measure. | Fine at 171 providers; revisit before a multi-society launch. |
| **Federation UI** | Documented as deferred in [`disabled-features.md`](../disabled-features.md) §federation — backend live, no screen calls it. **Deliberately retained for a future implementation; nothing in this plan removes any of it.** | The two `*_select_cross_community` policies are inert today. M1 makes the visit RPCs honour them (D17) so the future UI needs no rewrite; M2 leaves them untouched (D18). Keep every change additive. |
