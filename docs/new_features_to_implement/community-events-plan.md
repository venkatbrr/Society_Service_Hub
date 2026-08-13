# Community events — implementation plan (2026-08-13)

Cultural / sports / festival events posted by a designated role, visible to every
resident on the Community tab, with per-event contact people reachable by call or
WhatsApp.

**Scope decided here**: a new grant-based *Events coordinator* role, a
`community_events` table with up to 3 contacts per event, four new screens under
`/events`, and a reorganised Community tab. Notifications and WhatsApp link
previews are specified but marked optional so they can be dropped without
unpicking anything.

---

## 1. Decisions taken up front

### 1.1 The role is a grant, not a new `app_role_type` value

`profiles.app_role` is **single-valued**, so adding `event_organizer` to the enum
would mean a president could not also be a coordinator — and dropping/adding enum
values needs the type-swap dance documented in `docs/CLAUDE.md` §5 (worked example
`20260822000200`). Neither cost buys anything.

Instead, mirror `fund_roles`: a small grant table, `community_event_organizers`,
holding `(community_id, user_id, granted_by)`. Any number of residents can hold
it, presidents/VPs grant and revoke it, and the enum is untouched.

**Who can post**, in one sentence: a resident holding the grant, or a president /
vice president (leads can always post — they should not have to grant themselves
a role). Platform admin has no RLS grant on community tables, so they post
nothing here by design.

**UI name for the role: "Events coordinator."** ("Cultural committee" reads
narrower than sports + festivals; "organiser" collides with the person running a
single event, which is what the contact rows are.)

### 1.2 Naming — beware the existing `events` table

⚠️ **`public.events` already exists and means a *fund*** (see `architecture.md`
§4.4). The new table is therefore `community_events`, the contacts table is
`community_event_contacts`, and the grant table is `community_event_organizers`.
Never shorten these in code, comments, or SQL. This goes into `docs/CLAUDE.md` §9
as a trap.

### 1.3 Fields

Asked for: image, details notes, last date to register, event date, up to 3
contacts. Recommended additions, all cheap and all things a resident asks
immediately after reading the title:

| Field | Why | Required? |
|-------|-----|-----------|
| `category` | Cultural / sports / festival split — drives the filter chips and the card accent | yes, defaults to `cultural` |
| `venue` | "Where" is the second question after "when" | optional, ≤ 120 |
| `start_time` / `end_time` | Needed to sort two events on one date, and to render "Sat 6 PM" | `start_time` optional, `end_time` optional |
| `entry_fee` | Sports meets and ticketed cultural nights both need it; null = free | optional |
| `status` (`published` / `cancelled`) | Rain-cancelled events must stay visible with a cancelled badge, not vanish | yes, defaults `published` |
| `registration_link` | Some societies already run a Google Form | optional |

**Deliberately not included**: RSVP / attendee lists inside the app. That is a
whole second feature (capacity caps, cancellation, roster visibility) and the
contacts + external link cover it for now. Say so in the UI copy so nobody
expects a seat to be held.

### 1.4 Placement on the Community tab

Current order is hero → funds → (lead) manage rows → tiles → community code.
Funds currently occupies the whole first screen even when it reads ₹0/₹0/₹0, as
in the screenshot.

**New order:**

```
┌─────────────────────────────────────────┐
│ YOUR COMMUNITY                          │
│ IRA Aspiration                          │  hero (unchanged)
│ Kollur · You are a President            │
├─────────────────────────────────────────┤
│ Happening soon        [+ Post event]    │  ← NEW section, above funds
│ ┌────────┐ ┌────────┐ ┌────────┐        │
│ │ image  │ │ image  │ │ image  │        │  horizontal carousel,
│ │ SEP 14 │ │ SEP 21 │ │ OCT 02 │        │  up to 5 upcoming events
│ │ Ganesh │ │ Cricket│ │ Gandhi │        │  sorted by date ASC
│ │ Reg by │ │ Reg by │ │        │        │
│ └────────┘ └────────┘ └────────┘        │
│ View all events                       › │
├─────────────────────────────────────────┤
│ Community funds       [+ Create fund]   │  unchanged
│ …                                       │
├─────────────────────────────────────────┤
│ Manage blocks                         › │  lead-only rows,
│ Manage flats                          › │  + one new row:
│ Manage events coordinators            › │  ← NEW
├─────────────────────────────────────────┤
│ [Residents directory] [Emergency…]      │  unchanged tiles
├─────────────────────────────────────────┤
│ COMMUNITY CODE  B4UVX8         [Invite] │  unchanged
└─────────────────────────────────────────┘
```

**Why above funds**: events are the only thing on this screen that changes week to
week and that every resident cares about; funds is a static summary that stays
₹0 for most communities. Timely content earns the fold.

**Empty state**: when there are no upcoming events, render a *single slim row*,
not a full card — "No events scheduled" plus a "Post the first one" link for
coordinators and leads, and nothing actionable for residents. A big empty card
above funds would be worse than what is there today.

This changes the "section order is fixed: funds → residents tile → SOS tile →
community info" line in `features.md` §5, which must be updated in the same
change set.

---

## 2. Database

One migration: `supabase/migrations/20260907000000_community_events.sql`
(check `npx supabase migration list --linked` first — timestamps collide between
concurrent sessions; the latest applied today is `20260906000200`).

### 2.1 Tables

```sql
CREATE TABLE IF NOT EXISTS public.community_event_organizers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id)    ON DELETE CASCADE,
  granted_by    UUID REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.community_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id            UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_by              UUID NOT NULL REFERENCES public.profiles(id),
  title                   TEXT NOT NULL,
  category                TEXT NOT NULL DEFAULT 'cultural',
  description             TEXT,
  image_url               TEXT,
  venue                   TEXT,
  event_date              DATE NOT NULL,           -- local YYYY-MM-DD, never a timestamptz
  start_time              TIME,
  end_time                TIME,
  registration_last_date  DATE,
  entry_fee               NUMERIC(10,2),
  registration_link       TEXT,
  status                  TEXT NOT NULL DEFAULT 'published',
  cancelled_at            TIMESTAMPTZ,
  cancellation_note       TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_event_contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES public.community_events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,          -- 10-digit, normalised server-side
  role_label  TEXT,                   -- "Coordinator", "Registrations", …
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
```

Constraints (named, so a violation is legible in the client toast):

- `community_events_category_valid` — `category IN ('cultural','sports','festival','meeting','workshop','other')`
- `community_events_status_valid` — `status IN ('published','cancelled')`
- `community_events_text_lengths` — title ≤ 80, description ≤ 2000, venue ≤ 120, cancellation_note ≤ 200, registration_link ≤ 300
- `community_events_registration_before_event` — `registration_last_date IS NULL OR registration_last_date <= event_date`
- `community_events_time_order` — `end_time IS NULL OR start_time IS NULL OR end_time > start_time`
- `community_events_fee_bounds` — `entry_fee IS NULL OR (entry_fee >= 0 AND entry_fee <= 100000)`
- `community_event_contacts_text_lengths` — name ≤ 60, role_label ≤ 40, `phone ~ '^[6-9][0-9]{9}$'`

Indexes: `(community_id, event_date)` and `(event_id, sort_order)`.

### 2.2 Predicate

```sql
CREATE OR REPLACE FUNCTION public.is_event_organizer(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_event_organizers o
    JOIN profiles p ON p.id = o.user_id
    WHERE o.user_id = p_user_id
      AND o.community_id = p.community_id
      AND p.removed_at IS NULL
  );
$$;
```

Keep it **pure** — "holds the grant", nothing more. Policies compose it as
`is_event_organizer(auth.uid()) OR is_community_lead(auth.uid())`, which keeps the
lead override visible at each call site rather than buried (the mistake
`is_admin()` made — see §9 of `docs/CLAUDE.md`).

### 2.3 RLS

Every policy pins the tenant column. `is_community_lead()` **must** be paired
with `community_id = get_user_community_id()`, or a president of another society
matches every row (documented trap).

| Table | SELECT | INSERT / UPDATE | DELETE |
|-------|--------|-----------------|--------|
| `community_events` | `community_id = get_user_community_id()` | same, **and** `(is_event_organizer(auth.uid()) OR is_community_lead(auth.uid()))` | `created_by = auth.uid() OR (is_community_lead(auth.uid()) AND community_id = get_user_community_id()) OR is_platform_admin(auth.uid())` |
| `community_event_contacts` | event is visible to the caller | event is writable by the caller | same as insert — **do not skip the DELETE policy**; the edit flow deletes and re-inserts, and a missing policy makes the delete match zero rows and *return success*, duplicating contacts |
| `community_event_organizers` | `community_id = get_user_community_id()` | leads only, community pinned | leads only, community pinned |

The UPDATE policies get **both** `USING` and `WITH CHECK`, each naming
`community_id`. `USING`-only lets a resident move their row into another
community.

### 2.4 Triggers

| Trigger | Table | Timing | Job |
|---------|-------|--------|-----|
| `enforce_community_event_contact_cap` | `community_event_contacts` | BEFORE INSERT | ≤ 3 contacts per event. **`SECURITY DEFINER`** — an invoker-rights count runs under the caller's RLS and silently under-counts (the bug that cost the food-drop caps their enforcement, `20260823000000`) |
| `enforce_community_event_immutables` | `community_events` | BEFORE UPDATE | `community_id` and `created_by` cannot change; stamps `updated_at` |
| `stamp_community_event_cancellation` | `community_events` | BEFORE UPDATE | on transition to `cancelled`, set `cancelled_at = now()`; clear both when un-cancelling. Mirrors `stamp_mcn_preorder_cancellation` |
| `notify_community_event_published` *(optional, §6)* | `community_events` | AFTER INSERT | fan out `notifications` rows |

Anti-spam: cap a single coordinator at **5 published future events at a time**,
same shape as the food-drop cap in `20260821000100`. Cheap insurance.

### 2.5 The write RPC

Event and contacts must be written in **one transaction**. Two client round trips
means the contact-cap trigger can reject the children after the parent is
committed, leaving an event nobody can contact — the exact failure that produced
item-less pre-orders (`docs/CLAUDE.md` §9). Follow the `place_mcn_preorder()`
precedent:

```sql
upsert_community_event(
  p_event_id UUID,          -- NULL = create, non-null = edit
  p_title TEXT, p_category TEXT, p_description TEXT, p_image_url TEXT,
  p_venue TEXT, p_event_date DATE, p_start_time TIME, p_end_time TIME,
  p_registration_last_date DATE, p_entry_fee NUMERIC, p_registration_link TEXT,
  p_contacts JSONB          -- [{"name":…, "phone":…, "role_label":…}], 1–3 entries
) RETURNS UUID
```

`SECURITY DEFINER`, `SET search_path = public`, `REVOKE ALL FROM PUBLIC, anon`.

- **Takes no `community_id` and no `user_id`** — both derive from `auth.uid()`.
  A definer function with a caller-supplied scope parameter is an RLS bypass.
- Guards: caller is organizer or lead; on edit the row is in the caller's
  community and the caller is its creator or a lead.
- Normalises each phone through `normalize_indian_mobile()` and raises on a bad
  one, so the client cannot store a number `wa.me` will reject.
- On edit: `DELETE FROM community_event_contacts WHERE event_id = …` then
  re-insert, inside the same transaction.

Cancelling is a plain `UPDATE … SET status = 'cancelled'` under RLS — no RPC
needed, the trigger handles attribution.

### 2.6 Deploy loop

Per `docs/CLAUDE.md` §6, and remembering `types:prod` overwrites the whole file:

1. `npm run db:push:prod` (`db:push:preprod` still carries the `PREPROD_REF_TODO`
   placeholder and will fail loudly)
2. `npm run types:prod`
3. **Re-append the hand-maintained enriched-types block** at the bottom of
   `lib/database.types.ts` (`ProviderWithInteraction`, `VisitWithJoinerData`,
   `VisitJoinerWithProfile`)
4. `npx tsc --noEmit`

End the migration with `NOTIFY pgrst, 'reload schema';`.

---

## 3. Client — new files

| File | What |
|------|------|
| `app/events/index.tsx` | Full list. `SegmentedSlider` Upcoming / Past; `ChipRowSlider` category chips; upcoming sorted `(event_date, start_time)` ASC, past DESC. Focus-refresh via `useFocusEffect`, web pull-to-refresh via `useWebPullToRefresh` + `WebPullIndicator`. |
| `app/events/[id].tsx` | Detail: image hero, date/time/venue, "Registration closes <date>" (or "Registration closed"), details notes, entry fee, contacts block, share button. Edit / Cancel / Delete shown to the creator and leads. |
| `app/events/add.tsx` | Create and edit (`?id=` switches to edit, prefilled). Coordinator/lead only. |
| `app/events/coordinators.tsx` | Lead-only. Lists current coordinators, remove with `confirmAction`, "Add coordinator" modal picking a resident. |
| `components/EventCard.tsx` | Two variants — `compact` (carousel on the Community tab, ~240 px wide) and `full` (list rows). Built on `BaseCard`. |
| `lib/events.ts` | Pure helpers: `isRegistrationOpen(event, today)`, `formatEventWhen(event)` ("Sat 14 Sep · 6:00 PM"), `eventCategoryMeta(category)` → label + icon + accent token. No network calls. |

### 3.1 Contacts UI — the call / WhatsApp row

Per contact: name, role label, then two labelled buttons.

- **Call** → `PhoneCall01` icon + "Call". Route through a call-confirm dialog
  (`confirmAction`), matching the SOS convention that every dial is confirmed.
- **WhatsApp** → `MessageChatCircle` icon + "WhatsApp". **Always**
  `buildWhatsAppUrl(phone, text)` from `lib/phone.ts` — the `whatsapp://` scheme
  fails in the PWA, and stored numbers are 10 digits so the `91` prefix must be
  added at link time (both are documented traps). Prefill the message:
  `Hi <name>, I'd like to know more about "<event title>" on <date>.`

`@untitledui/icons` ships no WhatsApp brand mark and `react-native-svg` is not a
dependency, so the icon + text label is the in-register answer — the same call
made for the carpool screen in `aug-2026-fixes-plan.md` item 7.

### 3.2 Compose form (`app/events/add.tsx`)

- Image via `ImageUploader` — `subfolder="events"`, `aspectRatio={16/9}`.
- Both dates via `components/DateField.tsx`, never a raw `TextInput`
  (`@react-native-community/datetimepicker` renders `null` on web). `event_date`
  gets `minimumDate = today`; `registration_last_date` gets
  `maximumDate = event_date`, so the constraint cannot be tripped from the UI.
- Times: a slot dropdown, not a free `TextInput`.
- Contacts: repeatable rows, minimum 1, maximum 3, with an "Add contact" button
  that disappears at 3. Validate with `isValidIndianMobile` before submit — the
  RPC re-validates, this is just for a decent error message.
- Submit → `supabase.rpc('upsert_community_event', …)` → toast → `router.push`
  to the detail screen.

### 3.3 Coordinator management (`app/events/coordinators.tsx`)

Reuse `get_residents_directory(p_include_phone => true)` for the picker rather
than writing a new RPC — leads already see phones there. Grant and revoke are
direct table writes under RLS. Revoke uses `confirmAction` and states plainly
that existing events stay published.

---

## 4. Client — edits to existing files

| File | Change |
|------|--------|
| `app/(tabs)/community.tsx` | Add the events section above the funds section (§1.4). One extra query in the existing `Promise.all` in `loadCommunityData` — upcoming published events for the community, `limit 5`, ordered by date. Add the "Manage events coordinators" row to the lead-only block. |
| `context/AuthContext.tsx` | Add `isEventOrganizer: boolean`, loaded in the **second, non-blocking phase** alongside `funds_enabled` / `get_funds_access_status`. Default `false`. Reset it in `resetAuthState()` and in the no-community branch. |
| `lib/navigation.ts` | In `getImmediateParentRoute()`: `/events/add` → `?id` present ? `/events/{id}` : `/events`; `/events/coordinators` → `/community`; `/events/*` → `/events`; `/events` → `/community`. |
| `components/GlobalBottomNav.tsx` | Community tab `isActive` gains `p.startsWith('/events')`, so the tab stays lit inside the module. |
| Header back buttons | `HeaderBackButton` + `goBackSmart(router, '<current route>')`. The second argument is the **current** path, not the destination. |

**Route safety**: `/events` collides with nothing — there is no Events tab, and
`app/community/` is the only tab-name/directory overlap in the tree (already
flagged as hypothesis A in `aug-2026-fixes-plan.md` item 17). Note the empty
`app/event/` directory in the tree; delete it so nobody later creates
`app/event/index.tsx` and ends up with two near-identical URLs.

**Gating**: `isEventOrganizer` is false on first render while the second-phase
load is in flight — same trap as `fundsEnabled`. It may hide a button briefly;
it must never be the only thing standing between a resident and a write. RLS is
the real gate.

---

## 5. Verandah / UI rules to respect

- Tokens only — `Verandah`, `VerandahType`, `VerandahSpace`, `VerandahRadius`.
  No raw hex, no shadow props, no `LinearGradient`, no font weight ≥ 600, no
  `textTransform: 'uppercase'` outside `sectionLabel`.
- Serif type is reserved for the single largest title anchor — the section
  heading "Happening soon" on the Community tab, and the event title on the
  detail screen. Card titles stay sans.
- Sentence case everywhere.
- Icons from `@untitledui/icons` only, no emoji — including the category chips.
  Suggested mapping: cultural `Music01`, sports `Trophy01`, festival `Star01`,
  meeting `Users01`, workshop `Tool01`, other `CalendarDate`.
- Reuse `BaseCard`, `EmptyState`, `SegmentedSlider`, `ChipRowSlider`,
  `ImageUploader`, `DateField`, `HeaderBackButton`. Do not hand-roll a chip row
  or a tab animation.
- Every confirmation goes through `confirmAction`; every share through
  `shareOrCopy`; every toast through `react-native-toast-message`.

---

## 6. Optional, additive, droppable

Both are specified so they can be built later without reopening anything above.

**6a. Notify residents when an event is posted.** AFTER INSERT trigger inserting
`notifications` rows (`type = 'community_event'`, `data = {"event_id": …}`) for
every active resident of the community, plus a deep-link case in
`app/_layout.tsx`. If the fan-out ever needs to reach leads specifically, filter
`app_role IN ('president','vice_president') AND removed_at IS NULL` — selecting
on the dead `community_lead` value silently delivered to nobody twice before.

**6b. WhatsApp link preview for a shared event.** Same shape as
`api/share-listing.ts`: an `api/share-event.ts` on top of `api/_og.ts`, plus a
`get_event_og_card(p_id)` `SECURITY DEFINER` RPC granted to `anon`, returning
only `title`, `description`, `image_url`, `event_date`. Required because
`community_events` SELECT is scoped to `get_user_community_id()`, which resolves
to nothing for an unauthenticated crawler — a direct read returns `[]` with no
error and the tags fall back to defaults.

---

## 7. Sequencing

| Phase | Contents | Gate |
|-------|----------|------|
| 1 | Migration, RLS, triggers, `upsert_community_event`, deploy loop, types | `npx tsc --noEmit` |
| 2 | `AuthContext.isEventOrganizer`, `app/events/coordinators.tsx` | A lead can grant and revoke |
| 3 | `lib/events.ts`, `components/EventCard.tsx`, list + detail + compose | A coordinator can post; a resident can call and WhatsApp |
| 4 | Community tab section, nav mappings, bottom-nav matcher | Back navigation works from a deep link and a fresh browser load |
| 5 | Docs (§8) | — |
| 6 | Optional 6a / 6b | — |

`npx tsc --noEmit` is the only validation gate; there is no test framework.

---

## 8. Doc updates (same change set, one owner each)

- **`docs/features.md`** — new "§5.x Community events" subsection; update the
  Community tab row, whose "section order is fixed: funds → residents tile → SOS
  tile → community info" line becomes events → funds → manage → tiles → info.
- **`docs/architecture.md`** — the three tables in §4, `is_event_organizer` under
  Predicates, `upsert_community_event` in the RPC index, the triggers table, the
  RLS table, and the `/events/*` parent mappings in §9.
- **`docs/CLAUDE.md`** — two new traps: (1) `public.events` is a *fund*, the
  events module is `community_events`; (2) the contact-cap trigger must be
  `SECURITY DEFINER` for the same reason the drop caps must be.
- **`.github/app-summary.md`** — one line: new module, new role.
- **`docs/verandah.md`** — only if `EventCard` introduces a shared pattern worth
  naming (the compact carousel card probably is).
- Nothing federation-related, so no `cross-community-changelog.md` entry.

---

## 9. Open questions

1. **Past events** — keep them browsable forever under the Past tab (current
   assumption), or hide them 60 days after the event date? Forever is simpler and
   doubles as a record of what the society has run.
2. **Who may edit someone else's event** — assumed: the creator and any lead. The
   alternative, any coordinator, makes a shared committee inbox easier but
   removes accountability for a bad edit.
3. **Entry fee** — display only, as planned. Collecting money would belong in the
   funds module, not here.
