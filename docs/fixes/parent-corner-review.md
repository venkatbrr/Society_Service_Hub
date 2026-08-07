# Parent Corner — Edge-Case Review & Implementation Brief

**Date:** 2026-08-07
**Status:** Ready for implementation. Every open question is resolved in [Part 2](#part-2--resolved-design-decisions) — do not re-litigate them, implement as specified.

**Scope (the complete surface — there is nothing else):**

| File | Role |
|------|------|
| [app/mcn/parents/index.tsx](../../app/mcn/parents/index.tsx) | Directory: list, search, filters, sort, contact actions, delete |
| [app/mcn/parents/add.tsx](../../app/mcn/parents/add.tsx) | Create **and** edit (`?editId=`) |
| [app/(tabs)/network.tsx](../../app/(tabs)/network.tsx) | MCN hub card + "N children listed" badge (shared surface — see scope boundary) |
| [lib/navigation.ts](../../lib/navigation.ts) | `getImmediateParentRoute()` mappings for `/mcn/parents` and `/mcn/parents/*` |
| `supabase/migrations/20260726400000_add_mcn_parent_corner.sql` | Table, indexes, original RLS |
| `supabase/migrations/20260814000000_mcn_deletion_permissions.sql` | DELETE policy (superseded) |
| `supabase/migrations/20260821000300_add_parent_corner_intents.sql` | `intents TEXT[]` + GIN index |
| `supabase/migrations/20260822000000_repoint_dead_community_lead_checks.sql` | UPDATE policy (current) |
| `supabase/migrations/20260822000100_platform_admin_override_on_mcn_deletes.sql` | DELETE policy (current) |

No edge function, no admin-console page, no `notifications` rows, no `components/*` file, and no `lib/` helper are involved. Verified by
`grep -rn "mcn_parent_corner"` across the repo — the only hits outside `lib/database.types.ts` are the four files above (plus `scratch/test_schema.js`, dead scratch code).

**Method:** Walked the feature as a resident, a president, and a platform admin — add, prefill, list, filter, sort, search, edit, delete, WhatsApp, call, share, and the MCN hub badge. Read all five migrations in filename order. Probed the **live** project (`npx supabase db query --linked`) for the actual policy expressions, constraints, triggers, helper-function bodies, and current row shape. Read the `react-native-web` and `expo-linking` web implementations in `node_modules/` to confirm PWA behaviour rather than assume it.

**Baseline:** `npx tsc --noEmit` is **clean** (exit 0) before any change. It must be clean after.

**Result: 16 issues — 2 blocking, 6 high, 8 minor.**

---

## READ THIS FIRST — rules for the implementing agent

1. **Read `CLAUDE.md` and `docs/CLAUDE.md` before editing anything.** They override any habit you have. Relevant here in particular:
   - `lib/database.types.ts` is generated. Never hand-edit it.
   - `Alert.alert` is a **no-op on web**. Confirmations split on `Platform.OS`.
   - `public.is_admin()` is *not* a platform-admin check. Use `public.is_platform_admin(auth.uid())`.
   - The role enum is exactly `admin · resident · president · vice_president`.
   - Use `.maybeSingle()`, never `.single()`.
   - `mcn_parent_corner` **is** community-scoped: every query must filter by `communityId` from `useAuth()`. It is *not* on the user-scoped exception list.

2. **`npx tsc --noEmit` is the only automated gate, and it catches none of these 16 bugs.**
   The Supabase client in [lib/supabase.ts:25](../../lib/supabase.ts#L25) is created as `createClient(url, key)` with **no `<Database>` generic**, so every `.from(...).select(...)` returns `any`. That is precisely why issue #3 — selecting a column that does not exist — has survived. You must walk the checklist in [§ Verification](#verification). Do not report anything fixed on the strength of `tsc` alone.

3. **After touching `supabase/migrations/`, finish the loop yourself:**
   ```
   npm run db:push
   npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj > lib/database.types.ts
   ```
   then **re-append the hand-maintained enriched-types block** (`ProviderWithInteraction`, `VisitWithJoinerData`, `VisitJoinerWithProfile`) at the bottom of `lib/database.types.ts` — `gen types` overwrites the whole file (`docs/CLAUDE.md` §6, §9). Then `npx tsc --noEmit`.

4. **The SQL in this document is a specification, not tested code.** It was written by reading the live catalog, not by executing it. Where it says *"run this first"*, actually run it.

5. **Task M2 adds `CHECK` constraints to a live table.** Run the dry-run `SELECT` in [M2](#m2--length-and-value-constraints-10) first and confirm it returns zero rows. At the time of this review the table held **1 row** in **1 community** (`max(length(student_name))=8`, `max(length(school_name))=19`, `max(length(notes))=63`, all phones exactly 10 digits), so it should be a clean no-op — but verify, do not assume.

6. **Scope boundary.**
   - In [app/(tabs)/network.tsx](../../app/(tabs)/network.tsx) change **only** the error handling inside `fetchSectionStats` named in issue #16. That file is the shared MCN hub owned by six features; touch nothing else in it.
   - Do **not** change the `mcn_carpools` / `mcn_listings` / `mcn_posts` / `mcn_preorder_drops` policies. Issue #2 describes a hole those tables share, but widening the fix is a separate, riskier change set — see [Part 2](#part-2--resolved-design-decisions).
   - Do **not** introduce `lib/parentCorner*.ts` or any shared component. Nothing here is reused; two screens is the right size.

7. **Docs are part of the change set**, not a follow-up. See [§ Documentation updates](#documentation-updates).

---

## Severity summary

| # | Issue | Severity | Area | Fixed by |
|---|-------|----------|------|----------|
| 1 | Delete does nothing at all on the PWA | **P0** | Client (web) | [C1](#c1--appmcnparentsindextsx--delete-confirmation-1) |
| 2 | UPDATE/DELETE policies never check `community_id` | **P0** | DB | [M1](#m1--pin-the-community-on-update-and-delete-2) |
| 3 | Profile prefill is dead — `profiles.phone` does not exist | P1 | Client | [C2](#c2--appmcnparentsaddtsx--load-prefill-and-save-3-4-5-7) |
| 4 | A rejected edit reports "Child details updated!" | P1 | Client | [C2](#c2--appmcnparentsaddtsx--load-prefill-and-save-3-4-5-7) |
| 5 | Saving an edit rewrites `user_id` to whoever edited | P1 | Client | [C2](#c2--appmcnparentsaddtsx--load-prefill-and-save-3-4-5-7) |
| 6 | Board filter "University" can never match a saved entry | P1 | Client | [C2](#c2--appmcnparentsaddtsx--load-prefill-and-save-3-4-5-7), [C3](#c3--appmcnparentsindextsx--boards-contact-actions-sorting-6-7-8-14) |
| 7 | Phone is never validated; WhatsApp link double-prefixes `91` | P1 | Client | [C2](#c2--appmcnparentsaddtsx--load-prefill-and-save-3-4-5-7), [C3](#c3--appmcnparentsindextsx--boards-contact-actions-sorting-6-7-8-14) |
| 8 | "WhatsApp Parent" throws the PWA out of the app | P1 | Client (web) | [C3](#c3--appmcnparentsindextsx--boards-contact-actions-sorting-6-7-8-14) |
| 9 | Every mount fires the list query twice | P2 | Client | [C4](#c4--appmcnparentsindextsx--fetching-caps-copy-9-10-13) |
| 10 | No length limit anywhere — client or database | P2 | Client + DB | [M2](#m2--length-and-value-constraints-10), [C4](#c4--appmcnparentsindextsx--fetching-caps-copy-9-10-13), [C5](#c5--appmcnparentsaddtsx--input-caps-and-flat-normalisation-10-11) |
| 11 | Flat number is not normalised | P2 | Client | [C5](#c5--appmcnparentsaddtsx--input-caps-and-flat-normalisation-10-11) |
| 12 | Leads can delete but cannot edit, contradicting the docs | P2 | Client + Docs | [C6](#c6--appmcnparentsindextsx--lead-edit-affordance-12) |
| 13 | Residents are told to run a migration file | P2 | Client | [C4](#c4--appmcnparentsindextsx--fetching-caps-copy-9-10-13) |
| 14 | "Class 10" sorts before "Class 2" | P2 | Client | [C3](#c3--appmcnparentsindextsx--boards-contact-actions-sorting-6-7-8-14) |
| 15 | `architecture.md` documents a trigger that does not exist | P2 | Docs | [§ Documentation updates](#documentation-updates) |
| 16 | A failed count renders "0 children listed" | P2 | Client | [C7](#c7--apptabsnetworktsx--count-error-handling-16) |

---

# PART 1 — FINDINGS

# P0 — blocks real use

## 1. On the PWA, deleting your child's entry does nothing at all

[app/mcn/parents/index.tsx:269-288](../../app/mcn/parents/index.tsx#L269-L288):

```js
const handleDeleteEntry = (id: string, studentName: string) => {
  Alert.alert('Delete Entry', `Are you sure you want to remove student record for "${studentName}"?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { … } },
  ]);
};
```

There is no `Platform.OS` branch. React Native's `Alert` is a no-op on web, so on the installable PWA the trash icon is completely inert: no dialog, no toast, no console output, no network call. Nothing happens.

**Resident impact.** This directory publishes a **child's full name, school, class, the parent's name, the flat number, and a working phone number** to every resident of the society. The only way to withdraw it is the trash icon. A parent who has second thoughts, or whose family is moving out, taps Delete on the PWA and the entry stays up forever. They will assume the app is broken and, correctly, that they have lost control of their child's data. A president trying to remove an inappropriate or stale entry hits the same wall.

**The rest of the codebase already does this correctly** — eleven screens split on platform. The canonical shape is [app/mcn/carpools/[id].tsx:157-166](../../app/mcn/carpools/%5Bid%5D.tsx#L157-L166):

```js
if (Platform.OS === 'web') {
  if (typeof window !== 'undefined' && window.confirm('Delete Carpool?\nThis action cannot be undone.')) {
    performDelete();
  }
} else {
  Alert.alert('Delete Carpool?', 'This action cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: performDelete },
  ]);
}
```

`Platform` is already imported at [index.tsx:11](../../app/mcn/parents/index.tsx#L11) — the guard was simply never written.

---

## 2. The UPDATE and DELETE policies never check which community the row belongs to

Verified against the **live** project (`SELECT polname, polcmd, pg_get_expr(polqual, …), pg_get_expr(polwithcheck, …) FROM pg_policy WHERE polrelid='public.mcn_parent_corner'::regclass`):

```
mcn_parent_corner_select [r] USING=(community_id = get_user_community_id())                CHECK=-
mcn_parent_corner_insert [a] USING=-   CHECK=((community_id = get_user_community_id()) AND (user_id = auth.uid()))
mcn_parent_corner_update [w] USING=((user_id = auth.uid()) OR is_community_lead(auth.uid()) OR is_platform_admin(auth.uid()))  CHECK=-
mcn_parent_corner_delete [d] USING=((user_id = auth.uid()) OR is_community_lead(auth.uid()) OR is_platform_admin(auth.uid()))  CHECK=-
```

Note the asymmetry: **INSERT pins `community_id`. UPDATE and DELETE do not.** Two consequences follow, both verified structurally from the expressions above and from the live body of the helper.

### 2a. A row can be moved into a community it does not belong to

`mcn_parent_corner_update` declares `USING` and no `WITH CHECK`. Postgres then applies the `USING` expression to the **new** row as well — and that expression says nothing about `community_id`. So the statement

```sql
UPDATE public.mcn_parent_corner SET community_id = '<some other society>' WHERE id = '<my own row>';
```

passes: `user_id = auth.uid()` is true before and after. The row lands in a society the family has never lived in, publishing the child's name, class, school, flat number and phone to strangers there. The owner then **cannot undo it** — `mcn_parent_corner_select` is keyed on `community_id`, so the row instantly becomes invisible to them, and the app offers no way to reach a row it cannot list.

The client never does this by accident: the edit payload sends the editor's own `communityId` ([add.tsx:179](../../app/mcn/parents/add.tsx#L179)). This is reachable through the PostgREST endpoint with the anon key that ships in the bundle, i.e. by any resident with a browser console. The insert path is already immune because its `WITH CHECK` pins the community — the update path was simply never given the same treatment.

### 2b. A president of one society can edit and delete rows in another

The live definition of the helper (`pg_get_functiondef`) is:

```sql
CREATE OR REPLACE FUNCTION public.is_community_lead(p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = COALESCE(p_user_id, auth.uid())
      AND p.app_role IN ('president'::public.app_role_type, 'vice_president'::public.app_role_type)
      AND p.removed_at IS NULL
  );
END;
$function$
```

It asks **"is this person a lead anywhere?"**, not **"is this person a lead of this row's community?"**. Combined with a policy that never mentions `community_id`, a president of society A satisfies `mcn_parent_corner_update` / `_delete` for every parent-corner row in the entire platform. They cannot *browse* other societies (the SELECT policy stops that), so exploitation needs a row `id` — but ids are UUIDs handed to the client in plain text, and the delete path needs nothing but the id.

**Resident impact.** In a multi-tenant product this is the tenancy boundary failing on the one table that carries children's names and parents' phone numbers. Even absent malice, it means the platform cannot honestly tell a society that its parent directory is private to that society.

**How the rest of the codebase gets this right:** the insert policy on this very table, and `get_residents_directory()` ([20260822000200](../../supabase/migrations/20260822000200_drop_legacy_app_role_enum_values.sql#L101-L124)), which explicitly resolves the caller's `community_id` and filters on it rather than trusting the role check alone.

> **Note for the fixer, not a licence to expand scope:** `mcn_carpools`, `mcn_listings`, `mcn_posts` and `mcn_preorder_drops` carry the identical pattern (`architecture.md` §7, "Uniform MCN owner-or-lead rule"). Fix **only** `mcn_parent_corner` in this change set. See [Part 2](#part-2--resolved-design-decisions) for why.

---

# P1 — high

## 3. The "auto-fill from your profile" never fires — the column does not exist

[app/mcn/parents/add.tsx:76-97](../../app/mcn/parents/add.tsx#L76-L97):

```js
const { data, error } = await supabase
  .from('profiles')
  .select('full_name, flat_number, phone')     // ← `phone` is not a column
  .eq('id', user.id)
  .single();

if (error) throw error;
if (data) {
  if (!editId) {
    setParentName(data.full_name || '');
    setFlatNumber(data.flat_number || '');
    setContactPhone(data.phone || '');
  }
}
```

Verified against the live database:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles' AND column_name LIKE '%phone%';
-- → phone_number
```

There is no `profiles.phone`. PostgREST rejects the whole request (`42703 — column profiles.phone does not exist`), `error` is set, the `throw` fires, and [line 95](../../app/mcn/parents/add.tsx#L95) swallows it into `console.error`. Because one bad column kills the entire `select`, **all three prefills die together** — not just the phone.

**Resident impact.** The screen advertises itself as pre-filled from your profile. In reality every parent retypes their own name, flat number and phone by hand, every time they add a child. Typos in the flat number are then baked into a directory whose whole point is finding the neighbour at the same school, and a mistyped phone produces a WhatsApp button that messages a stranger.

This is a bare typo, and the whole app disagrees with it — [app/mcn/drops/[id].tsx:105](../../app/mcn/drops/%5Bid%5D.tsx#L105) uses `.select('full_name, flat_number, phone_number')`. `app/mcn/parents/add.tsx:82` is the **only** occurrence of `'…, phone'` in the repository.

Two more defects sit in the same block:
- `.single()` at [line 85](../../app/mcn/parents/add.tsx#L85) throws on zero rows. `docs/CLAUDE.md` §2.4 requires `.maybeSingle()`.
- `loadUserProfile()` runs on **every** mount including edit mode ([line 130](../../app/mcn/parents/add.tsx#L130)); the `!editId` guard is inside the callback rather than at the call site, so an edit pays for a round trip whose result is discarded.

---

## 4. An edit that the database refuses still says "Child details updated!"

[app/mcn/parents/add.tsx:194-200](../../app/mcn/parents/add.tsx#L194-L200):

```js
if (editId) {
  const { error } = await supabase
    .from('mcn_parent_corner')
    .update(payload)
    .eq('id', editId);
  if (error) throw error;
  Toast.show({ type: 'success', text1: 'Child details updated!' });
}
```

An `UPDATE` that matches **zero** rows is not an error in PostgREST — it is a successful statement affecting nothing. Under RLS, "not permitted" and "no such row" both present as zero rows. So the success toast fires, and [line 209](../../app/mcn/parents/add.tsx#L209) navigates back to a list that is unchanged.

Two real paths reach it:

- **Someone else's entry.** `loadExistingEntry()` at [line 103-107](../../app/mcn/parents/add.tsx#L103-L107) fetches by `id` alone with no ownership filter, and the SELECT policy is community-wide — so `/mcn/parents/add?editId=<a neighbour's row>` loads and renders that family's details in an editable form. Save, and the update matches zero rows (the resident is neither owner nor lead). Toast: *"Child details updated!"*.
- **A row deleted underneath you.** A president deletes an entry while the owner has the edit form open. Save → zero rows → *"Child details updated!"*. The parent's corrections are gone with no indication.

`docs/CLAUDE.md` §9 already names this family of bug — *"RLS makes the delete match zero rows and return success"* — for the delete-then-insert case. The same trap applies to a bare `update`.

---

## 5. Saving an edit reassigns the entry to whoever is editing it

The payload at [app/mcn/parents/add.tsx:178-192](../../app/mcn/parents/add.tsx#L178-L192) is built once and used for **both** insert and update:

```js
const payload = {
  community_id: communityId,
  user_id: user.id,          // ← sent on UPDATE too
  student_name: studentName.trim(),
  …
};
```

`user_id` and `community_id` are identity columns. Resending them on an update means: whenever a **president or vice-president** edits another resident's entry, `user_id` is overwritten with the president's id. The row's RLS `USING` clause is satisfied by the lead branch, so the write succeeds, and afterwards:

- the parent who created the entry is no longer its owner — the edit pencil disappears for them ([index.tsx:291](../../app/mcn/parents/index.tsx#L291) computes `isOwner` from `user_id`);
- the row now hangs off the president's profile, so if the president ever leaves the society the `ON DELETE CASCADE` on `mcn_parent_corner.user_id → profiles.id` takes the family's entry with it.

Today a lead can only reach the edit screen by typing the URL, because the pencil renders under `isOwner` ([index.tsx:315](../../app/mcn/parents/index.tsx#L315)) — which is itself issue #12. **Fix #5 before #12**, or granting leads the edit affordance turns a latent bug into a routine one.

---

## 6. Filtering by "University" can never match anything

The two screens carry two different board lists.

[app/mcn/parents/index.tsx:62](../../app/mcn/parents/index.tsx#L62) — the filter chips:
```js
const BOARD_OPTIONS = ['All', 'CBSE', 'ICSE', 'State Board', 'IB', 'IGCSE', 'PU Board', 'University', 'Other'];
```

[app/mcn/parents/add.tsx:30](../../app/mcn/parents/add.tsx#L30) — what actually gets saved:
```js
const BOARD_OPTIONS = ['CBSE', 'ICSE', 'State Board', 'IB', 'IGCSE', 'PU Board', 'University / Autonomous', 'Other'];
```

The comparison at [index.tsx:191](../../app/mcn/parents/index.tsx#L191) is exact (case-insensitive, but exact):

```js
list = list.filter((item) => item.board.toLowerCase() === selectedBoard.toLowerCase());
```

`"university / autonomous" !== "university"`. So:

- Tapping the **University** chip always yields an empty directory, even when college entries exist.
- Entries saved as *University / Autonomous* are unreachable by **any** board filter — the only chip that could match them does not exist.

The board pill on the card ([index.tsx:345](../../app/mcn/parents/index.tsx#L345)) renders the stored string, so a resident sees "University / Autonomous" on the card and "University" in the filter bar and has no way to connect them.

**Resident impact.** Parents of college students are invisible to exactly the search that would find them. `docs/features.md` §4.5 documents the board list as `… PU Board, University, Other` — matching the filter, not the writer, so the saved value is the one that is wrong.

Verified: the live table currently contains **0** rows with a board outside the filter list, so this can be corrected without a data backfill. Confirm again before shipping (query in [M2](#m2--length-and-value-constraints-10)).

---

## 7. The phone number is never validated, and the WhatsApp link prefixes `91` blindly

Nothing on the add screen touches `lib/phone.ts`. [app/mcn/parents/add.tsx:171-174](../../app/mcn/parents/add.tsx#L171-L174) is the entire check:

```js
if (!contactPhone.trim()) {
  Toast.show({ type: 'error', text1: 'Contact Phone Number is required' });
  return;
}
```

`"call me"`, `"98765"`, `"+91 98765 43210"` and `"0919876543210"` are all accepted and stored verbatim (the live table has no length or format constraint — verified via `pg_constraint`, which holds only the primary key, two foreign keys, and the `institution_type` check).

Then [index.tsx:253-260](../../app/mcn/parents/index.tsx#L253-L260) builds the deep link:

```js
const cleanPhone = item.contact_phone.replace(/\D/g, '');
const url = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(text)}`;
```

| Stored value | `cleanPhone` | Resulting link | Outcome |
|---|---|---|---|
| `9876543210` | `9876543210` | `wa.me/919876543210` | correct |
| `+91 98765 43210` | `919876543210` | `wa.me/91919876543210` | 14 digits — WhatsApp "phone number shared via url is invalid" |
| `09876543210` | `09876543210` | `wa.me/9109876543210` | invalid |
| `call me` | `` (empty) | `wa.me/91?text=…` | opens WhatsApp with no recipient |
| `98765` | `98765` | `wa.me/9198765` | invalid |

**Resident impact.** The single action the whole feature exists for — message the other parent — fails, and it fails with WhatsApp's own error page rather than anything the app can explain. `+91 98765 43210` is a completely ordinary way for an Indian resident to type their number.

**The codebase already knows how to do both halves.** Validation: [app/sos/donor.tsx:90-111](../../app/sos/donor.tsx#L90-L111) normalises on blur with `toLast10Digits` and hard-rejects on save with `normalizeIndianMobile`. Link building: [components/McnPostCard.tsx:39-48](../../components/McnPostCard.tsx#L39-L48) guards `digitsOnly.length === 10` *before* prefixing `91` and falls back gracefully otherwise. `lib/phone.ts` exists for exactly this and is used by `provider/add.tsx`, `sos/donor.tsx`, and `visits/add.tsx`.

The Call button at [index.tsx:262-267](../../app/mcn/parents/index.tsx#L262-L267) inherits the same garbage: `tel:` with zero digits is a silent no-op.

---

## 8. "WhatsApp Parent" throws the PWA out of the app

[app/mcn/parents/index.tsx:3](../../app/mcn/parents/index.tsx#L3) imports `expo-linking`, and [line 257](../../app/mcn/parents/index.tsx#L257) calls:

```js
Linking.openURL(url).catch(() => {
  Toast.show({ type: 'error', text1: 'Could not open WhatsApp' });
});
```

The web implementation, `node_modules/expo-linking/build/RNLinking.web.js:40-45`:

```js
async openURL(url) {
    if (typeof window !== 'undefined') {
        // @ts-ignore
        window.location = new URL(url, window.location).toString();
    }
},
```

It assigns `window.location` — a **same-tab** navigation. For an `https://wa.me/…` URL the PWA is replaced by WhatsApp Web. Coming back means a browser-back that cold-boots the whole Expo bundle: re-auth, re-fetch, back to the MCN hub, and the resident has to find the entry again. On an installed PWA in standalone display mode there may be no visible back affordance at all.

The `.catch` is dead code on web: assigning `window.location` never rejects, so the "Could not open WhatsApp" toast can never appear no matter what goes wrong.

*(The `tel:` link at [line 264](../../app/mcn/parents/index.tsx#L264) is fine — browsers hand `tel:` to a protocol handler without navigating. Only the `https://wa.me/` link ejects the user.)*

**The codebase already handles this** — [app/mcn/drops/manage/[id].tsx:244-250](../../app/mcn/drops/manage/%5Bid%5D.tsx#L244-L250):

```js
const url = `https://wa.me/91${clean}?text=${text}`;
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.open(url, '_blank');
  return;
}
Linking.openURL(url);
```

---

# P2 — smaller

## 9. Every mount fires the same query twice

Two effects load the same data. [index.tsx:150-154](../../app/mcn/parents/index.tsx#L150-L154):

```js
useFocusEffect(
  useCallback(() => {
    fetchEntries();
  }, [fetchEntries])
);
```

and [index.tsx:225-227](../../app/mcn/parents/index.tsx#L225-L227):

```js
useEffect(() => {
  fetchEntries();
}, [communityId, fetchEntries]);
```

`fetchEntries` is `useCallback`-wrapped on `[communityId]`, so both fire on mount and both fire again whenever the community changes — two identical `select *` round trips each time, with the list flashing through its loading state twice on a slow connection. `useFocusEffect` alone is the documented pattern (`docs/CLAUDE.md` §3, "Focus refresh") and already covers both cases: it re-runs when its callback identity changes, which happens exactly when `communityId` changes.

**Keep the `useFocusEffect`, delete the `useEffect`.** Do not do it the other way round — `useEffect` alone would stop the list refreshing when you return from the add screen.

While you are there: `fetchEntries` early-returns on `!communityId` ([line 120](../../app/mcn/parents/index.tsx#L120)) **before** `setLoading(false)`, leaving the spinner up. In practice the global guard in [app/_layout.tsx:114-116](../../app/_layout.tsx#L114-L116) redirects a community-less user to `/community-select`, and the loader self-heals once `communityId` resolves, so this is not a live defect — but the early return should still clear the flag so removing an effect can never turn it into one.

---

## 10. No length limit anywhere — not in the client, not in the database

`grep -c maxLength app/mcn/parents/add.tsx app/mcn/parents/index.tsx` → **0** and **0**. And from `pg_constraint` on the live table, the complete constraint set is:

```
mcn_parent_corner_pkey                    PRIMARY KEY (id)
mcn_parent_corner_community_id_fkey       FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE
mcn_parent_corner_user_id_fkey            FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
mcn_parent_corner_institution_type_check  CHECK (institution_type = ANY (ARRAY['school','college','preschool']))
```

No `CHECK` on any free-text column. Every sibling screen caps its inputs — [app/mcn/listing-add.tsx](../../app/mcn/listing-add.tsx#L152) uses `maxLength={80}` / `{280}` / `{15}`; [app/mcn/schools/add.tsx](../../app/mcn/schools/add.tsx#L145) uses `{100}` / `{40}` / `{300}` / `{15}`.

**Resident impact.** A pasted paragraph in Notes renders in full at [index.tsx:378](../../app/mcn/parents/index.tsx#L378) — no `numberOfLines`, no truncation — so one card can be taller than the screen and push every other family out of view. A very long `student_name` breaks the card header, the share message, and the school filter chip row. There is no rate or volume limit either, so the directory has no floor under how bad a single entry can make it.

Caps are specified in [M2](#m2--length-and-value-constraints-10) and must be applied **identically** on both sides.

---

## 11. Flat number is stored however it was typed

[app/mcn/parents/add.tsx:373-382](../../app/mcn/parents/add.tsx#L373-L382):

```jsx
<Text style={…}>Flat / Unit Number *</Text>
<TextInput
  placeholder="e.g. Block A-402"
  value={flatNumber}
  onChangeText={setFlatNumber}
/>
```

`docs/CLAUDE.md` §3 is explicit: *"Flat / house numbers — uppercase and strip spaces and hyphens on blur. Use placeholders like `A101`, never hyphenated examples."* This screen does neither, and its placeholder actively teaches the hyphenated form the convention forbids.

**Resident impact.** `A-402`, `a 402`, `A402` and `Block A-402` all coexist in one directory. Searching "A402" ([index.tsx:179](../../app/mcn/parents/index.tsx#L179) does a plain `includes`) misses three of them, sorting by flat ([line 214](../../app/mcn/parents/index.tsx#L214)) interleaves them arbitrarily, and the same family's flat looks different in Parent Corner than everywhere else in the app.

Three screens already do it right, identically — [app/community-join-block.tsx:105](../../app/community-join-block.tsx#L105), [app/community-request.tsx:227](../../app/community-request.tsx#L227), [app/visits/[id].tsx:575](../../app/visits/%5Bid%5D.tsx#L575):

```js
onBlur={() => setFlatNumber(prev => prev.toUpperCase().replace(/[\s-]/g, ''))}
```

---

## 12. A president can delete any entry but cannot edit one — the docs say otherwise

[index.tsx:290-335](../../app/mcn/parents/index.tsx#L290-L335):

```js
const isOwner = item.user_id === user?.id;
const canManage = isOwner || isCommunityLead;
…
{canManage && (
  <View style={styles.cardActionsRight}>
    {isOwner && (                       // ← edit pencil: owner only
      <TouchableOpacity onPress={() => router.push({ pathname: '/mcn/parents/add', params: { editId: item.id } })}>
    )}
    <TouchableOpacity onPress={() => handleDeleteEntry(item.id, item.student_name)}>   {/* delete: owner OR lead */}
  </View>
)}
```

`docs/features.md` §4.5 says *"**Owner or lead** can edit or delete any entry"*, and the role matrix at `docs/features.md:448` says *"Add / edit child entry — own only | own **or any**"*. RLS grants leads UPDATE. Only the UI withholds it.

**Resident impact.** A president who spots a wrong school name or an obviously mistyped phone number has exactly one tool: delete the family's entry outright. The proportionate action is unavailable.

Fixing this is a one-line change (`isOwner` → `canManage` on the pencil) but it is **strictly blocked on issue #5** — until the payload stops resending `user_id`, every lead edit silently transfers ownership.

---

## 13. Residents are told to run a migration file

[index.tsx:684-689](../../app/mcn/parents/index.tsx#L684-L689):

```jsx
<EmptyState
  icon="construct-outline"
  title="Database Table Missing"
  message="Please run migration file '20260726400000_add_mcn_parent_corner.sql' in your Supabase Dashboard SQL Editor to set up the Parent Corner table."
/>
```

This is developer copy in a production resident-facing app. It also violates the sentence-case rule (`docs/CLAUDE.md` §4). And the FAB ([line 702](../../app/mcn/parents/index.tsx#L702)) and the header `+` ([line 420](../../app/mcn/parents/index.tsx#L420)) stay live in this state, so a resident can open the add form and hit a raw Postgres error on save.

`docs/features.md` §4.5 already describes the intended behaviour — *"renders a 'feature not available' state"* — so the copy, not the doc, is what is wrong. Compare `getMissingFundSchemaMessage()` in [lib/supabaseErrors.ts](../../lib/supabaseErrors.ts): *"Funds need the latest Supabase migrations before every feature can load."*

---

## 14. "Class 10" sorts before "Class 2"

[index.tsx:205-220](../../app/mcn/parents/index.tsx#L205-L220):

```js
} else if (sortBy === 'grade') {
  const comp = a.grade_class.localeCompare(b.grade_class);
  …
} else if (sortBy === 'flat') {
  return a.flat_number.localeCompare(b.flat_number);
}
```

Plain `localeCompare` is lexicographic: `Class 10 · Class 11 · Class 2 · Class 3`, and `A10 · A102 · A2`. Both of the sorts a parent would actually use to scan the directory are wrong in the one way most visible at a glance. One-line fix: `localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })`.

---

## 15. `architecture.md` documents a trigger that does not exist

[docs/architecture.md:375](../../docs/architecture.md#L375) lists `mcn_parent_corner` among the tables carrying an `*_updated_at` BEFORE UPDATE trigger. Verified against the live database:

```sql
SELECT tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.relname = 'mcn_parent_corner' AND NOT t.tgisinternal;
-- → NO TRIGGERS
```

`grep -rn "parent_corner" supabase/migrations/` returns only the five files in scope, none of which create a trigger, and there is no `set_updated_at` / `handle_updated_at` helper anywhere in `supabase/migrations/`.

`updated_at` is maintained purely by the client sending `new Date().toISOString()` ([add.tsx:191](../../app/mcn/parents/add.tsx#L191)) — so its value is the **device clock**, and any write that does not go through this screen leaves it stale. Nothing in the UI reads the column today, so this is a documentation defect rather than a behavioural one. Correct the doc; do not add the trigger (see [Part 2](#part-2--resolved-design-decisions)).

---

## 16. A failed count renders "0 children listed"

[app/(tabs)/network.tsx:46-84](../../app/(tabs)/network.tsx#L46-L84) issues six counts in a `Promise.all` and then reads only `.count`:

```js
const [businessRes, preorderRes, carpoolRes, parentRes, schoolRes, postRes] = await Promise.all([…]);
…
setParentCount(parentRes.count ?? 0);
```

None of the six `error` fields is checked. A PostgREST failure resolves the promise with `{ count: null, error: {…} }`, so the `?? 0` turns any error into a confident **"0 children listed"** on the MCN hub card. `docs/CLAUDE.md` §9 names this exact trap: *"Destructuring only `data` from a Supabase call — a silent failure then looks like real empty data."*

**Resident impact.** The hub tells a parent nobody in the society has listed a child, so they never open the screen. Distinguishing "none yet" from "we could not load this" is the whole point of the badge.

---

# PART 2 — RESOLVED DESIGN DECISIONS

| # | Question | Decision | Rationale |
|---|---|---|---|
| D1 | Which board string wins — `University` or `University / Autonomous`? | **`University`.** Change [add.tsx:30](../../app/mcn/parents/add.tsx#L30) to match [index.tsx:62](../../app/mcn/parents/index.tsx#L62). | `docs/features.md` §4.5 already documents `University`, and it is the filter side, so no doc change and no data backfill (0 live rows carry the long form — reconfirm with the query in M2). |
| D2 | Fix the cross-community hole (#2) for all five MCN tables or only this one? | **Only `mcn_parent_corner`.** | This review's evidence covers this table only. `mcn_carpools` / `mcn_listings` / `mcn_posts` / `mcn_preorder_drops` have their own lead-moderation flows that a community filter could break, and changing five policies at once with no test suite is how you take moderation offline for the whole MCN. Raise it as its own change set. |
| D3 | Keep the `is_platform_admin()` branch in the rewritten policies? | **Yes, un-scoped.** | `CLAUDE.md`: the platform admin has ultimate powers across all communities, and `is_platform_admin()` already requires `community_id IS NULL`. Scoping it by `get_user_community_id()` would return `NULL` for them and silently revoke the override — exactly the failure `20260822000100` was written to fix. |
| D4 | Should leads keep DELETE across communities so platform moderation still works? | **No.** Scope the lead branch to their own community in both UPDATE and DELETE. | Platform-wide moderation is the platform admin's job, and their branch is untouched. A president has no legitimate reason to act on another society's children. |
| D5 | Enforce the community pin in a trigger or in RLS? | **RLS**, via a `WITH CHECK` on the UPDATE policy. | It is a pure row predicate with no cross-row aggregate, so the `SECURITY DEFINER`-trigger rule in `docs/CLAUDE.md` §9 does not apply. RLS keeps it visible next to the rule it corrects. |
| D6 | Should the client keep sending `user_id` / `community_id` on update? | **No** — build a separate update payload without them. | They are identity columns. Omitting them makes issue #5 unreachable regardless of who edits, and makes the client agree with the new `WITH CHECK` instead of fighting it. |
| D7 | How should a zero-row update be detected (#4)? | `.update(payload).eq('id', editId).select('id').maybeSingle()` and treat a `null` result as a failure with the toast *"Could not save — this entry may have been removed, or it is not yours to edit."* | `.select()` makes PostgREST return the affected rows, so zero rows becomes observable. `.maybeSingle()` (not `.single()`) per `docs/CLAUDE.md` §2.4. |
| D8 | Should a non-owner be able to open `?editId=` at all? | **No.** After loading, if `data.user_id !== user.id && !isCommunityLead`, toast *"You can only edit your own entry"* and `router.replace('/mcn/parents')`. | Cheaper and clearer than letting them fill in a form that cannot save. RLS remains the real boundary; this is the affordance. |
| D9 | Field length caps. | `student_name` 60 · `school_name` 100 · `board` 40 · `grade_class` 40 · `parent_name` 60 · `flat_number` 12 · `contact_phone` 15 · `notes` 300. | Mirrors `app/mcn/schools/add.tsx` (100 / 40 / 300 / 15) and `app/mcn/listing-add.tsx` (80 / 280 / 15). Every live value is far below these (max 19 chars); nothing is truncated. |
| D10 | Client `maxLength` or DB `CHECK`? | **Both, with identical numbers.** | `maxLength` alone is bypassable through the API; a `CHECK` alone surfaces as a raw Postgres string in a toast. |
| D11 | Constrain `intents` values in the database? | **Yes**, in the same constraint block: every element must be one of the seven known ids, and `array_length ≤ 7`. | The column is `NOT NULL DEFAULT '{}'` with no value check, so an API caller can inject arbitrary strings that render as raw ids on the card ([index.tsx:368](../../app/mcn/parents/index.tsx#L368) falls back to `|| id`). One-line addition to a migration already being written. |
| D12 | Add the missing `updated_at` trigger (#15)? | **No — fix the doc instead.** | Nothing reads `updated_at`; adding a trigger is new behaviour no finding requires. Deleting the false claim from `architecture.md` costs one line and removes the trap. |
| D13 | Cap entries per resident, mirroring the `mcn_listings` spam controls? | **Out of scope.** | No finding requires it and no abuse has occurred (1 live row). It is a product decision about family size, not a defect. |
| D14 | Should an entry disappear when its owner is removed from the community? | **Out of scope; do not change the SELECT policy.** | `mcn_parent_corner_select` is `community_id = get_user_community_id()`, identical to `mcn_carpools`, `mcn_listings` and `mcn_posts` (verified live). A removed family's entry persisting is a house-wide convention, not a Parent Corner bug. It does raise the stakes on issue #1: on the PWA the parent cannot even withdraw it themselves — which is why #1 is P0. |
| D15 | Should the WhatsApp share text stop including the phone number? | **No change.** | It matches `app/mcn/drops/[id].tsx`, `components/McnListingCard.tsx` and `components/ProviderCard.tsx`, which all share contact details the same way. Redesigning the privacy model of the share sheet is a product decision, not a bug fix. |
| D16 | Extract a shared `<PhoneField>` / `<ConfirmDelete>` helper? | **No.** | Two screens. `docs/CLAUDE.md` §4 says reuse the *existing* shared components; it does not ask for new abstractions, and no finding needs one. |
| D17 | **Migration filename.** | **`supabase/migrations/20260828000000_parent_corner_fixes.sql`** — one file for both M1 and M2. | `ls supabase/migrations/ \| sort \| tail` ends at `20260827000000_service_reminders_fixes.sql`, so `20260828000000` sorts strictly after every existing file. **Before you write it**, run `npx supabase migration list --linked` and confirm `20260828000000` is not taken by a concurrent session (`docs/CLAUDE.md` §5). At review time that command failed with `SQLSTATE 28P01` because `SUPABASE_DB_PASSWORD` was unset — set it first. |

---

# PART 3 — IMPLEMENTATION PLAN

## Sequencing

| Set | Contents | Ends with |
|-----|----------|-----------|
| **A — P0** | [M1](#m1--pin-the-community-on-update-and-delete-2) (policies), [C1](#c1--appmcnparentsindextsx--delete-confirmation-1) (web delete confirm) | `npm run db:push` → `gen types` → re-append enriched-types block → `npx tsc --noEmit` clean → run the **Database** and **Web (PWA)** rows for #1, #2 |
| **B — P1** | [C2](#c2--appmcnparentsaddtsx--load-prefill-and-save-3-4-5-7) (add screen: prefill, save guard, identity columns, phone, boards), [C3](#c3--appmcnparentsindextsx--boards-contact-actions-sorting-6-7-8-14) (list screen: boards, WhatsApp/call, sorting) | `npx tsc --noEmit` clean → run the rows for #3–#8, #14 |
| **C — P2** | [M2](#m2--length-and-value-constraints-10) (constraints), [C4](#c4--appmcnparentsindextsx--fetching-caps-copy-9-10-13), [C5](#c5--appmcnparentsaddtsx--input-caps-and-flat-normalisation-10-11), [C6](#c6--appmcnparentsindextsx--lead-edit-affordance-12), [C7](#c7--apptabsnetworktsx--count-error-handling-16), docs | `npm run db:push` → `gen types` → re-append block → `npx tsc --noEmit` clean → full checklist + regression sweep |

**C6 must land after C2.** Granting leads the edit pencil while the payload still resends `user_id` (#5) converts a latent ownership transfer into an everyday one.

---

## Database tasks

Both tasks go in the single file named in D17. Write them in order; the whole file is idempotent and safe to re-run.

### M1 — Pin the community on UPDATE and DELETE (#2)

**Run this first and record the output**, so you can prove the policies changed:

```sql
SELECT polname,
       polcmd::text AS cmd,
       pg_get_expr(polqual, polrelid)      AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS check_expr
FROM pg_policy
WHERE polrelid = 'public.mcn_parent_corner'::regclass
ORDER BY polname;
```

Expected before: `mcn_parent_corner_update` and `_delete` both show a `using_expr` with no `community_id`, and `check_expr` NULL.

```sql
-- ============================================================
-- M1. mcn_parent_corner: scope UPDATE and DELETE to the row's community.
--
-- Before: USING = (user_id = auth.uid() OR is_community_lead(auth.uid())
--                  OR is_platform_admin(auth.uid()))
-- and no WITH CHECK, so Postgres reused USING for the new row. Neither
-- expression mentions community_id, which meant
--   (a) an owner could move their row into another society, and
--   (b) is_community_lead() is not community-scoped (verified: it only tests
--       app_role IN (president, vice_president) AND removed_at IS NULL), so a
--       president of any society matched every row on the platform.
--
-- is_platform_admin() is deliberately left un-scoped: it requires
-- community_id IS NULL, so scoping it by get_user_community_id() would revoke
-- the platform override entirely (the bug 20260822000100 was written to fix).
-- ============================================================

DROP POLICY IF EXISTS "mcn_parent_corner_update" ON public.mcn_parent_corner;
CREATE POLICY "mcn_parent_corner_update"
  ON public.mcn_parent_corner FOR UPDATE
  USING (
    (
      community_id = public.get_user_community_id()
      AND (
        user_id = auth.uid()
        OR public.is_community_lead(auth.uid())
      )
    )
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    (
      community_id = public.get_user_community_id()
      AND (
        user_id = auth.uid()
        OR public.is_community_lead(auth.uid())
      )
    )
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "mcn_parent_corner_delete" ON public.mcn_parent_corner;
CREATE POLICY "mcn_parent_corner_delete"
  ON public.mcn_parent_corner FOR DELETE
  USING (
    (
      community_id = public.get_user_community_id()
      AND (
        user_id = auth.uid()
        OR public.is_community_lead(auth.uid())
      )
    )
    OR public.is_platform_admin(auth.uid())
  );
```

**Traps that bit during analysis:**

- The `WITH CHECK` is not optional decoration. Omit it and Postgres reuses `USING`, which is how the original hole was created — and `USING` alone would then also be checked against the *new* row, so an explicit, identical `WITH CHECK` is what makes the intent legible.
- The outer parentheses matter for readability only (`AND` binds tighter than `OR`), but write them: this is the exact expression a future reviewer will read to decide whether tenancy holds.
- Postgres has no `CREATE POLICY IF NOT EXISTS`. `DROP POLICY IF EXISTS` first is the idempotent form, matching every other migration in this repo.

### M2 — Length and value constraints (#10, D11)

**Dry run — must return zero rows before you add the constraints.** Also re-confirms D1:

```sql
SELECT id,
       length(student_name)  AS student_len,
       length(school_name)   AS school_len,
       length(board)         AS board_len,
       length(grade_class)   AS grade_len,
       length(parent_name)   AS parent_len,
       length(flat_number)   AS flat_len,
       length(contact_phone) AS phone_len,
       length(coalesce(notes, '')) AS notes_len,
       coalesce(array_length(intents, 1), 0) AS intent_count,
       board
FROM public.mcn_parent_corner
WHERE length(student_name)  > 60
   OR length(school_name)   > 100
   OR length(board)         > 40
   OR length(grade_class)   > 40
   OR length(parent_name)   > 60
   OR length(flat_number)   > 12
   OR length(contact_phone) > 15
   OR length(coalesce(notes, '')) > 300
   OR coalesce(array_length(intents, 1), 0) > 7
   OR NOT (intents <@ ARRAY['carpool','study_group','homework_help','school_info','activities','playdate','other'])
   OR board NOT IN ('CBSE','ICSE','State Board','IB','IGCSE','PU Board','University','Other');
```

At review time this returned **0 rows**. If it returns any row, stop and report — do not truncate resident data to make a constraint apply.

```sql
-- ============================================================
-- M2. Length and value constraints.
-- Numbers match the client maxLength values set in C4/C5 exactly.
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS for CHECK, so each is guarded
-- by a catalog lookup to keep the migration re-runnable.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.mcn_parent_corner'::regclass
      AND conname  = 'mcn_parent_corner_text_lengths'
  ) THEN
    ALTER TABLE public.mcn_parent_corner
      ADD CONSTRAINT mcn_parent_corner_text_lengths CHECK (
        length(student_name)  BETWEEN 1 AND 60
        AND length(school_name)   BETWEEN 1 AND 100
        AND length(board)         BETWEEN 1 AND 40
        AND length(grade_class)   BETWEEN 1 AND 40
        AND length(parent_name)   BETWEEN 1 AND 60
        AND length(flat_number)   BETWEEN 1 AND 12
        AND length(contact_phone) BETWEEN 1 AND 15
        AND (notes IS NULL OR length(notes) <= 300)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.mcn_parent_corner'::regclass
      AND conname  = 'mcn_parent_corner_intents_valid'
  ) THEN
    ALTER TABLE public.mcn_parent_corner
      ADD CONSTRAINT mcn_parent_corner_intents_valid CHECK (
        coalesce(array_length(intents, 1), 0) <= 7
        AND intents <@ ARRAY[
          'carpool','study_group','homework_help',
          'school_info','activities','playdate','other'
        ]::text[]
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
```

**Traps:**

- A `CHECK` constraint may only call `IMMUTABLE` functions. `length()`, `array_length()` and `<@` all qualify; do not reach for anything that touches `now()` or `auth.uid()` here.
- `array_length(x, 1)` returns `NULL`, not `0`, for an empty array — hence the `coalesce`. Without it the whole `CHECK` evaluates to `NULL`, which Postgres treats as *passing*, and the cap silently does nothing.
- Do **not** add these as `NOT VALID`. The table is tiny and validating now is what proves the dry run was honest.

---

## Client tasks

### C1 — `app/mcn/parents/index.tsx` — delete confirmation (#1)

Rewrite [handleDeleteEntry:269-288](../../app/mcn/parents/index.tsx#L269-L288). Lift the mutation into a `performDelete` closure and branch on platform, exactly as [app/mcn/carpools/[id].tsx:157-166](../../app/mcn/carpools/%5Bid%5D.tsx#L157-L166) does:

```js
const handleDeleteEntry = (id: string, studentName: string) => {
  const performDelete = async () => {
    try {
      const { data, error } = await supabase
        .from('mcn_parent_corner')
        .delete()
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        Toast.show({ type: 'error', text1: 'Could not remove this entry' });
        return;
      }
      Toast.show({ type: 'success', text1: 'Entry removed' });
      fetchEntries();
    } catch (err) {
      console.error(err);
      Toast.show({ type: 'error', text1: 'Failed to delete entry' });
    }
  };

  const title = 'Remove this entry?';
  const body = `This removes the record for "${studentName}" from Parent Corner. This cannot be undone.`;

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n${body}`)) {
      performDelete();
    }
  } else {
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: performDelete },
    ]);
  }
};
```

The `.select('id')` is the same zero-rows guard as D7 — after M1 a lead from another community will match nothing, and the resident must be told rather than shown a false success. Copy is sentence case per `docs/CLAUDE.md` §4.

### C2 — `app/mcn/parents/add.tsx` — load, prefill, and save (#3, #4, #5, #7)

1. **[Line 82](../../app/mcn/parents/add.tsx#L82)** — `'full_name, flat_number, phone'` → `'full_name, flat_number, phone_number'`, and **[line 85](../../app/mcn/parents/add.tsx#L85)** `.single()` → `.maybeSingle()`. Update the read at [line 91](../../app/mcn/parents/add.tsx#L91) to `data.phone_number`. Then hoist the `!editId` guard from inside the callback ([line 88](../../app/mcn/parents/add.tsx#L88)) up to the call site ([line 130](../../app/mcn/parents/add.tsx#L130)) so edit mode skips the request entirely.

2. **[Line 107](../../app/mcn/parents/add.tsx#L107)** — `.single()` → `.maybeSingle()`, and handle `data === null`: toast *"This entry no longer exists"* and `router.replace('/mcn/parents')`.

3. **Ownership guard (D8).** In `loadExistingEntry`, after a successful load, if `data.user_id !== user?.id && !isCommunityLead` → toast *"You can only edit your own entry"*, `router.replace('/mcn/parents')`, return. Add `isCommunityLead` to the `useAuth()` destructure at [line 54](../../app/mcn/parents/add.tsx#L54).

4. **Phone validation (#7).** Import `normalizeIndianMobile, toLast10Digits` from `../../lib/phone`. Add an `onBlur` on the phone `TextInput` ([line 387-394](../../app/mcn/parents/add.tsx#L387-L394)) copying [app/sos/donor.tsx:90-99](../../app/sos/donor.tsx#L90-L99) verbatim, and replace the presence check at [line 171-174](../../app/mcn/parents/add.tsx#L171-L174) with:

   ```js
   const normalizedPhone = normalizeIndianMobile(contactPhone);
   if (!normalizedPhone) {
     Toast.show({ type: 'error', text1: 'Invalid phone number', text2: 'Enter a valid 10-digit Indian mobile number.' });
     return;
   }
   ```
   Store `contact_phone: normalizedPhone`, not `contactPhone.trim()`.

5. **Split the payload (#5, D6).** Replace the single `payload` at [lines 178-192](../../app/mcn/parents/add.tsx#L178-L192) with a shared `fields` object holding only the editable columns, then:

   ```js
   if (editId) {
     const { data, error } = await supabase
       .from('mcn_parent_corner')
       .update({ ...fields, updated_at: new Date().toISOString() })
       .eq('id', editId)
       .select('id')
       .maybeSingle();
     if (error) throw error;
     if (!data) {
       Toast.show({
         type: 'error',
         text1: 'Could not save',
         text2: 'This entry may have been removed, or it is not yours to edit.',
       });
       return;                       // ← do NOT navigate away
     }
     Toast.show({ type: 'success', text1: 'Child details updated' });
   } else {
     const { error } = await supabase
       .from('mcn_parent_corner')
       .insert({ ...fields, community_id: communityId, user_id: user.id });
     if (error) throw error;
     Toast.show({ type: 'success', text1: 'Child details added to Parent Corner' });
   }
   ```
   `community_id` and `user_id` now appear **only** on the insert path. Returning early on the `!data` branch keeps the resident's typing on screen instead of discarding it — that is half the value of fixing #4.

6. **[Line 30](../../app/mcn/parents/add.tsx#L30)** (#6, D1) — `'University / Autonomous'` → `'University'`.

### C3 — `app/mcn/parents/index.tsx` — boards, contact actions, sorting (#6, #7, #8, #14)

1. **#6** — no change needed to [line 62](../../app/mcn/parents/index.tsx#L62); it is already correct. After C2 lands, verify the two arrays agree element-for-element apart from the leading `'All'`. Consider a short comment on each pointing at the other.

2. **#7 + #8 — `handleWhatsAppPress` [253-260](../../app/mcn/parents/index.tsx#L253-L260):**

   ```js
   const handleWhatsAppPress = (item: ParentCornerItem) => {
     const digitsOnly = (item.contact_phone || '').replace(/\D/g, '');
     const last10 = digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly;
     if (last10.length !== 10) {
       Toast.show({ type: 'error', text1: 'No valid phone number on this entry' });
       return;
     }
     const text = `Hi ${item.parent_name}, I saw your entry for ${item.student_name} (${item.school_name}) in our community Parent Corner.`;
     const url = `https://wa.me/91${last10}?text=${encodeURIComponent(text)}`;
     if (Platform.OS === 'web' && typeof window !== 'undefined') {
       window.open(url, '_blank');
       return;
     }
     Linking.openURL(url).catch(() => {
       Toast.show({ type: 'error', text1: 'Could not open WhatsApp' });
     });
   };
   ```
   The `slice(-10)` is what makes an existing `+91 98765 43210` row work; `lib/phone.ts` exports `toLast10Digits` doing exactly this — import it rather than re-implementing. `window.open(url, '_blank')` is the [drops/manage](../../app/mcn/drops/manage/%5Bid%5D.tsx#L245-L249) pattern and keeps the PWA alive.

3. **#7 — `handleCallPress` [262-267](../../app/mcn/parents/index.tsx#L262-L267):** apply the same 10-digit guard before `tel:`. Leave the `Linking.openURL` call as-is — `tel:` does not navigate the page away, so no web branch is needed.

4. **#14 — sorting [205-220](../../app/mcn/parents/index.tsx#L205-L220):** replace all four `localeCompare(x)` calls with `localeCompare(x, undefined, { numeric: true, sensitivity: 'base' })`.

### C4 — `app/mcn/parents/index.tsx` — fetching, caps, copy (#9, #10, #13)

1. **#9** — delete the `useEffect` at [225-227](../../app/mcn/parents/index.tsx#L225-L227) entirely. Keep the `useFocusEffect` at [150-154](../../app/mcn/parents/index.tsx#L150-L154) and do **not** change its dependency array — `[fetchEntries]` is what makes it re-run on a community change. **This is the dead-code half of the task; do not land the fix without it.**
2. **#9 (hardening)** — in `fetchEntries` [118-121](../../app/mcn/parents/index.tsx#L118-L121), change `if (!communityId) return;` to clear both flags first:
   ```js
   if (!communityId) { setLoading(false); setRefreshing(false); return; }
   ```
3. **#10** — add `numberOfLines={4}` to the notes `Text` at [378](../../app/mcn/parents/index.tsx#L378) so a long note cannot swallow the list even for rows written before M2.
4. **#13** — rewrite the schema-missing `EmptyState` at [684-689](../../app/mcn/parents/index.tsx#L684-L689) to resident-facing sentence case, e.g. `title="Parent Corner isn't available yet"`, `message="This feature needs the latest updates before it can load. Please try again later."` In the same render pass, hide the FAB ([702](../../app/mcn/parents/index.tsx#L702)) and the header `+` ([420](../../app/mcn/parents/index.tsx#L420)) when `isMissingSchema` is true, so nobody opens a form that cannot save.

### C5 — `app/mcn/parents/add.tsx` — input caps and flat normalisation (#10, #11)

Add `maxLength` to every `TextInput`, matching M2 exactly:

| Input | Line | `maxLength` |
|---|---|---|
| Child's full name | [255-261](../../app/mcn/parents/add.tsx#L255-L261) | 60 |
| School / college name | [295-301](../../app/mcn/parents/add.tsx#L295-L301) | 100 |
| Class / grade & section | [346-352](../../app/mcn/parents/add.tsx#L346-L352) | 40 |
| Parent name | [363-369](../../app/mcn/parents/add.tsx#L363-L369) | 60 |
| Flat / unit number | [375-381](../../app/mcn/parents/add.tsx#L375-L381) | 12 |
| Parent phone number | [387-394](../../app/mcn/parents/add.tsx#L387-L394) | 15 |
| Notes | [432-448](../../app/mcn/parents/add.tsx#L432-L448) | 300 |

`board` is chip-selected and can never exceed 40; no input to cap.

**#11** — on the flat input add
```js
onBlur={() => setFlatNumber(prev => prev.toUpperCase().replace(/[\s-]/g, ''))}
```
and change the placeholder at [378](../../app/mcn/parents/add.tsx#L378) from `"e.g. Block A-402"` to `"e.g. A402"`, per `docs/CLAUDE.md` §3.

### C6 — `app/mcn/parents/index.tsx` — lead edit affordance (#12)

**Only after C2 is merged.** At [315](../../app/mcn/parents/index.tsx#L315) change the pencil's guard from `isOwner` to `canManage`. `canManage` is already computed at [292](../../app/mcn/parents/index.tsx#L292) and the enclosing block already gates on it, so this is a one-token edit that makes the UI match `docs/features.md` §4.5 and the RLS policy.

### C7 — `app/(tabs)/network.tsx` — count error handling (#16)

**Narrow edit only** — this file belongs to the MCN hub. Inside `fetchSectionStats` [46-84](../../app/(tabs)/network.tsx#L46-L84), after the `Promise.all` destructure, check the errors before the setters:

```js
const firstError = [businessRes, preorderRes, carpoolRes, parentRes, schoolRes, postRes]
  .map((r) => r.error)
  .find(Boolean);
if (firstError) throw firstError;
```

The existing `catch` at [85-87](../../app/(tabs)/network.tsx#L85-L87) then logs it and every count stays `null`, which the card already renders as *no badge at all* (`{parentCount !== null && …}` at [211](../../app/(tabs)/network.tsx#L211)) rather than a confident zero. Change nothing else in this file.

---

# VERIFICATION

**`npx tsc --noEmit` catches none of these 16 findings.** The Supabase client is untyped ([lib/supabase.ts:25](../../lib/supabase.ts#L25)), the bugs are policy expressions, platform branches, string mismatches and swallowed errors — all invisible to the compiler. `tsc` proves only that you did not break the build. Walk this list.

Two rows in the catalogue do **not** apply and were checked: the feature has **no date or time field anywhere**, so there is no UTC/IST exposure to test; and it creates **no `notifications` rows** and schedules no local notification, so there is no cadence to cap.

### Database

| # | Check | Expected |
|---|---|---|
| 2 | Re-run the `pg_policy` query from [M1](#m1--pin-the-community-on-update-and-delete-2) | `_update` shows a non-null `check_expr`; both `_update` and `_delete` `using_expr` contain `community_id = get_user_community_id()` |
| 2a | As resident A (own row), `UPDATE mcn_parent_corner SET community_id = '<other community uuid>' WHERE id = '<own row>'` | **0 rows updated.** Before the fix this succeeded |
| 2a | As resident A, `UPDATE … SET grade_class = 'Class 9' WHERE id = '<own row>'` | 1 row updated — the ordinary path still works |
| 2b | As a president of community B, `DELETE FROM mcn_parent_corner WHERE id = '<a community-A row id>'` | **0 rows.** Before the fix this deleted the row |
| 2b | As a president of community A, delete a community-A row | Succeeds — in-community moderation is intact |
| 3 | `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name LIKE '%phone%'` | `phone_number` only — confirms C2 used the right column name |
| 10 | Re-run the M2 dry-run `SELECT` | 0 rows |
| 10 | `INSERT` a row with a 61-char `student_name` via SQL | Rejected by `mcn_parent_corner_text_lengths` |
| D11 | `INSERT` a row with `intents = '{carpool,bogus}'` | Rejected by `mcn_parent_corner_intents_valid` |
| D11 | `INSERT` a row with `intents = '{}'` | **Accepted** — proves the `coalesce(array_length(…),0)` guard did not turn the whole CHECK `NULL` |
| 15 | `SELECT tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='mcn_parent_corner' AND NOT t.tgisinternal` | Still no rows — confirms D12 (doc fixed, no trigger added) |

### Web (PWA) — `npm run web`

| # | Check | Expected |
|---|---|---|
| 1 | Tap the trash icon on your own entry | A browser confirm dialog appears; confirming removes the card and shows "Entry removed"; cancelling changes nothing |
| 1 | Same, as a president on another resident's entry | Same — the dialog appears and the delete lands |
| 3 | Open `/mcn/parents/add` fresh | Parent name, flat number and phone are **pre-filled from your profile**. Before the fix all three were blank |
| 3 | Open `/mcn/parents/add?editId=<your row>` | The existing values load; no second, wasted profile request in the network tab |
| 4 | Open `/mcn/parents/add?editId=<a neighbour's row>` | Redirected straight back to the directory with "You can only edit your own entry" — the form never renders |
| 4 | Open your own entry for edit, delete the row from a second browser, then Save | Error toast "Could not save…"; **you stay on the form with your typing intact**. Before the fix: "Child details updated!" and silent loss |
| 5 | As a president, edit a resident's entry and save; then re-open the directory as that resident | The resident still sees their own edit pencil — `user_id` unchanged |
| 6 | Tap the **University** board chip with a college entry present | The college entry is listed. Before the fix: empty |
| 6 | Add a college entry and check its card badge | Reads "University", matching the filter chip |
| 7 | Enter `+91 98765 43210`, blur the field | Field rewrites itself to `9876543210` |
| 7 | Enter `98765` and Save | Rejected with "Enter a valid 10-digit Indian mobile number." — nothing is written |
| 7 | Tap WhatsApp on a legacy row storing `+91 98765 43210` | Opens `wa.me/919876543210` — 12 digits, not 14 |
| 8 | Tap **WhatsApp Parent** | Opens in a **new tab**; the Parent Corner screen is still there behind it, still scrolled where you left it |
| 9 | Open the network tab, load `/mcn/parents` | Exactly **one** request to `mcn_parent_corner`. Before the fix: two |
| 9 | Navigate to add, save, and land back on the directory | The new entry is present — focus refresh still works after the `useEffect` removal |
| 10 | Paste 500 characters into Notes | Input stops at 300; the card shows at most 4 lines |
| 11 | Type `block a-402` in Flat, blur | Becomes `A402` |
| 12 | As a president, view another resident's card | Both the pencil **and** the trash icon are shown |
| 13 | Force the schema-missing state (temporarily point the client at a project without the table) | Resident-facing sentence-case copy; **no** migration filename; the FAB and header `+` are hidden |
| 14 | Sort by **Class / Grade** with `Class 2`, `Class 9`, `Class 10` present | Order is 2, 9, 10 — not 10, 2, 9 |
| 16 | Break the count (revoke, or go offline mid-load) and open the MCN hub | The Parent Corner card shows **no badge**. Before the fix: "0 children listed" |

### Native — `npm run android`

| # | Check | Expected |
|---|---|---|
| 1 | Tap trash | The native `Alert` still appears — the web branch did not regress native |
| 7 | Tap WhatsApp with a valid number | The WhatsApp app opens on the right chat |
| 7 | Tap Call | The dialer opens pre-filled with 10 digits |
| 8 | Tap WhatsApp, then Android hardware back | Returns into the app on the Parent Corner screen, list state preserved |
| 11 | Flat `onBlur` normalisation | Fires on keyboard dismiss as well as on focus change |
| — | Android hardware back on the add screen with unsaved text | Leaves the screen (unchanged behaviour — no guard was added; see D16) |

### Regression sweep

| Area | Check | Expected |
|---|---|---|
| Navigation | Deep-link straight to `/mcn/parents/add` in a fresh tab, then tap the header back arrow | Lands on `/mcn/parents`, not the MCN hub — `getImmediateParentRoute()` [lib/navigation.ts:128](../../lib/navigation.ts#L128) already maps `/mcn/parents/*` → `/mcn/parents`; confirm none of the edits disturbed it |
| Navigation | Deep-link to `/mcn/parents`, tap back | Lands on `/network` ([lib/navigation.ts:129](../../lib/navigation.ts#L129)) |
| Navigation | Browser back after a successful save | Does **not** return to the add form — [add.tsx:209](../../app/mcn/parents/add.tsx#L209) uses `router.replace`, which must stay `replace` |
| Bottom nav | While on `/mcn/parents`, check the tab bar | The MCN tab is highlighted (`p.startsWith('/mcn/')`, [components/GlobalBottomNav.tsx:42](../../components/GlobalBottomNav.tsx#L42)) |
| Empty state | New community with no entries | "No student details added yet" — **not** the schema-missing state |
| Cascade | Platform-admin-delete a profile that owns an entry (staging only) | The entry disappears via `ON DELETE CASCADE`; the directory renders without error |
| Search | Type into search, watch the network tab | Filtering is client-side; no request per keystroke; the 300 ms debounce at [index.tsx:111-116](../../app/mcn/parents/index.tsx#L111-L116) is untouched |
| Filters | Combine institution type + board + school + looking-for | Results narrow correctly; the school chip row still derives from live entries |
| Other MCN screens | Open carpools, business listings, drops, borrow posts | Unchanged — M1 touched only `mcn_parent_corner` (D2) |
| MCN hub | All six badges | Still render real counts; only the error path changed (C7) |

---

# DOCUMENTATION UPDATES

Each fact goes to exactly one file.

**`docs/features.md`** — §4.5 Parent Corner (user-visible behaviour only; no schema columns):
- Contact phone is now required to be a valid 10-digit Indian mobile, normalised on blur, and the WhatsApp/Call actions are disabled for entries whose stored number is not usable.
- Field limits as advertised to the resident: child's name 60, school/college 100, class/grade 40, parent name 60, flat 12, phone 15, notes 300.
- Flat/unit number is uppercased with spaces and hyphens stripped on blur.
- Editing another resident's entry via URL now returns you to the directory instead of loading a form that cannot save; a save that the database rejects reports an error and keeps your input.
- Leads can now **edit** as well as delete any entry — this makes the existing §4.5 "Roles" line and the role matrix at `docs/features.md:448` true rather than aspirational; no wording change is needed there, but re-read them to confirm.
- Board options: correct the list only if it does not already read `… PU Board, University, Other` (it does — D1 changed the writer to match the doc).
- Sorting by class/grade and by flat is numeric-aware.

**`docs/architecture.md`**:
- §7 RLS model — `mcn_parent_corner` UPDATE and DELETE are now scoped to the row's community (`community_id = get_user_community_id() AND (owner OR lead)`, `OR is_platform_admin()`), and UPDATE carries an explicit `WITH CHECK`. Add a sentence to the "Uniform MCN owner-or-lead rule" paragraph at line 407 noting that `mcn_parent_corner` is now **stricter** than its four siblings, and that the same community pin has *not* yet been applied to `mcn_carpools`, `mcn_listings`, `mcn_posts`, `mcn_preorder_drops` (D2). A reader must not assume the rule is still uniform.
- §4.8 — record the new `mcn_parent_corner_text_lengths` and `mcn_parent_corner_intents_valid` check constraints against the `mcn_parent_corner` row at line 264.
- **§6 Triggers, line 375 — remove `mcn_parent_corner` from the `*_updated_at` trigger list.** No such trigger exists (#15); `updated_at` is client-supplied.

**`docs/CLAUDE.md`** §9 Known traps — add two rows:
| Trap | Reality |
|------|---------|
| An RLS `UPDATE` policy with `USING` but no `WITH CHECK` | Postgres reuses `USING` for the new row. If `USING` does not mention `community_id`, a resident can move their own row into another community. Always write both, and always pin the tenant column. |
| `public.is_community_lead()` in a policy without a `community_id` predicate | It only asks "is this person a lead *anywhere*". A president of another society then matches every row on the platform. Pair it with `community_id = get_user_community_id()`. |

**`docs/verandah.md`** — no change. No token or shared component is touched.

**`docs/platform-admin.md`** — no change. Parent Corner has no admin-console surface (verified: zero hits for `mcn_parent_corner` under `admin-dashboard/`).

**`.github/app-summary.md`** — no change. No new module, tab, or role.

**`docs/disabled-features.md`** — no change. Nothing is disabled or removed.

**`docs/cross-community-changelog.md`** — no change. Parent Corner is single-community: no `list_visible_*` / `can_user_see_*` RPC, no partner-community policy, and `get_user_partner_community_ids()` is not involved. Confirm this still holds after M1 — if you find yourself adding a partner-community clause, an entry becomes **mandatory**.
