# Features Reference

> Per-screen contract for every user-facing surface: purpose, tables, business rules, navigation, and roles.
> **Schema columns are not repeated here** — [`architecture.md`](architecture.md) §4 owns those. Design rules live in [`verandah.md`](verandah.md). Coding rules live in [`CLAUDE.md`](CLAUDE.md).

---

## Screen index

Jump straight to what you need; skip the rest.

| Domain | Screens | Section |
|--------|---------|---------|
| Auth & onboarding | login, forgot-password, community-select, community-request(+submitted), community-join-block | [§1](#1-authentication--onboarding) |
| Help tab | providers, service visits | [§2](#2-help-tab--providers--visits) |
| Saved tab | favorites | [§3](#3-saved-tab) |
| MCN tab | hub, business, drops, carpools, parents, orders (+ hidden: schools, borrow posts) | [§4](#4-mcn--my-community-network) |
| Community tab | events, funds status, blocks, SOS, residents | [§5](#5-community-tab) |
| Funds | list, add, detail, transactions, access request | [§6](#6-funds) |
| Profile tab | profile, edit, reminders, hire feedback, legal | [§7](#7-profile-tab) |
| Notifications | feed | [§8](#8-notifications) |
| Platform admin | web console (5 pages) | [`platform-admin.md`](platform-admin.md) |
| Access matrix | who can do what | [§9](#9-role-based-access-matrix) |
| Integrations | external services per screen | [§10](#10-external-integrations) |
| Marketing site | public landing page (`public/landing.html`) | [§12](#12-public-marketing-landing-page) |

**Role vocabulary used throughout**: *Resident* = any community member · *Lead* = `president` or `vice_president`, checked via `isCommunityLead` · *Platform admin* = `app_role = 'admin'` with no community. The strings `community_lead` and `community_admin` no longer exist in the enum (dropped 2026-08-22) — never test for them.

---

## 1. Authentication & onboarding

### Login — `app/login.tsx`

| Aspect | Details |
|--------|---------|
| **Purpose** | Sign in with Phone OTP (primary), Google (secondary), or optional email/password if enabled |
| **Tables** | `auth.users` via Supabase Auth; trigger `handle_new_user()` auto-creates the `profiles` row |
| **Rules** | Primary action routes to `/login-phone`. Google sign-in exchanges the native or web identity token with Supabase and always prompts account selection rather than silently reusing the last account. OAuth errors on web display a clear Toast message. Target deep-link routes survive OAuth redirects on the PWA. |
| **Navigation** | Entry point when unauthenticated. Routes to `/login-phone` (primary) or `/forgot-password`. Post-auth routing belongs to the root layout, which restores any saved deep-link target. |
| **Integrations** | Supabase Auth, Google Sign-In (needs a dev build — not Expo Go) |

### Login Phone — `app/login-phone.tsx`

| Aspect | Details |
|--------|---------|
| **Purpose** | Authenticate via 10-digit Indian mobile number OTP via MSG91 widget |
| **Tables** | `auth.users` via `verify-phone-otp` Edge Function; `profiles` with `phone_number` |
| **Rules** | Validates 10-digit Indian mobile numbers (`^[6-9]\d{9}$`). Integrates with MSG91 OTP Widget on web and mobile. On OTP verification, passes `access_token` to `verify-phone-otp` Edge Function which verifies server-side with MSG91 using `MSG91_AUTHKEY` secret and establishes the authenticated Supabase session. |
| **Navigation** | Back to `/login`. Post-auth proceeds through the standard root auth gate (`/community-select` for new users). |
| **Integrations** | MSG91 OTP Widget API / SDK, Supabase Edge Function `verify-phone-otp` |

### Forgot password — `app/forgot-password.tsx`

Sends a Supabase reset email. Email must contain `@`. Reset URL redirects to `/login` (with `/reset-password` route reserved for future implementation).


### Community select — `app/community-select.tsx`

| Aspect | Details |
|--------|---------|
| **Purpose** | Join an existing community by code, or start a new-community request |
| **RPC** | `join_community_by_code(p_code)` |
| **Rules** | 6-character uppercase alphanumeric code. Joining is **immediate — there is no resident approval queue**. A removed resident cannot re-join with the code; a community lead must re-admit them via `community_lead_readmit_resident`. On success the screen calls `refreshSession()` so `communityId` is populated before redirecting. If the joined community has `blocks_enabled = true`, the user is routed to `/community-join-block` first. |
| **Invite-link prefill survives signed-out signup** | The screen pre-fills `code` from `?code=` (`useLocalSearchParams`), but a signed-out visitor gets bounced to `/login` first, and `usePathname()` never carries the query string. `app/_layout.tsx`'s root auth guard captures `code` into `pendingCommunityCodeRef` (+ `sessionStorage['wooru.pendingCommunityCode']` on web, alongside the existing `wooru.pendingRoute`) the moment it redirects an unauthenticated visit away, then re-appends it to the `/community-select` redirect once the new account has no community yet — so the code survives a full-page Google OAuth redirect. |
| **Navigation** | → `/community-join-block` or `/(tabs)`; → `/community-request` for a new community |

### Community join block — `app/community-join-block.tsx`

| Aspect | Details |
|--------|---------|
| **Purpose** | Capture flat and block/tower from verified inventory right after joining a community |
| **RPC** | `set_my_flat(p_flat_id)` → updates `profiles.flat_id`, trigger syncs `flat_number` and `block_id` |
| **Rules** | Residents pick their block and unit from the `FlatPicker` dropdowns. **Residents never type flat numbers.** Flats are grouped by floor with quick search. An escape hatch ("Can't find flat?") triggers `FlatAdditionRequestModal` to submit missing units for review. All copy uses the community's `block_label` ("Block" or "Tower"). |
| **Navigation** | From `/community-select` → `/(tabs)` on save |

### Community request — `app/community-request.tsx`

| Aspect | Details |
|--------|---------|
| **Purpose** | Submit a new community for platform review |
| **RPC** | `submit_community_request(...)` → `community_requests` |
| **Rules** | Required: name, city, pincode, flat/house number, accuracy confirmation. Optional: area, address, community type, approximate units. Flat number normalizes to uppercase without spaces or hyphens on blur so approval records stay clean. New requests enter `pending`. |
| **Navigation** | → `/community-request-submitted` |

### Community request submitted — `app/community-request-submitted.tsx`

Status screen for an active request. Root routing lands here whenever `activeCommunityRequest` exists. `pending` shows a waiting state; `rejected` shows the reason with restart options; approved users refresh into the app once their profile updates.

---

## 2. Help tab — providers & visits

`app/(tabs)/index.tsx` — one screen, two segments.

| Aspect | Details |
|--------|---------|
| **Tables** | `service_providers`, `favorites`, `provider_hires`, `service_visits`, `visit_joiners`, `profiles`, `events`, `event_transactions` |
| **Components** | `UpcomingServicesCard`, `ProviderCard`, `VisitCard`, `SearchBar`, `CategoryFilter`, `EmptyState` |
| **Shared rules** | Both segments use 300 ms debounced search. Both refetch on focus so newly created records appear on return. The active segment and visit sub-tab are preserved in route params across drill-in and back. `provider_hires` is scoped to `communityId`; `visit_joiners` is scoped to the current page's visit IDs. Web uses `useWebPullToRefresh` since `RefreshControl` is a native no-op. The header carries an Invite-neighbors share action that sends the community join code. |
| **Compact density** | The whole screen follows a WhatsApp chat-tile layout: 22 px header title, 36 px circular header buttons, 6 px segment padding, 36 px search bar, 4 px category-chip padding, 56 px FAB. Provider cards are single-row tiles (avatar · name + verified badge · inline meta row of category · ★ rating · hire count · bookmark). Visit cards use 10 px padding and 30 px avatars. New cards on this screen must match. |

### Providers segment

| Aspect | Details |
|--------|---------|
| **Rules** | Sorted by `avg_rating` descending. Two-level filter: a group row (All Services, Home Support, Repairs & Maintenance, Healthcare & Wellness, Personal Care, Transport & Vehicle Care, Events & Occasions, Education & Coaching, Government & Docs, Other) then a category chip row scoped to the active group. Selecting a group applies `.in('category', groupCategories)`; selecting a category applies `.eq('category', …)`. Groups come from `CATEGORY_GROUPS` in `constants/categories.ts`. Search matches name, category, and phone number (digits-stripped on both sides) using placeholder `"Search by name or phone number..."`. A network or load error surfaces a connection error view with pull-to-refresh retry. An **"Available now"** chip filters the loaded list client-side to Maid/Cook providers currently inside a reported free time band (see Maid/Cook availability below). |
| **State** | `selectedCategory: string \| null`, `selectedGroupCategories: string[] \| null`, and `availableNowOnly: boolean`, all reset on tab switch/search clear (except `availableNowOnly`, which is a pure client-side filter over the already-fetched list and needs no refetch) |

### Maid/Cook availability

Two well-known keys inside `service_providers.details` (JSONB), added via the same category-specific detail fields as any other provider attribute — no schema change:
- `freeSlots: string[]` — chip multi-select over six fixed bands defined in `lib/availability.ts` (`AVAILABILITY_SLOTS`): Early morning (5–8am), Morning (8–11am), Midday (11am–2pm), Afternoon (2–5pm), Evening (5–8pm), Night (8–10pm)
- `weeklyOff: string` — a day name, or `'None'`

`lib/availability.ts` derives `isFreeNow()` and a badge string (`getAvailabilityBadge()`: "Free now" / "Free from 5–8pm" / `null`) from the current time. The badge renders on `ProviderCard` (Help tab list) and the provider detail header when present. Reporting is entirely resident-supplied and unverified — treat it as a rough signal, not a booking system.

### Service visits segment

| Aspect | Details |
|--------|---------|
| **Rules** | Rendered as a `SectionList` grouped by category — each header shows the category emoji (`getServiceCategoryEmoji`), name, and a count badge; sections sort busiest-first and empty categories are hidden. Sub-tabs: **Upcoming, Past** (everything before today, or `completed`/`cancelled` regardless of date — no separate 30-day archive tier). Cancelled visits move to Past immediately regardless of planned date. Past rows never show an `upcoming` badge even when a stale row still carries that status. A `?visitTab=archived` deep link (from before the merge) maps onto `past`. |

### Add provider — `app/provider/add.tsx`

| Aspect | Details |
|--------|---------|
| **Tables** | Writes `service_providers`; optionally `provider_personal_notes` |
| **Rules** | Required: name (2–80 chars), phone, category. Description (≤1000 chars) and personal note (≤1000 chars) are optional. Categories come from `constants/categories.ts` via the same grouped picker as the Help tab. Category-specific structured fields come from `constants/providerDetails.ts` and land in `service_providers.details` (JSONB), with numeric fields parsed to non-negative numbers. No salary input — pricing goes in the freeform description. A private "Personal note" can be captured at save time and is visible only to its author. Phone accepts flexible formats (including country code), then normalizes to a validated 10-digit mobile before duplicate check, fraud check, and insert. **A duplicate normalized phone in the same community routes the user to the existing provider instead of creating a row.** Creation runs the `fraud-check` Edge Function and stores the verdict in `service_providers.fraud_status` (and a row in `fraud_verdicts`). If the edge function is unavailable, execution fails open to `QUEUE_LOW_PRIORITY` with `unavailable: true`, saving `queued_low` status while publishing the provider live. |
| **Roles** | Any resident |

### Provider detail — `app/provider/[id].tsx`

| Aspect | Details |
|--------|---------|
| **Tables** | Reads/writes `service_providers`, `favorites`, `ratings`, `provider_hires`, `provider_reports`, `provider_personal_notes` |
| **Rules** | Overview & Category Details section renders `description` and category-specific `details` (Decision D6). Ratings are 1–5 stars, one upserted row per user. Review text (≤1000 chars) can be edited without re-tapping stars when a rating already exists. Rate card requires contacting the provider first (`myHireCount > 0`) with a clear helper prompt when uncontacted (Decision D4). Review fraud check R-R6 is evaluated as `FLAG` (not HARD_BLOCK). Community reviews list reviewer name, optional flat number, stars, and text — collapsed to the first 3 with a Load more / Show less toggle, fetched with a `.limit(50)` bound. Contact actions log a hire (deduplicated per user/provider/day via generated `contact_date` unique index; duplicate key `23505` returns success without incrementing count or scheduling duplicate reminder) and schedule local 24 h feedback notification. Private Personal note editor supports up to 1000 chars with a live character counter. Residents in the provider's home community get **Report provider** with fixed reasons (Wrong info, Spam, Inappropriate, No longer available, Other), once per provider; details input (≤500 chars) is available for all reasons and required for 'Other'. Report button is hidden for foreign-community providers (`!isOwnCommunity`). Community Reports banner displays when 2 or more unresolved pending reports exist for public users (Decision D3), or starting at 1 for community leads and platform admins. Leads and platform admins can resolve reports (**Mark reviewed** / **Dismiss**) directly from the banner or admin console, and get **Delete provider**. Delete provider confirms with platform split (`window.confirm` / `Alert.alert`) and verifies deletion response (`.select('id')`). Contact counters display as **Contacts** / "contacted N times". A non-existent provider ID renders an explicit unavailable screen with back navigation. |
| **Navigation** | From Help, Saved, Visit Detail, and the reminder technician lookup |
| **Integrations** | Phone dialer, WhatsApp (prefixed with `91` country code for 10-digit mobiles), native Share |

### Add visit — `app/visits/add.tsx`

Required: title, category, provider context, date. Categories use the same two-level grouped picker. Users either link an existing provider ("Select existing provider") or type a manual name and phone; manual phone/WhatsApp accept flexible input but normalize to validated 10-digit mobiles. Selecting an existing provider automatically reuses their phone number as the WhatsApp contact. `max_joiners` is validated (1 or more, or empty for unlimited). Dates are stored as local calendar dates (`YYYY-MM-DD`) to avoid timezone rollover. New visits start `upcoming`.

### Visit detail — `app/visits/[id].tsx`

| Aspect | Details |
|--------|---------|
| **Tables / RPC** | `service_visits`, `visit_joiners`, `profiles`; RPCs `get_community_visits`, `get_visit_joiners` |
| **Rules** | Joiners can add a flat number and note; the join modal seeds the flat number from `profile.flat_number` and normalizes edits on blur. Server-side trigger `visit_joiner_capacity_guard` enforces `max_joiners`. **The creator** changes status (`upcoming` → `in_progress`/`completed`/`cancelled`) or reschedules an upcoming visit via the **Reschedule** button. Rescheduling updates date/time and emits a `visit_rescheduled` notification to other residents. Host can **Mark as completed** on past visits (`(!isPast || isCreator)`). Community leads and platform admins can cancel or delete visits. All destructive status updates and deletes confirm before writing. Estimated cost is displayed as the raw text typed by the host. Date parsing is local date-only so status classification is timezone-stable. Back navigation uses `goBackSmart`. |

### Hire feedback — `app/hire-feedback/[hireId].tsx`

| Aspect | Details |
|--------|---------|
| **Tables / RPCs** | Reads `provider_hires`, `service_providers`; reads/writes `hire_feedback`; RPCs `record_hire_feedback`, `should_show_public_rating_nudge`, `mark_public_rating_nudge` |
| **Rules** | Opened by a local notification 24 h after a hire. Records `positive`, `negative`, or `skipped` with an optional 280-char note. Feedback is **strictly private and user-scoped**. A `positive` signal can trigger a public-rating prompt exactly once per provider, gated by existing rating plus nudge memory. `negative` and `skipped` never trigger it. **Public ratings are never auto-created** — only an explicit "Rate now" continues to `/provider/[id]`. |
| **Integrations** | `expo-notifications` local scheduling; deep link via `data.kind = 'hire_feedback'` |

---

## 3. Saved tab

`app/(tabs)/favorites.tsx` — the user's saved providers from `favorites` joined to `service_providers`. Provider-only (no business targets). Unfavoriting removes the row immediately. `useFocusEffect` refreshes on return; web uses `useWebPullToRefresh`.

---

## 4. MCN — My Community Network

### 4.1 Hub — `app/(tabs)/network.tsx`

| Aspect | Details |
|--------|---------|
| **Purpose** | Landing screen for the resident-to-resident economy |
| **Tables** | Count-only reads: `mcn_listings`, `mcn_preorder_drops`, `mcn_carpools`, `mcn_parent_corner` (plus `schools` and `mcn_posts` only while those sections are un-hidden) |
| **Rules** | Two quick actions (My Orders, My Submissions) above the section cards, each showing a live count fetched in a single `Promise.all`. Counts refresh on focus and on pull-to-refresh. A hidden section renders no card **and issues no count query** — its slot in the `Promise.all` is `null`. |
| **Cards** | Pre-order Food & Community Business → `/mcn/drops` (open drops **not yet past their cutoff** + active listings) · Community Carpooling → `/mcn/carpools` (active rides) · Parent Corner → `/mcn/parents` (children listed) |
| **Glyph motion** | Each card's icon carries a slow idle animation matched to its subject (the bag sways, the car drifts, the group breathes), on deliberately unequal cycles so the screen never pulses in unison — `components/AnimatedTileGlyph.tsx`. Static under reduce-motion. Spec in [`verandah.md`](verandah.md) §Idle motion. |
| **Teaser card** | While any MCN section is hidden, a final **"Watch this space"** card sits below the live ones — `components/ComingSoonTile.tsx`, driven by `HAS_HIDDEN_MCN_SECTIONS`. It is **not pressable** — there is nothing to open yet. Animated: rings ping out from the glyph, the glyph breathes, two sparkles twinkle off-beat, and the subtitle cross-fades between three teaser lines. Falls back to static under reduce-motion. Spec in [`verandah.md`](verandah.md) §Coming-soon tile. |
| **Hidden** | **Schools Catalog & Compare** and **Borrow & Share** cards were hidden on 2026-08-13 behind `constants/featureFlags.ts`. The hero subtitle drops "sharing" while borrow is off. See [`hidden-features/mcn-schools-and-borrow.md`](hidden-features/mcn-schools-and-borrow.md). |

### 4.2 Business listings — `app/mcn/business.tsx`

| Aspect | Details |
|--------|---------|
| **Purpose** | Directory of resident-run businesses |
| **Tables** | `mcn_listings`, `mcn_business_categories`, `mcn_products`, `ratings`, `profiles` |
| **Rules** | Community-scoped with 300 ms debounced name search. A horizontal category chip bar filters by `category_id`; tapping the active chip returns to All. Listings are grouped by category into collapsible sections, with active listings sorted ahead of paused ones and inactive listings kept visible behind an inactive badge. Cards show summary only (cover image, owner, category badge) — offerings and prices appear after opening the listing. The cover is ~11.5% of viewport height via `getNetworkTileImageHeight()` with a top-anchored crop, matching food drops; the listing detail hero is 30% via `getMediaHeroHeight()`. See §4.3 for why. Each card's share action links to `/api/share-listing?id=…` (`api/share-listing.ts`), the same OG-preview pattern as food drops. `mcn_listings` has no anon-readable SELECT policy, so the endpoint reads through `get_listing_og_card(p_id)`, a `SECURITY DEFINER` RPC exposing only `name`/`description`/`image_url` — never a direct table read. |
| **Anti-spam rules** | All enforced server-side by triggers on `mcn_listings` (migrations `20260819000000`, `20260821000000`), not just the UI: **one listing per resident per category** (create a second under the same category and it's rejected — edit the existing one instead); **max 5 active listings per resident** across all categories (reactivating a 6th is blocked until another is paused/deleted); **1 new listing per resident per 24 hours**. Each check raises a plain-language error the client surfaces directly (`error.message`), so no separate client-side copy to keep in sync. |
| **Reporting** | Any non-owner can report a listing from its detail screen (flag icon, reason picker, one report per resident per listing — `mcn_listing_reports`, mirrors `provider_reports`). At 3 pending reports the listing is auto-hidden (`is_active = false`, `flagged_for_review_at` set) and leads are notified; a lead or the owner can reactivate it from the existing Manage listing screen, which clears the flag. |
| **Roles** | All residents view and create. Owner or lead can manage and delete. Delete sits in a **bottom-of-screen danger zone** on the manage screen (`components/DangerZone.tsx`, shared with food drops) — it names the listing and its products as the loss, points the host at pausing instead if they are only closing for a while, and carries the shared spam caution. |

### Add listing — `app/mcn/listing-add.tsx`

Business name required (max 80). Category required, from the `mcn_business_categories` lookup. Description optional (max 280). Contact phone required, normalized to 10 digits. Navigates to the manage screen on success.

### Listing detail — `app/mcn/listing/[id].tsx`

| Aspect | Details |
|--------|---------|
| **Tables** | `mcn_listings`, `mcn_business_categories`, `mcn_products`, `ratings`, `mcn_listing_reports`, `profiles` |
| **Rules** | **Browse-and-contact only — there is no in-app ordering.** Offerings split by `item_type` into Products and Services, each row showing name, optional description, availability, and either `₹ amount / unit` or **"Price on request"** when `price IS NULL`. Unavailable offerings show a "Not available" badge. Non-owners see a line above the offerings — "Prices are indicative. Call or message *owner* to place an order." — and a labelled **Call / WhatsApp** pair below the description (via `buildWhatsAppUrl`); both are hidden from the owner and when no contact number exists. Also carries the ratings/reviews block and the report flow. |
| **Reviews** | Star rating plus optional text, one upserted row per user (`ratings`, `onConflict: 'user_id,listing_id'`). Reviewers can also attach **one optional photo** (`ratings.image_url`, via `ImageUploader`, `subfolder="reviews"`) — re-submitting a review replaces its photo along with the text. Thumbnails in the review list open the screen's existing full-screen image viewer. |
| **Roles** | Any resident can browse and contact the owner. Owner **or lead** sees the Manage action in the header. |

> Cart, quantity steppers, and the order modal were removed on 2026-08-09 — `mcn_orders`, `mcn_order_items`, and `place_mcn_order()` all still exist and are simply unused. See [`disabled-features.md`](disabled-features.md) §2b.

### Manage listing — `app/mcn/listing/manage/[id].tsx`

| Aspect | Details |
|--------|---------|
| **Rules** | Toggle listing active/paused, edit details including category, and manage offerings. The offering modal supports `item_type` (`product`/`service`) and an optional price — blank stores `NULL` and renders as "Price on request". Deleting a product or a whole listing with orders in history is gracefully blocked with a prompt to pause instead (SQLSTATE 23503 handling). |
| **Roles** | **Owner or lead.** The screen enforces this itself: a non-owner, non-lead is toasted and redirected to `/mcn/business`. |

### Orders received — `app/mcn/listing/orders/[id].tsx` — **unlinked**

No screen navigates here since in-app business ordering was hidden on 2026-08-09; the route file is kept so historical orders stay reachable by URL. Behavior is unchanged: orders grouped Pending / Fulfilled / Cancelled, auto-refresh on focus, a WhatsApp button pre-filling items and total via `buildWhatsAppUrl`, and pending orders markable fulfilled or cancelled behind `confirmAction`. Owner only. See [`disabled-features.md`](disabled-features.md) §2b.

### 4.3 Pre-order food drops — `app/mcn/drops/*`

Routes: `index` (catalog) · `add` · `[id]` (detail + ordering) · `manage/[id]` (host dashboard) · `manage/index`

| Aspect | Details |
|--------|---------|
| **Purpose** | Time-gated group ordering for home chefs and food businesses — weekend specials, home baking, pop-up meals |
| **Tables** | `mcn_preorder_drops`, `mcn_preorder_items`, `mcn_preorder_orders`, `mcn_preorder_order_items`, `mcn_listings`, `profiles` |
| **Catalog rules** | Tabs: Open / Past / Mine, defaulting to `cutoff_at` ascending. **Filter and sort sit in that same pill row**, to the right of the tabs and styled as the same pill — icon-width, so five affordances still fit a narrow phone without the row scrolling. Both open bottom sheets. **Sort** offers Closing soon (default) · Delivery soonest · Just added · Price low→high; the pill fills primary while any non-default sort is active. A fifth option, **Most ordered, is built but parked** behind `DROP_SORT_MOST_ORDERED_ENABLED` (`constants/featureFlags.ts`) — see [docs/hidden-features/](hidden-features/README.md). **Filter** offers four groups: delivery day (today / tomorrow / this weekend / next 7 days), meal (breakfast / lunch / snacks / dinner, read from the host-chosen `meal_type`), veg / egg / non-veg, and price (under ₹100 / ₹100–300 / above ₹300, judged on the drop's **cheapest** item). The filter pill shows a count of active groups. Filter edits are held in a draft and committed on **Show results**, so the list underneath does not churn while a half-built filter set is being assembled. Filtering and sorting are client-side: a community sees a handful of open drops at a time and every field is already loaded for the tiles, so a round trip per chip tap would cost more than it saves. A drop matches a diet filter when **at least one** of its items does — you order individual items, and the menu marks each one, so a mixed drop is a real result for both Veg and Non-veg. A drop whose menu failed to load has no price and is kept rather than hidden, so a data-loading failure never masquerades as a filter result; on price sort those drops sink instead of leading a "cheapest first" list with no price to show. Filtering to nothing gets its own empty state ("No drops match these filters") with a **Clear filters** action, distinct from a genuinely empty tab. Per-drop order counts and item quantities come from `get_mcn_drop_order_counts` — a direct read of `mcn_preorder_orders` returns zero rows logged-out, since those rows carry buyer name, phone, and flat and are deliberately not public. That call is gated on `DROP_SORT_MOST_ORDERED_ENABLED`, since the parked sort is its only consumer and an ungated fetch would be a round trip per load for nothing on screen. Revenue metrics (total, completed, order count) still need the amounts, so they stay on a direct read and load only on the Mine tab. Anonymous viewers see only `status = 'open'` drops. Cards show host identity (name plus flat number when available), the linked business listing when present, and side-by-side close/delivery timing chips. **A drop with no photo falls back to a bundled illustration** (`assets/images/food-drop-placeholder.jpg`, 1200×657 JPEG / 143 KB — a drawn tiffin spread) rather than the old empty grey box reading "food photo", which looked like an unfinished screen. **Illustration, not photograph, is the deliberate choice**: a realistic thali shot on a paid listing reads as a picture of the food you are about to buy, whereas a drawing cannot be mistaken for the host's actual dish. Bundled, not remote, so it renders offline and costs no request. Real covers crop `contentPosition="top"`; the placeholder crops from the centre. The drop **detail** screen uses the same fallback so a photoless drop does not open to a blank slab of text, but renders it non-tappable — there is no real photo to open full-screen. The **"Reserve now" CTA overlays the cover photo's bottom-right** rather than taking a full-width row under the body: it keeps the affordance visible in the feed while costing the tile no height. **It is hidden for the host** — you cannot pre-order your own drop, so a shimmering CTA on your own card invites a tap that goes nowhere; hosts manage from inside the drop, and tapping the card still opens it. The card derives this from `useAuth()` rather than an `isCreator` prop, since a prop is one a caller can silently forget to pass. A soft highlight drifts across it continuously while the drop is open (`ReserveButton`) — two gradient bands running half a cycle apart, so one is always on the pill; a single band spends ~40% of its cycle clearing the edges, which reads as the glow arriving late; closed and completed drops get a muted, static "View menu" instead, since animating a dead end is just noise. The sweep is gated on `useReduceMotion()`. The cover photo is **~11.5% of viewport height** (`getNetworkTileImageHeight()`, clamped 84–130px, re-measured from `useWindowDimensions()`), replacing the old fixed 108px strip. That number is derived, not chosen: the feed must show **at least three tiles at once**, and after ~270px of fixed chrome and a ~97px compact card body there is only ~100px left for the photo. Opening the drop grows the same photo to **30%** (`getMediaHeroHeight()`, clamped 150–280px): on a tile the photo competes with the two tiles below it for the fold, on a detail screen it is what you came to look at and competes with nothing. Enlarging the tile is therefore not a free win — it buys a prettier card by pushing the third one off screen. The same budget is why the tile carries **no description and no CTA button**: the "Reserve now" button called the identical `onPress` as the card wrapper, so it bought nothing but ~65px (divider + button — a third of the card body), and tapping the card has always opened the drop. Open/closed state still reads from the cut-off chip's colour and copy, and the description is one tap away. Three tiles fit from roughly an 800px viewport upward (iPhone 13+ ≈ 844, Pixel ≈ 890); a short 640–700px screen gets ~2.1–2.4, because the fixed chrome eats proportionally more — there is no image height that fixes that without gutting the card. The crop is `contentPosition="top"` in both places, since `contentFit="cover"` centre-crops and takes the top off a plated dish, and both are tappable into `ImageViewer`. Community business and community events cards use the same pair of tokens for the same reason. A `?id=` param redirects into the drop detail (web deep-link bridge). |
| **Publish rules** | A drop specifies title, prep notes, fulfillment date, fulfillment time (system time picker), **meal slot**, `cutoff_at` deadline, and items with name, unit, price, **veg / egg / non-veg**, and optional `max_quantity`. The meal picker (breakfast / lunch / snacks / dinner) is **its own titled card section** headed "Which meal is this? *", placed directly after the delivery schedule card, with four full-width chips showing the label and its time-of-day hint (Morning / Midday / Evening / Night). It was previously an 11px sub-label tucked under the delivery-time fields, where hosts skipped it — being pre-filled, it looked already answered. It still **seeds itself from the delivery time** — before 11:00 breakfast, to 15:30 lunch, to 19:00 snacks, else dinner — then stops following once the host picks one themselves, so changing the time later never silently overrules a deliberate answer. Editing an existing drop treats its stored value as already chosen and does not re-guess. It is stored rather than derived at read time because the clock cannot tell a late snack from an early dinner, and residents filter the catalog on it. Diet is per item, not per drop, because a single menu is routinely mixed (veg curry alongside a chicken biryani) — a drop-level label would be wrong on half the listings. It **defaults to veg**, so a host who never touches the row publishes a veg menu; items created before the column existed were backfilled to veg and stay wrong until their host edits them, which ages out on its own since drops are short-lived. The same value drives the green/amber/red dot beside each item on the drop detail menu and the dots beside the title on each catalog tile (one per diet type the menu offers, ordered veg → egg → non-veg). **Delivery time must be strictly later than the cutoff, and neither may be in the past.** The date pickers refuse any day before today (the fulfillment picker's floor is the cut-off date), and submitting re-checks both timestamps against the current moment — a drop published past its own cut-off would be un-orderable, since `place_mcn_preorder` rejects every order once `cutoff_at <= now()`. In edit mode the past-time check applies only to values the host actually changed, so a drop left open past its cut-off can still be edited for a typo. There is no overall drop-order cap — capacity is per item, and it is enforced by a database trigger, not just the UI. An item's `max_quantity` is a **total shared across every buyer's orders combined**, not a per-order allowance — e.g. `max_quantity = 5` means at most 5 units total can ever be ordered for that item across all residents. The item form and the item row on the detail screen both say so explicitly, and `get_mcn_drop_item_availability` / `check_mcn_drop_item_quantity_capacity` (plus insert/update triggers on `mcn_preorder_order_items` and `mcn_preorder_orders`) enforce it server-side. |
| **Item stock** | Max quantity is optional per item; if given it must be a whole number above zero (blank means no limit). An item given a max quantity shows its live remaining stock to shoppers — `N of M left — shared across all residents`, turning red as `Sold out — all M claimed` at zero. The `+` stepper is disabled once the selection reaches what is left, and the count is re-read each time the screen is focused, since another resident ordering makes it stale. The cap is a total across everyone's orders; a rejected order is refused whole, with the server naming the item and how many remain. |
| **Ordering rules** | Residents order before the cutoff with flat number and phone. Past the cutoff, new orders are blocked automatically. A resident may place **multiple** orders on the same drop while it is open. `confirmed` orders can be edited or cancelled by the buyer — editing correctly excludes the order's own prior quantity when checking remaining shared item capacity. Once the host marks an order `fulfilled`, it displays as **Delivered** and becomes immutable. The resident sees whether an order was cancelled by themselves or "Cancelled by host", along with any cancellation note provided by the host. |
| **Host dashboard** | Aggregates item totals across active pre-orders for kitchen prep. Items given a max quantity at creation show their cap next to the ordered count (`of N max`, turning red with `max N · full` once the cap is reached); capped items with no orders yet still appear at `0x` so remaining capacity stays visible. Also shows a delivery roster split into active pre-orders, collapsible delivered orders, and collapsible cancelled orders (with Mark delivered hidden on cancelled). The host can cancel active pre-orders before delivery with an optional note (quick-pick chips + free text); items automatically return to available stock. Cancelled cards differentiate host cancellations ("You cancelled" plus note) from resident cancellations. The host marks orders fulfilled and finally marks the drop `completed`. |
| **Sharing** | Share buttons (header pill, filled button beside the title, and the card's own share icon) build a WhatsApp-formatted message linking to `/api/share-drop?id=…`, a Vercel serverless function (`api/share-drop.ts`, excluded from the app's `tsconfig.json` like `supabase/functions`) that serves real `og:title`/`og:description`/`og:image` tags to link-preview crawlers (WhatsApp, Facebook, etc.) by user-agent sniffing, then redirects everyone else straight into `/mcn/drops?id=…`. A bare app URL has no per-page meta tags to show a preview from, since the web build is a client-rendered SPA. The share image is run through `ogImageUrl()` (`api/_og.ts`) to a fixed 1200×630 JPEG crop — an untransformed multi-MB original is silently dropped by WhatsApp's preview fetcher. Every in-app share (drops, listings, providers, visits, community invites, carpools) goes through `lib/share.ts`'s `shareOrCopy()`, not `Share.share` directly — see architecture.md's sharing note. |
| **Roles** | **Anonymous users can browse** — drops are publicly readable so shared links work logged-out. Login is required to order or publish. The creator manages the drop. **Creator, lead, or platform admin can permanently delete** a drop and its items/orders. Delete lives in a **bottom-of-screen danger zone** (`components/DangerZone.tsx`) on both the drop detail screen and the manage dashboard — it used to sit inline in the header action row beside Edit drop and Mark completed, one mis-tap from routine work, and it is the only action on those screens that cannot be undone. The zone names what is lost (drop title, pre-order count, that buyers are not notified) and carries a shared spam caution: posting and deleting repeatedly looks like spam to neighbours and is visible to the society president. Confirmation goes through `confirmAction`, so it is `window.confirm` on web and `Alert.alert` on native. |

### 4.4 Carpooling — `app/mcn/carpools/*`

Routes: `index` (list) · `add` (create/edit via `?id=...`) · `[id]` (detail + requests)

| Aspect | Details |
|--------|---------|
| **Purpose** | Neighbor ride sharing: daily office commutes, weekend intercity travel & outstation trips |
| **Tables / RPCs** | `mcn_carpools`, `mcn_carpool_requests`, `profiles`; RPCs `get_mcn_carpool_seats(p_carpool_id)`, `get_mcn_carpool_passengers(p_carpool_id)` |
| **List rules** | Tabs: All (active + paused) / Offering / Seeking / My carpools (both created and joined; **cancelled rides are excluded from My carpools** — the query filters `.neq('status', 'cancelled')` for both created and joined rows). Search covers title, start point, destination, vehicle, notes, and host name (debounced 300 ms). Whatever a tab returns is further split into **collapsible Active / Paused / Completed sections** (a `SectionList` with a status-keyed bucket per group) — Active starts expanded, Paused and Completed start collapsed; a group is omitted entirely when empty. Status badges: Active (teal), Paused (amber), Completed (grey), Cancelled (soft red — still used on the detail screen). |
| **Publish rules** | Required: title, start point, end point, contact phone (validated via `lib/phone.ts`). Schedule choices: **recurring weekdays** (Mon–Sun chips) or **one-off calendar date** (`trip_date DATE` via `DateField`). Departure time is 12-hour AM/PM with optional return time. For offering rides: available vehicle capacity (1–6 seats, immutable after publish), vehicle info, and pricing (`free` or numeric `price_per_seat_amount` rendered via `Rupees`). Pricing and vehicle blocks are hidden for seeking posts. |
| **Request & seat rules** | Only active offering rides accept join requests from non-owners. A rider submits name, phone (validated Indian mobile), flat number (e.g. A101), seats requested, and optional note. One open request per rider per ride (enforced by partial unique index `mcn_carpool_requests_one_open_idx`). Host accepts/declines. Seat capacity and valid transitions are trigger-enforced (`check_mcn_carpool_request_validity`, `enforce_mcn_carpool_request_transition`). Remaining seats are dynamically derived, never mutated on the carpool row. Declined riders can re-apply if plans change. Confirmed co-passengers roster is displayed to the society via `get_mcn_carpool_passengers` without exposing rider phone numbers. |
| **Notifications & cascade** | Notifications sent on request created (host notified), status changes (rider notified of accept/decline; host notified if rider cancels), and ride cancellation/pause (all confirmed passengers notified). Cancelling a ride cascades to cancel its active requests. |
| **Roles & controls** | Any resident creates rides and requests seats. **Creator or lead** can pause, resume, cancel, mark completed, or delete any ride (both offering and seeking). **Creator or lead** can edit ride details via `/mcn/carpools/add?id=...`. |

### 4.5 Parent Corner — `app/mcn/parents/*`

Routes: `index` (directory) · `add` (create/edit)

| Aspect | Details |
|--------|---------|
| **Purpose** | Opt-in directory of residents' children, for study groups, school-run coordination, and finding neighbors at the same school |
| **Tables** | `mcn_parent_corner` |
| **Rules** | Required on save: student name (max 60), school/college name (max 100), class/grade (max 40), parent name (max 60), flat number (max 12), contact phone (max 15). Contact phone must be a valid 10-digit Indian mobile number, normalized on blur and save; WhatsApp/Call actions are disabled for invalid stored numbers. Flat number is uppercased and stripped of spaces and hyphens on blur (e.g. `A402`). Notes field is optional (max 300, clamped to 4 lines on card). Institution type is `school`, `college`, or `preschool`. Board choices: CBSE, ICSE, State Board, IB, IGCSE, PU Board, University, Other, NA. Board is required, so **NA** is the opt-out for parents whose reason for listing has nothing to do with a syllabus (e.g. carpooling only); a hint under the chip row says so, and NA is also a directory filter chip. "Looking for" is an optional multi-select chip picker (carpooling, study group, homework help, school info & updates, sports/activities buddy, playdate/hangout, other) shown as badges on the card and as a filter chip row on the directory. The directory offers 300 ms debounced search, query ceiling (limit 500), case-insensitive school chip grouping, filters by institution type / board / school / looking-for, and numeric-aware sorting by school, grade, flat, or recency. Web PWA uses native browser confirmation for deletion. Directory handles 3 distinct states: *not available yet*, *couldn't load*, and *nothing listed yet*. |
| **School picker** | For `school`/`preschool`, the name field is `components/SchoolPicker.tsx` — a searchable modal over `data/westHyderabadSchools.ts` (81 curated West Hyderabad schools), filtered to the relevant `level` (pre-school vs. K-12) and grouped by locality. A pinned **"Other — my school isn't listed"** row reveals the old free-text input for anything not in the catalog. Picking a catalog entry also stores its id in `mcn_parent_corner.school_catalog_id` (nullable `TEXT`, no FK — the catalog lives in app code, not the database) and, when the school's `syllabus` string matches a `BOARD_OPTIONS` value exactly, pre-fills Board. `college` always uses free text — the catalog has no college entries. Switching institution type clears the current pick and returns to the picker (free text for college). |
| **Roles** | Residents manage their own entries. **Owner or lead** can edit or delete any entry. Editing another resident's entry via URL checks ownership and returns to directory if unauthorized. |

### 4.6 Schools catalog & parent report card — `app/mcn/schools/*` — **hidden**

> **Hidden from the UI on 2026-08-13** behind `SCHOOLS_CATALOG_ENABLED` in [`constants/featureFlags.ts`](../constants/featureFlags.ts). The hub card is gone; the routes below still work by URL and the database is untouched. Behavior as described is exactly what returns when the flag flips. Re-enable checklist: [`hidden-features/mcn-schools-and-borrow.md`](hidden-features/mcn-schools-and-borrow.md).
>
> `data/westHyderabadSchools.ts` is **still in active use** while this is hidden — Parent Corner's `SchoolPicker` (§4.5) reads it.

Routes: `index` · `[id]` · `review` · `add` · `compare`

| Aspect | Details |
|--------|---------|
| **Purpose** | Regional school directory plus a structured parent review system |
| **Tables** | `schools`, `school_reviews`, `profiles`; curated data from `data/westHyderabadSchools.ts` |
| **Catalog rules** | Merges ~50 curated regional schools with community-submitted ones. Cards show syllabus, level, distance, fee range, parent review count, and review badges. Up to **3 schools** can be selected for side-by-side comparison at `/mcn/schools/compare?ids=a,b,c`; selecting a fourth is refused with an info toast. |
| **Report card rules** | Replaces flat 1–5 stars with **8 aspect dimensions** — Academics, Teachers, Infrastructure, Sports & Activities, Safety & Hygiene, Transport, Value for Money, Child's Happiness — scored on an emoji scale (😟 😕 😐 🙂 🤩) defined in `constants/schoolReviewAspects.ts`. Parents pick their child's grade and may add optional 140-char per-aspect notes plus an overall comment. Aggregates are written to `schools.avg_*` and `review_count` by a database trigger. Reviews accept text school IDs so curated (non-UUID) schools can be reviewed. |
| **Detail view** | 8-axis radar chart (`SchoolRadarChart`), aspect score breakdown, parent review cards (`SchoolReviewCard`), and a report-card CTA |
| **Add school rules** | Required: name, distance (≥0), fee range. Phone, when supplied, must be 10 digits. |
| **Roles** | All residents view, compare, add schools, and submit or edit **their own** report card. Leads can delete school listings. |

### 4.7 Borrow & share posts — `app/mcn/add.tsx`, `app/mcn/my-posts.tsx` — **hidden**

> **Hidden from the UI on 2026-08-13** behind `BORROW_SHARE_ENABLED` in [`constants/featureFlags.ts`](../constants/featureFlags.ts). Both entry points are gated: the hub card, and the **Borrow posts** tab on My Submissions. `mcn_posts` and every existing row are untouched. Re-enable checklist: [`hidden-features/mcn-schools-and-borrow.md`](hidden-features/mcn-schools-and-borrow.md).

| Aspect | Details |
|--------|---------|
| **Tables** | `mcn_posts` |
| **Rules** | Title required (max 80), description optional (max 280). For `kind = 'borrow'` contact info is mandatory; business-kind posts keep it optional. A detected 10-digit number is normalized. My Posts groups the user's own posts into Active and Closed with close/delete actions. Launched from the hub's Borrow & Share entry, the screen runs in borrow-only community-feed mode: it shows the whole community's borrow posts, but close and delete stay limited to the signed-in user's own rows. |
| **While hidden** | `app/mcn/my-posts.tsx` is **business listings only** — the segmented control does not render at all (a single chip is chrome with no choice in it), `?segment=borrow` is inert, and the FAB always opens `/mcn/listing-add`. Same shape My Orders took when business ordering was hidden ([`disabled-features.md`](disabled-features.md) §2b). |
| **Roles** | Any resident posts. **Author or lead** can delete. |

### 4.8 My orders — `app/mcn/my-orders.tsx`

| Aspect | Details |
|--------|---------|
| **Purpose** | The resident's own food pre-orders |
| **Tables** | `mcn_preorder_orders` + `mcn_preorder_order_items` |
| **Rules** | A single list — scoped to `buyer_id = user.id`, sorted newest first, cancelled sinking to the bottom. Each card carries the drop title, host, delivery date/time, items, total, and View drop / Call host / WhatsApp actions. Pre-orders cancel while `confirmed`; `fulfilled` (shown as **Delivered**) and `cancelled` are read-only. |
| **Navigation** | From the MCN hub quick-action bar |

> The **Business Orders** tab was removed on 2026-08-09 along with in-app business ordering, taking the segmented control with it — one list means no tabs. The screen's old `?tab=business` param is inert. See [`disabled-features.md`](disabled-features.md) §2b.

---

## 5. Community tab

`app/(tabs)/community.tsx`

| Aspect | Details |
|--------|---------|
| **Purpose** | Building-level view: events, funds, residents, SOS, community info |
| **Tables / RPCs** | `communities`, `community_events`, `events`, `event_transactions`, `fund_roles`, `profiles`, `funds_access_requests`; RPCs `get_my_community_funds_overview()`, `withdraw_funds_access_request(...)` |
| **Rules** | Section order is fixed: **events ("Happening soon") → funds → manage rows (lead only) → residents/SOS tiles → community info**. The events section shows up to 5 upcoming published events in a horizontal carousel sorted by date, above funds — timely content earns the fold ahead of a funds summary that reads ₹0 for most communities. The hero shows only the community name; the "going around the building" pulse line was intentionally removed. Community info includes a join-code tile with an Invite-neighbors share action; the shared message includes `/api/share-community?id=…` (`api/share-community.ts`) so WhatsApp renders a branded preview card (`get_community_og_card(p_id)` RPC — `communities` has no anon SELECT policy, and the join code itself is never put in the RPC response, only in the plain-text message). The funds request CTA exists only in this section. |
| **Roles** | All residents view. Create-fund and post-event are visible to leads, platform admins, and (for events) the events-coordinator grant. |
| **No president yet** | When `communityHasLead` is false, a notice card sits directly under the hero: "No president yet", stating that neighbourly features all still work and that funds and block in-charges open up once a president is in place, with a link to the residents directory. The funds section replaces its "Request funds support" CTA with an explanation instead. See `architecture.md` §3 → Leaderless communities for what is and is not gated. |

### Community events — `app/events/*`

Cultural, sports, and festival events, posted by a designated **events coordinator** grant or a community lead, with up to 3 call/WhatsApp contacts per event.

| Aspect | Details |
|--------|---------|
| **Tables / RPCs** | `community_events`, `community_event_contacts`, `community_event_organizers`; RPC `upsert_community_event(...)` writes an event and its contacts atomically. Cancelling is a plain `UPDATE community_events SET status = 'cancelled'` under RLS. |
| **Screens** | `/events` (list, Upcoming/Past segments + category chips), `/events/[id]` (detail — contacts, share, edit/cancel/delete for the creator or a lead), `/events/add` (create; `?id=` edits), `/events/coordinators` (lead-only grant management, picks from `get_residents_directory`) |
| **Presentation** | The list uses a poster card: full-width cover at ~11.5% of viewport height (`getNetworkTileImageHeight`, clamped 84–130px — sized so three tiles stay on the fold), top-anchored crop, an overlaid day/month badge, a "Today"/"Tomorrow" pill on the two days that matter, serif title, and the register-by date as a chip. The previous 96px thumbnail row read as a settings list rather than a what's-on feed. The detail screen shows the same photo at 30% (`getMediaHeroHeight`), tappable into `ImageViewer` with a "Tap to view" hint, because the cover is cropped. Category chips render **only for categories the community has actually posted in**, and the row is hidden entirely below two — six permanent chips made an empty screen look like a filter problem. Selecting a category that disappears on a scope switch falls back to "All". **The chip row lives in a fixed-height slot** (`chipsSlot`) — `ChipRowSlider`'s root is a horizontal `ScrollView`, which has no intrinsic height and stretches when dropped straight into a `flex: 1` column, leaving the chips and the animated pill at different vertical offsets so the row jumped between selections. |
| **Fields** | title, category (cultural/sports/festival/meeting/workshop/other), description, image, venue, event date, optional start/end time, optional "requires registration" toggle with a last-date-to-register, optional entry fee (display only — not collected through the app), optional external registration link, 1–3 contacts (name, phone, role label) |
| **Notifications** | Posting an event notifies **every other resident of the community** (`community_event_posted`), and cancelling one notifies them again (`community_event_cancelled`, appending the cancellation note). Both are database triggers, so the notification cannot be skipped by a client that writes the row a different way, and both deep-link to `/events/[id]`. Editing an event does **not** re-notify — `upsert_community_event()` edits with an UPDATE and the post trigger is INSERT-only. |
| **Rules** | Residents cannot post — enforced in RLS via `is_event_organizer()` OR `is_community_lead()`, not just hidden in the UI. A resident becomes a coordinator only via a grant row in `community_event_organizers`, managed by leads on `/events/coordinators`; this is **not** a new `app_role` value (that enum is single-valued per profile — see `docs/CLAUDE.md` §9). No in-app RSVP — contacts and an optional external link are the only ways to reach the organizers; the UI states this so nobody expects a held seat. A cancelled event stays visible with a "Cancelled" badge rather than disappearing. Community tab shows up to 5 upcoming events; `/events` shows the full list. |
| **Roles** | All residents view. Post/edit/cancel/delete: creator, any lead, or (create/edit only) an events coordinator. Delete additionally allowed to platform admins. Coordinator grants: lead only. |

### Funds activation states

Rendered by the funds section based on `communities.funds_enabled`:

| State | UI |
|-------|-----|
| Inactive, no request | CTA card "Request funds support" → `/funds-access/request` |
| Pending | Pending-review card with requester name, date, phone; withdraw shown to the requester only |
| Rejected | Rejection reason plus "Request again" |
| Previously active | Post-revocation note |
| Active | Merged Community funds card with health summary and "Open community funds" |

Platform approval enables funds **and promotes the designated resident to `president`** in the same transaction. Revocation disables funds and blocks while preserving ledger history.

### Funds access request — `app/funds-access/request.tsx`

Contact name and phone required; purpose optional, capped at 280 characters. Writes via `submit_funds_access_request(...)`, refreshes status from `get_funds_access_status(...)`, and returns to the Community tab where the CTA becomes the pending state. Any resident of a funds-inactive community **that has a president or vice president** can submit.

Without a lead the screen renders an explanation and a "Back to community" button instead of the form. It guards itself rather than trusting its entry point — the route is deep-linkable and reachable from a stale notification.

### Blocks / towers — `app/community/blocks.tsx`

Blocks are optional per community and **decoupled from funds activation**. `communities.block_label` chooses the noun ("Block" or "Tower") used everywhere.

**Changed 2026-08-14: the president can no longer create, archive, or switch off blocks.** The screen is now read-plus-rename: it lists every block with its resident and in-charge counts, explains that block setup is handled by the Wooru team, and offers a Rename action. The enable/disable switch and the "Add block" field are gone, and the underlying RPCs are revoked at the database (see `architecture.md` §5 → Funds and blocks), so hiding the controls actually removes the capability. Rationale: block inventory determines resident flat scoping, fund collection scopes, and the per-block collector cap; turning it off unscoped every resident and in-charge in a single tap. Archiving went with it because, with `add_community_block()` revoked, archiving would be a one-way door a president could not undo.

| Aspect | Details |
|--------|---------|
| **RPCs** | `list_community_blocks`, `rename_community_block`. Create / archive / toggle live in the admin console only (`platform_add_community_block`, `platform_archive_community_block`, `platform_set_blocks_enabled`) |
| **Rules** | Per-block resident and in-charge counts are shown so a lead can see the shape of the community. All labels come from `blockLabel` in AuthContext. **The fetched block list renders whenever it is non-empty, independent of `blocksEnabled`** — that value resolves in a second, non-blocking phase (see the known trap in `CLAUDE.md` §9), so gating the list on it would blank the screen on first paint. With no blocks, the empty copy branches on `blocksEnabled` to say either "none set up yet" or "blocks are turned off", both pointing at support. |
| **Lifecycle** | Platform admins seed blocks at community-approval time (setting `blocks_enabled = true` and the label) and maintain them thereafter. Joining residents pass through `/community-join-block`. Profile shows a block picker only while blocks are active. Contribution flows load contributors through `list_eligible_contributors_for_collector(...)` so block in-charges see only their own residents. |
| **Roles** | Lead only (view + rename); platform admin for everything structural |

### Flats inventory — `app/community/flats.tsx`

Lead-managed canonical unit inventory for the community.

| Aspect | Details |
|--------|---------|
| **RPCs** | `list_community_flats`, `add_community_flats`, `archive_community_flat`, `list_pending_flat_addition_requests`, `review_flat_addition` |
| **Rules** | Community leads can view flats grouped by block/floor, bulk-add flat lists (comma/newline separated), and archive units. In addition, leads review resident flat addition requests with one-tap approve or reject (with reason) workflows. Approving a request automatically assigns the flat to the requesting resident. The "no blocks set up yet" empty state only renders once the initial load finishes (`loading && blocks.length === 0` shows a spinner instead) — otherwise it flashed briefly on every screen open, before blocks had loaded, even for communities with blocks already configured. |
| **Roles** | Lead only |

### SOS — `app/sos/index.tsx`, `app/sos/donor.tsx`, `app/sos/manage-contacts.tsx`

| Aspect | Details |
|--------|---------|
| **Purpose** | Fast one-tap emergency surface: emergency directory plus blood donor registry |
| **Tables** | `emergency_contacts`, `blood_donors`, `profiles` |
| **Emergency rules** | Merges global defaults (`community_id IS NULL`) with community rows, grouped by category (hospital, ambulance, police, fire, security, helpline, other — see `constants/sos.ts`) and sorted by `sort_order` then `name`. **Every dial passes through a call-confirm dialog** — via `confirmAction`, not `Alert.alert`, which is a no-op on web and left the Call button doing nothing at all in the PWA until 2026-08-14. |
| **Global directory** | The 14 national helplines (112, 108, 102, 100, 103, 101, 1091, 1098, 14567, 1073, 1078, 1930, 1906, 1912) are seeded as `community_id IS NULL` rows and visible to every community. They were seeded when SOS shipped but the rows were gone from production, leaving every community's SOS screen empty; re-asserted by `20260908000100`. Because `db push` tracks migrations by filename, re-running the original seed file is a no-op — a data fix like this always needs a new migration. Community-specific numbers (security desk, nearest hospital) remain the president's job in `/sos/manage-contacts`. |
| **Donor rules** | Opt-in only. One donor profile per resident per community: blood group, phone, availability toggle, short note — editable and deletable at any time. The list defaults to available donors with a blood-group filter and an optional show-all toggle. Display names resolve from `profiles.full_name` at read time so they stay current. |
| **Roles** | All residents view and maintain their own donor row. `/sos/manage-contacts` is lead/platform-admin only. Platform admins additionally manage global rows. |
| **Navigation** | Header back buttons call `goBackSmart` (`/sos/*` → `/sos` → `/community`) — previously raw `router.back()`, which is a silent no-op when the screen is deep-linked or freshly loaded with no history to pop. See `lib/navigation.ts`'s `getImmediateParentRoute()`. |

### Residents directory — `app/residents.tsx`

| Aspect | Details |
|--------|---------|
| **RPCs** | `get_residents_directory(p_include_phone)`; `community_lead_remove_resident(p_target_profile_id)` |
| **Rules** | Active residents only, grouped by block when `blocks_enabled`. Emails always visible; **phone numbers only to leads and platform admins**. Leads open a resident sheet and can remove non-lead residents (via `confirmAction`, so it works in the PWA). Role badges render President / Vice President / Resident. When the community has no lead at all, a notice strip above the list says so — otherwise residents have to infer it from the absence of a badge on every row. Accepts `?returnTo=community\|profile`. |

---

## 6. Funds

### Funds home — `app/funds/index.tsx`

Fixed layout: fund health summary on top, then the list of all community funds via `FundsList`. RPC `get_my_community_funds_overview()`. All residents view; create is lead/platform-admin gated.

### Add fund — `app/funds/add.tsx`

Title required. **Exactly one treasurer must be selected** (leads and platform admins are excluded from the treasurer picker). The fund starts with `goal_amount = 0` and `event_date = now`. The route blocks access when funds are inactive or the caller is not a lead or platform admin. Redirects to `/funds/[id]`.

### Fund detail — `app/funds/[id].tsx`

| Aspect | Details |
|--------|---------|
| **Tables** | `events`, `event_transactions`, `fund_roles`, `profiles`, `community_flats` |
| **Rules** | Treasurers manage collectors and all transactions; collectors add contributions only; residents are view-only. Leads are treated as treasurer-level. **Exactly one treasurer per fund** (enforced by migration `20260813000000` and `fund_role_guard`). In block-enabled communities, assigning a collector requires choosing a block — there is no all-residents option in that flow. The screen shows a Contributions list (income with contributor details) and a separate Expense list. Contributions list resolves occupant names and flat labels from the stored snapshot columns (`contributor_name` and `contributor_flat_id`), with legacy fallback to profile mappings. Shows collection coverage badge `{n} of {totalFlats} flats collected` for progress tracking. Leads can mark a fund **closed** (`is_closed`), blocking further transactions and edits. If funds are inactive, stale links render a safe inactive state instead of loading ledger actions. |
| **Role banner** | The "You are a …" line shows the viewer's **actual role** — President, Vice President, Platform admin, Treasurer, Block in-charge, Collector, or Resident. `getEffectiveFundRole()` collapses `admin`/`president`/`vice_president` into one internal `'admin'` fund capacity, so `formatRoleForFundContext()` takes `appRole` as a third argument to name the person correctly rather than showing a generic "Fund admin". What they can *do* is stated separately by the Role Access card underneath (`getRoleAccessSummary`). Same banner on the Add transaction screen. |
| **Navigation** | → `/funds/add-transaction?event_id=…&type=income\|expense` |

### Add transaction — `app/funds/add-transaction.tsx`

| Aspect | Details |
|--------|---------|
| **RPC** | `list_collection_targets_for_collector` |
| **Rules** | Contribution mode uses the block-aware collection target list (grouping flats by floor with quick search by flat/occupant name) and disables flats that have already contributed. A block-scoped collector only sees flats of their assigned block; a collector with no block, the treasurer, and leads see every flat. Prefills occupant name in an editable Payer name input field. Saves flat ID, user ID (if signed up), and snapshot name. Expense mode requires title and amount and never sets contributor columns. Supports an optional receipt image (`event_transactions.image_url`). Tapping an existing contribution or expense row reopens this screen pre-filled for editing, resolving historical payer details off the transaction snapshot columns. Inactive funds render a graceful error state. |
| **Amount** | At most 2 decimal places and at most **₹10,00,000 per entry**, checked in the form and enforced by the ledger trigger. |
| **Outside sponsor** | Leads (and platform admins) get a **Community member / Outside sponsor** toggle in contribution mode. Sponsor mode replaces the resident picker with a sponsor name (required), phone, and note, and does not prompt for the caller's block. A sponsor row shows on the fund detail Contributions list as "Outside sponsor" and can only be reopened for editing by a lead — collectors and treasurers see it as read-only. |
| **Roles** | Add/edit member contribution: collector, treasurer, or lead. Add/edit **sponsor** contribution: lead only. Add/edit expense: treasurer or lead only. |

---

## 7. Profile tab

`app/(tabs)/profile.tsx`

| Aspect | Details |
|--------|---------|
| **Purpose** | Account-level hub only — identity, reminders, submissions, sign-out |
| **RPCs** | `get_my_due_soon_count()`, `get_my_recent_service_history(p_limit)` |
| **Rules** | **No building-level content here** — community metadata and the residents directory belong to the Community tab. The settings card shows the community role and, when applicable, a separate fund-access badge (Treasurer or Collector) so fund permissions are explicit. A block picker appears only while blocks are active. The identity card no longer shows a profile photo — removed to save space; see Edit profile. Legal is two rows, "Terms of service" and "Privacy policy", each deep-linking to its own tab. |
| **Sign-out destination** | **Web lands on the public home page at `/`, not the login form** — signing out means "I'm done", not "log me in as someone else", and the deployed root already serves the marketing page (`build-admin.js` puts `public/landing.html` at `dist/index.html`). Native has no landing page and goes to `/login`. Both paths go through `goToLanding()` in `lib/siteUrl.ts`, which returns `false` on native so the caller falls through — and which returns `/landing.html` instead of `/` under `__DEV__`, because the Expo dev server serves the SPA at `/` and redirecting there would loop. The same helper is used by `/admin-redirect` and `/community-request-submitted`. |
| **Navigation** | → `/profile/edit`, `/services`, `/mcn/my-posts`, `/legal?doc=terms`, `/legal?doc=privacy`; `/` (web) or `/login` (native) after sign-out |

### Edit profile — `app/profile/edit.tsx`

Name updates apply directly. Email updates send a verification link to the new address before taking effect (`supabase.auth.updateUser` plus a `profiles` write). Empty names are rejected.

**Profile photo removed** — there is no upload/display here or on the Profile tab identity card. `avatar_url` (often a Google OAuth photo) is still round-tripped unchanged on every save so it isn't wiped, and `components/Avatar` still renders it (falling back to an initials monogram) everywhere else in the app — residents list, provider/post cards, comments.

**Flat/`{blockLabel}` is locked once set** — `FlatPicker` (backed by `community_flats`, saved via `set_my_flat(p_flat_id)`) only renders while `profile.flat_id` is still null, i.e. for a resident who hasn't picked one yet. Once set, the field becomes a read-only row (block + flat number, lock icon, "ask your president to update it" hint) resolved via `list_community_flats`. Locked state is captured once on load (`isFlatLocked`), not derived from the live picker value, so it can't be un-set by picking-then-clearing in the same session.

### Personal service reminders — `app/services/*`

**User-scoped, not community-scoped** — these queries never pass `communityId`.

| Screen | Details |
|--------|---------|
| **List** (`index.tsx`) | Reads `get_my_upcoming_services()`. Refreshes on screen focus (`useFocusEffect`); sorted by next due date and urgency. |
| **Add** (`add.tsx`) | Required: `service_name`, `category`, `last_serviced_on`, `frequency_months`. Date cannot be in the future; frequency is 1–60 months. Cross-platform date picking via `DateField` (`<input type="date">` on web). Notes capped at 500 characters with live counter. Images stored as `images` JSONB array (up to 3 images with titles). Choosing a category pre-fills default frequency. Provider picker searches by name/phone. Saves via `goBackSmart`. |
| **Detail / edit** (`[id].tsx`) | Reads the row directly from `user_services` by ID. Honest mark-done (no fake optimistic badge flash); single 4-arg RPC `mark_service_done(p_service_id, p_provider_id, p_cost_paid, p_note)` logs to `user_service_history` and resets notification count. Editing preserves provider link even if provider list is filtered or fails loading (`providerLinkUnresolved`). History edits automatically reconcile `user_services.last_serviced_on` via DB trigger. Technician button routes to Help tab Providers segment with category filter. |
| **Surfaces** | `components/UpcomingServicesCard.tsx` sits on the Help tab (refreshes on focus; "Find tech" routes to Help tab provider segment). Profile shows badge count and "{N} due or overdue" label from `get_my_due_soon_count()`. `notify_due_services()` creates `service_reminder` notifications on a repeating cadence (at most 1 per 6.5 days, capped at 5 per cycle) driven daily by `check_due_services` Edge Function. |

### Terms & privacy — `app/legal.tsx`

| Aspect | Details |
|--------|---------|
| **Purpose** | In-app reading surface for Terms of Service and Privacy Policy |
| **Data** | Single source of truth in `data/legal.ts` (DPDP Act 2023 compliant) |
| **Rules** | Segmented control switches between Terms of Service and Privacy Policy. Deep-linkable via `?doc=privacy` or `?doc=terms`. Scroll position resets on tab change. Full Verandah styling with support for callouts, tables, bullet lists, subheadings, and tappable contact/internal links. |
| **Public links** | Each document also has a standalone public URL — `wooru.in/terms` and `wooru.in/privacy`, static HTML generated from `data/legal.ts` by `npm run legal:html` and served via the `vercel.json` rewrites. The in-app footer shows the URL for the active document with "Open in browser" and "Share link" actions, so it can be handed to an app store listing, an OAuth consent screen, or a WhatsApp message without routing anyone through the app. |
| **Navigation** | Reachable post-auth via **two** Profile menu rows — "Terms of service" (`/legal?doc=terms`) and "Privacy policy" (`/legal?doc=privacy`) — rather than one combined "Terms & privacy" row, since each document has its own public URL and residents look for them by name. Pre-auth from the Login screen (`/legal?returnTo=login`). Header back button maps to `/profile` via `goBackSmart`. |
| **Placeholders** | `LEGAL_ENTITY` in `data/legal.ts` still holds bracketed placeholders (`[LEGAL ENTITY NAME]`, `[REGISTERED ADDRESS]`, `[CONTACT EMAIL]`, `[GRIEVANCE OFFICER NAME]`, `[JURISDICTION CITY]`, `[LIABILITY CAP]`) and both documents carry a "Draft pending legal review" callout. This is deliberate and unresolved — the copy needs real values before launch. Run `npm run legal:html` after filling them in, or the public pages will keep serving the draft. |

---

## 8. Notifications

`app/notifications.tsx`

| Aspect | Details |
|--------|---------|
| **Tables** | Reads/writes `notifications` |
| **Rules** | Users mark individual rows or the whole list as read. Funds-activation types (`funds_access_requested`, `funds_access_approved`, `funds_access_rejected`, `community_lead_appointed`, `funds_access_revoked`) are handled alongside the core flows; legacy promotion and admin-review payloads are still recognized so old rows stay tappable; unknown types fall through safely. |
| **Routing** | `new_visit` → `/visits/[id]` · `service_reminder` → `/services/[id]` · `community_event_posted` / `community_event_cancelled` → `/events/[id]` · community approval/rejection/removal → `/community-select` · funds-requested and legacy promotion/admin-review → platform approvals · funds approval, rejection, lead appointment, revocation → Community tab |
| **Real-time** | Supabase Realtime `INSERT` subscription on the signed-in user's rows; updates local state and fires a local native alert on mobile. |

---

## 9. Role-based access matrix

*Lead* = `president` or `vice_president`. Platform admins hold lead-equivalent rights plus the console-only capabilities in [`platform-admin.md`](platform-admin.md).

| Capability | Resident | Lead | Treasurer | Collector |
|-----------|----------|------|-----------|-----------|
| **Providers & visits** |
| View / search providers | ✅ | ✅ | — | — |
| Add provider | ✅ | ✅ | — | — |
| Rate, save, note a provider | ✅ | ✅ | — | — |
| Report provider | ✅ | ✅ | — | — |
| Delete provider | ❌ | ✅ | — | — |
| Create visit | ✅ | ✅ | — | — |
| Join / leave visit | ✅ | ✅ | — | — |
| Change visit status / reschedule | creator only | creator only | — | — |
| **Funds** |
| View funds | ✅ | ✅ | ✅ | ✅ |
| Create fund | ❌ | ✅ | — | — |
| Assign treasurer | ❌ | ✅ | — | — |
| Assign collectors | ❌ | ✅ | ✅ | — |
| Add contribution | ❌ | ✅ | ✅ | ✅ |
| Edit existing contribution | ❌ | ✅ | ✅ | ✅ |
| Add / edit outside-sponsor contribution | ❌ | ✅ | ❌ | ❌ |
| Add expense | ❌ | ✅ | ✅ | ❌ |
| Close / reopen fund | ❌ | ✅ | — | — |
| **Community** |
| View residents directory | ✅ | ✅ | — | — |
| See resident phone numbers | ❌ | ✅ | — | — |
| Remove non-lead resident | ❌ | ✅ | — | — |
| Manage blocks / towers | ❌ | ✅ | — | — |
| Manage emergency contacts | ❌ | ✅ | — | — |
| Register as blood donor | ✅ | ✅ | — | — |
| **MCN — business** |
| View / search listings | ✅ | ✅ | — | — |
| Create listing | ✅ | ✅ | — | — |
| Manage listing (toggle, offerings) | own only | own **or any** | — | — |
| Delete listing | own only | own **or any** | — | — |
| Contact owner (call / WhatsApp) | any but own | any but own | — | — |
| **MCN — food drops** |
| Browse drops | ✅ (also anonymous) | ✅ | — | — |
| Publish drop | ✅ | ✅ | — | — |
| Place / edit / cancel own pre-order | ✅ | ✅ | — | — |
| Manage drop, mark fulfilled, complete | creator | creator | — | — |
| Delete drop | own only | own **or any** | — | — |
| **MCN — carpools** |
| Browse rides | ✅ | ✅ | — | — |
| Publish ride | ✅ | ✅ | — | — |
| Request a seat | ✅ (not own) | ✅ (not own) | — | — |
| Accept / reject requests | host | host | — | — |
| Edit / delete ride | own only | own **or any** | — | — |
| **MCN — parents & schools** |
| View parent corner | ✅ | ✅ | — | — |
| Add / edit child entry | own only | own **or any** | — | — |
| Delete child entry | own only | own **or any** | — | — |
| View / compare schools *(hidden)* | ✅ | ✅ | — | — |
| Add school *(hidden)* | ✅ | ✅ | — | — |
| Submit / edit report card *(hidden)* | own only | own only | — | — |
| Delete school listing *(hidden)* | ❌ | ✅ | — | — |
| **MCN — posts** |
| View / add borrow post *(hidden)* | ✅ | ✅ | — | — |
| Close / delete post *(hidden)* | own only | own **or any** | — | — |

*(hidden)* = the permission is unchanged in the database, but the UI that exercises it is flagged off — see [`hidden-features/`](hidden-features/README.md).
| **Personal** |
| Service reminders | ✅ own | ✅ own | ✅ own | ✅ own |
| Hire feedback (private) | ✅ own | ✅ own | — | — |
| View own orders | ✅ | ✅ | — | — |

---

## 10. External integrations

| Integration | Used by | How |
|-------------|---------|-----|
| Supabase Auth | Login, signup, password reset | Email/password with persisted AsyncStorage session |
| Google Sign-In | Login | `@react-native-google-signin/google-signin` token exchange; dev build required |
| Supabase Realtime | Notifications | `postgres_changes` INSERT subscription on `notifications` |
| Edge Function `check_due_services` | Reminders | Daily call to `notify_due_services()`; scheduled in the Supabase dashboard at `30 3 * * *` (9 AM IST) |
| Edge Function `fraud-check` | Add provider | Returns a verdict stored in `service_providers.fraud_status` and `fraud_verdicts` |
| Cloudinary | Listing covers, product photos, drop images, expense receipts | Unsigned HTTP upload via `expo-image-picker` and `components/ImageUploader.tsx` |
| Expo Notifications | Reminders, hire feedback | Permission request, Android channel, local scheduling |
| Phone dialer | Providers, visits, SOS, listings, carpools, orders | `Linking.openURL('tel:...')` |
| WhatsApp | Providers, listings, orders, carpools | `whatsapp://send` or `https://wa.me/` |
| Native Share | Join code, providers, food drops, parent entries | `Share.share()` |
| DateTimePicker | Visits, reminders, drops, carpools | `@react-native-community/datetimepicker` |

---

## 11. Removed product surface

**Resident marketplace** — removed, not hidden. `app/business/*` is deleted and `resident_businesses`, `business_offerings`, `business_inquiries` were dropped in `20260422010000_simplify_roles_and_remove_marketplace.sql`. Provider favorites and ratings became single-target as a result. MCN replaced this surface. See [`disabled-features.md`](disabled-features.md).

**Cross-community federation** — backend live, no UI. See [`cross-community.md`](cross-community.md).

---

## 12. Public marketing landing page

| | |
|---|---|
| **File** | `public/landing.html` — a **standalone static page**, not an Expo screen. Shipped to `dist/index.html` by `build-admin.js`; see [`CLAUDE.md`](CLAUDE.md) §9 for why a `vercel.json` rewrite cannot do this. |
| **Purpose** | Public marketing page at `wooru.in/`. Drives sign-ups; every CTA links to `/login`. |
| **Tables** | None. Fully static — no Supabase client, no data fetching. |

**Redesigned 2026-08-14** from the `design_handoff_landing_page` bundle. Sections top→bottom: sticky header · hero · arch colonnade graphic · feature bento (`#platform`) · food-drops spotlight · transparency panel (`#funds`) · how it works (`#how`) · who it's for (`#roles`) · FAQ (`#faq`) · CTA · footer.

**Interactions** — all vanilla JS in one inline `<script>` at the bottom: header shadow past 8px scroll · IntersectionObserver scroll-reveal (staggered, with a 2.6s safety net that force-reveals everything) · decorative parallax on the arch watermarks · role tab rail (`aria-selected`, Residents default) · single-open FAQ accordion (first row open, clicking the open row closes it). `prefers-reduced-motion` skips reveal and parallax entirely.

**Rules for editing it**

- **It must render fully with JavaScript disabled.** Google's OAuth brand reviewer reads the page without JS. Scroll-reveal only engages after an inline head script adds `.wn-js` to `<html>`; the FAQ and role panels carry their default open/closed state in the markup. Never gate content behind a script that must run first.
- **Marketing copy may only claim active features.** The live-vs-do-not-advertise list in [`hidden-features/mcn-schools-and-borrow.md`](hidden-features/mcn-schools-and-borrow.md) §Landing page redesign is the source of truth — schools, borrow & share, in-app business ordering, federation, and web push must stay off the page.
- Self-contained: the only external requests are the two Google Fonts families (Instrument Serif + Plus Jakarta Sans). No CDN scripts.
- The logo is the app's own `/images/icon-512.png`. Do not add a second copy of the mark.
- Verandah tokens do **not** apply here — the page has its own `--wn` CSS custom properties in `:root`, matching the Verandah palette by value. [`verandah.md`](verandah.md) governs the app, not this file.

**PWA install banners** — Android/Chrome and iOS Safari have no shared install API, so each gets its own surface, on both the landing page and inside the app:

| Platform | Landing page (`public/landing.html`) | In-app (mounted in `app/_layout.tsx`) |
|---|---|---|
| Android / desktop Chrome | `#wn-install` header button, revealed on `beforeinstallprompt` with a pulsing highlight (static colour fallback under `prefers-reduced-motion`); a bottom "Wooru installed / Open" snackbar (`#wn-open-toast`) appears on `appinstalled` and auto-hides after 8s; every "Get started" CTA on the page swaps to "Open app" → `/network` once installed. | `PwaInstallBanner` — same `beforeinstallprompt` gate, dismissible with a 3-day cooldown. |
| iOS Safari | `#wn-ios-install` — Safari never fires `beforeinstallprompt`, so this is a purely instructional bottom banner ("Add Wooru to your home screen — Tap Share, then \"Add to Home Screen\""), shown ~1.5s after load and left open (no auto-hide) so the user has time to find the Share button. | `IosInstallBanner` — same copy and gating, mounted alongside `PwaInstallBanner`. |

Both iOS surfaces gate on Safari specifically (`isIOSSafari()` — excludes `CriOS`/`FxiOS`/`EdgiOS`/`OPiOS`, whose Add to Home Screen flow differs) and offer **two** dismiss paths, because iOS gives no way to detect an existing install from a Safari tab (`navigator.standalone` reads `false` there even once installed): a **×** sets a 7-day cooldown, and a separate **"Already added"** action sets a permanent flag so a user who has already installed is never nagged again. `lib/pwaInstall.ts` (`isIOSSafari`, `isRunningAsInstalledPwa`) is the shared source for the in-app banner; the landing page duplicates the same detection logic since it is a static file outside the bundle — see the comment at each site pointing at the other.

`NotificationPermissionBanner` (also mounted in `_layout.tsx`) is a related but separate concern — it asks for `Notification` permission once installed, on any platform. See [`disabled-features.md`](disabled-features.md) §8 for why granting it does not yet result in any delivered notification.
