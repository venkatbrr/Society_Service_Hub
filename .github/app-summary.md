# Society Service Hub — Application Summary

> **The master overview.** Single-source portrait of the whole product for AI agents and maintainers.
> Deep detail lives elsewhere: per-screen contracts in [`docs/features.md`](../docs/features.md), schema and RPCs in [`docs/architecture.md`](../docs/architecture.md), rules in [`docs/CLAUDE.md`](../docs/CLAUDE.md). Doc routing table: [`docs/README.md`](../docs/README.md).

**Contents:** [1 Product](#1-what-this-app-is) · [2 Stack](#2-technology-stack) · [3 Applications](#3-the-three-applications) · [4 Roles](#4-roles-and-permission-model) · [5 Tenancy](#5-multi-tenancy) · [6 Boot flow](#6-boot-and-routing-flow) · [7 Modules](#7-feature-modules) · [8 Route map](#8-complete-route-map) · [9 Data model](#9-data-model-at-a-glance) · [10 Notifications](#10-notifications) · [11 Design](#11-design-system) · [12 Integrations](#12-external-integrations) · [13 Web/PWA](#13-web-and-pwa-specifics) · [14 Commands](#14-commands) · [15 Boundaries](#15-product-boundaries)

---

## 1. What this app is

Society Service Hub is a **multi-tenant community operations app for gated residential societies in India**. Each society ("community") is an isolated tenant. Residents join by a 6-character code; new societies are created only through a platform-reviewed request.

The product covers seven resident-facing capabilities:

1. **Trusted provider discovery** — a community-curated directory of plumbers, electricians, maids, tutors, photographers, and ~40 other service categories, with ratings, private notes, and abuse reporting.
2. **Shared service visits** — residents schedule a provider visit and neighbors join it, splitting cost and coordination.
3. **My Community Network (MCN)** — the resident-to-resident economy: home businesses, pre-order food drops, carpooling, a parent directory, a schools catalog with parent report cards, and borrow-and-share posts.
4. **Community funds** — transparent, role-scoped ledgers for maintenance and event collections, gated behind platform approval.
5. **Personal service reminders** — private appliance/service maintenance schedules with due-date notifications.
6. **SOS** — emergency phone directory plus an opt-in blood donor registry.
7. **Community administration** — resident directory, block/tower management, onboarding.

---

## 2. Technology stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Expo SDK 54 / React Native 0.81 | New architecture enabled, dev-client build |
| Language | TypeScript | Strict mode; `@/*` path alias → project root |
| Routing | `expo-router` ~6 | File-based, typed routes enabled |
| Backend | Supabase | Postgres, Auth, Realtime, RPC, Edge Functions, project `mbzvcaoulawdugfearmj` |
| State | React Context | `AuthContext` + `NotificationContext` only — no Redux/Zustand |
| Session storage | AsyncStorage adapter | Not SecureStore (Android 2 KB per-entry limit) |
| Auth | Supabase Auth + Google Sign-In | Email/password, password reset, Google token exchange |
| Notifications | `expo-notifications` | Local alerts on native; Realtime feed on all platforms |
| Design system | Verandah | Light-mode only, flat, no shadows |
| Image upload | Cloudinary | Unsigned HTTP upload (listings, products, drops) |
| Admin console | Vanilla HTML/CSS/JS | `admin-dashboard/`, Supabase JS + Chart.js via CDN |
| Hosting | Vercel | `vercel.json` rewrites; `npm run build` exports web + copies admin console |

Notable dependencies: `@supabase/supabase-js`, `@react-native-google-signin/google-signin`, `@react-native-community/datetimepicker`, `expo-image-picker`, `expo-notifications`, `expo-linear-gradient`, `react-native-toast-message`, `react-native-reanimated`, `framer-motion` (web motion), `@expo/vector-icons`, `xlsx` (schools data tooling).

---

## 3. The three applications

This repo ships three distinct surfaces from one codebase:

| Surface | Path | Audience | Tech |
|---------|------|----------|------|
| **Mobile app** | `app/` | Residents, community leads | Expo / React Native |
| **PWA** | same `app/`, web target | Residents on desktop/mobile browsers | react-native-web, installable, service worker |
| **Platform admin console** | `admin-dashboard/` | Platform admins only | Vanilla JS SPA with hash routing |

Platform admins are deliberately **excluded from the mobile app**: on web they are hard-redirected to `/admin/index.html`; on native they land on `/admin-redirect`, which tells them the console is web-only.

---

## 4. Roles and permission model

### App roles (`profiles.app_role`, enum `app_role_type`)

| Role | Meaning | Derived flag |
|------|---------|--------------|
| `admin` | Platform admin. Must have `community_id = NULL`. | `isPlatformAdmin` |
| `president` | Primary community lead | `isCommunityLead` |
| `vice_president` | Secondary community lead, same powers | `isCommunityLead` |
| `resident` | Default member | — |
| `community_lead` | **Legacy.** Migrated to `president` on 2026-06-16. Still in the enum for historical rows; no live code grants it. | — |
| `community_admin` | **Legacy.** Migrated to `president`. Dead. | — |

> **Critical for agents:** "community lead" is a *concept*, not a role string. Check `isCommunityLead` from `useAuth()` in app code, or `public.is_community_lead(auth.uid())` in SQL. Never compare `app_role === 'community_lead'` — that string is dead.

`isPlatformAdmin` = `app_role === 'admin'` (or the hardcoded platform-admin email).
`isCommunityLead` = `(app_role === 'president' || app_role === 'vice_president') && !!communityId`.

### Fund roles (`fund_roles.role`) — per fund, independent of app role

| Role | Powers |
|------|--------|
| `treasurer` | Full ledger: contributions, expenses, manage collectors. Exactly one per fund. |
| `collector` | Record contributions only; optionally scoped to one block |
| `resident` | View-only fallback (implicit, not stored) |

Resolved through `lib/fundRoles.ts` — always use `getEffectiveFundRole()` and `getFundPermissions()`, never ad-hoc checks. Community leads and platform admins resolve to treasurer-level.

### Who can delete what (MCN)

Since migration `20260814000000_mcn_deletion_permissions.sql`, deletion of **any** MCN entity is allowed for the **creator/owner OR a community lead OR a platform admin**, enforced by RLS on `mcn_preorder_drops`, `mcn_listings`, `mcn_carpools`, `mcn_parent_corner`, and `mcn_posts`.

---

## 5. Multi-tenancy

Every resident belongs to exactly one community (`profiles.community_id`).

- **Client rule**: all community-scoped queries filter by `communityId` from `useAuth()`.
- **Server rule**: RLS policies compare against `public.get_user_community_id()`.
- **Exception — user-scoped tables** (no community filter, RLS is `auth.uid() = user_id`, no lead/admin override):
  `user_services`, `user_service_history`, `hire_feedback`, `provider_public_rating_nudges`, `provider_personal_notes`.
- **Exception — global rows**: `emergency_contacts` with `community_id IS NULL` are platform-wide defaults visible to everyone.
- **Exception — public read**: food drops (`mcn_preorder_drops` and children) are readable without a session so shared drop links work for logged-out visitors.

---

## 6. Boot and routing flow

**Startup** (`app/_layout.tsx`): `SafeAreaProvider` → `AuthProvider` → `NotificationProvider` → `WebDesktopFrame` → `PwaInstallBanner` + `RootLayoutNav` + `Toast`. `configureGoogleSignIn()` runs on mount. `useSyncedBackNavigation()` wires browser/hardware back to the logical route hierarchy.

**Redirect rules**, in evaluation order:

```text
loading                                  -> full-screen spinner
no session                               -> /login
   exceptions (stay public): web "/" ; /mcn/drops and /mcn/drops/*
platform admin, web                      -> hard redirect to /admin/index.html
platform admin, native                   -> /admin-redirect
no community + active request            -> /community-request-submitted
no community + no request                -> /community-select
community present, on an auth/onboarding -> saved target route, else /(tabs)
```

The intended destination is saved before bouncing to `/login` and restored after sign-in (deep-link preservation).

**Join sub-flow**: a successful `join_community_by_code()` in `app/community-select.tsx` routes to `/community-join-block` when the joined community has `blocks_enabled = true`; block + flat number are mandatory there.

---

## 7. Feature modules

### 7.1 Help tab — providers and visits (`app/(tabs)/index.tsx`)

Two segments behind one screen.

**Providers**: community-scoped directory sorted by `avg_rating`. Two-level category filter — a group row (All Services, Home Support, Repairs & Maintenance, Healthcare & Wellness, Personal Care, Transport & Vehicle Care, Events & Occasions, Education & Coaching, Government & Docs, Other) then a category chip row scoped to that group; picking a group applies an `IN` clause, picking a category applies `eq`. Debounced search (300 ms). Residents can rate (1–5, one upsertable rating each), save, call, WhatsApp, share, write a **private** personal note, and report for abuse. Community leads and platform admins get delete instead of report. Adding a provider runs a **fraud check** (Supabase Edge Function `fraud-check`) whose verdict is stored in `service_providers.fraud_status` and `fraud_verdicts`. Duplicate phone numbers route to the existing provider instead of creating a row.

**Service visits**: grouped by category via `SectionList`, split into Upcoming / Recent (≤30 days) / Archived (>30 days). Only the creator changes status (`upcoming` → `in_progress` / `completed` / `cancelled`) or reschedules; rescheduling emits a `visit_rescheduled` notification to the community. Joiners supply flat number and an optional note.

Also on this screen: `UpcomingServicesCard` (due-reminder banner), an active-fund teaser, and an Invite-neighbors share action carrying the community join code.

### 7.2 Saved tab (`app/(tabs)/favorites.tsx`)

Provider-only bookmarks from `favorites`. Unfavoriting removes the row from the list immediately; refetches on focus.

### 7.3 MCN tab — My Community Network (`app/(tabs)/network.tsx`)

A **hub of four section cards**, each with a live count, plus two quick-action buttons (My Orders, My Submissions):

| Card | Route | Live count |
|------|-------|-----------|
| Pre-order Food & Community Business | `/mcn/drops` | open drops + active listings |
| Community Carpooling | `/mcn/carpools` | active rides |
| Parent Corner | `/mcn/parents` | children listed |
| Schools Catalog & Compare | `/mcn/schools` | curated + community schools |

**Business listings** (`/mcn/business`) — resident-run businesses with a cover photo, a category from the `mcn_business_categories` lookup, and offerings split into products vs services. Prices are nullable (`NULL` renders "Price on request"). Listings are grouped by category and collapsible; active sort ahead of paused. Residents place multi-item orders with quantity steppers (0.5 steps for kg/litre, 1 for piece/box/pack/dozen); owners see orders grouped Pending / Fulfilled / Cancelled and WhatsApp buyers with a pre-filled itemised message. Owner **or a community lead** can open the manage screen and delete the listing.

**Pre-order food drops** (`/mcn/drops`) — time-gated group ordering for home chefs and food businesses. A drop has a fulfillment date + time window, a hard `cutoff_at` deadline, and line items with unit, price, and optional per-item `max_quantity` (enforced by a database trigger, not just UI). Catalog tabs: Active / Closed / My drops. Past the cutoff, new orders are blocked. Residents may place multiple orders while open and edit or cancel `confirmed` ones; once the host marks an order `fulfilled` it becomes immutable and shows as Delivered. The host dashboard (`/mcn/drops/manage/[id]`) aggregates item totals for kitchen prep and lists a delivery roster split into active, delivered, and cancelled. Drops are **publicly readable** so shared links work logged-out.

**Carpooling** (`/mcn/carpools`) — ride sharing with `role_type` of `offering` or `seeking`. Fields: start/end point, departure and optional return time, recurring weekday array, available seats, vehicle info, `pricing_type` (`free`/`paid`) with `price_per_seat`, contact phone, notes. Tabs: All / Offering / Seeking / My rides. Riders on an `offering` ride submit a join request (`mcn_carpool_requests`) with seats and a note; the host accepts or rejects. Statuses: `active`, `paused`, `cancelled`, `completed`.

**Parent Corner** (`/mcn/parents`) — an opt-in directory of residents' children for study groups and school-run coordination. Each entry carries student name, institution type (school / college / preschool), school name, board (CBSE, ICSE, State Board, IB, IGCSE, PU Board, University, Other), grade, parent name, flat, and phone. Filter by type, board, and school; sort by school, grade, flat, or recency.

**Schools catalog** (`/mcn/schools`) — a curated regional dataset (`data/westHyderabadSchools.ts`) merged with community-submitted schools. Each school carries syllabus, level, distance, fee range, facilities, and links. The **Parent Report Card** replaces star reviews with **8 emoji-scored dimensions** (Academics, Teachers, Infrastructure, Sports & Activities, Safety & Hygiene, Transport, Value for Money, Child's Happiness) on a 😟😕😐🙂🤩 scale, plus child grade, optional 140-char per-aspect notes, and an overall comment. Averages are maintained on `schools.avg_*` by trigger. Detail view renders an 8-axis radar chart; up to 3 schools can be compared side by side.

**Borrow & Share** (`mcn_posts`, `/mcn/add`, `/mcn/my-posts`) — lightweight posts for borrowing or giving away items. Reached through My Submissions.

**My Orders** (`/mcn/my-orders`) — the resident's own orders across two tabs: pre-order food and business listings.

### 7.4 Community tab (`app/(tabs)/community.tsx`)

Fixed section order: **funds → residents tile → SOS tile → community info**.

**Funds** are activation-gated on `communities.funds_enabled`:

| State | Rendering |
|-------|-----------|
| Inactive, no request | CTA "Request funds support" → `/funds-access/request` |
| Request pending | Pending card with requester name/date/phone; requester can withdraw |
| Rejected | Reason + "Request again" |
| Previously active | Post-revocation note |
| Active | Merged funds card with income/expense/balance → `/funds` |

Platform approval of a funds request enables funds **and** promotes the designated resident to `president` in one transaction.

Community info includes a join-code tile with an Invite-neighbors share action.

**Funds domain** (`/funds/*`): funds are `events` rows; ledger lines are `event_transactions` (`type` of income/expense); role grants are `fund_roles`. Exactly one treasurer per fund (enforced by migration `20260813000000`). Collectors and treasurers can edit existing contributions. Community leads can close a fund (`is_closed`), blocking further writes. In block-enabled communities, collector assignment must pick a block, and contributor pickers come from `list_eligible_contributors_for_collector()` so block in-charges only see their own residents.

**Blocks / towers** (`/community/blocks`) — optional per-community structure, **decoupled from funds**. `communities.block_label` chooses the noun ("Block" or "Tower") used across all UI. Platform admins can seed blocks at approval time; community leads toggle scoping and create/rename/archive blocks. Re-adding an archived name restores that block rather than erroring.

**SOS** (`/sos`) — two surfaces. The emergency directory merges global rows (`community_id IS NULL`) with community rows, grouped by category (hospital, ambulance, police, fire, security, helpline, other) and gated behind a call-confirm dialog. The blood donor registry is opt-in: one profile per resident with blood group, phone, availability toggle, and note; the list defaults to available donors with a blood-group filter. Community leads manage contacts at `/sos/manage-contacts`.

**Residents directory** (`/residents`) — active residents, grouped by block when blocks are on. Emails always shown; phone numbers only to leads and platform admins. Leads can remove non-lead residents (soft delete).

### 7.5 Profile tab (`app/(tabs)/profile.tsx`)

Account-level only — building-level content belongs in the Community tab. Shows identity, community role badge, a separate fund-access badge (Treasurer/Collector) when applicable, a due-soon reminder count, a My Submissions link, and sign-out.

**Personal service reminders** (`/services/*`) — private, **user-scoped, not community-scoped**. A reminder has service name, category, last-serviced date, and frequency in months; category choice pre-fills a default frequency from `lib/serviceCategories.ts`. Optionally linked to a saved provider (picker searches by name *and* phone). Marking done captures optional provider, amount paid, and note into `user_service_history`, then rolls the due date forward. `notify_due_services()` emits `service_reminder` notifications for reminders due within 7 days; the `check_due_services` Edge Function is the daily driver.

**Hire feedback** (`/hire-feedback/[hireId]`) — contacting a provider logs a hire and schedules a local 24-hour reminder. Feedback is `positive`, `negative`, or `skipped` with an optional note, and is strictly private. A `positive` signal may trigger a one-time public-rating nudge per provider; `negative` and `skipped` never do. Public ratings are never auto-created.

### 7.6 Onboarding and platform review

Residents join instantly by code — there is **no resident approval queue**. Creating a new community requires a `community_requests` submission (name, city, pincode, flat number, optional area/address/type/unit count) reviewed in the admin console. Approval creates the community, generates its join code, assigns the requester as `resident`, and optionally seeds blocks with a chosen label.

### 7.7 Platform admin console (`admin-dashboard/`)

Hash-routed SPA with five pages — `#dashboard`, `#approvals`, `#communities`, `#providers`, `#funds-requests`. Covers community metrics and charts, community-creation approvals with block seeding, community/lead/block/resident management, provider moderation, and funds-activation decisions. See [`docs/platform-admin.md`](../docs/platform-admin.md).

---

## 8. Complete route map

### Root / onboarding
`/index` · `/login` · `/forgot-password` · `/community-select` · `/community-request` · `/community-request-submitted` · `/community-join-block` · `/admin-redirect` · `/admin/index`

### Tabs — `app/(tabs)/`
`index` (Help) · `favorites` (Saved) · `network` (MCN) · `community` · `profile`

### Standalone
`/notifications` · `/residents` · `/profile/edit` · `/community/blocks`

### Providers & visits
`/provider/add` · `/provider/[id]` · `/visits/add` · `/visits/[id]` · `/hire-feedback/[hireId]`

### Funds
`/funds` · `/funds/add` · `/funds/[id]` · `/funds/add-transaction` · `/funds-access/request`

### Reminders
`/services` · `/services/add` · `/services/[id]`

### SOS
`/sos` · `/sos/donor` · `/sos/manage-contacts`

### MCN — `app/mcn/`
`/mcn/business` · `/mcn/listing-add` · `/mcn/listing/[id]` · `/mcn/listing/manage/[id]` · `/mcn/listing/orders/[id]`
`/mcn/drops` · `/mcn/drops/add` · `/mcn/drops/[id]` · `/mcn/drops/manage/[id]` · `/mcn/drops/manage/index`
`/mcn/carpools` · `/mcn/carpools/add` · `/mcn/carpools/[id]`
`/mcn/parents` · `/mcn/parents/add`
`/mcn/schools` · `/mcn/schools/add` · `/mcn/schools/[id]` · `/mcn/schools/review` · `/mcn/schools/compare`
`/mcn/add` · `/mcn/my-posts` · `/mcn/my-orders`

Back navigation separates two concepts (see [`docs/architecture.md`](../docs/architecture.md) §9): the browser and Android hardware back buttons do **chronological** back, handled by expo-router itself; the in-app header arrow does **hierarchical up** via `goBackSmart()` and the parent map in `lib/navigation.ts`. Forward navigation is always `router.push()` so each screen owns exactly one history entry.

---

## 9. Data model at a glance

Column-level detail lives in [`docs/architecture.md`](../docs/architecture.md) §Database Schema.

| Domain | Tables |
|--------|--------|
| Tenancy & identity | `communities`, `profiles`, `community_requests`, `community_blocks`, `profile_audit_log` |
| Providers | `service_providers`, `favorites`, `ratings`, `provider_hires`, `provider_reports`, `provider_personal_notes`, `provider_public_rating_nudges`, `hire_feedback`, `fraud_verdicts` |
| Visits | `service_visits`, `visit_joiners` |
| Funds | `events`, `event_transactions`, `fund_roles`, `funds_access_requests`, `funds_access_revocations` |
| MCN — business | `mcn_business_categories`, `mcn_listings`, `mcn_products`, `mcn_orders`, `mcn_order_items` |
| MCN — food drops | `mcn_preorder_drops`, `mcn_preorder_items`, `mcn_preorder_orders`, `mcn_preorder_order_items` |
| MCN — carpools | `mcn_carpools`, `mcn_carpool_requests` |
| MCN — parents & schools | `mcn_parent_corner`, `schools`, `school_reviews` |
| MCN — social | `mcn_posts` |
| Reminders | `user_services`, `user_service_history` |
| SOS | `blood_donors`, `emergency_contacts` |
| Messaging | `notifications` |
| Federation (backend only) | `community_partnerships`, `community_groups`, `community_group_members`, `provider_shares`, `service_visit_communities`, `community_announcements`, `announcement_audiences` |

**Removed**: `resident_businesses`, `business_offerings`, `business_inquiries` (marketplace, dropped in `20260422010000`).

**Edge Functions**: `check_due_services` (daily reminder sweep, must be scheduled in the Supabase dashboard at `30 3 * * *` = 9 AM IST) and `fraud-check` (provider/review fraud verdicts).

---

## 10. Notifications

`NotificationContext` loads the latest 50 rows for the signed-in user, subscribes to Realtime `INSERT` on `notifications`, requests native permission, and fires a local alert on mobile.

**Live types**: `new_visit` · `visit_rescheduled` · `community_approved` · `community_rejected` · `removed_from_community` · `service_reminder` · `funds_access_requested` · `funds_access_approved` · `funds_access_rejected` · `community_lead_appointed` · `funds_access_revoked`

**Reserved for federation** (backend exists, nothing emits them yet): `partnership_request` · `partnership_accepted`

**Legacy, still handled so old rows stay tappable**: `new_community_request` · `new_promotion_request` · `promoted_to_admin` · `promotion_approved` · `promotion_rejected`

Local (non-table) notifications: the 24-hour hire-feedback reminder, deep-linked via `data.kind = 'hire_feedback'`.

---

## 11. Design system

**Verandah** — the only active UI language. Full reference: [`docs/verandah.md`](../docs/verandah.md).

- Tokens: `constants/Colors.ts` (`Verandah` palette — surface `#FAF8F4`, card `#FFFFFF`, primary `#0F3732`, accent `#0F6E56`) and `constants/Verandah.ts` (`VerandahType`, `VerandahSpace`, `VerandahRadius`, `VerandahLayout`).
- Light mode only. Flat surfaces with hairline borders. **No shadows, elevation, or glassmorphism.**
- Font weights capped at 400 and 500. Sentence case everywhere.
- Serif/display type is reserved for the single largest title anchor on a screen.
- Shared components: `BaseCard`, `Avatar` (deterministic initials, no photo upload), `Rupees` (en-IN currency), `EmptyState`, `SearchBar`, `CategoryFilter`, `HeaderBackButton`.
- `Ionicons` for all interactive icons; emojis only for dynamic category tags.
- The Help tab uses a **compact WhatsApp chat-tile density**: single-row provider tiles, 36 px search bars, 30 px avatars, 10 px card padding.
- Several components have `.web.tsx` variants (`AppIcon`, `EmojiRating`, `HeaderBackButton`, `NetworkTileIcon`, `SchoolAspectIcon`, `SchoolRadarChart`, `ScoreSentimentIcon`, `MotionWrapper`) where native rendering does not translate to the web.

---

## 12. External integrations

| Integration | Used by | How |
|-------------|---------|-----|
| Supabase Auth | Login, signup, reset | Email/password with persisted session |
| Google Sign-In | Login | `@react-native-google-signin/google-signin`, token exchanged with Supabase; always prompts account selection. Requires a dev build — not Expo Go. |
| Supabase Realtime | Notifications | `postgres_changes` INSERT subscription |
| Supabase Edge Functions | Reminders, fraud | `check_due_services`, `fraud-check` |
| Cloudinary | Listing covers, product images, drop images | Unsigned HTTP upload via `expo-image-picker` |
| Expo Notifications | Reminders, hire feedback | Permissions, Android channel, local scheduling |
| Phone dialer | Providers, visits, carpools, SOS, orders | `Linking.openURL('tel:...')` |
| WhatsApp | Providers, listings, orders, carpools | `whatsapp://send` / `https://wa.me/` |
| Native share | Join code, providers, food drops | `Share.share()` |
| DateTimePicker | Visits, reminders, drops, carpools | `@react-native-community/datetimepicker` |

---

## 13. Web and PWA specifics

- Installable PWA: `public/manifest.json` + `public/service-worker.js`. Registration checks `document.readyState` for `complete`/`interactive` so it still registers when the load event already fired.
- `app/+html.tsx` sets `html`, `body`, `#root` to `height: 100%` and `#root` to `display: flex`, which keeps the tab bar on screen, and resets focus outlines on inputs.
- Native `RefreshControl` is a no-op on web, so scrollable lists use the custom `useWebPullToRefresh` hook plus `WebPullIndicator`.
- `WebDesktopFrame` constrains the app to a phone-shaped frame on wide viewports.
- `vercel.json` rewrites `/` → `landing.html`, `/admin*` → the admin console, and everything else → the SPA `index.html`.
- `npm run build` runs `expo export --platform web` then `node build-admin.js`, which copies `admin-dashboard/` into `dist/admin` and `public/admin` and stages `landing.html`.
- Web deep links for dynamic food-drop routes are bridged through query params so browser refresh works.

---

## 14. Commands

```bash
npm start          # Expo dev server
npm run web        # Web/PWA preview — fastest layout iteration
npm run android    # Native Android build (required for Google Sign-In)
npm run ios        # Native iOS build
npm run build      # Web export + admin console copy (deploy artifact)
npm run preview    # Serve ./dist locally

npx tsc --noEmit   # Type check — the only automated gate; no test framework configured

npm run db:login   # Authenticate Supabase CLI
npm run db:link    # Link to project mbzvcaoulawdugfearmj
npm run db:push    # Apply migrations
npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj   # Regenerate lib/database.types.ts
```

---

## 15. Product boundaries

- The resident **marketplace is removed, not hidden**. `app/business/*` is gone and its tables were dropped. MCN replaced it.
- There is **no resident approval queue** — joining by code is immediate.
- Personal reminders are **user-scoped**, never community-scoped.
- Platform admins never appear inside a community and are barred from the mobile app surface.
- **Cross-community federation is backend-only.** Schema, helper predicates, and RPCs are live; no screen calls them. All user-visible behavior is single-community. See [`docs/cross-community.md`](../docs/cross-community.md).
- Email verification and password-strength rules are intentionally disabled for pilot onboarding — see [`docs/disabled-features.md`](../docs/disabled-features.md).
- There is **no automated test suite**. `npx tsc --noEmit` is the gate.
