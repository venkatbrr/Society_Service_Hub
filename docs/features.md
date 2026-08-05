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
| MCN tab | hub, business, drops, carpools, parents, schools, posts, orders | [§4](#4-mcn--my-community-network) |
| Community tab | funds status, blocks, SOS, residents | [§5](#5-community-tab) |
| Funds | list, add, detail, transactions, access request | [§6](#6-funds) |
| Profile tab | profile, edit, reminders, hire feedback | [§7](#7-profile-tab) |
| Notifications | feed | [§8](#8-notifications) |
| Platform admin | web console (5 pages) | [`platform-admin.md`](platform-admin.md) |
| Access matrix | who can do what | [§9](#9-role-based-access-matrix) |
| Integrations | external services per screen | [§10](#10-external-integrations) |

**Role vocabulary used throughout**: *Resident* = any community member · *Lead* = `president` or `vice_president`, checked via `isCommunityLead` · *Platform admin* = `app_role = 'admin'` with no community. The string `community_lead` is a dead legacy value — never test for it.

---

## 1. Authentication & onboarding

### Login — `app/login.tsx`

| Aspect | Details |
|--------|---------|
| **Purpose** | Sign up or sign in with email/password or Google |
| **Tables** | `auth.users` via Supabase Auth; a trigger auto-creates the `profiles` row |
| **Rules** | Email must contain `@`. Sign-up requires full name plus matching password and confirmation. Flat number is **not** collected here — `profiles.flat_number` stays optional and is captured later by flows that need it. Signing up with an already-registered email flips the form to sign-in mode and suggests Forgot password. Google sign-in exchanges the native or web identity token with Supabase and always prompts account selection rather than silently reusing the last account. |
| **Navigation** | Entry point when unauthenticated. Links to `/forgot-password`. Post-auth routing belongs to the root layout, which restores any saved deep-link target. |
| **Integrations** | Supabase Auth, Google Sign-In (needs a dev build — not Expo Go) |

### Forgot password — `app/forgot-password.tsx`

Sends a Supabase reset email. Email must contain `@`. Reset URL uses the `societyservicehub://reset-password` deep-link scheme. Returns to `/login`.

### Community select — `app/community-select.tsx`

| Aspect | Details |
|--------|---------|
| **Purpose** | Join an existing community by code, or start a new-community request |
| **RPC** | `join_community_by_code(p_code)` |
| **Rules** | 6-character uppercase alphanumeric code. Joining is **immediate — there is no resident approval queue**. On success the screen calls `refreshSession()` so `communityId` is populated before redirecting. If the joined community has `blocks_enabled = true`, the user is routed to `/community-join-block` first. |
| **Navigation** | → `/community-join-block` or `/(tabs)`; → `/community-request` for a new community |

### Community join block — `app/community-join-block.tsx`

| Aspect | Details |
|--------|---------|
| **Purpose** | Capture flat number and block/tower right after joining a block-enabled community |
| **Tables** | Writes `profiles.flat_number` and `profiles.block_id` |
| **Rules** | Appears only when `blocks_enabled = true`. **Mandatory — cannot be skipped.** Flat number normalizes to uppercase with spaces and hyphens stripped on blur. Block is chosen from a dropdown. All copy uses the community's `block_label` ("Block" or "Tower"). |
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
| **Rules** | Sorted by `avg_rating` descending. Two-level filter: a group row (All Services, Home Support, Repairs & Maintenance, Healthcare & Wellness, Personal Care, Transport & Vehicle Care, Events & Occasions, Education & Coaching, Government & Docs, Other) then a category chip row scoped to the active group. Selecting a group applies `.in('category', groupCategories)`; selecting a category applies `.eq('category', …)`. Groups come from `CATEGORY_GROUPS` in `constants/categories.ts`. |
| **State** | `selectedCategory: string \| null` and `selectedGroupCategories: string[] \| null`, both reset on tab switch and search clear, both in `fetchProviders` dependencies |

### Service visits segment

| Aspect | Details |
|--------|---------|
| **Rules** | Rendered as a `SectionList` grouped by category — each header shows the category emoji (`getServiceCategoryEmoji`), name, and a count badge; sections sort busiest-first and empty categories are hidden. Sub-tabs: Upcoming, Recent (past ≤30 days), Archived (>30 days). Cancelled visits move to Past/Archived immediately regardless of planned date. Past and Archived rows never show an `upcoming` badge even when a stale row still carries that status. |

### Add provider — `app/provider/add.tsx`

| Aspect | Details |
|--------|---------|
| **Tables** | Writes `service_providers`; optionally `provider_personal_notes` |
| **Rules** | Required: name, phone, category. Categories come from `constants/categories.ts` via the same grouped picker as the Help tab. Category-specific structured fields come from `constants/providerDetails.ts` and land in `service_providers.details` (JSONB). No salary input — pricing goes in the freeform description. A private "Personal note" can be captured at save time and is visible only to its author. Phone accepts flexible formats (including country code), then normalizes to a validated 10-digit mobile before duplicate check, fraud check, and insert. **A duplicate normalized phone in the same community routes the user to the existing provider instead of creating a row.** Creation runs the `fraud-check` Edge Function and stores the verdict in `service_providers.fraud_status` (and a row in `fraud_verdicts`). |
| **Roles** | Any resident |

### Provider detail — `app/provider/[id].tsx`

| Aspect | Details |
|--------|---------|
| **Tables** | Reads/writes `service_providers`, `favorites`, `ratings`, `provider_hires`, `provider_reports`, `provider_personal_notes` |
| **Rules** | Ratings are 1–5 stars, one upserted row per user. Review text can be edited without re-tapping stars when a rating already exists. Community reviews list reviewer name, optional flat number, stars, and text — collapsed to the first 3 with a Load more / Show less toggle. Contact actions log a hire and schedule the local 24-hour feedback reminder. A private Personal note editor replaces the old history card. Experience Details stay hidden here. Residents get **Report provider** with fixed reasons (Wrong info, Spam, Inappropriate, No longer available, Other), once per provider; reports notify leads. Leads and platform admins get **Delete provider** instead of report. |
| **Navigation** | From Help, Saved, Visit Detail, and the reminder technician lookup |
| **Integrations** | Phone dialer, WhatsApp, native Share |

### Add visit — `app/visits/add.tsx`

Required: title, category, provider context, date. Categories use the same two-level grouped picker. Users either link an existing provider ("Select existing provider") or type a manual name and phone; manual phone/WhatsApp accept flexible input but normalize to validated 10-digit mobiles. Dates are stored as local calendar dates (`YYYY-MM-DD`) to avoid timezone rollover. New visits start `upcoming`.

### Visit detail — `app/visits/[id].tsx`

| Aspect | Details |
|--------|---------|
| **Tables / RPC** | `service_visits`, `visit_joiners`, `profiles`; RPC `get_visit_joiners` |
| **Rules** | Joiners can add a flat number and note; the join modal seeds the flat number from `profile.flat_number` and normalizes edits on blur. **Only the creator** changes status (`upcoming` → `in_progress`/`completed`/`cancelled`) or reschedules an upcoming visit. Rescheduling updates date/time and emits a `visit_rescheduled` notification to other residents. Mark-complete, reschedule, and cancel are visible only while the visit is `upcoming`. Date parsing is local date-only so status classification is timezone-stable. Back navigation restores prior Help tab state via params. |

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
| **Tables** | Count-only reads: `mcn_listings`, `mcn_preorder_drops`, `mcn_carpools`, `mcn_parent_corner`, `schools`, `mcn_posts` |
| **Rules** | Two quick actions (My Orders, My Submissions) above four section cards, each showing a live count fetched in a single `Promise.all`. The schools count adds curated `WEST_HYDERABAD_SCHOOLS` to community rows. Counts refresh on focus and on pull-to-refresh. |
| **Cards** | Pre-order Food & Community Business → `/mcn/drops` (open drops + active listings) · Community Carpooling → `/mcn/carpools` (active rides) · Parent Corner → `/mcn/parents` (children listed) · Schools Catalog & Compare → `/mcn/schools` (schools cataloged) |

### 4.2 Business listings — `app/mcn/business.tsx`

| Aspect | Details |
|--------|---------|
| **Purpose** | Directory of resident-run businesses |
| **Tables** | `mcn_listings`, `mcn_business_categories`, `mcn_products`, `ratings`, `profiles` |
| **Rules** | Community-scoped with 300 ms debounced name search. A horizontal category chip bar filters by `category_id`; tapping the active chip returns to All. Listings are grouped by category into collapsible sections, with active listings sorted ahead of paused ones and inactive listings kept visible behind an inactive badge. Cards show summary only (image, owner, category badge) — offerings and prices appear after opening the listing. |
| **Roles** | All residents view and create. Owner or lead can manage and delete. |

### Add listing — `app/mcn/listing-add.tsx`

Business name required (max 80). Category required, from the `mcn_business_categories` lookup. Description optional (max 280). Contact phone required, normalized to 10 digits. Navigates to the manage screen on success.

### Listing detail & order — `app/mcn/listing/[id].tsx`

| Aspect | Details |
|--------|---------|
| **Tables** | `mcn_listings`, `mcn_business_categories`, `mcn_products`, `mcn_orders`, `mcn_order_items`, `profiles` |
| **Rules** | Offerings split by `item_type` into Products and Services, each row showing name, optional description, availability, and either `₹ amount / unit` or **"Price on request"** when `price IS NULL`. Quantity steps are **0.5 for kg/litre and 1 for piece/dozen/box/pack**, minimum 0. The cart shows line items and a subtotal; the note is optional. The action button either places a new order or updates an existing pending order (deletes old items, inserts new). Direct Call and WhatsApp links. |
| **Roles** | Any resident except the owner can order. Owner **or lead** sees the Manage action in the header. |

### Manage listing — `app/mcn/listing/manage/[id].tsx`

| Aspect | Details |
|--------|---------|
| **Rules** | Toggle listing active/paused, edit details including category, and manage offerings. The offering modal supports `item_type` (`product`/`service`) and an optional price — blank stores `NULL` and renders as "Price on request". Deleting a product is blocked when order items reference it. The whole listing can be permanently deleted. |
| **Roles** | **Owner or lead.** The screen enforces this itself: a non-owner, non-lead is toasted and redirected to `/mcn/business`. |

### Orders received — `app/mcn/listing/orders/[id].tsx`

Orders grouped Pending / Fulfilled / Cancelled. The WhatsApp button pre-fills a message with items and total. Pending orders can be marked fulfilled or cancelled behind a confirmation. Owner only.

### 4.3 Pre-order food drops — `app/mcn/drops/*`

Routes: `index` (catalog) · `add` · `[id]` (detail + ordering) · `manage/[id]` (host dashboard) · `manage/index`

| Aspect | Details |
|--------|---------|
| **Purpose** | Time-gated group ordering for home chefs and food businesses — weekend specials, home baking, pop-up meals |
| **Tables** | `mcn_preorder_drops`, `mcn_preorder_items`, `mcn_preorder_orders`, `mcn_preorder_order_items`, `mcn_listings`, `profiles` |
| **Catalog rules** | Tabs: Active / Closed / My drops, ordered by `cutoff_at` ascending. Signed-in users additionally get per-drop order counts, item quantities, and revenue metrics (total, completed, order count), computed client-side while excluding cancelled orders. Anonymous viewers see only `status = 'open'` drops. Cards show host identity (name plus flat number when available), the linked business listing when present, and side-by-side close/delivery timing chips. A `?id=` param redirects into the drop detail (web deep-link bridge). |
| **Publish rules** | A drop specifies title, prep notes, fulfillment date, fulfillment time (system time picker), `cutoff_at` deadline, and items with name, unit, price, and optional `max_quantity`. **Delivery time must be strictly later than the cutoff.** There is no overall drop-order cap — capacity is per item, and it is enforced by a database trigger, not just the UI. |
| **Ordering rules** | Residents order before the cutoff with flat number and phone. Past the cutoff, new orders are blocked automatically. A resident may place **multiple** orders on the same drop while it is open. `confirmed` orders can be edited or cancelled by the buyer. Once the host marks an order `fulfilled`, it displays as **Delivered** and becomes immutable. |
| **Host dashboard** | Aggregates item totals across active pre-orders for kitchen prep, and shows a delivery roster split into active pre-orders, collapsible delivered orders, and collapsible cancelled orders (with Mark delivered hidden on cancelled). The host marks orders fulfilled and finally marks the drop `completed`. |
| **Roles** | **Anonymous users can browse** — drops are publicly readable so shared links work logged-out. Login is required to order or publish. The creator manages the drop. **Creator, lead, or platform admin can permanently delete** a drop and its items/orders, from either the detail header or the manage dashboard; deletion confirms via `window.confirm` on web and `Alert.alert` on native. |

### 4.4 Carpooling — `app/mcn/carpools/*`

Routes: `index` (list) · `add` · `[id]` (detail + requests)

| Aspect | Details |
|--------|---------|
| **Purpose** | Neighbor ride sharing: daily commutes, school runs, intercity and outstation trips |
| **Tables** | `mcn_carpools`, `mcn_carpool_requests`, `profiles` |
| **List rules** | Tabs: All (active + paused) / Offering / Seeking / My rides, newest first. Client-side search across title, start point, end point, and vehicle info. Status badges: Active (green), Paused (amber), Cancelled (red). |
| **Publish rules** | Required: title, start point, end point. Also captured: `role_type` (`offering` or `seeking`), departure time, optional return time, recurring weekdays from Mon–Sun, available seats (≥1), vehicle info, `pricing_type` (`free`/`paid`) with `price_per_seat`, contact phone (backfilled from the profile when absent), and notes. |
| **Request rules** | Only rides that are `active` **and** `offering` accept join requests, and only from non-owners. A rider submits name, phone, flat number, seats, and an optional note; one open request per rider per ride. The host sees all non-cancelled requests and accepts or rejects pending ones. Statuses: `pending`, `accepted`, `rejected`, `cancelled`. |
| **Roles** | Any resident creates rides and requests seats. **Creator or lead** can edit, change status, and delete. |

### 4.5 Parent Corner — `app/mcn/parents/*`

Routes: `index` (directory) · `add` (create/edit)

| Aspect | Details |
|--------|---------|
| **Purpose** | Opt-in directory of residents' children, for study groups, school-run coordination, and finding neighbors at the same school |
| **Tables** | `mcn_parent_corner` |
| **Rules** | Required on save: student name, school/college name, class/grade, parent name, flat number, contact phone. Institution type is `school`, `college`, or `preschool`. Board choices: CBSE, ICSE, State Board, IB, IGCSE, PU Board, University, Other. The directory offers 300 ms debounced search, filters by institution type / board / school (the school list is derived from existing entries), and sorting by school, grade, flat, or recency. Call and share actions are available per entry. If the table has not been deployed, `isSupabaseSchemaError` renders a "feature not available" state instead of an error toast. |
| **Roles** | Residents manage their own entries. **Owner or lead** can edit or delete any entry. |

### 4.6 Schools catalog & parent report card — `app/mcn/schools/*`

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

### 4.7 Borrow & share posts — `app/mcn/add.tsx`, `app/mcn/my-posts.tsx`

| Aspect | Details |
|--------|---------|
| **Tables** | `mcn_posts` |
| **Rules** | Title required (max 80), description optional (max 280). For `kind = 'borrow'` contact info is mandatory; business-kind posts keep it optional. A detected 10-digit number is normalized. My Posts groups the user's own posts into Active and Closed with close/delete actions. Launched from the hub's Borrow & Share entry, the screen runs in borrow-only community-feed mode: it shows the whole community's borrow posts, but close and delete stay limited to the signed-in user's own rows. |
| **Roles** | Any resident posts. **Author or lead** can delete. |

### 4.8 My orders — `app/mcn/my-orders.tsx`

| Aspect | Details |
|--------|---------|
| **Purpose** | One place for everything the resident has ordered |
| **Tables** | `mcn_orders` + `mcn_order_items`, `mcn_preorder_orders` + `mcn_preorder_order_items` |
| **Rules** | Two tabs — **Pre-order food** and **Business** — each scoped to `buyer_id = user.id` and sorted newest first. Business orders cancel while `pending`; food pre-orders cancel while `confirmed`. `fulfilled` and `cancelled` orders are read-only. |
| **Navigation** | From the MCN hub quick-action bar |

---

## 5. Community tab

`app/(tabs)/community.tsx`

| Aspect | Details |
|--------|---------|
| **Purpose** | Building-level view: funds, residents, SOS, community info |
| **Tables / RPCs** | `communities`, `events`, `event_transactions`, `fund_roles`, `profiles`, `funds_access_requests`; RPCs `get_my_community_funds_overview()`, `withdraw_funds_access_request(...)` |
| **Rules** | Section order is fixed: **funds → residents tile → SOS tile → community info**. The hero shows only the community name; the "going around the building" pulse line was intentionally removed. Community info includes a join-code tile with an Invite-neighbors share action. The funds request CTA exists only in this section. |
| **Roles** | All residents view. Create-fund is visible to leads and platform admins. |

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

Contact name and phone required; purpose optional, capped at 280 characters. Writes via `submit_funds_access_request(...)`, refreshes status from `get_funds_access_status(...)`, and returns to the Community tab where the CTA becomes the pending state. Any resident of a funds-inactive community can submit.

### Blocks / towers — `app/community/blocks.tsx`

Blocks are optional per community and **decoupled from funds activation**. `communities.block_label` chooses the noun ("Block" or "Tower") used everywhere.

| Aspect | Details |
|--------|---------|
| **RPCs** | `list_community_blocks`, `set_community_blocks_enabled`, `add_community_block`, `rename_community_block`, `archive_community_block` |
| **Rules** | Disabling blocks removes active scoping for residents and in-charges but preserves historical contributions. Per-block resident and in-charge counts are surfaced to support safe archival. **Re-adding a previously archived block name restores that block** rather than failing on a duplicate name. All labels come from `blockLabel` in AuthContext. |
| **Lifecycle** | Platform admins may seed blocks at community-approval time (setting `blocks_enabled = true` and the label). Joining residents pass through `/community-join-block`. Profile shows a block picker only while blocks are active. Contribution flows load contributors through `list_eligible_contributors_for_collector(...)` so block in-charges see only their own residents. |
| **Roles** | Lead only |

### SOS — `app/sos/index.tsx`, `app/sos/donor.tsx`, `app/sos/manage-contacts.tsx`

| Aspect | Details |
|--------|---------|
| **Purpose** | Fast one-tap emergency surface: emergency directory plus blood donor registry |
| **Tables** | `emergency_contacts`, `blood_donors`, `profiles` |
| **Emergency rules** | Merges global defaults (`community_id IS NULL`) with community rows, grouped by category (hospital, ambulance, police, fire, security, helpline, other — see `constants/sos.ts`) and sorted by `sort_order` then `name`. **Every dial passes through a call-confirm dialog.** |
| **Donor rules** | Opt-in only. One donor profile per resident per community: blood group, phone, availability toggle, short note — editable and deletable at any time. The list defaults to available donors with a blood-group filter and an optional show-all toggle. Display names resolve from `profiles.full_name` at read time so they stay current. |
| **Roles** | All residents view and maintain their own donor row. `/sos/manage-contacts` is lead/platform-admin only. Platform admins additionally manage global rows. |

### Residents directory — `app/residents.tsx`

| Aspect | Details |
|--------|---------|
| **RPCs** | `get_residents_directory(p_include_phone)`; `community_lead_remove_resident(p_target_profile_id)` |
| **Rules** | Active residents only, grouped by block when `blocks_enabled`. Emails always visible; **phone numbers only to leads and platform admins**. Leads open a resident sheet and can remove non-lead residents. Role badges render President / Vice President / Resident. Accepts `?returnTo=community\|profile`. |

---

## 6. Funds

### Funds home — `app/funds/index.tsx`

Fixed layout: fund health summary on top, then the list of all community funds via `FundsList`. RPC `get_my_community_funds_overview()`. All residents view; create is lead/platform-admin gated.

### Add fund — `app/funds/add.tsx`

Title required. **Exactly one treasurer must be selected** (leads and platform admins are excluded from the treasurer picker). The fund starts with `goal_amount = 0` and `event_date = now`. The route blocks access when funds are inactive or the caller is not a lead or platform admin. Redirects to `/funds/[id]`.

### Fund detail — `app/funds/[id].tsx`

| Aspect | Details |
|--------|---------|
| **Tables** | `events`, `event_transactions`, `fund_roles`, `profiles` |
| **Rules** | Treasurers manage collectors and all transactions; collectors add contributions only; residents are view-only. Leads are treated as treasurer-level. **Exactly one treasurer per fund** (enforced by migration `20260813000000` and `fund_role_guard`). In block-enabled communities, assigning a collector requires choosing a block — there is no all-residents option in that flow. The screen shows a Contributions list (income with contributor details) and a separate Expense list. Leads can mark a fund **closed** (`is_closed`), blocking further transactions and edits. If funds are inactive, stale links render a safe inactive state instead of loading ledger actions. |
| **Navigation** | → `/funds/add-transaction?event_id=…&type=income\|expense` |

### Add transaction — `app/funds/add-transaction.tsx`

| Aspect | Details |
|--------|---------|
| **RPC** | `list_eligible_contributors_for_collector` |
| **Rules** | Contribution mode uses the block-aware eligible-contributor list and disables residents who have already contributed. In block-enabled communities, a collector or treasurer without a block assignment must pick a block before continuing — no all-residents option. Expense mode requires title and amount and never sets `contributor_user_id`. Supports an optional receipt image (`event_transactions.image_url`). Inactive funds render a graceful error state. |
| **Roles** | Contributions: collector, treasurer, or lead. Expenses: treasurer or lead. |

---

## 7. Profile tab

`app/(tabs)/profile.tsx`

| Aspect | Details |
|--------|---------|
| **Purpose** | Account-level hub only — identity, reminders, submissions, sign-out |
| **RPCs** | `get_my_due_soon_count()`, `get_my_recent_service_history(p_limit)` |
| **Rules** | **No building-level content here** — community metadata and the residents directory belong to the Community tab. The settings card shows the community role and, when applicable, a separate fund-access badge (Treasurer or Collector) so fund permissions are explicit. A block picker appears only while blocks are active. |
| **Navigation** | → `/profile/edit`, `/services`, `/mcn/my-posts`, `/login` after sign-out |

### Edit profile — `app/profile/edit.tsx`

Name updates apply directly. Email updates send a verification link to the new address before taking effect (`supabase.auth.updateUser` plus a `profiles` write). Empty names are rejected.

### Personal service reminders — `app/services/*`

**User-scoped, not community-scoped** — these queries never pass `communityId`.

| Screen | Details |
|--------|---------|
| **List** (`index.tsx`) | Reads `get_my_upcoming_services()`. Pull-to-refresh; sorted by next due date and urgency. |
| **Add** (`add.tsx`) | Required: `service_name`, `category`, `last_serviced_on`, `frequency_months`. Date cannot be in the future; frequency is 1–60 months. Choosing a category pre-fills the default frequency from `lib/serviceCategories.ts`. Linking a provider is optional; **the picker searches by provider name and phone number** (non-digits stripped from both sides before comparing). Provider options refresh on focus, so a provider added mid-flow appears on return. When no providers exist, the form offers a direct shortcut to add one. |
| **Detail / edit** (`[id].tsx`) | Reads the row directly from `user_services` by ID (not through the list RPC). Mark-done is optimistic then re-reads from the database; RPC `mark_service_done(p_service_id, …)` supports optional provider, amount paid, and note, which land in `user_service_history`. Editing reuses the add validations, including provider remapping with name/phone search. Delete requires confirmation. The technician shortcut routes back to the Help tab Providers segment with a mapped category filter. |
| **Surfaces** | `components/UpcomingServicesCard.tsx` sits above the Help content — its zero-state is a single-row inline banner (wrench emoji · title · body · inline "Add service" pill · dismiss) in one ~40 px row; the all-clear and has-due states use 8 px vertical / 12 px horizontal padding and 13 px titles. Profile shows a due-soon badge from `get_my_due_soon_count()`. `notify_due_services()` creates `service_reminder` notifications for reminders due within 7 days where `notified_at` is empty; the `check_due_services` Edge Function drives it daily. |

---

## 8. Notifications

`app/notifications.tsx`

| Aspect | Details |
|--------|---------|
| **Tables** | Reads/writes `notifications` |
| **Rules** | Users mark individual rows or the whole list as read. Funds-activation types (`funds_access_requested`, `funds_access_approved`, `funds_access_rejected`, `community_lead_appointed`, `funds_access_revoked`) are handled alongside the core flows; legacy promotion and admin-review payloads are still recognized so old rows stay tappable; unknown types fall through safely. |
| **Routing** | `new_visit` → `/visits/[id]` · `service_reminder` → `/services/[id]` · community approval/rejection/removal → `/community-select` · funds-requested and legacy promotion/admin-review → platform approvals · funds approval, rejection, lead appointment, revocation → Community tab |
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
| Manage listing (toggle, offerings, orders) | own only | own **or any** | — | — |
| Delete listing | own only | own **or any** | — | — |
| Place / update order | any but own | any but own | — | — |
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
| View / compare schools | ✅ | ✅ | — | — |
| Add school | ✅ | ✅ | — | — |
| Submit / edit report card | own only | own only | — | — |
| Delete school listing | ❌ | ✅ | — | — |
| **MCN — posts** |
| View / add borrow post | ✅ | ✅ | — | — |
| Close / delete post | own only | own **or any** | — | — |
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
