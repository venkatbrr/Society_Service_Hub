# Plan — Flat & Block selection instead of free-text entry

**Status:** ready for implementation (nothing in this plan has been built yet)
**Prepared:** 2026-08-10
**Pilot community:** IRA Aspiration (`64cd9fa6-ad3b-40f0-9f1e-6b9f6a6fce06`, code `B4UVX8`)

## Goal

Residents must **never type** a block/tower or flat number. They pick both from
dropdowns backed by a verified per-community flat inventory. New communities supply
their tower/flat list in the community request; a platform admin confirms and seeds
it at approval time.

---

## 1. Current state (verified against the live DB and code, 2026-08-10)

| Thing | State |
|---|---|
| `communities` | exactly one row — IRA Aspiration, `blocks_enabled = false`, `block_label = 'Block'`, `approximate_units = '500+'` |
| `community_blocks` | **empty** — no blocks exist for any community |
| `profiles` | 3 rows (2 platform admins, 1 president). `flat_number` is `NULL` on all three, `block_id` `NULL` on all three |
| Flat capture today | free-text `TextInput`, normalized client-side with `.toUpperCase().replace(/[\s-]/g,'')` |

**Implication: there is no production flat data to migrate.** No backfill, no
reconciliation. This is the cheapest possible moment to make this change.

Existing infrastructure to build **on top of**, not replace:

- `public.community_blocks` (`community_id`, `name`, `archived_at`, unique on `(community_id, name)`)
- `profiles.block_id`, `fund_roles.block_id`
- RPCs: `list_community_blocks`, `add_community_block`, `rename_community_block`,
  `archive_community_block`, `set_community_blocks_enabled`,
  `platform_add_community_block`, `platform_archive_community_block`,
  `platform_set_block_label`, `platform_set_blocks_enabled`
- `communities.blocks_enabled`, `communities.block_label` (`'Block' | 'Tower'`)
- `platform_approve_community_request(p_request_id, p_block_names TEXT[], p_block_label TEXT)`
  already seeds blocks and flips `blocks_enabled` on approval
- [components/BlockPicker.tsx](../../components/BlockPicker.tsx) — block dropdown, already exists
- [app/community/blocks.tsx](../../app/community/blocks.tsx) — president block management, already exists
- `admin-dashboard/js/approvals.js` — approval UI already collects block names + label
- `admin-dashboard/js/communities.js` — platform block management already exists

So the missing layer is **flats**, plus wiring the pickers into the four screens
that still let users type.

---

## 2. Source data for IRA Aspiration

`data/communities/ira_aspiration/resident_details.xlsx`, sheet `in`, 908 rows,
columns `S.no | Flat | Name | User Type | Occupancy Status`.

Every `Flat` value matches `^Block - ([A-Z]) ([A-Z0-9]+)$` — **0 unparseable rows**.
370 distinct flats across 5 blocks:

| Block | Flats | Floors present | Unit numbers |
|---|---|---|---|
| A | 95 | G, 1–9 | 01–17 |
| B | 88 | G, 1–9 | 01–17 |
| C | 81 | G, 1–9 | 01–17 |
| D | 75 | G, 1–9 | 01–17 |
| E | 31 | G, 1–9 | 01–08 |

**Already generated for you:** `data/communities/ira_aspiration/flats.seed.json`
holds the parsed, deduplicated, naturally-sorted inventory in the exact shape the
seeding RPC consumes:

```json
{ "community": "IRA Aspiration", "block_label": "Block", "total_flats": 370,
  "blocks": [ { "block": "A", "flat_count": 95, "flats": ["102","104", …] }, … ] }
```

Do not re-parse the spreadsheet; use that JSON.

### ⚠️ Known gap — read before seeding

The spreadsheet lists **occupied** flats only, so the inventory has holes
(Block A floor 1 is `102,104,106,110,112,114,116` — no 101, 103, 105…). The
community is `500+` units; a full G+9 × 17-unit grid across 5 blocks would be
roughly 800. **370 is a subset, not the building.**

Two options were considered:

- **(a) Seed exactly the 370 verified flats, plus an escape hatch** for a resident
  whose flat is missing. ✅ **Chosen** — never invents units that may not exist.
- (b) Generate the full grid per block from the observed floor/unit ranges.
  Rejected — fabricates flats and pollutes the picker with non-existent units.

Because of (a), **Phase 5 (flat-addition request path) is not optional for the
pilot** — without it, a legitimate resident of an unlisted flat cannot finish signup.
Separately, flag to the product owner: ask the IRA Aspiration association for the
complete flat master list and re-seed; the seeding RPC is idempotent by design so a
re-run only adds the missing units.

---

## 3. Design decisions (settle these before writing code — do not re-litigate)

1. **New table `community_flats`; `community_blocks` is untouched.** Flats hang off
   a block, not off the community directly.
2. **`profiles.flat_id` is the new source of truth; `profiles.flat_number` stays as
   a denormalized text mirror.** Over 40 read sites already render
   `profiles.flat_number` (cards, funds, MCN, residents directory). A trigger keeps
   `flat_number` and `block_id` in sync from `flat_id`, so **none of those read
   sites need to change.** This is the single most important decision in this plan.
3. **Mirror format is `<block name>-<flat number>`** → `A-412`, `A-G04`. Set by
   trigger, never by a client.
4. **Downstream text columns keep their `flat_number TEXT`** (`mcn_preorder_orders`,
   carpool ride requests, `mcn_parents`, visits). They are point-in-time snapshots;
   only their *source* changes (read from profile instead of a text field).
5. **Flats require `blocks_enabled = true`** when the community has blocks. A flat
   may have `block_id IS NULL` only for a community with no blocks at all.
   `set_community_blocks_enabled(false)` must **raise** if any active flat has a
   non-null `block_id`, rather than silently orphaning residents.
6. **Normalization:** `upper(regexp_replace(input, '[^A-Za-z0-9]', '', 'g'))`,
   max 10 chars — identical to today's client-side rule, now enforced in SQL.
7. **`list_community_flats` is callable by any authenticated user, not only
   members** — the join flow runs before the user belongs to the community. It
   returns no PII (flat identifiers + occupancy counts only). This matches the
   existing `list_community_blocks` grant.
8. **Replace, don't overload, RPCs that gain a defaulted argument.** PostgREST
   cannot disambiguate `f(a,b,c)` from `f(a,b,c,d DEFAULT …)`. `DROP` the old
   signature in the same migration.

---

## 4. Implementation phases

Each phase is one migration file plus its client changes. Phases are ordered so the
tree compiles and the app works after every phase.

### Phase 1 — `community_flats` table + resident-facing reads

**Migration:** `supabase/migrations/<ts>_add_community_flats.sql`

```sql
CREATE TABLE IF NOT EXISTS public.community_flats (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  block_id     UUID REFERENCES public.community_blocks(id) ON DELETE CASCADE,
  flat_number  TEXT NOT NULL CHECK (flat_number = upper(flat_number)
                                    AND flat_number ~ '^[A-Z0-9]{1,10}$'),
  floor_label  TEXT CHECK (floor_label IS NULL OR length(floor_label) <= 4),
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PG15+ NULLS NOT DISTINCT so the no-block case is still deduplicated.
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_flats_unique
  ON public.community_flats (community_id, block_id, flat_number) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_community_flats_block_active
  ON public.community_flats (block_id) WHERE archived_at IS NULL;
```

- `floor_label` = `flat_number` minus its last two chars (`'412'→'4'`, `'G04'→'G'`),
  empty → `NULL`. Populate at insert via trigger; used only to group the picker.
- Enable RLS. Policies: `SELECT` for `authenticated` on active rows (see decision 7);
  all writes go through `SECURITY DEFINER` RPCs, so **no** direct `INSERT`/`UPDATE`
  policy.
- Trigger `validate_flat_block_assignment()` — mirror the existing
  `validate_profile_block_assignment()`: the block must belong to `community_id`.

**Columns on `profiles`:**

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS flat_id UUID REFERENCES public.community_flats(id) ON DELETE SET NULL;
```

**Trigger `sync_profile_flat_denorm()`** (BEFORE INSERT OR UPDATE OF `flat_id` ON `profiles`):
when `flat_id` is not null, resolve the flat + its block and set
`NEW.block_id`, `NEW.flat_number = block.name || '-' || flat.flat_number`
(or just `flat.flat_number` when `block_id IS NULL`); raise if the flat's
`community_id` ≠ the profile's `community_id`.

**RPC `list_community_flats(p_community_id UUID, p_block_id UUID DEFAULT NULL)`**
→ `TABLE(id UUID, block_id UUID, block_name TEXT, flat_number TEXT, floor_label TEXT, resident_count INT)`.
Active flats + active blocks only, ordered by `block_name`, then `floor_label`, then
`flat_number` with natural ordering. `SECURITY DEFINER`, `SET search_path = public`,
`GRANT EXECUTE … TO authenticated`.

**RPC `set_my_flat(p_flat_id UUID)`** — the only way a resident sets their flat.
Validates the flat is active and belongs to the caller's `community_id`, then
updates `profiles.flat_id` (trigger fills the rest). Also accept `NULL` to clear.

**End the migration with `NOTIFY pgrst, 'reload schema';`**

Then: `npm run db:push` → `npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj` → `npx tsc --noEmit`.

### Phase 2 — Seed IRA Aspiration

**Migration:** `supabase/migrations/<ts>_seed_ira_aspiration_flats.sql`

First add the reusable primitive, then call it — the plan's "future addition" story
is that every later community goes through this same RPC:

**RPC `platform_seed_community_flats(p_community_id UUID, p_payload JSONB, p_block_label TEXT DEFAULT 'Block')`**

- Guard: `is_platform_admin(auth.uid())` — **but** allow it to run when `auth.uid()`
  is `NULL` so a migration can invoke it (`IF auth.uid() IS NOT NULL AND NOT
  is_platform_admin(auth.uid()) THEN RAISE …`).
- `p_payload` is `[{"block":"A","flats":["102","104"]}, …]` — the exact shape of
  `flats.seed.json`.
- For each entry: upsert the block (un-archive if archived, mirroring
  `add_community_block`), then insert each normalized flat
  `ON CONFLICT DO NOTHING`. **Idempotent — safe to re-run when the association
  supplies the full master list.**
- Sets `communities.blocks_enabled = true` and `block_label = p_block_label`.
- Returns `(blocks_created INT, flats_created INT)`.

Then, in the same migration, inline the 370 flats from `flats.seed.json` as a
`jsonb` literal and call the RPC for `64cd9fa6-ad3b-40f0-9f1e-6b9f6a6fce06`.
**Read the JSON file and paste the real values — do not hand-retype flat numbers.**

Verify after push:

```sql
select b.name, count(*) from community_flats f
  join community_blocks b on b.id = f.block_id
 where f.community_id = '64cd9fa6-ad3b-40f0-9f1e-6b9f6a6fce06'
 group by b.name order by b.name;
-- expect A 95, B 88, C 81, D 75, E 31  (370 total)
```

### Phase 3 — Client: pick, never type

**New `components/FlatPicker.tsx`** — Verandah-styled (read
[docs/verandah.md](../verandah.md) first), two dependent dropdowns:
block → flat. Props: `communityId`, `value: string | null` (flat id), `onChange`,
`blockLabel`, `disabled`. Group the flat list by `floor_label` with a search box —
95 options in one flat list is unusable. Reuse `BlockPicker`'s data-loading shape;
show its "not set up yet" empty state when the community has no flats.

Wire it into:

| File | Change |
|---|---|
| [app/community-join-block.tsx](../../app/community-join-block.tsx) | Delete the flat `TextInput` and the ad-hoc block dropdown. Use `FlatPicker`; submit via `set_my_flat` instead of the direct `profiles` update at lines 71–77. Flat becomes **required**. |
| [app/profile/edit.tsx](../../app/profile/edit.tsx) | Replace the flat `TextInput` (line ~135) with `FlatPicker`; save via `set_my_flat`. Drop `flat_number` from the `profiles` update and from the `auth.updateUser` metadata write. |
| [app/mcn/drops/[id].tsx](../../app/mcn/drops/[id].tsx) | Flat field becomes read-only text sourced from `profile.flat_number`. If the profile has no flat, prompt the user to set it (link to profile edit) instead of accepting typed input. Keep sending `p_flat_number` — the value just comes from the profile now. |
| [app/mcn/carpools/[id].tsx](../../app/mcn/carpools/[id].tsx) | Same treatment (currently `flatNumber` state + `TextInput` at line ~971). |
| [app/mcn/parents/add.tsx](../../app/mcn/parents/add.tsx) | Same treatment (`TextInput` at line ~420). |
| [app/visits/[id].tsx](../../app/visits/[id].tsx) | Same treatment (`flatNo` state, line 77 / write at line 261). |
| [context/AuthContext.tsx](../../context/AuthContext.tsx) | Expose `flatId` alongside the existing `blockId` / `blocksEnabled` / `blockLabel`. |
| [lib/auth.ts](../../lib/auth.ts) | Drop the `flatNumber` argument from `signUpWithEmail` and the `flat_number` metadata write — flat is chosen after community join, never at signup. |
| [app/(tabs)/profile.tsx](../../app/(tabs)/profile.tsx) | Reads `user.user_metadata.flat_number` (lines 211–213). Switch to `profile.flat_number`; the metadata copy is going away. |

Also drop the now-dead `handle_new_user` write of `raw_user_meta_data->>'flat_number'`
(from `20260507202500_add_flat_number_to_signup.sql`) in the Phase 3 migration.

**New `app/community/flats.tsx`** — president/VP flat management, sibling of
`app/community/blocks.tsx`: pick a block, see its flats, bulk-add
(comma/newline-separated numbers), archive. Backed by new lead-scoped RPCs
`add_community_flats(p_block_id UUID, p_flat_numbers TEXT[])` and
`archive_community_flat(p_flat_id UUID)`, both guarded by
`is_community_lead(auth.uid())` + community ownership of the block.
Link it from wherever `app/community/blocks.tsx` is linked.
`app/community/` is **not** under `app/mcn/`, so `getImmediateParentRoute()` in
[lib/navigation.ts](../../lib/navigation.ts) does not need a new mapping — confirm
by checking how `blocks.tsx` behaves.

**Remember: `Alert.alert` is a no-op on web.** Any confirm in `flats.tsx` must
branch on `Platform.OS` and use `window.confirm`.

### Phase 4 — Intake and approval for new communities

**Migration:** columns + RPC replacements.

```sql
ALTER TABLE public.community_requests
  ADD COLUMN IF NOT EXISTS block_label TEXT CHECK (block_label IN ('Block','Tower')),
  ADD COLUMN IF NOT EXISTS block_details JSONB;  -- [{"block":"A","flats":["101",…]}]
```

- `submit_community_request` — add `p_block_label TEXT DEFAULT NULL`,
  `p_block_details JSONB DEFAULT NULL`. **`DROP` the previous signature** in the
  same migration (decision 8). Validate `block_details` shape server-side: array of
  objects with a non-empty `block` string and a `flats` array of strings; cap it
  (e.g. ≤ 50 blocks, ≤ 2000 flats total) so a bad client can't write junk.
- `platform_approve_community_request` — add `p_flats JSONB DEFAULT NULL`; when
  present, call `platform_seed_community_flats` after the community row is created.
  Also **match the requester's `requester_flat_number` to a seeded flat** and set
  their `profiles.flat_id` — the president then starts out correctly placed.
  `DROP` the 3-arg signature; re-`GRANT` the new one.
- Keep `requester_flat_number` as free text on the request. At request time no
  inventory exists yet, so this one field genuinely cannot be a dropdown.

**Client — [app/community-request.tsx](../../app/community-request.tsx):** add a
"Towers / blocks and flats" section after "Approximate units": a repeatable row of
{block name, flat numbers (multiline, comma/newline separated)}, plus a
Block/Tower label toggle. Pass `p_block_label` and `p_block_details`. Explain in
copy that the platform team verifies this list before the community goes live.

**Admin console — `admin-dashboard/js/approvals.js`:** it already holds
`blockLabels` / `blockNames` per request. Pre-fill both from the request's
`block_details`, add a per-block flats textarea, and pass `p_flats` to
`platform_approve_community_request`. This is the "confirm from backend" step —
the admin must be able to edit every value before approving.

**Admin console — `admin-dashboard/js/communities.js`:** add a Flats panel under the
existing Blocks/Towers section — per-block flat list, bulk paste-to-add, archive.
New platform RPCs `platform_add_community_flats(p_community_id, p_block_id, p_flat_numbers)`
and `platform_archive_community_flat(p_flat_id)`.

### Phase 5 — Flat-addition escape hatch (required for the pilot, see §2)

```sql
CREATE TABLE public.flat_addition_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  block_id     UUID NOT NULL REFERENCES public.community_blocks(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  flat_number  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','approved','rejected')),
  …reviewed_by / reviewed_at / rejection_reason
);
```

- RLS + one pending request per `(community_id, block_id, flat_number)` via a
  partial unique index.
- `request_flat_addition(p_block_id UUID, p_flat_number TEXT)` — any authenticated
  member of that community; rate-limit to a handful of pending rows per user.
- `review_flat_addition(p_request_id UUID, p_approve BOOLEAN, p_reason TEXT DEFAULT NULL)`
  — `is_community_lead` **or** `is_platform_admin`; on approve, insert the flat and
  notify the requester via `public.notifications` (follow the pattern in
  `platform_approve_community_request`).
- Client: a "My flat isn't listed" link in `FlatPicker`'s empty/not-found state →
  small form. Pending state shows "waiting for your community lead to confirm".
  Surface pending requests in `app/community/flats.tsx` and in the admin console.

---

## 5. Docs to update (part of the change set, not a follow-up)

Route each fact to exactly **one** owning file — see the routing rules in the root
[CLAUDE.md](../../CLAUDE.md):

- [docs/architecture.md](../architecture.md) — `community_flats`,
  `flat_addition_requests`, `profiles.flat_id`, `community_requests.block_details` /
  `block_label`, every new RPC, the two new triggers, the new
  `app/community/flats.tsx` route. **This file owns the schema — do not restate
  columns anywhere else.**
- [docs/features.md](../features.md) — join flow now picks block + flat; profile
  edit picks; MCN/visits flat fields are read-only from profile; president flat
  management; flat-addition request flow.
- [docs/CLAUDE.md](../CLAUDE.md) §9 — new trap: **flat numbers are never
  free-text; write them only via `set_my_flat` / seeding RPCs, and read
  `profiles.flat_number` as a trigger-maintained mirror.**
- [docs/verandah.md](../verandah.md) — `FlatPicker` as a shared component.
- [docs/platform-admin.md](../platform-admin.md) — approval-time flat seeding,
  community Flats panel, flat-addition review.
- [.github/app-summary.md](../../.github/app-summary.md) — one line, since flat
  inventory is a new cross-cutting concept.
- **Not** `docs/cross-community-changelog.md` — nothing here touches federation.

---

## 6. Verification checklist

- [ ] `npm run db:push` after **every** migration — never leave one unapplied
- [ ] `npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj > lib/database.types.ts` (generated file — never hand-edit)
- [ ] `npx tsc --noEmit` clean — the only validation gate in this repo
- [ ] Seed count query returns A 95 / B 88 / C 81 / D 75 / E 31
- [ ] `mcp__supabase__get_advisors` clean — every new table has RLS with explicit policies
- [ ] Grep confirms no `TextInput` anywhere still writes a flat number
- [ ] Web: flat picker and every confirm dialog work (`Alert.alert` is a no-op on web)
- [ ] Manual: join IRA Aspiration as a fresh resident → block A → flat 412 →
      profile shows `A-412`; residents directory, funds member list, and MCN cards
      all render it
- [ ] Manual: `set_community_blocks_enabled(false)` on IRA Aspiration **fails
      loudly** rather than orphaning the 370 flats (decision 5)

## 7. Out of scope

- Backfilling names/owner-vs-tenant/occupancy from the spreadsheet — this plan uses
  the `Flat` column only. The `Name`, `User Type`, and `Occupancy Status` columns
  are a separate pre-verification feature; do not build it here.
- Any change to the `flat_number TEXT` columns on orders, carpool requests,
  `mcn_parents`, or visits (decision 4).
