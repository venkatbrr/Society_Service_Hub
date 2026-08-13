# Fix batch plan — 2026-08-13

Nineteen items from a single review pass, grouped into four batches by shared
surface area. Item numbers are the user's original numbering (1 and 15 were not
issued). Each item records the **root cause where it is confirmed**, and says so
explicitly where it is still a hypothesis.

Batches are ordered so that shared infrastructure lands before the screens that
consume it. Within a batch, items are independent.

---

## Batch 1 — Broken actions (items 16, 17, 18)

Highest value: these are things a user taps that do nothing.

### 18. "Invite members" does nothing on the providers screen — CONFIRMED

`handleInviteNeighbors` in [`app/(tabs)/index.tsx:144-161`](../../app/(tabs)/index.tsx#L144-L161)
calls `Share.share()` unguarded. Per `docs/CLAUDE.md` §9, `Share.share` **rejects
on desktop web** when `navigator.share` is absent — the catch swallows it into a
generic "Share failed" toast. The food-drop share at
[`app/mcn/drops/[id].tsx:585`](../../app/mcn/drops/[id].tsx#L585) already has the
correct `Platform.OS === 'web' && navigator.share` branch; the invite paths never
got it.

The identical bug exists in [`app/(tabs)/community.tsx:203-220`](../../app/(tabs)/community.tsx#L203-L220).

**Fix** — new `lib/share.ts` exporting one helper, then route every share through it:

```ts
export async function shareOrCopy(opts: { title?: string; message: string }): Promise<'shared' | 'copied' | 'cancelled'>
```

1. Web + `navigator.share` → `navigator.share`.
2. Web without it → `expo-clipboard` `setStringAsync`, success toast "Link copied".
3. Native → `Share.share`.
4. Swallow `AbortError`/cancel, return `'cancelled'` (no toast).

Call sites to convert: `app/(tabs)/index.tsx`, `app/(tabs)/community.tsx`,
`app/mcn/drops/[id].tsx`, `components/McnListingCard.tsx`,
`components/PreorderDropCard.tsx`, `components/ProviderCard.tsx`,
`components/VisitCard.tsx`, `app/mcn/parents/index.tsx`,
`app/visits/[id].tsx`, `app/provider/[id].tsx`,
`app/community-request-submitted.tsx`.

`expo-clipboard` is already a dependency — no new package.

### 16. Emergency & blood donors back button does nothing — CONFIRMED

Three problems, all in `app/sos/`:

| File | Line | Problem |
|------|------|---------|
| [`app/sos/index.tsx`](../../app/sos/index.tsx#L366) | 366 | raw `router.back()` |
| [`app/sos/donor.tsx`](../../app/sos/donor.tsx#L189) | 189 | raw `router.back()` |
| [`app/sos/manage-contacts.tsx`](../../app/sos/manage-contacts.tsx#L260) | 260 | raw `router.back()` |

`router.back()` is a silent no-op when the screen was deep-linked or reached on a
fresh load with nothing to pop — the documented trap in `docs/CLAUDE.md` §9. And
`/sos/*` has **no entry in `getImmediateParentRoute()`**, so even `goBackSmart`
would fall through to `/network` instead of `/community` (the SOS card lives on
the Community tab — [`app/(tabs)/community.tsx:386`](../../app/(tabs)/community.tsx#L386)).

**Fix**
1. In [`lib/navigation.ts`](../../lib/navigation.ts#L316) `getImmediateParentRoute()`, add before the default:
   ```ts
   // 7c. SOS
   if (cleanPath.startsWith('/sos/')) return '/sos';
   if (cleanPath === '/sos') return '/community';
   ```
2. Swap all three raw `router.back()` calls for `goBackSmart(router, '<current route>')`.
   Remember the second argument is the **current** path, not the destination.
3. While here: `app/sos/index.tsx` and `manage-contacts.tsx` hand-roll a back
   `TouchableOpacity` — replace with `components/HeaderBackButton` as `donor.tsx`
   already does.

### 17. President sees no blocks/towers or flats under Manage — NEEDS REPRO FIRST

Data is healthy, so this is a client bug. Verified against prod:

- 5 blocks (A–E), none archived, all on the one community
- 748 flats, every one attached to a block
- `communities.blocks_enabled = true`
- the president profile has the right `community_id`, and `get_user_community_id()`
  falls back to `profiles` so the `communities_select_own` policy resolves
- `list_community_blocks` / `list_community_flats` are `SECURITY DEFINER`, granted
  to `authenticated`, and take no guard that a president would fail

**Step 1 — reproduce with the console open** (`npm run web`, sign in as president,
open `/community/blocks` and `/community/flats`). Note whether the screen renders
empty, renders the Community tab instead, or renders nothing at all. That single
observation picks between the two hypotheses below.

**Hypothesis A (leading) — route collision.** `app/(tabs)/community.tsx` resolves
to `/community` and the directory `app/community/` resolves to `/community/blocks`.
This is the exact shape `docs/CLAUDE.md` §9 warns about ("a tab screen and a route
directory cannot share a name"), which is why `/network` and `/mcn/*` were split.
expo-router does not error — it silently corrupts the boundary.
*Fix*: move `app/community/blocks.tsx` → `app/manage/blocks.tsx` and
`app/community/flats.tsx` → `app/manage/flats.tsx`; update the two `router.push`
calls in `app/(tabs)/community.tsx:339,354`; add `/manage/*` → `/community`
mappings to `getImmediateParentRoute()`; add a permanent redirect
`/community/:path+` → `/manage/:path+` in `vercel.json` alongside the existing
`/network/:path+` rule; add `/manage` to the `TABS[].isActive` matcher in
`components/GlobalBottomNav.tsx` so the Community tab stays lit.

**Hypothesis B — render gating.** [`app/community/blocks.tsx:167`](../../app/community/blocks.tsx#L167)
hides the entire block list behind `isBlocksEnabled`, seeded from the
`AuthContext` value that loads in a **second, non-blocking phase** (§9 trap). A
slow or failed `communities` read leaves it `false` and the list never appears.
*Fix*: render the list regardless of the toggle (the toggle governs fund-collection
scoping, not whether blocks exist), and show a skeleton while `blocksEnabled` is
still undefined rather than defaulting to `false`.

**Fix regardless of which hypothesis wins** — both screens use `Alert.alert` for
confirmations ([`blocks.tsx:96`](../../app/community/blocks.tsx#L96) and
[`:133`](../../app/community/blocks.tsx#L133)), which is a **no-op on web**. On
web today, the president taps "Archive" or toggles blocks off and nothing happens.
Convert to `confirmAction` from `lib/confirm.ts`.

---

## Batch 2 — Sharing, link previews, and image weight (items 2, 3, 11, 20)

Items 3 and 11 are the same request. All four share one root: how an image URL
reaches a crawler.

### 3 + 11. Food drop and business shares show no image in WhatsApp

**Food drops** already route through the OG endpoint
[`api/share-drop.ts`](../../api/share-drop.ts) and anon *can* read drops
(`mcn_preorder_drops_select_public` has `qual: true`), so the crawler is getting
HTML. The image is what fails: `og:image` is the **raw Cloudinary `secure_url`**
with no transformation and no declared dimensions. Picker output at `quality: 0.8`
with no size cap is routinely 2–4 MB, and WhatsApp silently drops any OG image
much over ~600 KB or without `og:image:width`/`height`.

**Business listings have no endpoint at all.**
[`components/McnListingCard.tsx:59`](../../components/McnListingCard.tsx#L59)
shares a bare SPA URL (`/mcn/listing/{id}`), and the web build has no per-page
meta tags — the crawler sees the generic shell.

**Fix**
1. Extract `api/_og.ts` — `escapeHtml`, `APP_ORIGIN`, the bot UA pattern, an
   `ogImageUrl()` that injects `w_1200,h_630,c_fill,f_jpg,q_auto:good` into a
   Cloudinary URL, and a `renderOgPage()`. Mirror `lib/cloudinary.ts` rather than
   importing it (same reason `share-drop.ts` mirrors `lib/siteUrl.ts` — Vercel's
   Node runtime, excluded from `tsconfig`).
2. Emit the full tag set: `og:image:secure_url`, `og:image:width` 1200,
   `og:image:height` 630, `og:image:type`, `og:site_name`.
3. Rewrite `api/share-drop.ts` on top of the helper (URL shape unchanged — links
   already in the wild keep working).
4. New `api/share-listing.ts`. **`mcn_listings` has no public SELECT policy**, so
   an anon client reads nothing — add a migration with
   `get_listing_og_card(p_id UUID)`, `SECURITY DEFINER`, returning only
   `name, description, image_url`, granted to `anon`. Deriving scope from a single
   id and exposing three columns is the minimum surface.
5. Point `components/McnListingCard.tsx` and the listing detail screen at
   `siteUrl('/api/share-listing?id=…')`.
6. **Security follow-up**: `mcn_preorder_drops_select_public` (`qual: true`)
   currently exposes every drop row of every community to anonymous readers —
   far more than the preview needs. Replace it with a `get_drop_og_card()` RPC of
   the same shape as step 4, then drop the blanket policy.

*Verification*: paste a share link into the Facebook sharing debugger and into a
real WhatsApp chat (WhatsApp caches aggressively per-URL — test with a fresh drop).

### 2. Community share must include a link so the preview renders

[`app/(tabs)/community.tsx:211`](../../app/(tabs)/community.tsx#L211) shares name
and code as plain text with no URL — nothing for a crawler to unfurl.

`communities` has **no image column**, so there is no per-community photo to
preview. Use a branded card instead:

1. Add `public/og-community.png` (1200×630, Verandah teal, Wooru wordmark).
2. New `api/share-community.ts` + `get_community_og_card(p_id UUID)` RPC
   (`communities_select_own` blocks anon, same as listings). Title = community
   name, description = address + "Join with code XXXX on Wooru", image = the
   branded card.
3. Append `siteUrl('/api/share-community?id=<communityId>')` to the share message,
   on its own last line, and route it through `shareOrCopy` from Batch 1.

Same treatment for the providers-screen invite in `app/(tabs)/index.tsx`, so both
invite paths produce an identical preview card.

### 20. Further image-size optimization beyond the Cloudinary presets

Cloudinary-side settings are already on; the remaining wins are in this repo.

| Change | Where | Effect |
|--------|-------|--------|
| Add `f_auto` to the transform chain | [`lib/cloudinary.ts:132-138`](../../lib/cloudinary.ts#L132-L138) | Serves AVIF/WebP to browsers that accept it, JPEG to native. Typically 25–40% off `q_auto` alone. Biggest single win. |
| Add `dpr_auto` on web | same | Stops shipping 3× pixels to 1× desktop displays. |
| Request real render sizes | `components/PreorderDropCard.tsx:182`, `components/McnListingCard.tsx:100`, `app/mcn/listing/[id].tsx:368`, `app/mcn/drops/[id].tsx:634`, `app/services/[id].tsx:531` | These pass **no width**, so they get the 800 px default for cards that render 150–350 px wide. Pass explicit widths; use `q_auto:eco` for list thumbnails and reserve `q_auto:good` for hero/full-screen. |
| Cap the upload itself | Cloudinary upload preset → incoming transformation `c_limit,w_1600,h_1600,q_auto:good` | Everything after this is cheaper, including the OG card. Console change, not code. |
| Trim picker output | [`components/ImageUploader.tsx:55-59`](../../components/ImageUploader.tsx#L55-L59) | `quality: 0.8` with no dimension cap uploads full sensor resolution over mobile data. Lower to `0.7`; the incoming transformation handles dimensions. |

`cloudinaryUrl()`'s existing idempotence guard compares the joined param string, so
adding params changes the sentinel — re-check that guard when editing.

---

## Batch 3 — UI polish (items 4, 5, 6, 7, 10, 12, 13)

### 4. No flat / block change under Edit Profile
**Decision: lock once set, still pickable when empty.**

In [`app/profile/edit.tsx:137-150`](../../app/profile/edit.tsx#L137-L150), branch on
`profile.flat_id`:
- **null** → keep `FlatPicker` (this is the only path a new resident has to set a
  flat; removing it outright would strand them).
- **set** → read-only row showing `blockLabel` + `flat_number` with a lock glyph
  and the hint "To change your flat, ask your president to update it."

Drop the `set_my_flat` call from `handleSave` when the field is locked. The block
is already derived — `sync_profile_flat_denorm` fills `block_id` from the flat —
so there is nothing separate to lock.

### 5. Remove the profile image
**Decision: remove display + upload, keep initials elsewhere.**

- [`app/(tabs)/profile.tsx:199-204`](../../app/(tabs)/profile.tsx#L199-L204) — drop
  the 56 px `Avatar` from the identity card; let name/email/flat take the width.
- [`app/profile/edit.tsx:114-123`](../../app/profile/edit.tsx#L114-L123) — remove the
  `ImageUploader` block and the `avatarUrl` state.
- Keep writing the existing `avatar_url` through unchanged in `handleSave` so
  Google-sourced avatars are not wiped; `components/Avatar.tsx` keeps rendering
  monograms everywhere else with no change.

### 6. All tiles need a visible thin border

Tiles already carry `borderWidth: 0.5` — they inherit it from
[`components/BaseCard.tsx:72-74`](../../components/BaseCard.tsx#L72-L74). The problem
is the colour: `borderHair` is `rgba(15, 55, 50, 0.10)`, effectively invisible on
the `#F0EDE3` cream surface.

**Fix**: raise `Verandah.borderHair` in [`constants/Colors.ts:104`](../../constants/Colors.ts#L104)
to roughly `rgba(15, 55, 50, 0.18)`. One token, and every tile using `BaseCard`
(the MCN hub, community actions, provider cards, drop cards) picks it up.

Then audit for tiles that opt out of `BaseCard` and hard-code a border — e.g.
`app/(tabs)/community.tsx:523-531` (`styles.tile`) and the dark-panel variants at
`:617` and `app/(tabs)/network.tsx:343`, which use cream-on-teal alphas and should
be tuned separately, not swept into the same token.

Sweep with `grep -rn "borderColor: 'rgba" app/ components/` and log anything that
genuinely cannot use the token in the `verandah.md` out-of-register appendix.

### 13. Thinner borders on unselected category / sub-category chips
**Decision: thinner and fainter.**

Item 6 makes tile borders more present; chips should move the other way so the
selected pill is the only thing carrying weight. In
[`components/CategoryFilter.tsx:157-161`](../../components/CategoryFilter.tsx#L157-L161)
`chipInactive` currently reuses the same `borderHair` that item 6 is darkening —
without this change, chips would get heavier as a side effect.

Add a dedicated `Verandah.borderWhisper` token (~`rgba(15, 55, 50, 0.06)`) and use
`StyleSheet.hairlineWidth` instead of `0.5` (on web, `0.5` rounds up to a full
device pixel at DPR 1). Apply to `chipInactive` in `CategoryFilter` and to the
matching inactive chip styles in `components/ChipRowSlider.tsx` and
`components/SegmentedSlider.tsx` so all three chip families stay consistent.

### 7. Better call and WhatsApp icons on the carpool screen

[`app/mcn/carpools/[id].tsx:672,679`](../../app/mcn/carpools/[id].tsx#L672-L679) uses
`Phone01` (a static handset outline) and `MessageCircle01` (a generic speech
bubble that reads as "comment", not "WhatsApp").

`@untitledui/icons` ships no WhatsApp brand mark, and `react-native-svg` is **not**
a dependency, so an inline brand glyph would mean adding a package.

**Recommendation**: stay inside the icon set — swap to `PhoneCall01` (handset with
call waves, unmistakably "dial") and `MessageChatCircle` (overlapping bubbles,
reads as a chat thread), and add the text labels "Call" and "WhatsApp" beneath each
so the action is named rather than inferred. This keeps the "no emoji, no brand
glyph" rule in `docs/CLAUDE.md` §3 intact.

*Alternative if you want the real green WhatsApp mark*: add `react-native-svg`
(~1 exposed component, well supported by Expo 54) and a
`components/WhatsAppIcon.tsx`. Higher recognition, one new dependency, and it
becomes an out-of-register entry in `verandah.md`. Flagging the trade-off rather
than deciding it.

Apply the same swap to the other WhatsApp buttons for consistency:
`app/mcn/parents/index.tsx:434`, `app/provider/[id].tsx`, `app/mcn/listing/[id].tsx`.

### 10. Business edit save button is too short

The button style at
[`app/mcn/listing/manage/[id].tsx:1281-1287`](../../app/mcn/listing/manage/[id].tsx#L1281-L1287)
declares `height: 52` — the correct height. But at
[`:572`](../../app/mcn/listing/manage/[id].tsx#L572) the "Save business details"
button composes styles in an order that lets a later `paddingVertical`/`height`
entry win. Read the flattened style at that call site and pin it: give the primary
save button its own `styles.saveDetailsBtn` with `height: 52`,
`justifyContent: 'center'`, and no competing padding — matching the modal buttons
at `:808` and `:944`.

Cross-check `app/mcn/listing-add.tsx` and `app/mcn/drops/add.tsx` for the same
pattern while in there.

### 12. Visits — drop "Archived", keep Active and Past

"Archived" is not a status. It is a 30-day cutoff applied to the same past bucket:
[`app/(tabs)/index.tsx:343-348`](../../app/(tabs)/index.tsx#L343-L348) puts visits
older than 30 days in `archived`, and `:336-341` keeps newer ones in `past`.

**Fix** — delete the cutoff, not just the tab:
- remove `thirtyDaysAgo`, the `archivedData` filter, `archivedVisits` state
  (`:60`), its sort (`:353`), its search filter (`:364`) and its setter (`:369`)
- `pastData` becomes everything not upcoming, sorted DESC
- `SegmentedSlider` (`:655-661`) drops to two options; the generic narrows to
  `'upcoming' | 'past'`
- `:586` and `:590` lose their `archived` branches
- `visitTab` param handling at `:55` and `:399` must map a stale
  `?visitTab=archived` deep link onto `past` rather than falling through

Long past lists are already paged by the existing scroll behaviour, so nothing
needs the cutoff to stay performant.

---

## Batch 4 — Feature work (items 8, 9, 14, 19)

### 8. Carpooling — collapsible Active / Paused sections, no cancelled rides

Today [`app/mcn/carpools/index.tsx`](../../app/mcn/carpools/index.tsx) has a flat
list under a 4-way tab. Cancelled rides leak in through the **My rides** tab only:
`:76-126` filters by ownership with no status predicate, while `:143-148` correctly
constrains the other tabs to `active`/`paused`.

**Fix**
1. Add `.neq('status', 'cancelled')` to both queries in the `activeTab === 'my'`
   branch (created rides and joined rides). Keep `status` on the row — the detail
   screen still needs it.
2. Replace the flat `FlatList` with two collapsible sections, **Active** (expanded
   by default, count in the header) and **Paused** (collapsed by default). Reuse
   the disclosure pattern rather than inventing one; `LayoutAnimation` is
   unavailable under the New Architecture, so animate with `react-native-reanimated`
   (already a dependency) or render without animation.
3. Keep the existing `all | offering | seeking | my` tabs above the sections — the
   sections partition whatever the tab returns.
4. `renderStatusBadge`'s `cancelled` case (`:203`) stays for the detail screen.

### 9. Parent Corner — searchable school dropdown

[`app/mcn/parents/add.tsx:336-360`](../../app/mcn/parents/add.tsx#L336-L360) is a free
`TextInput` plus six hard-coded national-brand chips
(`POPULAR_SCHOOL_SUGGESTIONS`, `:62-69`) that do not even match West Hyderabad.

**The list already exists**: [`data/westHyderabadSchools.ts`](../../data/westHyderabadSchools.ts)
holds 81 schools with `name`, `area_locality`, `syllabus` and `level` — the Schools
module consumes it in five screens today.

**Fix**
1. New `components/SchoolPicker.tsx` — modal + search field, filtering
   `WEST_HYDERABAD_SCHOOLS` on name and locality, grouped by locality, showing
   syllabus as secondary text. Model it on `components/FlatPicker.tsx`, which
   already solves "searchable modal over a long grouped list".
2. Pin an **"Other — my school isn't listed"** row at the bottom that reveals the
   existing free-text input. Continue storing the resolved string in
   `parent_corner.school_name` so nothing downstream changes.
3. Store the catalogue id alongside when one was picked, so Parent Corner posts can
   later link to the school's report card in `/mcn/schools/[id]`. Needs
   `school_catalog_id TEXT NULL` on the parent-corner table — a nullable column,
   no backfill.
4. Delete `POPULAR_SCHOOL_SUGGESTIONS`.
5. Pre-school and college entries: the catalogue's `level` covers `pre_school`, so
   filter the picker by the selected `institutionType`. There are no colleges in
   the list — colleges fall through to the "Other" free-text path, which is
   correct for now.

### 19. One image on a community business review

`ratings` (the table backing listing reviews — `app/mcn/listing/[id].tsx:270-300`)
has **no image column**.

**Fix**
1. Migration: `ALTER TABLE public.ratings ADD COLUMN IF NOT EXISTS image_url TEXT;`
   plus `NOTIFY pgrst, 'reload schema';`. Existing RLS covers it — the column
   inherits the row's policies, no policy change needed.
2. Run the full loop from `docs/CLAUDE.md` §6: `db:push:preprod` → `types:preprod`
   → **re-append the hand-maintained enriched-types block** → `tsc --noEmit`, then
   `db:push:prod` after merge.
3. Add `ImageUploader` (`subfolder="reviews"`, `aspectRatio={4/3}`) to the review
   form, and include `image_url` in the existing `upsert` — the `onConflict:
   'user_id,listing_id'` path means editing a review replaces its image, which is
   the behaviour you want.
4. Render the thumbnail in the review list (`:599-610`) and open it in the
   full-screen viewer the screen already has at `:702`.
5. Cap at one image, as asked — a single nullable column, not an array.

### 14. Maid / cook availability
**Decision: time-band slots + "Free now" badge, stored in the existing JSONB.**

`Maid` already has an `availability` radio of `Full-time | Part-time | On-call`
([`constants/providerDetails.ts:26-30`](../../constants/providerDetails.ts#L26-L30)) —
that answers "how much" but not "when", which is the question a resident hiring a
maid actually has.

Because `service_providers.details` is JSONB driven by `CATEGORY_DETAIL_FIELDS`,
this needs **no migration**.

1. New field type `slots` in `constants/providerDetails.ts`:
   ```ts
   { key: 'freeSlots', label: 'Free at', type: 'slots',
     options: ['Early morning 5–8', 'Morning 8–11', 'Midday 11–2',
               'Afternoon 2–5', 'Evening 5–8', 'Night 8–10'] }
   ```
   plus `{ key: 'weeklyOff', label: 'Weekly off', type: 'radio', options: [...days, 'None'] }`.
   Add to `Maid` and `Cook`. Semantics: **selected = free**, so an empty value means
   "not stated" rather than "never available" — an unfilled provider is not
   penalised.
2. Render `slots` in the provider add/edit form as a two-column free/busy toggle
   grid. Existing `chips` rendering is close; extend the same renderer.
3. New `lib/availability.ts` — `getSlotForTime(date)`, `isFreeNow(details)`,
   `nextFreeSlot(details)`, all pure and unit-free of network calls.
4. `components/ProviderCard.tsx` gets a live badge: "● Free now" (accent) or
   "Free from 5pm" (muted), rendered only when `freeSlots` is populated and the
   provider is a Maid or Cook.
5. Help tab gets an **"Available now"** filter chip beside the existing category
   chips, filtering client-side on the loaded set — at current provider counts a
   server-side JSONB filter would be premature.
6. Editing rules follow the existing provider-edit permissions (creator or
   community lead). Worth stating in the UI copy that availability is
   neighbour-reported and may be stale — nobody should treat it as a booking system.

---

## Sequencing and gates

| Batch | Contents | Migration? | Depends on |
|-------|----------|-----------|------------|
| 1 | 16, 17, 18 | no | — |
| 2 | 2, 3, 11, 20 | yes — 3 OG RPCs | Batch 1's `lib/share.ts` |
| 3 | 4, 5, 6, 7, 10, 12, 13 | no | Batch 3 items 6 and 13 must land together |
| 4 | 8, 9, 14, 19 | yes — `ratings.image_url`, `parent_corner.school_catalog_id` | — |

`npx tsc --noEmit` is the only validation gate — no test framework exists. Every
migration completes the §6 loop (preprod push → regen types → **re-append the
enriched-types block** → typecheck → prod push after merge) in the same change set.

Doc updates, routed per §7:
- `docs/features.md` — items 4, 5, 8, 9, 12, 14, 19
- `docs/architecture.md` — the three OG RPCs, both new columns, the `/sos/*` and
  (if hypothesis A holds) `/manage/*` parent mappings
- `docs/CLAUDE.md` — new traps: `Share.share` unguarded on web; OG endpoints
  needing a definer RPC because anon has no RLS grant
- `docs/verandah.md` — `borderWhisper` token, `SchoolPicker`, the availability
  slot grid, and any border that could not be tokenised
