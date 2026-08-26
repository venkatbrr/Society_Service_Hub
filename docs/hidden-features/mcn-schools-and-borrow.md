# Hidden: Schools catalog & Borrow and share

**Hidden on 2026-08-13.** Both features are **fully built and fully working**. Only their entry points are gated. No table, policy, RPC, trigger, curated dataset, or resident row was touched.

| | Schools catalog & compare | Borrow & share posts |
|---|---|---|
| **Flag** | `SCHOOLS_CATALOG_ENABLED` | `BORROW_SHARE_ENABLED` |
| **Flag file** | [`constants/featureFlags.ts`](../../constants/featureFlags.ts) | same |
| **Routes** | `/mcn/schools`, `/mcn/schools/[id]`, `/mcn/schools/add`, `/mcn/schools/review`, `/mcn/schools/compare` | `/mcn/add?kind=borrow`, the borrow tab of `/mcn/my-posts` |
| **Tables** | `schools`, `school_reviews` | `mcn_posts` |
| **Feature contract** | [`../features.md`](../features.md) §4.6 | [`../features.md`](../features.md) §4.7 |

---

## Why

The MCN hub was advertising five sections while pilot communities were actively using three. Schools and Borrow had the lowest engagement of the set, and an empty section reads as an abandoned app rather than a new one. The hub now shows only what residents are actually using, and a single teaser card stands in for what is coming.

This is a **presentation decision, not a product decision.** Both features stay deployed so that turning them on later is a flag flip, not a rebuild — and so any rows residents already created are still there when they come back.

---

## What changed

### 1. `constants/featureFlags.ts` — new file

Three exports: the two flags, plus `HAS_HIDDEN_MCN_SECTIONS` (true while either flag is off) which drives the teaser card. Both flags are `false`.

### 2. `app/(tabs)/network.tsx` — the MCN hub

| Change | Detail |
|---|---|
| Schools card | Wrapped in `{SCHOOLS_CATALOG_ENABLED && …}` — not rendered |
| Borrow card | Wrapped in `{BORROW_SHARE_ENABLED && …}` — not rendered |
| Teaser card | New card in their place: **"Watch this space"**, an animated `ComingSoonTile` (see [`../verandah.md`](../verandah.md) §Coming-soon tile). Rendered when `HAS_HIDDEN_MCN_SECTIONS`. **Deliberately not pressable** — there is nothing to open, and a tap that does nothing reads as a bug |
| Count queries | The `schools` and `mcn_posts` count reads are dropped from the `Promise.all` while their flag is off (the array positions become `null`, and the error sweep uses `r?.error`). Nothing renders the numbers, so nothing should fetch them on every focus |
| Hero subtitle | Drops the word "sharing" while borrow is hidden: *"Neighbours, local businesses, carpools & school parents — all in one place."* The original string returns with the flag |

The hub is now three live section cards — Pre-order food & community business, Community carpooling, Parent Corner — plus the teaser.

### 3. `app/mcn/my-posts.tsx` — My Submissions

The hub card was not the only door into borrow; the **My Submissions** quick action opens this screen, which had a Borrow tab.

| Change | Detail |
|---|---|
| Segmented control | Gated on `BORROW_SHARE_ENABLED`. With one segment left, the control disappears entirely rather than rendering a lone chip — the screen is business listings only, the same shape My Orders took when business ordering was hidden ([`../disabled-features.md`](../disabled-features.md) §2b) |
| `?segment=borrow` | Ignored while hidden — it would select a tab that does not render. The param is inert, not an error |
| FAB | Always routes to `/mcn/listing-add`; the `/mcn/add?kind=borrow&source=my-posts` branch is unreachable |
| List padding | `listContent` gains `paddingTop: 10` while hidden, since the segmented control is no longer there to space the first card off the header |

### 4. `public/landing.html`

The Community Network feature card claimed *"Borrow household items…"*. Rewritten to name live features (rides, resident businesses, parent connections). **The full redesign landed on 2026-08-14** — see [Landing page redesign](#landing-page-redesign) below.

---

## What was deliberately **not** touched

Read this before deleting anything that looks orphaned.

- **All database objects.** `schools`, `school_reviews`, `mcn_posts`, their RLS policies, and the trigger that aggregates review scores into `schools.avg_*` / `review_count` are all live. Every resident row that existed on 2026-08-13 is still there. **No migration was written and none is needed** — in either direction.
- **`data/westHyderabadSchools.ts`.** 81 curated schools. This is **not** dead code — `components/SchoolPicker.tsx` reads it for the school field in **Parent Corner**, which is live and visible. Deleting it breaks a shipping feature.
- **All five `app/mcn/schools/*` route files and `app/mcn/add.tsx`.** Unlinked but routable by URL, which is how you QA before flipping a flag.
  - **Correction (2026-08-26):** `app/mcn/add.tsx` was **not** intact when this was written. Commit `ce09600` (2026-08-01) had already replaced the borrow composer with a bare `<Redirect href="/(tabs)/network" />` — twelve days *before* the feature was flagged off, and nobody noticed because the flag hid the only two doors to it. Flipping `BORROW_SHARE_ENABLED` back on would have produced a Borrow tab whose FAB bounced straight to the MCN hub, with no way to create a borrow post at all. The screen was restored from `7d52f0e` on 2026-08-26 (routes repointed `/network/*` → `/mcn/*`, header moved onto `buildMcnHeaderOptions` + `goBackSmart`, `kind` fixed to `'borrow'`). The lesson generalises: **"left on disk" is a claim to verify with `cat`, not to assume** — a hidden route has no user to notice it rotting.
- **`lib/navigation.ts`.** The `/mcn/schools*` parent mappings in `getImmediateParentRoute()` stay, so back navigation still works for anyone who reaches those routes by URL.
- **`constants/schoolReviewAspects.ts`.** The 8 report-card aspects. Unused while hidden, single source of truth when back.
- **`components/NetworkTileIcon.tsx` / `.web.tsx`.** The `schools` and `borrow` kinds remain in the union.
- **`components/SchoolRadarChart.tsx`, `components/SchoolReviewCard.tsx`.** Schools-detail components, still live and rendering.
  - One change on 2026-08-17: **`SchoolRadarChart.web.tsx` no longer uses `framer-motion`**, and the package was removed from `package.json`. Because the whole app ships as one web bundle, that dependency was downloaded by every visitor on every cold load — ~86 KB gzipped, 11% of the bundle — for a chart only reachable inside this hidden feature. The animations (entrance staggers, the rotating dashed ring, the idle breathe, the stroke draw-on) were reimplemented as CSS keyframes with the same timings, plus a `prefers-reduced-motion` block the framer version never had. Visually unchanged; re-verify it when the flag flips. **Do not reintroduce `framer-motion`** — nothing else imports it.

---

## Re-enable checklist

1. Flip the flag(s) in [`constants/featureFlags.ts`](../../constants/featureFlags.ts) to `true`.
2. `npx tsc --noEmit`.
3. Open `/network` — the hidden card(s) return with live counts, and the teaser disappears once **both** flags are on (`HAS_HIDDEN_MCN_SECTIONS` goes false).
4. For borrow: check that My Submissions shows both tabs again, that `/mcn/my-posts?segment=borrow` lands on the borrow tab, and that the FAB **actually opens the composer** at `/mcn/add?kind=borrow&source=my-posts` and that submitting returns to the borrow tab with the new post on it. (This step silently could not pass between 2026-08-01 and 2026-08-26 — see the audit below.)
5. For schools: walk `/mcn/schools` → detail → report card → compare, and confirm the review aggregate trigger still populates `schools.avg_*` on submit.
6. Move the row from the inventory table in [`README.md`](README.md), update the pointer in [`../disabled-features.md`](../disabled-features.md), and revert the "hidden" notes in [`../features.md`](../features.md) §4.1/§4.6/§4.7 and the role matrix.
7. Re-check the landing page: if it was redesigned around the active feature set, the returning feature needs its card back.

Nothing needs to be deployed, migrated, or backfilled.

---

## Audit, 2026-08-26

Both features were walked end to end while still hidden, to check that "flip the flag and it comes back" was actually true. It was not. Fixed in the same session:

| # | What was wrong | Where |
|---|---|---|
| 1 | **The borrow composer did not exist.** A redirect stub since `ce09600`; the FAB led nowhere. Restored — see the correction above. | `app/mcn/add.tsx` |
| 2 | **The hub's borrow count contradicted the screen it opened.** The card counted the whole community's active borrow posts, then opened My Submissions, which lists only your own — "12 active borrow posts" followed by "You haven't posted any". The count is now scoped to the signed-in resident and the label says so. | `app/(tabs)/network.tsx` |
| 3 | **The Borrow tab showed business-kind posts.** `mcn_posts.kind` also allows `'business'` (legacy, pre-`mcn_listings`); the query filtered by user but not by kind. | `app/mcn/my-posts.tsx` |
| 4 | **Half the Cambridge schools were unreachable.** The board chip read `Cambridge (CAIE)` and matched by substring, finding 6 of 14. The `Mokila` locality chip matched **zero** schools. `Ramachandrapuram` missed every `R C Puram` one. Chips now carry keyword lists and match whole words. | `constants/schoolCatalog.ts` (new), `app/mcn/schools/index.tsx` |
| 5 | **A school a resident added vanished from every locality filter**, because the add form had no locality or address field at all — so it also got no Maps link. Both fields added. | `app/mcn/schools/add.tsx` |
| 6 | **The add form's board picker and the catalog's board filter were different lists.** A school added as `Cambridge / IGCSE` could not be found under `Cambridge (CAIE)`. Both now read one constant. | as above |
| 7 | **Parent review counts never appeared on catalog cards.** The card renders `review_count`, but the fetch dropped the column and curated schools never had one. Counted from `school_reviews` for both kinds now. | `app/mcn/schools/index.tsx` |
| 8 | **Submitting a report card did not refresh the school.** `[id].tsx` fetched in a plain `useEffect`, so `router.back()` from the review screen returned the parent to "No parent reviews yet" — with their own review missing. Now `useFocusEffect`. | `app/mcn/schools/[id].tsx` |
| 9 | **Three screens could spin forever**: `review.tsx` without `schoolId`, `compare.tsx` without `ids`, `[id].tsx` without an id all returned before `setLoading(false)`. | schools routes |
| 10 | **A failed catalog fetch read as "no community schools"** — the 81 curated entries still render, so the failure was invisible and every review count silently went to zero. | `app/mcn/schools/index.tsx` |
| 11 | **RLS: `schools`/`school_reviews`/`mcn_posts` writes were not community-scoped**, and the UPDATE policies had no `WITH CHECK`. See migration `20260927000000`. | `supabase/migrations/` |

**Verified as correct, no change needed:** every entry point is genuinely gated (`grep` for `/mcn/schools`, `/mcn/add`, `segment=borrow` finds only flag-guarded call sites); the count queries really are skipped while hidden; `ComingSoonTile` is not pressable; the `getImmediateParentRoute()` mappings all resolve; `data/westHyderabadSchools.ts` is still load-bearing for Parent Corner.

**Known and deliberately left:** the `ICSE` board chip matches zero *curated* schools — it is kept because the add form offers ICSE, so it is reachable for community-added ones. One curated entry (`Junior College (Intermediate/JEE-EAPCET, not K-12)`) matches no board chip and is findable only by search or `All Boards`.

---

## Landing page redesign

The public landing page (`public/landing.html`, served at `/` — see the `vercel.json` / `build-admin.js` note in [`../CLAUDE.md`](../CLAUDE.md) §9) was redesigned around the **actually active** feature set. **The redesign shipped on 2026-08-14**; page structure and editing rules now live in [`../features.md`](../features.md) §12, and the two lists below remain the source of truth for what its copy may claim. As of 2026-08-13 that is:

**Live and advertisable**

- Neighbour-verified service providers, ratings, and service visits (Help tab)
- Saved providers (Saved tab)
- Pre-order food drops
- Community business directory — **browse and contact only; there is no in-app ordering** ([`../disabled-features.md`](../disabled-features.md) §2b)
- Community carpooling
- Parent Corner
- Community events, blocks, SOS, residents directory
- Funds — collections, transactions, transparency
- Personal service reminders
- Installable PWA

**Do not advertise**

- Schools catalog & compare — hidden (this doc)
- Borrow & share — hidden (this doc)
- In-app business ordering — hidden ([`../disabled-features.md`](../disabled-features.md) §2b)
- Cross-community federation — backend only, no UI ([`../disabled-features.md`](../disabled-features.md) §7)
- Web push notifications — designed, not built ([`../disabled-features.md`](../disabled-features.md) §8)
- Email/password sign-up — UI hidden; Google is the only visible path ([`../disabled-features.md`](../disabled-features.md) §1b)

Keep this list as the source of truth for what the marketing copy may claim, and update it in the same change set as any flag flip. When a hidden feature returns, the redesigned page needs its card back — the bento grid and the "Home businesses" role panel are where it would go.
</content>
