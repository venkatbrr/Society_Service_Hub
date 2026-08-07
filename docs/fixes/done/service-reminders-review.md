# My Service Reminders — Edge-Case Review & Implementation Brief

**Date:** 2026-08-07
**Status:** Ready for implementation. All open decisions are resolved in this document — do not re-litigate them, implement as specified.
**Scope:** `app/services/*`, `components/ServiceCard.tsx`, `components/UpcomingServicesCard.tsx`, `components/ServiceHistoryList.tsx`, `components/UrgencyBadge.tsx`, `lib/serviceReminderHelpers.ts`, `lib/serviceCategories.ts`, `supabase/migrations/`, `supabase/functions/check_due_services/`

**Method:** Walked the feature as a resident would — add, list, detail, edit, mark-done, history, notifications, and the Help/Profile surfaces — cross-checked against the migrations and probed the live Supabase project for function resolution.

**Baseline:** `npx tsc --noEmit` is clean before any change. It must be clean after.

**Result: 14 issues — 3 blocking, 5 high, 6 minor.**

---

## READ THIS FIRST — rules for the implementing agent

1. **Read `CLAUDE.md` and `docs/CLAUDE.md` before editing anything.** They override any
   habit you have. In particular: `lib/database.types.ts` is generated and must never be
   hand-edited; `Alert.alert` is a no-op on web; community queries scope by `communityId`
   **except** `user_services`, `user_service_history`, and `hire_feedback`, which are
   user-scoped and must never be community-filtered.

2. **`npx tsc --noEmit` is the only automated gate. There is no test framework and no
   lint script.** A green `tsc` proves almost nothing about these 14 bugs — you must also
   walk the manual verification checklist in [§ Verification](#verification) at the end.
   Do not report an issue as fixed on the strength of `tsc` alone.

3. **After touching `supabase/migrations/`, finish the loop yourself:**
   ```
   npm run db:push
   npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj > lib/database.types.ts
   npx tsc --noEmit
   ```
   Never leave a migration unapplied or types unregenerated.

4. **The SQL in this document is a specification, not tested code.** It was written by
   reading the schema, not by executing it. Review it, adapt it, and verify each statement
   applies cleanly. Where it says *"verify with this query first"*, actually run the query.

5. **Scope boundary.** Issue #3 requires edits to `app/(tabs)/profile.tsx` and
   `app/(tabs)/index.tsx`. In those two files, change **only** the reminder-related data
   fetching and the one label named in #14. Do not refactor anything else in them — they
   are shared surfaces owned by other features.

6. **The image backfill (#2) rewrites live resident data.** Run the dry-run `SELECT`
   first, eyeball the output, and only then run the `UPDATE`. Do not skip this.

7. **Docs are part of the change set, not a follow-up.** See
   [§ Documentation updates](#documentation-updates).

---

## Severity summary

| # | Issue | Severity | Area | Fixed by |
|---|-------|----------|------|----------|
| 1 | Web/PWA date pickers render nothing | **P0** | Client (web) | [Task C1](#task-c1--shared-datefield-component-1-8) |
| 2 | Notes + images exceed the 500-char DB CHECK | **P0** | Client + DB | [Task M2](#task-m2--move-images-out-of-notes-2-9), [C5](#task-c5--appservicesaddtsx-2-13) |
| 3 | List and home cards never refresh on focus | **P0** | Client | [Task C2](#task-c2--refresh-on-focus-3-12) |
| 4 | Editing a reminder silently unlinks its provider | P1 | Client | [Task C4](#task-c4--appservicesidtsx-4-6-9-14) |
| 5 | A reminder notifies exactly once, ever | P1 | DB | [Task M5](#task-m5--repeating-notification-cadence-5) |
| 6 | `mark_service_done` is ambiguously overloaded | P1 | DB + Client | [Task M4](#task-m4--drop-the-overload-and-harden-mark_service_done-6), [C4](#task-c4--appservicesidtsx-4-6-9-14) |
| 7 | UTC `CURRENT_DATE` vs. IST local dates | P1 | DB | [Task M3](#task-m3--ist-date-handling-7) |
| 8 | History edits save the wrong day | P1 | Client | [Task C1](#task-c1--shared-datefield-component-1-8) |
| 9 | Every save costs two round-trips (`image_url`) | P2 | Client | [Task C4](#task-c4--appservicesidtsx-4-6-9-14) |
| 10 | History and reminder can silently disagree | P2 | DB | [Task M6](#task-m6--reconcile-last_serviced_on-from-history-10) |
| 11 | "Find tech" doesn't navigate to technicians | P2 | Client | [Task C3](#task-c3--home-and-profile-surfaces-3-11-14) |
| 12 | Infinite spinner when `user` is null | P2 | Client | [Task C2](#task-c2--refresh-on-focus-3-12) |
| 13 | `router.back()` no-op on deep-linked add | P2 | Client | [Task C5](#task-c5--appservicesaddtsx-2-13) |
| 14 | Optimistic-update noise + inaccurate badge label | P2 | Client | [Task C3](#task-c3--home-and-profile-surfaces-3-11-14), [C4](#task-c4--appservicesidtsx-4-6-9-14) |

---

# PART 1 — FINDINGS

# P0 — blocks real use

## 1. On web/PWA the date pickers are completely dead

`@react-native-community/datetimepicker` ships no `.web.js`. Its fallback at
`node_modules/@react-native-community/datetimepicker/src/datetimepicker.js` is:

```js
export default function DateTimePicker(_props: BaseProps): null {
  React.useEffect(() => {
    console.warn(`DateTimePicker is not supported on: ${Platform.OS}`);
  }, []);
  return null;
}
```

Three reminder surfaces render it with **no** `Platform.OS === 'web'` branch:

- [app/services/add.tsx:337-348](../../app/services/add.tsx#L337-L348) — "Last serviced on"
- [app/services/[id].tsx:637-648](../../app/services/[id].tsx#L637-L648) — edit "Last serviced on"
- [components/ServiceHistoryList.tsx:281-292](../../components/ServiceHistoryList.tsx#L281-L292) — "Serviced on"

**Resident impact on the PWA:** tapping the date field does nothing at all. You cannot
record a past service date — every reminder silently starts from `new Date()`, so the
first due date is wrong for anyone logging an appliance serviced months ago. You cannot
correct a wrong date afterwards, and you cannot undo an accidental
"Mark as serviced today".

**This is a gap specific to this feature.** The rest of the app already handles it:

- [app/visits/add.tsx:307-334](../../app/visits/add.tsx#L307-L334)
- [app/mcn/drops/add.tsx:555](../../app/mcn/drops/add.tsx#L555)

Both render an `<input type="date">` under `Platform.OS === 'web'`.

---

## 2. Notes + images blow past the 500-char DB CHECK

Reminder images are serialized as `[ReminderImage:title|url]` tags **into the `notes`
column** ([lib/serviceReminderHelpers.ts:68-83](../../lib/serviceReminderHelpers.ts#L68-L83)),
but the constraint applies to the combined string:

```sql
-- supabase/migrations/20260426000000_add_user_services.sql:17
notes text CHECK (notes IS NULL OR length(notes) <= 500)
```

The UI advertises 500-char notes ([add.tsx:554](../../app/services/add.tsx#L554)), 60-char
image titles ([add.tsx:534](../../app/services/add.tsx#L534)), and up to 3 images — **that
combination cannot be saved.**

Measured against the project's real Cloudinary URL shape (114 chars, cloud `xetj8taj`,
folder `society_hub/service_receipts`):

```
typical cloudinary url length: 114

ok       len= 449  3 images, short titles, no notes
REJECTED len= 550  3 images, short titles, 100-char notes
REJECTED len= 575  3 images, max 60-char titles, no notes
REJECTED len= 647  3 images, 60-char titles with spaces, no notes
ok       len= 497  2 images, short titles, 200-char notes
REJECTED len= 647  1 image, short title, 500-char notes
```

Note the last row: **one image plus the advertised maximum notes already fails.** And the
third row: **three images with the allowed 60-char titles fails with zero notes.**

The failure surfaces as a raw Postgres string in a toast — `err.message` at
[add.tsx:246](../../app/services/add.tsx#L246) and [[id].tsx:425](../../app/services/[id].tsx#L425) —
reading *"new row for relation "user_services" violates check constraint
"user_services_notes_check""*. On the edit screen the resident's typing is lost with no
explanation of what to shorten.

---

## 3. The list and home cards never refresh — "my reminder disappeared"

[app/services/index.tsx:45-47](../../app/services/index.tsx#L45-L47) fetches in a plain
`useEffect` keyed on `user`:

```js
useEffect(() => {
  fetchServices();
}, [fetchServices]);
```

`user` doesn't change while signed in, so this runs once on mount. Add a reminder →
`router.back()` → the list screen was never unmounted → **the new reminder is not
there** until the resident pulls to refresh. Same after editing or marking done from the
detail screen.

The same plain-`useEffect` pattern appears in two always-mounted tab surfaces, so both go
stale for the entire session:

- [components/UpcomingServicesCard.tsx:59-61](../../components/UpcomingServicesCard.tsx#L59-L61) — Help tab card
- [app/(tabs)/profile.tsx:38](../../app/(tabs)/profile.tsx#L38) — due-soon badge

For contrast, [add.tsx:96-136](../../app/services/add.tsx#L96-L136) and
[[id].tsx:193-233](../../app/services/[id].tsx#L193-L233) already use `useFocusEffect` for
their provider lists — the pattern exists in the feature, it just wasn't applied to the
reminder data itself.

This is the single most likely "the app lost my reminder" complaint.

---

# P1 — data loss and missed reminders

## 4. Editing a reminder silently unlinks its provider

[app/services/[id].tsx:235-247](../../app/services/[id].tsx#L235-L247):

```js
useEffect(() => {
  if (!service?.provider_id) {
    setSelectedProvider(null);
    setMarkDoneProvider(null);
    return;
  }
  const linkedProvider = providers.find((p) => p.id === service.provider_id) ?? null;
  if (linkedProvider) {                      // <-- only sets on a hit
    setSelectedProvider(linkedProvider);
    setMarkDoneProvider(linkedProvider);
  }
}, [providers, service?.provider_id]);
```

`providers` is **community-filtered** ([[id].tsx:205-207](../../app/services/[id].tsx#L205-L207)).
When the linked provider isn't in that list, `selectedProvider` stays `null` and the edit
form shows "No provider linked". The save then writes:

```js
// [id].tsx:401
provider_id: selectedProvider?.id ?? null,
```

So opening "Edit details" to change the service name and hitting Save **wipes the provider
link** whenever:

- the provider fetch failed (the `catch` at [[id].tsx:216-220](../../app/services/[id].tsx#L216-L220) sets `providers` to `[]`),
- the provider was deleted from the community, or
- the resident switched communities since creating the reminder.

No warning, no way to tell it happened.

---

## 5. A reminder notifies exactly once, ever

`notify_due_services()` stamps `notified_at = now()` after inserting a notification
([migration 20260426, lines 217-219](../../supabase/migrations/20260426000000_add_user_services.sql#L217-L219)),
and its `WHERE` clause requires `notified_at IS NULL`. The only thing that clears the flag
is the trigger:

```sql
-- supabase/migrations/20260426000000_add_user_services.sql:52-58
IF TG_OP = 'UPDATE' THEN
  IF NEW.last_serviced_on <> OLD.last_serviced_on
     OR NEW.frequency_months <> OLD.frequency_months THEN
    NEW.notified_at := NULL;
  END IF;
```

So: **one** notification fires 7 days before the due date, then silence. The service goes
overdue and the resident is never told again. There is no day-of ping and no overdue
escalation, even though `notify_due_services` already has copy written for both cases
(lines 198-205) — that copy only ever renders if the very first firing happened to land on
or after the due date.

**Compounding it:** there is no server-side push fan-out. This is already documented in
[docs/disabled-features.md:66-70](../disabled-features.md#L66-L70) — `profiles.expo_push_token`
is stored but nothing consumes it. `notify_due_services` writes an in-app `notifications`
row; the resident sees it only if they open the app, or via the Realtime local alert while
the app is running. **One in-app-only ping per 6-month cycle is effectively no reminder.**

> **Out of scope for this brief.** Building the push fan-out is a separate project with its
> own design doc (`docs/archive/pwa-web-push-notifications-plan.md`). Fixing the cadence
> (#5) is in scope and makes the existing in-app channel materially more useful. Do not
> start on push delivery.

---

## 6. `mark_service_done` is ambiguously overloaded (verified against production)

The 1-arg version from migration `20260426` was never dropped when `20260508` added the
4-arg version with defaults. Both still exist. Probing the live project:

```
POST /rest/v1/rpc/mark_service_done  {"p_service_id": "..."}

PGRST203  Could not choose the best candidate function between:
  public.mark_service_done(p_service_id => uuid),
  public.mark_service_done(p_service_id => uuid, p_provider_id => uuid,
                           p_cost_paid => numeric, p_note => text)
```

```
POST /rest/v1/rpc/mark_service_done  {"p_service_id":"...","p_provider_id":null,
                                      "p_cost_paid":null,"p_note":null}

P0001  Service not found or not owned by caller     <-- resolves correctly
```

The 4-arg call works, so the live "Mark done" button is fine. The `skipDetails === true`
branch at [[id].tsx:296-300](../../app/services/[id].tsx#L296-L300) would always fail — it is
currently unreachable from the UI (`submitMarkDone(false)` is the only caller, at
[line 939](../../app/services/[id].tsx#L939)), so this is a **latent landmine** rather than a
live break. Any future 1-arg call, or a doc reader following the migration, hits it.

---

## 7. UTC `CURRENT_DATE` vs. IST local dates

Supabase Postgres runs on UTC; IST is +5:30. No migration sets a session timezone.

**7a — Adding a reminder between 00:00 and 05:30 IST fails.** The date picker's
`maximumDate` is today (local), client validation `lastServicedOn > new Date()`
([add.tsx:169](../../app/services/add.tsx#L169)) passes, but the DB CHECK
`last_serviced_on <= CURRENT_DATE` evaluates `CURRENT_DATE` as **yesterday** in that
window. The insert is rejected with an opaque constraint error and the resident is fully
blocked. Same applies to `user_service_history.serviced_on <= CURRENT_DATE`
([migration 20260508, line 7](../../supabase/migrations/20260508000000_user_service_history.sql#L7)).

**7b — The list badge and the detail badge can disagree by a day.**
`get_my_upcoming_services` computes server-side from UTC:

```sql
-- migration 20260426, line 135
(s.next_due_on - CURRENT_DATE)::integer AS days_until_due
```

while the detail screen recomputes it in **local** time:

```js
// [id].tsx:155-160
const today = new Date(); today.setHours(0,0,0,0);
const dueDate = new Date(serviceRow.next_due_on); dueDate.setHours(0,0,0,0);
const daysUntilDue = Math.round((dueDate.getTime() - today.getTime()) / msPerDay);
```

Between 00:00 and 05:30 IST the list shows "Due in 3d" and the detail shows "Due in 2d".

---

## 8. History edits save the wrong day

[components/ServiceHistoryList.tsx:155](../../components/ServiceHistoryList.tsx#L155):

```js
const servicedOnValue = editDate.toISOString().split('T')[0];
```

A date picked from the native picker is **local midnight**. For IST that is
`18:30Z on the previous day`, so `toISOString()` yields the day before. **Editing a
history entry silently shifts it one day earlier**, every time.

`add.tsx` and `[id].tsx` already do this correctly with local component formatting
(`getFullYear` / `getMonth` / `getDate` — see [add.tsx:202-205](../../app/services/add.tsx#L202-L205));
`ServiceHistoryList` is the one file that didn't get the same treatment.

---

# P2 — smaller

## 9. Every save costs two round-trips

`user_services` has **no `image_url` column** — confirmed against the generated
`lib/database.types.ts` (`Row` is `category, community_id, created_at, frequency_months,
id, last_serviced_on, next_due_on, notes, notified_at, provider_id, service_name,
updated_at, user_id`). Both write paths send it anyway and retry on failure:

- [add.tsx:233-239](../../app/services/add.tsx#L233-L239)
- [[id].tsx:406-418](../../app/services/[id].tsx#L406-L418)

So the first insert/update **always** fails with PGRST204 and is retried. Beyond the
wasted latency on every save, the retry is triggered by *any* error, so a genuine failure
(such as issue #2's constraint violation) is re-attempted pointlessly and only the second
attempt's message reaches the resident.

The dead read side is at [[id].tsx:162](../../app/services/[id].tsx#L162) —
`parseNotesAndImages(serviceRow.notes, (serviceRow as any).image_url)` where the second
argument is permanently `undefined`.

## 10. History and reminder can silently disagree

`ServiceHistoryList` edits and deletes `user_service_history` rows directly
([lines 177-215](../../components/ServiceHistoryList.tsx#L177-L215)) without reconciling
`user_services.last_serviced_on`. Deleting the most recent "mark done" entry leaves the
reminder's `next_due_on` pushed forward by a full cycle. Recoverable via "Edit details" on
native — but per issue #1, **not recoverable at all on web.**

## 11. "Find tech" doesn't find a tech

[components/UpcomingServicesCard.tsx:121-126](../../components/UpcomingServicesCard.tsx#L121-L126)
labels the button "Find tech" but navigates to `/services/[id]`. The real technician
lookup is `handleFindTech` at [[id].tsx:326-333](../../app/services/[id].tsx#L326-L333), which
routes to the Help tab Providers segment with a mapped category filter.

## 12. Infinite spinner when `user` is null

[app/services/index.tsx:31-43](../../app/services/index.tsx#L31-L43) returns before the
`finally` block that clears `loading`:

```js
const fetchServices = useCallback(async () => {
  if (!user) return;          // <-- setLoading(false) never runs
  ...
  } finally { setLoading(false); setRefreshing(false); }
```

Recovers once `user` populates; a genuinely signed-out render spins forever.

## 13. `router.back()` is a no-op on a deep-linked add

[add.tsx:244](../../app/services/add.tsx#L244) calls `router.back()` after a successful save. If
`/services/add` was the first route — PWA deep link, notification tap, fresh tab — there is
no history to pop, so the resident is left staring at the filled form with a success toast.
The rest of the feature uses `goBackSmart(router, path)` from
[lib/navigation.ts:201](../../lib/navigation.ts#L201), which falls back to `replace()`.

## 14. Optimistic-update noise + inaccurate badge label

- [[id].tsx:285-293](../../app/services/[id].tsx#L285-L293) sets `days_until_due: s.frequency_months * 30`
  and leaves `next_due_on` untouched, flashing a wrong badge and a stale due date until the
  refetch lands.
- `get_my_due_soon_count` uses `next_due_on <= CURRENT_DATE + interval '7 days'`
  ([migration 20260426, line 159](../../supabase/migrations/20260426000000_add_user_services.sql#L159)),
  which includes everything already overdue, but Profile labels it
  "N due this week" ([profile.tsx:221](../../app/(tabs)/profile.tsx#L221)).

---

# PART 2 — RESOLVED DESIGN DECISIONS

These were open questions during review. They are now **settled**. Implement as written.

| Question | Decision | Why |
|---|---|---|
| **#2** — where do reminder images live? | A single `user_services.images jsonb` column holding `[{title, url}, …]`, `NOT NULL DEFAULT '[]'`, `CHECK jsonb_array_length(images) <= 3`. **Not** a child table. | One column, one backfill, no new RLS surface, no join, no extra round-trip. The client already models images as an array of `{title, url}` — this is the same shape with no translation layer. A child table buys ordering and per-image rows we do not need for a hard cap of 3. |
| **#5** — how to track notification cadence? | **Reuse the existing `notified_at`** as "timestamp of last notification sent", and add `notify_count smallint NOT NULL DEFAULT 0`. Do not add a `last_notified_on date`. | `notified_at` already exists, is already reset by the trigger, and already carries the right meaning once the `IS NULL` gate is replaced by an age gate. Adding a redundant date column would leave two sources of truth. |
| **#5** — what cadence? | At most one notification per rolling 7 days, starting when `next_due_on <= today + 7`, capped at **5 per cycle**: ~7 days before due, on/near the due date, then ~7 / ~14 / ~21 days overdue. | Matches the copy `notify_due_services` already contains for the due-today and overdue cases. Five caps the nagging at roughly three weeks past due. |
| **#7** — how to make dates IST-aware? | Add a `public.today_ist()` helper and **drop the two `CHECK (… <= CURRENT_DATE)` constraints entirely**, re-enforcing the bound inside `BEFORE INSERT OR UPDATE` triggers instead. | Postgres rejects non-`IMMUTABLE` functions inside `CHECK` constraints, so `today_ist()` cannot go there without lying about its volatility. Triggers have no such restriction **and** let us raise a friendly, resident-readable message instead of the opaque `violates check constraint` string called out in #7a. |
| **#10** — how to reconcile history with the reminder? | An `AFTER INSERT OR UPDATE OR DELETE` trigger on `user_service_history` that sets `user_services.last_serviced_on = MAX(serviced_on)` of the remaining rows. **Not** a client-side callback, and **not** an "Undo mark done" button. | A DB trigger is atomic and cannot be skipped by a client that crashes mid-flow, hits a network error, or is an older app build. Deleting the *last* remaining history row leaves `last_serviced_on` untouched — with no history there is no better value to infer. |
| **#14** — how to fix the Profile badge label? | Relabel to **"N due or overdue"**. Do not change the RPC's return type. | `get_my_due_soon_count` returns a scalar `integer`; splitting overdue out means either a breaking return-type change or a second RPC and round-trip, to fix a four-word label. Not worth it. |
| **Migration filename** | `supabase/migrations/20260827000000_service_reminders_fixes.sql` | The latest existing migration is `20260826000000_preorder_orders_rpc_only.sql`. A `20260807…` name would sort **before** twelve already-applied migrations and break `db push` ordering. Verify the tail of `ls supabase/migrations/` before you commit to a number — if anything newer has landed, bump accordingly. |

---

# PART 3 — IMPLEMENTATION PLAN

## Sequencing

Land in three change sets, in this order. Each must end with a clean `npx tsc --noEmit`
and its slice of the verification checklist.

| Set | Contents | Rationale |
|-----|----------|-----------|
| **1 — P0** | Migration tasks M1, M2 · Client tasks C1, C2, C5 | What a resident hits on day one. The migration must land before C4/C5 stop sending `image_url`. |
| **2 — P1** | Migration tasks M3, M4, M5, M6 · Client tasks C4, C6 | Data-loss and missed-reminder fixes. |
| **3 — P2** | Client task C3 + remaining cosmetics | Cleanups. |

> Sets 1 and 2 both edit `supabase/migrations/`. You may write **one** migration file
> containing M1–M6 and push it once — that is preferred over six files. If you split it,
> keep the timestamps strictly increasing.

---

## Database

All tasks below belong in **one** file:
`supabase/migrations/20260827000000_service_reminders_fixes.sql`

Write idempotent SQL. Enable RLS with explicit policies on any new table (none are
expected here). End the file with `NOTIFY pgrst, 'reload schema';`.

### Task M1 — IST date helper

```sql
CREATE OR REPLACE FUNCTION public.today_ist()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date;
$$;

GRANT EXECUTE ON FUNCTION public.today_ist() TO authenticated;
```

Every remaining task uses this in place of `CURRENT_DATE`.

---

### Task M2 — Move images out of `notes` *(#2, #9)*

**Step 1 — add the column.**

```sql
ALTER TABLE public.user_services
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;
```

**Step 2 — temporary URL-decode helper.** Titles were written through
`encodeURIComponent`, and Postgres has no built-in decoder. This one is dropped again in
step 6.

```sql
CREATE OR REPLACE FUNCTION public.url_decode_tmp(p_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  v_bytes bytea := '\x'::bytea;
  i integer := 1;
  n integer := length(p_input);
  ch text;
BEGIN
  WHILE i <= n LOOP
    ch := substr(p_input, i, 1);
    IF ch = '%' AND i + 2 <= n AND substr(p_input, i + 1, 2) ~ '^[0-9a-fA-F]{2}$' THEN
      v_bytes := v_bytes || decode(substr(p_input, i + 1, 2), 'hex');
      i := i + 3;
    ELSE
      v_bytes := v_bytes || convert_to(ch, 'utf8');
      i := i + 1;
    END IF;
  END LOOP;
  RETURN convert_from(v_bytes, 'utf8');
EXCEPTION WHEN OTHERS THEN
  RETURN p_input;   -- never fail a backfill over one malformed title
END;
$$;
```

**Step 3 — DRY RUN. Run this and read the output before going further.**

```sql
WITH parsed AS (
  SELECT
    u.id,
    r.ord,
    public.url_decode_tmp(r.m[1]) AS title,
    btrim(r.m[2])                 AS url
  FROM public.user_services u,
       LATERAL regexp_matches(
         u.notes,
         '\[ReminderImage:([^|\]]+)\|([^\]]+)\]',
         'g'
       ) WITH ORDINALITY AS r(m, ord)
  WHERE u.notes IS NOT NULL
)
SELECT
  id,
  count(*) AS image_count,
  jsonb_agg(
    jsonb_build_object('title', COALESCE(NULLIF(btrim(title), ''), 'Attachment'),
                       'url',   url)
    ORDER BY ord
  ) AS proposed_images
FROM parsed
WHERE url <> ''
GROUP BY id
ORDER BY image_count DESC
LIMIT 50;
```

Confirm: titles are human-readable (not still `%20`-encoded), URLs look like
`https://res.cloudinary.com/xetj8taj/…`, and no row shows `image_count > 3`. If any row
exceeds 3, decide what to truncate **before** adding the CHECK in step 5.

**Step 4 — backfill, then strip the tags from `notes`.**

```sql
WITH parsed AS (
  SELECT
    u.id,
    r.ord,
    public.url_decode_tmp(r.m[1]) AS title,
    btrim(r.m[2])                 AS url
  FROM public.user_services u,
       LATERAL regexp_matches(
         u.notes,
         '\[ReminderImage:([^|\]]+)\|([^\]]+)\]',
         'g'
       ) WITH ORDINALITY AS r(m, ord)
  WHERE u.notes IS NOT NULL
),
agg AS (
  SELECT
    id,
    jsonb_agg(
      jsonb_build_object('title', COALESCE(NULLIF(btrim(title), ''), 'Attachment'),
                         'url',   url)
      ORDER BY ord
    ) AS imgs
  FROM parsed
  WHERE url <> ''
  GROUP BY id
)
UPDATE public.user_services s
SET images = agg.imgs
FROM agg
WHERE agg.id = s.id
  AND s.images = '[]'::jsonb;   -- idempotent: never overwrite a real value on re-run
```

Then the legacy single-URL `[Receipt: …]` form, for rows that got nothing above:

```sql
UPDATE public.user_services s
SET images = jsonb_build_array(
      jsonb_build_object('title', 'Receipt / Warranty Card',
                         'url',   btrim((regexp_match(s.notes, '\[Receipt:\s*(https?://[^\]]+)\]'))[1]))
    )
WHERE s.images = '[]'::jsonb
  AND s.notes ~* '\[Receipt:\s*https?://[^\]]+\]';
```

Finally clear both tag forms out of `notes`:

```sql
UPDATE public.user_services
SET notes = NULLIF(
      btrim(
        regexp_replace(
          regexp_replace(notes, '\[ReminderImage:[^\]]+\]', '', 'g'),
          '\[Receipt:[^\]]+\]', '', 'g'
        )
      ),
      ''
    )
WHERE notes ~* '\[(ReminderImage|Receipt):';
```

**Step 5 — cap at 3.**

```sql
ALTER TABLE public.user_services
  DROP CONSTRAINT IF EXISTS user_services_images_check;

ALTER TABLE public.user_services
  ADD CONSTRAINT user_services_images_check
  CHECK (jsonb_typeof(images) = 'array' AND jsonb_array_length(images) <= 3);
```

**Step 6 — drop the temporary helper.**

```sql
DROP FUNCTION IF EXISTS public.url_decode_tmp(text);
```

**Step 7 — expose `images` on the list RPC.** `get_my_upcoming_services` gains a column,
which **cannot** be done with `CREATE OR REPLACE` — the return type changes, so it must be
dropped first.

```sql
DROP FUNCTION IF EXISTS public.get_my_upcoming_services();

CREATE FUNCTION public.get_my_upcoming_services()
RETURNS TABLE (
  id uuid, user_id uuid, community_id uuid, service_name text, category text,
  last_serviced_on date, frequency_months integer, next_due_on date, notes text,
  images jsonb, provider_id uuid, notified_at timestamptz,
  created_at timestamptz, updated_at timestamptz, days_until_due integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.user_id, s.community_id, s.service_name, s.category,
         s.last_serviced_on, s.frequency_months, s.next_due_on, s.notes,
         s.images, s.provider_id, s.notified_at, s.created_at, s.updated_at,
         (s.next_due_on - public.today_ist())::integer
  FROM public.user_services s
  WHERE s.user_id = auth.uid()
  ORDER BY s.next_due_on ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_upcoming_services() TO authenticated;
```

> **Keep the tag-parsing fallback in `lib/serviceReminderHelpers.ts`.** Do not delete
> `parseNotesAndImages`. Older app builds will keep writing tags into `notes` for a while,
> and a row missed by the backfill must still render. New code reads `images` first and
> falls back to `parseNotesAndImages(notes)` when `images` is empty.

---

### Task M3 — IST date handling *(#7)*

**Verify the constraint names first:**

```sql
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN ('public.user_services'::regclass,
                   'public.user_service_history'::regclass)
  AND contype = 'c';
```

Expect `user_services_last_serviced_on_check` and
`user_service_history_serviced_on_check`. Use whatever names the query actually returns.

```sql
ALTER TABLE public.user_services
  DROP CONSTRAINT IF EXISTS user_services_last_serviced_on_check;

ALTER TABLE public.user_service_history
  DROP CONSTRAINT IF EXISTS user_service_history_serviced_on_check;
```

Re-enforce in the existing `user_services` trigger function (rewritten in full in
[Task M5](#task-m5--repeating-notification-cadence-5)), and add one for history:

```sql
CREATE OR REPLACE FUNCTION public.user_service_history_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.serviced_on > public.today_ist() THEN
    RAISE EXCEPTION 'Service date cannot be in the future.'
      USING ERRCODE = '22007';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_service_history_validate_trigger ON public.user_service_history;
CREATE TRIGGER user_service_history_validate_trigger
  BEFORE INSERT OR UPDATE ON public.user_service_history
  FOR EACH ROW EXECUTE FUNCTION public.user_service_history_validate();
```

Also swap `CURRENT_DATE` → `public.today_ist()` in `get_my_due_soon_count`:

```sql
CREATE OR REPLACE FUNCTION public.get_my_due_soon_count()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.user_services
  WHERE user_id = auth.uid()
    AND next_due_on <= public.today_ist() + 7;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_due_soon_count() TO authenticated;
```

---

### Task M4 — Drop the overload and harden `mark_service_done` *(#6)*

```sql
DROP FUNCTION IF EXISTS public.mark_service_done(uuid);
```

Then replace the 4-arg version so it uses IST and explicitly resets the notification
counter. **The reset must be explicit** — marking done twice on the same day leaves
`last_serviced_on` unchanged, so the `<>` comparison in the compute trigger does not fire
and would otherwise leave `notify_count` stale.

```sql
CREATE OR REPLACE FUNCTION public.mark_service_done(
  p_service_id uuid,
  p_provider_id uuid DEFAULT NULL,
  p_cost_paid numeric DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS public.user_services
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result public.user_services;
  v_provider_name text;
BEGIN
  UPDATE public.user_services
  SET last_serviced_on = public.today_ist(),
      notified_at      = NULL,
      notify_count     = 0
  WHERE id = p_service_id
    AND user_id = auth.uid()
  RETURNING * INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found or not owned by caller';
  END IF;

  IF p_provider_id IS NOT NULL THEN
    SELECT sp.name INTO v_provider_name
    FROM public.service_providers sp WHERE sp.id = p_provider_id;
  END IF;

  INSERT INTO public.user_service_history (
    service_id, user_id, serviced_on, provider_id,
    provider_name_snapshot, cost_paid, note
  ) VALUES (
    v_result.id, v_result.user_id, public.today_ist(), p_provider_id,
    v_provider_name, p_cost_paid,
    CASE WHEN p_note IS NULL OR length(btrim(p_note)) = 0
         THEN NULL ELSE left(btrim(p_note), 280) END
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_service_done(uuid, uuid, numeric, text) TO authenticated;
```

> **Dead code to remove in the same change set.** Dropping the 1-arg function leaves an
> unreachable call site behind. In [app/services/[id].tsx](../../app/services/[id].tsx):
> delete the `skipDetails` parameter from `submitMarkDone`, delete the
> `if (skipDetails) { … }` branch at lines 296-300, and update the sole caller at line 939
> to `submitMarkDone()`. See [Task C4](#task-c4--appservicesidtsx-4-6-9-14).

---

### Task M5 — Repeating notification cadence *(#5)*

**Step 1 — counter column.**

```sql
ALTER TABLE public.user_services
  ADD COLUMN IF NOT EXISTS notify_count smallint NOT NULL DEFAULT 0;
```

**Step 2 — rewrite the compute trigger** to reset the counter alongside `notified_at`, and
to carry the IST date validation from M3.

```sql
CREATE OR REPLACE FUNCTION public.user_services_compute_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.last_serviced_on > public.today_ist() THEN
    RAISE EXCEPTION 'Last serviced date cannot be in the future.'
      USING ERRCODE = '22007';
  END IF;

  NEW.next_due_on := NEW.last_serviced_on + (NEW.frequency_months || ' months')::interval;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.last_serviced_on <> OLD.last_serviced_on
       OR NEW.frequency_months <> OLD.frequency_months THEN
      NEW.notified_at  := NULL;
      NEW.notify_count := 0;
    END IF;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;
```

The trigger itself (`user_services_compute_fields_trigger`) already exists and is
unchanged.

**Step 3 — rewrite `notify_due_services`.** The `notified_at IS NULL` gate becomes an age
gate, plus a per-cycle cap.

```sql
CREATE OR REPLACE FUNCTION public.notify_due_services()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count   integer := 0;
  v_today   date    := public.today_ist();
  v_service RECORD;
BEGIN
  FOR v_service IN
    SELECT s.id AS service_id, s.user_id, s.service_name, s.category, s.next_due_on,
           (s.next_due_on - v_today)::integer AS days_until_due
    FROM public.user_services s
    WHERE s.next_due_on <= v_today + 7
      AND s.notify_count < 5
      AND (
        s.notified_at IS NULL
        -- 6d12h, not 7d, so a cron that drifts by minutes never skips a whole week
        OR s.notified_at < now() - interval '6 days 12 hours'
      )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, data, is_read)
    VALUES (
      v_service.user_id,
      'service_reminder',
      CASE
        WHEN v_service.days_until_due < 0  THEN v_service.service_name || ' is overdue!'
        WHEN v_service.days_until_due = 0  THEN v_service.service_name || ' is due today'
        ELSE v_service.service_name || ' is due in ' || v_service.days_until_due || ' days'
      END,
      CASE
        WHEN v_service.days_until_due < 0
          THEN 'Overdue by ' || ABS(v_service.days_until_due) || ' days. Schedule a service now.'
        WHEN v_service.days_until_due = 0
          THEN 'Your service is due today. Book a technician!'
        ELSE 'Service reminder: due in ' || v_service.days_until_due || ' days.'
      END,
      jsonb_build_object(
        'service_id',     v_service.service_id,
        'service_name',   v_service.service_name,
        'category',       v_service.category,
        'next_due_on',    v_service.next_due_on,
        'days_until_due', v_service.days_until_due
      ),
      false
    );

    UPDATE public.user_services
    SET notified_at  = now(),
        notify_count = notify_count + 1
    WHERE id = v_service.service_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
```

**Idempotency is preserved:** re-running immediately produces zero new notifications,
because every row just touched now has `notified_at = now()`.

**No change needed to `supabase/functions/check_due_services/index.ts`** — it just calls
the RPC. Confirm the scheduled trigger still exists in the Supabase Dashboard; if the
`pg_cron` branch in migration `20260426` never fired (it only schedules when the extension
is present), the Edge Function schedule is the only thing delivering these.

---

### Task M6 — Reconcile `last_serviced_on` from history *(#10)*

```sql
CREATE OR REPLACE FUNCTION public.user_service_history_sync_parent()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_service_id uuid := COALESCE(NEW.service_id, OLD.service_id);
  v_latest     date;
BEGIN
  SELECT MAX(h.serviced_on) INTO v_latest
  FROM public.user_service_history h
  WHERE h.service_id = v_service_id;

  -- No history left: nothing better to infer, so leave the reminder untouched.
  IF v_latest IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.user_services s
  SET last_serviced_on = v_latest
  WHERE s.id = v_service_id
    AND s.last_serviced_on IS DISTINCT FROM v_latest;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS user_service_history_sync_parent_trigger ON public.user_service_history;
CREATE TRIGGER user_service_history_sync_parent_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.user_service_history
  FOR EACH ROW EXECUTE FUNCTION public.user_service_history_sync_parent();
```

**Interaction to be aware of:** the `UPDATE` on `user_services` fires
`user_services_compute_fields_trigger`, which recomputes `next_due_on` and resets
`notified_at` / `notify_count`. That is the desired behaviour — correcting a service date
should re-arm the reminder. There is no recursion: the `user_services` trigger does not
write to `user_service_history`.

**Ordering note:** `mark_service_done` sets `last_serviced_on` and *then* inserts the
history row, so this trigger fires second and writes the same value — an idempotent no-op
thanks to the `IS DISTINCT FROM` guard.

---

### End of migration

```sql
NOTIFY pgrst, 'reload schema';
```

Then run the three-command loop from rule 3 at the top of this document.

---

## Client

### Task C1 — Shared `DateField` component *(#1, #8)*

Create **`components/DateField.tsx`**:

- Props: `value: Date`, `onChange: (d: Date) => void`, `maximumDate?: Date`,
  `minimumDate?: Date`, plus optional style overrides.
- On `Platform.OS === 'web'`: render `<input type="date">`. Mirror the inline style block
  already used at [app/visits/add.tsx:307-334](../../app/visits/add.tsx#L307-L334) so the
  control matches the rest of the app, and drive `min` / `max` from the bound props.
- On native: keep the current `TouchableOpacity` + `DateTimePicker` pair, including
  `display={Platform.OS === 'ios' ? 'spinner' : 'default'}` and the iOS-only
  `setShowDatePicker(Platform.OS === 'ios')` behaviour.
- Export a helper `formatLocalDateForDb(d: Date): string` that builds `YYYY-MM-DD` from
  `getFullYear()` / `getMonth()+1` / `getDate()`. **Never `toISOString()`.**

Then replace all three call sites:

| File | Lines | Note |
|------|-------|------|
| [app/services/add.tsx](../../app/services/add.tsx) | 328-348 | `maximumDate` = today |
| [app/services/[id].tsx](../../app/services/[id].tsx) | 630-648 | `maximumDate` = today |
| [components/ServiceHistoryList.tsx](../../components/ServiceHistoryList.tsx) | 270-292 | `maximumDate` = today |

And in `ServiceHistoryList.handleSave`, replace line 155:

```diff
- const servicedOnValue = editDate.toISOString().split('T')[0];
+ const servicedOnValue = formatLocalDateForDb(editDate);
```

Both `add.tsx` and `[id].tsx` already build their date strings correctly by hand — collapse
those into `formatLocalDateForDb` too, so there is exactly one implementation.

---

### Task C2 — Refresh on focus *(#3, #12)*

**[app/services/index.tsx](../../app/services/index.tsx):**

```diff
- useEffect(() => {
-   fetchServices();
- }, [fetchServices]);
+ useFocusEffect(
+   useCallback(() => {
+     fetchServices();
+   }, [fetchServices])
+ );
```

Import `useFocusEffect` from `@react-navigation/native`, matching
[add.tsx:2](../../app/services/add.tsx#L2).

And fix the spinner:

```diff
  const fetchServices = useCallback(async () => {
-   if (!user) return;
+   if (!user) { setLoading(false); return; }
```

---

### Task C3 — Home and Profile surfaces *(#3, #11, #14)*

**[components/UpcomingServicesCard.tsx](../../components/UpcomingServicesCard.tsx):**

- Swap the `useEffect` at lines 59-61 for `useFocusEffect(useCallback(…))`.
- Fix the "Find tech" button at lines 121-126 to route to the providers list rather than
  the detail screen. Reuse the exact shape of `handleFindTech` in
  [[id].tsx:326-333](../../app/services/[id].tsx#L326-L333):

  ```js
  router.push({
    pathname: '/(tabs)/',
    params: { segment: 'providers',
              filterCategory: mapServiceCategoryToProviderCategory(s.category as ServiceCategory) },
  } as any);
  ```

**[app/(tabs)/profile.tsx](../../app/(tabs)/profile.tsx):**

- Wrap the reminder fetches (`get_my_due_soon_count`, `get_my_recent_service_history`) in
  `useFocusEffect`. `refreshAllProfileData` at lines 144-157 already exists — reuse it.
- Line 221: `{dueSoonCount} due this week` → `{dueSoonCount} due or overdue`.
- **Change nothing else in this file.**

---

### Task C4 — `app/services/[id].tsx` *(#4, #6, #9, #14)*

**a) Stop unlinking providers (#4).** Track whether the link resolved, and preserve the
stored id when it did not:

```js
const [providerLinkUnresolved, setProviderLinkUnresolved] = useState(false);

useEffect(() => {
  if (!service?.provider_id) {
    setSelectedProvider(null);
    setMarkDoneProvider(null);
    setProviderLinkUnresolved(false);
    return;
  }
  if (providersLoading) return;                 // don't judge mid-fetch
  const linked = providers.find((p) => p.id === service.provider_id) ?? null;
  if (linked) {
    setSelectedProvider(linked);
    setMarkDoneProvider(linked);
    setProviderLinkUnresolved(false);
  } else {
    setProviderLinkUnresolved(true);            // keep the id, we just can't name it
  }
}, [providers, providersLoading, service?.provider_id]);
```

In `handleSaveEdit`, preserve rather than null:

```diff
- provider_id: selectedProvider?.id ?? null,
+ provider_id: selectedProvider?.id
+   ?? (providerLinkUnresolved ? service.provider_id : null),
```

When `providerLinkUnresolved` is true, the selector should show a muted chip such as
*"Linked provider unavailable in this community"* with an explicit "Unlink" affordance —
so clearing the link stays possible, but only deliberately.

**b) Remove the dead 1-arg branch (#6).** Drop the `skipDetails` parameter, delete the
`if (skipDetails) { … }` block at lines 296-300, and change the caller at line 939 to
`submitMarkDone()`. This must ship together with [Task M4](#task-m4--drop-the-overload-and-harden-mark_service_done-6).

**c) Drop the `image_url` retry (#9).** Delete the fallback blocks at lines 235-239 and
411-418. Read images from the new `images` column, falling back to
`parseNotesAndImages(notes)` when it is empty. Write `images` as a jsonb array. Replace the
raw `err.message` toasts at line 425 with resident-readable copy, keeping the raw text in a
`console.error` for debugging.

**d) Honest optimistic update (#14).** At lines 285-293, either compute the real
`next_due_on` and `days_until_due` (`last_serviced_on` + `frequency_months`, matching the
DB trigger's month arithmetic) or drop the optimistic write entirely and show the existing
`marking` spinner until `fetchService()` returns. Prefer the latter — it is less code and
cannot disagree with the server.

---

### Task C5 — `app/services/add.tsx` *(#2, #13)*

- Write to the new `images` column; delete the `image_url` retry at lines 233-239.
- Show a live remaining-characters counter under Notes reflecting the true 500-char budget.
  Since images no longer live in `notes`, this is now simply `500 - notes.length` — but
  add the counter anyway so the limit is visible.
- Replace `router.back()` at line 244 with `goBackSmart(router, '/services/add')`.
- Replace raw `err.message` at line 246 with friendly copy plus a `console.error`.

---

### Task C6 — `lib/serviceReminderHelpers.ts` *(#2)*

- **Keep `parseNotesAndImages` exactly as it is.** It is the read-path fallback for rows
  that predate the backfill and for older app builds still writing tags.
- `serializeNotesAndImages` is no longer used on the write path once images move to their
  own column. Either delete it and its call sites
  ([add.tsx:214](../../app/services/add.tsx#L214), [[id].tsx:389](../../app/services/[id].tsx#L389))
  or leave it unused — do not leave it half-wired.
- Add a `toImagesJson(drafts: ReminderImageDraft[]): ReminderImage[]` helper that filters
  drafts to those with both a `url` and a non-empty trimmed `title`, capped at 3. Both
  `add.tsx` and `[id].tsx` already duplicate this filter inline
  ([add.tsx:215-217](../../app/services/add.tsx#L215-L217),
  [[id].tsx:390-392](../../app/services/[id].tsx#L390-L392)) — collapse both into it.

---

# VERIFICATION

`npx tsc --noEmit` catches **none** of these 14 bugs. Walk this list. Run the app with
`npm run web` for the web rows and a device/emulator build for the native rows.

## Database checks

Run in the Supabase SQL editor as an authenticated user where noted.

| # | Check | Expected |
|---|-------|----------|
| 2 | `SELECT id, jsonb_array_length(images), length(notes) FROM user_services WHERE images <> '[]' LIMIT 20;` | Images present, `notes` free of `[ReminderImage:` |
| 2 | `SELECT count(*) FROM user_services WHERE notes ~* '\[(ReminderImage\|Receipt):';` | `0` |
| 6 | `POST /rest/v1/rpc/mark_service_done {"p_service_id":"<uuid>"}` | Resolves — **not** `PGRST203`. (Will return "Service not found" for a bogus id; that is a pass.) |
| 7 | `SELECT public.today_ist(), CURRENT_DATE;` at 01:00 IST | `today_ist()` is one day ahead of `CURRENT_DATE` |
| 7 | Insert a `user_services` row with `last_serviced_on = today_ist()` at 01:00 IST | Succeeds |
| 5 | `SELECT notify_due_services();` twice in a row | Second call returns `0` |
| 5 | Backdate a row: `UPDATE user_services SET notified_at = now() - interval '8 days' WHERE id = …;` then `SELECT notify_due_services();` | Returns ≥ 1, `notify_count` increments |
| 5 | Repeat until `notify_count = 5`, then run again | Returns `0` — cap holds |
| 10 | Mark a service done, then `DELETE` the newest `user_service_history` row | `user_services.last_serviced_on` falls back to the previous history date; `next_due_on` recomputes |
| 10 | Delete the *only* history row | `last_serviced_on` unchanged (no crash) |

## Web (PWA) — `npm run web`

| # | Check | Expected |
|---|-------|----------|
| 1 | `/services/add` → tap "Last serviced on" | A date picker opens and accepts a date 6 months ago |
| 1 | `/services/[id]` → "Edit details" → tap "Last serviced on" | Same |
| 1 | `/services/[id]` → History → tap a row → tap "Serviced on" | Same |
| 8 | Edit a history date to a specific day, save, reopen | **Same day**, not one earlier |
| 2 | Add a reminder with 3 images, 60-char titles, and 500 chars of notes | Saves successfully |
| 3 | Add a reminder, then back | New reminder is in the list **without** pulling to refresh |
| 3 | Mark done, then back to the list | Urgency badge is current |
| 3 | Add a reminder, switch to the Help tab | `UpcomingServicesCard` reflects it |
| 3 | Add a reminder, switch to the Profile tab | Due-soon badge reflects it |
| 13 | Open `/services/add` directly in a fresh tab, save | Lands on `/services`, not stuck on the form |
| 11 | Help tab → `UpcomingServicesCard` → "Find tech" | Providers list, filtered to the mapped category |
| 4 | Load a reminder while offline (kill the network so the provider fetch fails), edit the name, save, reload | Provider link **still intact** |

## Native

| # | Check | Expected |
|---|-------|----------|
| 1 | All three date fields on Android and iOS | Still work exactly as before — no regression from `DateField` |
| 14 | Mark done and watch the card | No flash of a wrong "Due in Nd" badge or stale due date |
| 4 | Reminder linked to a provider, switch communities, edit the name, save | Provider link intact |
| 5 | With a reminder due in 3 days, trigger the Edge Function twice a week apart | Two notifications, escalating copy |

## Regression sweep

| Check | Expected |
|-------|----------|
| `npx tsc --noEmit` | Clean |
| `lib/database.types.ts` regenerated, not hand-edited | `images` and `notify_count` present on `user_services` |
| Notification tap on a `service_reminder` row | Routes to `/services/[id]` ([notifications.tsx:105-107](../../app/notifications.tsx#L105-L107)) |
| Back button from `/services/[id]` and `/services` | Still `/services` and `/profile` ([lib/navigation.ts:176-177](../../lib/navigation.ts#L176-L177)) |
| Delete a reminder | History rows cascade; list refreshes |
| A resident with **zero** reminders | Empty states render on list, Help card, and Profile |

---

# DOCUMENTATION UPDATES

Route each fact to exactly **one** owning file — duplicating across files is what caused
the last round of drift.

| File | What to add |
|------|-------------|
| [docs/architecture.md](../architecture.md) | `user_services.images jsonb` and `notify_count smallint`; `today_ist()`; the two new triggers (`user_service_history_validate`, `user_service_history_sync_parent`); the rewritten `notify_due_services` cadence; `get_my_upcoming_services` now returning `images`; the dropped 1-arg `mark_service_done`; the dropped date CHECK constraints |
| [docs/features.md](../features.md) | Reminder notification cadence (7 days out, due day, then weekly overdue, max 5); date fields now work on web; history edits reconcile the reminder's last-serviced date. **Do not restate schema columns here** — `architecture.md` owns them |
| [docs/CLAUDE.md](../CLAUDE.md) §9 | New trap: **`@react-native-community/datetimepicker` renders `null` on web** — every date field needs a `Platform.OS === 'web'` branch, or use `components/DateField.tsx`. File it next to the existing `Alert.alert` no-op entry. Also note that adding a column to a `RETURNS TABLE` function requires `DROP FUNCTION` first |
| [docs/verandah.md](../verandah.md) | `components/DateField.tsx` as a shared component, with its props and both platform renderings |
| [docs/README.md](../README.md) | Add a row for `docs/fixes/` if this folder is to be kept — it is not currently in the routing table |

Nothing here touches federation objects, so `docs/cross-community-changelog.md` needs no
entry. No new module, tab, or role, so `.github/app-summary.md` needs no entry.
