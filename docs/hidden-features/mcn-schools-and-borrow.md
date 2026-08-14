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
- **`lib/navigation.ts`.** The `/mcn/schools*` parent mappings in `getImmediateParentRoute()` stay, so back navigation still works for anyone who reaches those routes by URL.
- **`constants/schoolReviewAspects.ts`.** The 8 report-card aspects. Unused while hidden, single source of truth when back.
- **`components/NetworkTileIcon.tsx` / `.web.tsx`.** The `schools` and `borrow` kinds remain in the union.
- **`components/SchoolRadarChart.tsx`, `components/SchoolReviewCard.tsx`.** Schools-detail components, untouched.

---

## Re-enable checklist

1. Flip the flag(s) in [`constants/featureFlags.ts`](../../constants/featureFlags.ts) to `true`.
2. `npx tsc --noEmit`.
3. Open `/network` — the hidden card(s) return with live counts, and the teaser disappears once **both** flags are on (`HAS_HIDDEN_MCN_SECTIONS` goes false).
4. For borrow: check that My Submissions shows both tabs again, that `/mcn/my-posts?segment=borrow` lands on the borrow tab, and that the FAB routes to the add-post screen from it.
5. For schools: walk `/mcn/schools` → detail → report card → compare, and confirm the review aggregate trigger still populates `schools.avg_*` on submit.
6. Move the row from the inventory table in [`README.md`](README.md), update the pointer in [`../disabled-features.md`](../disabled-features.md), and revert the "hidden" notes in [`../features.md`](../features.md) §4.1/§4.6/§4.7 and the role matrix.
7. Re-check the landing page: if it was redesigned around the active feature set, the returning feature needs its card back.

Nothing needs to be deployed, migrated, or backfilled. The database was never changed.

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
