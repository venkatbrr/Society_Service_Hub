# Features Reference

> **AI agents must review this file before modifying any feature.**

This document describes the current user-facing product surface, the screens involved, the active tables touched, key business rules, navigation flows, role-based access, and live integrations.

---

## App Summary

Society Service Hub currently ships six main experiences across five bottom tabs: trusted provider discovery (Help), community service-visit coordination (Help), a local business directory and social sharing surface (MCN), activation-gated community funds (Community), personal service reminders (Profile), and a community SOS surface — emergency numbers + blood donors (Community). Residents use the main tabs for everyday workflows, community leads manage local operations such as funds, optional block scoping, and emergency directories, and platform admins review community requests plus funds-access requests.

The web app is configured as a fully installable Progressive Web App (PWA) with offline capabilities, utilizing an optimized service worker cache registration and viewport height styling to mimic a native app experience on mobile browsers.

The entire home screen uses a **compact, WhatsApp chat-tile inspired UI density** where provider cards, visit cards, maintenance banners, search bars, category filters, segment controls, and headers are all vertically compact to maximize visible content per screen. Provider tiles follow a single-row horizontal layout (avatar · name · inline meta · bookmark) instead of multi-section cards.

The app surface is narrower than the backend schema by design. Cross-community federation tables and RPCs already exist, but the current UI remains centered on the resident's home community, with no exposed federation controls or cross-community browsing screens yet.

---

## Authentication & Onboarding

### Login (`app/login.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Sign up or sign in via email/password or Google OAuth |
| **Tables** | Writes: `auth.users` through Supabase Auth. Trigger auto-creates `profiles` row. |
| **Business rules** | Email must contain `@`. Sign-up requires full name plus matching password and confirm password. Flat number is not collected on the first sign-up screen; `profiles.flat_number` stays optional and can be provided later in flows that ask for it. If sign-up is attempted with an already-registered email, the form switches to sign-in mode and prompts the user to sign in or use Forgot password. Google sign-in exchanges the native or web identity token with Supabase and always prompts account selection (does not silently reuse the last Google account). |
| **Navigation** | Entry point for unauthenticated users. Links to `/forgot-password`. Post-auth routing is handled by the root layout. |
| **Roles** | N/A (pre-auth) |
| **Integrations** | Supabase Auth, Google Sign-In |

### Community Select (`app/community-select.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Join an existing community by code or start the request flow for a new one |
| **Tables** | Writes: `profiles` via `join_community_by_code(p_code)` RPC |
| **Business rules** | Join code is a 6-character uppercase alphanumeric code. Joining is immediate; there is no resident approval queue. Successful joins call `refreshSession()` so auth state and `communityId` update before redirecting. If the joined community has both funds and blocks enabled, the screen sends the user to block selection before the main app. |
| **Navigation** | From root redirect when authenticated users have no `community_id` and no active request. To `/community-join-block` after join when block onboarding applies, otherwise `/(tabs)`, or `/community-request` for a new request. |
| **Roles** | Any authenticated user |

### Community Join Block (`app/community-join-block.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Capture flat number and first block/tower assignment immediately after a resident joins a block-enabled community |
| **Tables / RPCs** | Writes: `profiles` table updates (`flat_number`, `block_id`) |
| **Business rules** | This handoff appears only after a successful join into a community where `blocks_enabled` is true. Entering a flat number and picking a block/tower is strictly mandatory; users cannot skip this screen. The flat number is normalized (uppercase, spaces/hyphens removed) on blur. The block/tower is selected via a dropdown. The screen title and subtitle use the community's `block_label` (Block or Tower) for dynamic labeling. |
| **Navigation** | From `/community-select` after successful join. To `/(tabs)` on save. |
| **Roles** | Any authenticated resident joining a block-enabled community |

### Community Request (`app/community-request.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Submit a new community creation request for platform review |
| **Tables** | Writes: `community_requests` through `submit_community_request(...)` RPC |
| **Business rules** | Required: community name, city, pincode, flat or house number, and accuracy confirmation. Optional: area, address, community type, approximate units. The requester flat or house number input is formatted in uppercase and strips spaces and hyphens on blur to keep approval data consistent. New requests enter `pending` status. |
| **Navigation** | From `/community-select`. To `/community-request-submitted` on success. |
| **Roles** | Any authenticated user |

### Community Request Submitted (`app/community-request-submitted.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Status screen for users who have an active community request |
| **Tables** | Reads: `community_requests`, `communities` |
| **Business rules** | Root routing lands here when `activeCommunityRequest` exists. `pending` shows a waiting state, `rejected` shows the reason and restart options, and approved users can refresh into the app after their profile is updated. |
| **Navigation** | Reached from `/community-request` and root redirects. |

### Forgot Password (`app/forgot-password.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Request a password reset email |
| **Tables** | None directly; Supabase Auth handles the reset flow |
| **Business rules** | Email must contain `@`. Reset URL uses the `societyservicehub://reset-password` deep link scheme. |
| **Navigation** | From `/login`. Returns users to `/login` after success. |

---

## Main App Tabs

### Tab 1: Help - Services Dashboard (`app/(tabs)/index.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Main discovery hub with two switchable segments: Trusted Providers and Service Visits |
| **Tables** | Reads: `service_providers`, `favorites`, `provider_hires`, `service_visits`, `visit_joiners`, `profiles`, `events`, `event_transactions` |
| **Business rules** | Providers are sorted by `avg_rating` descending. The provider filter uses a two-level grouped navigation: a group row (All Services, Home Support, Repairs & Maintenance, Healthcare & Wellness, Personal Care, Transport & Vehicle, Events & Functions, Education & Classes, Government Services, Other) followed by a category chip row that shows only categories within the selected group. Selecting a group without a specific category filters the provider query to all categories in that group using an `IN` clause, so Events + All returns only Photography, Decoration, Catering, etc. and never shows Maid. Selecting a specific category adds a single equality filter. Service Visits split into Upcoming, Recent (Past up to 30 days), and Archived (older than 30 days) buckets based on date, with cancelled visits moving to Past/Archived immediately regardless of planned date. Past/Archived visits do not display an `upcoming` status badge even if a stale row still has `status = 'upcoming'`. The screen preserves the active segment and visit sub-tab in route params when users drill into details and return. Provider and visit data are refreshed whenever the screen regains focus so newly added records appear immediately after returning. The header includes an Invite Neighbors action beside notifications that opens the native share sheet with the current community join code. The home stack also shows `UpcomingServicesCard` and `ActiveFundTeaser` above the main list. Provider search and visit search are debounced (300 ms) to avoid firing Supabase queries on every keystroke. The `provider_hires` query is scoped to the current `communityId`. The `visit_joiners` query is scoped to the ID set of the current page of visits only. On the web target, swipe-down-to-refresh is enabled via a custom touch gesture hook (`useWebPullToRefresh`) that triggers dynamic list data reloading when dragging down at scroll offset 0. |
| **Navigation** | To `/provider/[id]`, `/provider/add`, `/visits/[id]`, `/visits/add`, and `/notifications` |
| **Roles** | All community members can browse and create providers or visits |
| **Components** | `UpcomingServicesCard`, `ActiveFundTeaser`, `ProviderCard`, `VisitCard`, `SearchBar`, `CategoryFilter`, `EmptyState` |
| **State additions** | `selectedGroupCategories: string[] \| null` — set by `CategoryFilter` via `onSelectGroupCategories` callback; used to build the `IN` clause on the provider query when a group (but not specific category) is active. |
| **Compact UI** | The entire Help screen uses a compact, information-dense layout inspired by WhatsApp chat tiles. The header title uses a reduced serif font (22px), header action buttons are 36px circles (down from 44px), the Providers/Visits segmented control uses 6px vertical padding (down from 10px), the search bar is 36px tall (down from 44px), category filter chips use 4px vertical padding (down from 8px), and the FAB is 56px (down from 64px). Provider cards are redesigned as single-row horizontal tiles with avatar, name+verified badge, and an inline meta row (category · ★ rating · hire count) all on one compact card. Visit cards use reduced padding (10px), smaller avatars (30px), and smaller text sizes. The `UpcomingServicesCard` zero-state is a single-row inline banner instead of a multi-row card with full-width CTA button. |

### Tab 2: Saved - Favorites (`app/(tabs)/favorites.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Show the current user's saved providers |
| **Tables** | Reads and writes: `favorites`, joined with `service_providers` |
| **Business rules** | Favorites are provider-only. Unfavoriting removes the item from the list immediately. `useFocusEffect` refreshes the screen whenever the tab regains focus. On the web target, swipe-down-to-refresh is enabled via the custom `useWebPullToRefresh` hook. |
| **Navigation** | To `/provider/[id]` |
| **Roles** | Personal favorites only |

### Tab 3: Community (`app/(tabs)/community.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Consolidated building-level view: funds section, residents and SOS shortcuts, and community info in one tab |
| **Tables / RPCs** | Reads: `communities`, `events`, `event_transactions`, `fund_roles`, `profiles`, `funds_access_requests`; RPCs: `get_my_community_funds_overview()`, `withdraw_funds_access_request(...)` |
| **Business rules** | Section order is fixed: funds, residents tile, SOS tile, community info. Top hero shows only the community name. The pulse/"Going around the building" section is intentionally removed from this tab. Funds are activation-gated: when `funds_enabled = false`, the section renders request/status cards (request CTA, pending, rejected retry, and previously-active note) instead of fund tiles. When `funds_enabled = true`, the section renders one merged Community funds card that includes fund health summary and the "Open community funds" action to route to the dedicated funds page. Community info includes a dedicated community-code tile with an Invite neighbors share action (same copy pattern as Home tab invite). Funds request CTA entry is only in this section. |
| **Navigation** | To `/funds`, `/funds/[id]`, `/funds/add`, `/residents?returnTo=community`, and `/sos` |
| **Roles** | All residents can view; create-fund action remains role-gated exactly as before. |

### SOS and Emergency (`app/sos/index.tsx`, `app/sos/donor.tsx`, `app/sos/manage-contacts.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Fast emergency surface for one-tap calling: emergency directory + blood donor registry |
| **Tables** | Reads/writes: `blood_donors`, `emergency_contacts`, `profiles` |
| **Business rules** | Blood donor listing is opt-in only. Residents can register one donor profile per community with blood group, phone, availability toggle, and short note, then edit or delete it any time. Donor listing defaults to only available donors with a blood-group filter and optional show-all toggle. Display names are resolved from `profiles.full_name` at read time so names stay current. Emergency numbers combine global defaults (`community_id IS NULL`) with community-specific rows, grouped by category and sorted by `sort_order` then `name`. Every dial action uses a call-confirm dialog before opening the phone dialer. |
| **Navigation** | Entry shortcut from Community tab to `/sos`; donor editor at `/sos/donor`; lead/admin management at `/sos/manage-contacts` |
| **Roles** | All residents can view emergency numbers and donors plus maintain their own donor profile. Only community leads or platform admins can access `/sos/manage-contacts`. Platform admins can also manage global emergency rows. |
| **Design system** | Uses Verandah tokens, `BaseCard`, `Avatar`, `EmptyState`, and `Ionicons`; no gradients/shadows. |

## Funds - Activation

Residents in communities with `funds_enabled = false` can submit a funds-support request from `/funds-access/request`. The Community tab funds section renders one of the activation states:

- State B: CTA card with "Request funds support"
- State C: pending review card (requester name/date/phone) with withdraw action for requester only
- State D: rejected status with reason and "Request again"
- State E: previously active note after revocation

Platform admin approval promotes one designated resident to `community_lead` and enables funds in the same transaction. Revocation disables funds and blocks while preserving ledger history.

### Funds Access Request (`app/funds-access/request.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Submit the resident-side request that asks platform admins to activate funds for a community |
| **Tables / RPCs** | Writes via RPC: `submit_funds_access_request(...)`; refreshes auth-backed status from `get_funds_access_status(...)` |
| **Business rules** | Contact name and phone are required. Purpose is optional and capped at 280 characters. After a successful submit, the user is returned to the Community tab where the activation CTA is replaced by the pending-review state. |
| **Navigation** | From the Community tab funds CTA. Returns to `/(tabs)/community` on success. |
| **Roles** | Any resident in a community where funds are inactive |

## Blocks / Towers (Optional)

Blocks (or towers — the label is configurable per community) are visible when `blocks_enabled = true`. They are **decoupled from funds activation**: a platform admin can seed blocks at community creation time before any funds flow exists. Each community stores a `block_label` column (`Block` or `Tower`) that controls how the concept is named across all resident-facing UI.

- Admin seeding: during community approval, the platform admin can optionally add block/tower names and select the label. This sets `blocks_enabled = true` and inserts the block rows at creation time.
- Join flow: after `join_community_by_code`, users are routed to `/community-join-block` when `blocks_enabled = true` (regardless of funds status) to mandatory enter their flat number and select their block/tower.
- Profile override: Profile tab shows "Your block/tower" row and block picker modal only when blocks are active.
- Community lead setup: `/community/blocks` allows block toggling, create/rename/archive, and scoped management. All text uses the community's configured label.
- Contribution flow: contributor options are loaded through `list_eligible_contributors_for_collector(...)` so block in-charges only see eligible residents.
- Label management: platform admins can change the block label from the community detail screen in the admin console.

### Community Blocks Management (`app/community/blocks.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Let a community lead enable or disable block/tower scoping and manage the roster |
| **Tables / RPCs** | Reads: `profiles`, `fund_roles`; RPCs: `list_community_blocks`, `set_community_blocks_enabled`, `add_community_block`, `rename_community_block`, `archive_community_block` |
| **Business rules** | Disabling blocks removes active block scoping for residents and block in-charges but preserves historical fund contributions. The screen surfaces resident counts and in-charge counts per block to support safe cleanup and archival decisions. Re-adding a previously archived block name restores that archived block instead of failing with a duplicate-name error. All text labels use the community's `block_label` from AuthContext. |
| **Navigation** | Linked from community-management flows. |
| **Roles** | Community lead only |

### Tab 4: Profile - Personal Hub (`app/(tabs)/profile.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Account-level hub for user identity, personal service reminders, recent personal service history, and sign-out |
| **Tables / RPCs** | RPCs: `get_my_due_soon_count()`, `get_my_recent_service_history(p_limit)` |
| **Business rules** | Profile now avoids building-level sections. Community metadata and residents-directory access are rendered in the Community tab only. The settings card shows the user's community role and, when applicable, a separate fund access badge (Treasurer or Collector) so fund permissions are explicit. |
| **Navigation** | To `/services` and `/login` after sign-out |
| **Roles** | Personal profile only |

### Edit Profile (`app/profile/edit.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Allow residents to edit their full name and email address |
| **Tables / RPCs** | Writes: `auth.users` via `supabase.auth.updateUser` and `profiles` |
| **Business rules** | Users can update their name directly. Updating their email sends a verification link to the new address before it takes effect. Validation prevents empty names. |

---

## Community Directory

### Residents Directory (`app/residents.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Standalone community directory screen linked from the Community tab |
| **Tables** | Reads via RPC: `get_residents_directory(p_include_phone)`; writes via RPC: `community_lead_remove_resident(p_target_profile_id)` |
| **Business rules** | Directory shows active residents only. Grouped by block if `blocks_enabled` is true. Phone numbers and emails are shown below names. Phone numbers are exposed only to community leads and platform admins. Community leads can open a resident sheet and remove non-lead residents. The screen supports a `returnTo` param to return to the caller tab context. |
| **Navigation** | Standalone route: `/residents` |
| **Roles** | All residents can view. Community leads can remove non-lead residents. Platform admins can view phone numbers. |

---

## Platform Admin Console (Web Application)

The Platform Admin Console is a standalone single-page web application (`admin-dashboard/`) built using vanilla HTML/CSS/JS with Supabase JS and Chart.js CDNs. It allows platform admins to manage community-level structures, onboarding, and fund approvals.

In the mobile app, platform admins are automatically redirected to the `/admin-redirect` screen which informs them that the portal has moved and directs them to the web URL.

### Dashboard (`#dashboard`)

| Aspect | Details |
|--------|---------|
| **Purpose** | High-level metrics visualization and provider category breakdowns per community |
| **Tables / RPCs** | Calls RPC: `platform_get_community_dashboard`, `platform_get_providers_by_category` |
| **Business rules** | Admins select a community from a dropdown. It displays 8 metric cards: Residents, Service Providers, Scheduled Visits (Upcoming), Completed Visits, Past Visits (last 30 days), Hires/Contacts (total and monthly), Orders Placed (marketplace orders with pending/fulfilled breakdown), and Funds Health (collected vs spent). A horizontal bar chart visualizes service providers by category, and collapsible cards list the top 3 rated providers for each category. |

### Funds Requests (`#funds-requests`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Review pending/decided funds-access requests, designate lead on approval, or reject with reason |
| **Tables / RPCs** | Reads: `funds_access_requests`, `communities`, `profiles`; writes via RPC: `platform_approve_funds_access_request`, `platform_reject_funds_access_request` |
| **Business rules** | Approval requires selecting an active resident to designate as the community lead (defaults to requester). Rejection supports a 280-char reason. Re-evaluates local lists and updates status inline. |

### Community Approvals (`#approvals`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Review and act on pending community creation requests |
| **Tables** | Reads: `community_requests`, `profiles`; writes via RPC: `platform_approve_community_request`, `platform_reject_community_request`; audit RPC: `set_audit_actor` |
| **Business rules** | Approval creates the community, generates its join code, and assigns the requester to that community as `resident`. The admin can optionally seed blocks/towers at approval time by adding block names and selecting a label (Block or Tower); when blocks are provided, the community is created with `blocks_enabled = true` and the corresponding `block_label`. Rejection accepts an optional rejection reason. Reviewer cards show requester name, phone, email, flat number, and submitted location details. |

### Communities Directory and Detail (`#communities`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Inspect communities, see membership counts, and manage local community leads, blocks/towers, and residents |
| **Tables** | Reads: `communities`, `profiles`; writes via RPC: `platform_soft_remove_resident`, `platform_set_community_lead`, `platform_remove_community_lead`, `platform_set_blocks_enabled`, `platform_set_block_label`, `platform_add_community_block`, `platform_archive_community_block`, `platform_remove_block_in_charge`, `platform_revoke_funds_access` |
| **Business rules** | Platform removals are soft deletes on the profile, reset the role to resident, and preserve last-lead protection. Detail screen includes funds status, revoke action, lead set/remove controls, block list management with block/tower label toggle, and block in-charge removals across funds. The top identity card shows active community leads. |

---

## Service Providers

### Add Provider (`app/provider/add.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Register a trusted service provider for the current community |
| **Tables** | Writes: `service_providers`; optionally writes: `provider_personal_notes` (creator's private note) |
| **Business rules** | Required: name, phone, and category. Categories come from `constants/categories.ts` (including options such as Photography, Decoration, Notary, Babysitter). The category picker is grouped into high-level sections (for example Home Support, Repairs & Maintenance, Events & Functions) to make long service lists easier to navigate before choosing a specific category. The form supports category-specific structured details via `constants/providerDetails.ts` but omits salary input; pricing can be written in the freeform description placeholder (for example service-wise charges). Flat/block note input is removed from add-provider. A private "Personal note" field can be filled at save time and is stored only for the current resident. Phone accepts flexible input formats (for example with country code), then normalizes to a validated 10-digit mobile number before duplicate checks, fraud checks, and insert. If a provider with the same normalized phone already exists in the same community, the form explains that the phone is already linked and routes users to that existing provider instead of creating a duplicate row. Provider creation runs the fraud check helper before insert and stores the resulting `fraud_status`. |
| **Navigation** | From the Help tab add action. Opens the newly created provider after a successful save; duplicate phone matches open the existing provider. |
| **Roles** | All residents can add providers |

### Provider Detail (`app/provider/[id].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Show provider profile, ratings, save state, contact actions, report, and lead/admin-only deletion |
| **Tables** | Reads: `service_providers`, `favorites`, `ratings`, `provider_hires`, `provider_reports`, `provider_personal_notes`; writes: `favorites`, `ratings`, `provider_hires`, `provider_reports`, `provider_personal_notes` |
| **Business rules** | Ratings are 1-5 stars with one upserted rating per user. Users can submit or edit review text without re-tapping stars when an existing rating already exists. Community reviews are listed with reviewer name, optional flat number, star rating, and review text for community-visible ratings. The list is collapsed to the first 3 items by default with a Load more/Show less toggle for readability. Contact actions increment provider hire history and schedule a local 24-hour feedback reminder. The old private history card is replaced with a private "Personal note" editor, and the saved note is visible only to the same resident who wrote it. Experience Details remain hidden on this screen. All residents see a "Report provider" button with predefined reason categories (Wrong info, Spam, Inappropriate, No longer available, Other); each user can report a provider once. Community leads and platform admins see a "Delete provider" button instead. Reports notify community leads for review. |
| **Navigation** | From the Help tab, Favorites, Visit Detail, and Service Reminder technician lookup |
| **Integrations** | Phone, WhatsApp, native Share |

### Hire Feedback (Private) (`app/hire-feedback/[hireId].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Collect a resident's private post-visit signal after a logged hire |
| **Tables / RPCs** | Reads: `provider_hires`, `service_providers`; reads/writes: `hire_feedback`; RPCs: `record_hire_feedback`, `should_show_public_rating_nudge`, `mark_public_rating_nudge` |
| **Business rules** | A local notification (24 hours after hire) opens this flow. Resident can record `positive`, `negative`, or `skipped`, with an optional 280-char note for `positive`/`negative`. Feedback is strictly private and user-scoped. A `positive` signal can trigger a same-screen public-rating prompt exactly once per provider, gated by existing rating + nudge memory. `negative` and `skipped` never trigger the public-rating prompt. Public ratings are never auto-created; only explicit `Rate now` continues to provider rating UI. |
| **Navigation** | Notification deep link route from `data.kind = 'hire_feedback'`; `Rate now` continues to `/provider/[id]` |
| **Integrations** | `expo-notifications` local scheduling and response handling |

---

## Service Visits

### Add Visit (`app/visits/add.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Schedule a group visit for a service, optionally linked to an existing provider |
| **Tables** | Reads: `service_providers`; writes: `service_visits` |
| **Business rules** | Required: title, category, provider context, and date. Categories are drawn from the full shared list in `constants/categories.ts` and presented through the same two-level grouped picker (Home Support, Repairs & Maintenance, Healthcare & Wellness, Personal Care, Transport & Vehicle, Events & Functions, Education & Classes, Government Services, Other) used on the Add Provider form. Users can link an existing provider (label: "Select existing provider") or enter a manual provider name and phone. Manual phone and WhatsApp values accept flexible formats but are validated and normalized to 10-digit mobile numbers before save. Visit dates are stored as local calendar dates (`YYYY-MM-DD`) to avoid timezone rollover into the previous day. New visits start as `upcoming`. |
| **Navigation** | From the Help tab add action. Returns back on success. |
| **Roles** | All residents can create visits |

### Visit Detail (`app/visits/[id].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Show visit details, joiners, join and leave actions, and creator-side status controls |
| **Tables** | Reads: `service_visits`, `visit_joiners`, `profiles`; RPC: `get_visit_joiners`; writes: `visit_joiners`, `service_visits.status` |
| **Business rules** | Joiners can add optional flat number and note. The join modal seeds the flat number from `profile.flat_number` when available and formats edited flat numbers to uppercase without spaces or hyphens on blur. Only the creator can move the visit between `upcoming`, `in_progress`, `completed`, and `cancelled`, and can also reschedule an upcoming visit by updating date/start/end time from the detail screen. Rescheduling emits a community notification to other residents so they see the updated schedule. Creator action buttons for mark complete, reschedule, and cancel are shown only while the visit is still `upcoming`; once completed or cancelled, those actions are hidden. Date parsing for display and past/upcoming checks uses local date-only handling to keep status classification consistent across timezones. Back navigation preserves the prior Help tab state through route params. |
| **Navigation** | From Help and Notifications. Can deep-link to `/provider/[id]` when the visit is linked to a provider. |

---

## Fund Management

### Community Funds Home (`app/funds/index.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Dedicated entry point for the Community funds tile; central place to browse fund health and all community fund events |
| **Tables / RPCs** | RPC reads: `get_my_community_funds_overview()`; list data via `events`, `event_transactions`, `fund_roles` through `FundsList` |
| **Business rules** | Layout order is fixed: Fund health summary on top, then Events and funds list below. All community funds/events are shown from this page, and each card opens per-fund detail. Create-fund CTA remains role-gated. |
| **Navigation** | From `/(tabs)/community` funds tile. To `/funds/[id]` and `/funds/add`. |
| **Roles** | All residents can view; create remains community-lead/platform-admin gated. |

### Add Fund (`app/funds/add.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Create a fund and assign 1-2 treasurers |
| **Tables** | Reads: `profiles`; writes: `events`, `fund_roles` |
| **Business rules** | Fund title is required. At least one treasurer must be selected, with a max of two. The fund starts with `goal_amount = 0` and `event_date = now`. The route blocks access when funds are inactive or the caller is not a community lead or platform admin. |
| **Navigation** | From the Community tab funds action. Redirects to `/funds/[id]` after success. |
| **Roles** | Intended for community leads or equivalent fund admins |

### Fund Detail (`app/funds/[id].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Show ledger totals, transaction history, and role assignment controls |
| **Tables** | Reads: `events`, `event_transactions`, `fund_roles`, `profiles`; writes: `fund_roles` |
| **Business rules** | Treasurers can manage collectors and all transactions. Collectors can add contributions only. Existing contributions can be edited by collectors and treasurers. Residents stay view-only. Community leads are treated as treasurer-level in this fund context. Minimum treasurer count is one, max treasurers is two. In block-enabled communities, collector assignment from fund detail requires choosing a specific block scope (no all-residents option in that flow). Fund detail explicitly shows a single Contributions list (income entries with contributor details) and an Expense list. If funds are inactive, stale links render a safe inactive state instead of loading ledger actions. Community Leads can mark funds as 'closed' which blocks further transactions or edits. |
| **Navigation** | To `/funds/add-transaction?event_id=...&type=income|expense` |

### Add Transaction (`app/funds/add-transaction.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Log either an income contribution or an expense against a fund |
| **Tables** | Reads: `events`, `fund_roles`, `event_transactions`; RPC read: `list_eligible_contributors_for_collector`; writes: `event_transactions` |
| **Business rules** | Contribution mode uses block-aware eligible contributor list and marks already-contributed residents as disabled. In block-enabled communities, collectors and treasurers without a block assignment must pick a specific block before continuing to contribution mode (no all-residents option in that prompt). Expense mode requires title and amount and does not set `contributor_user_id`. If funds are inactive, screen shows a graceful error state. |
| **Roles** | Contributions: collector, treasurer, or community lead. Expenses: treasurer or community lead. |

---

## Notifications (`app/notifications.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Show a per-user notification feed with mark-as-read actions |
| **Tables** | Reads and writes: `notifications` |
| **Business rules** | Notification UI handles funds-activation types (`funds_access_requested`, `funds_access_approved`, `funds_access_rejected`, `community_lead_appointed`, `funds_access_revoked`) in addition to existing flows, and unknown types still fall through safely. Legacy promotion and admin-review payloads are still recognized so older notification rows remain tappable. Users can mark individual rows or the full list as read. |
| **Navigation** | From the header bell on the Help tab. `new_visit` opens `/visits/[id]`; `service_reminder` opens `/services/[id]`; community approval, rejection, and removal route to `/community-select`; funds-requested and legacy promotion or admin-review notifications open platform approvals; funds approval, rejection, lead, and revocation notifications route to the Community tab. |
| **Roles** | Personal notifications only |
| **Real-time** | Supabase Realtime subscribes to INSERT events on the signed-in user's notifications, updates local state, and triggers a local native alert on mobile. |

---

## Personal Service Reminders

### My Service Reminders (`app/services/index.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | List the signed-in user's upcoming service reminders |
| **Tables** | Reads via RPC: `get_my_upcoming_services()` on `user_services` |
| **Business rules** | Data is user-scoped rather than community-scoped. The screen supports pull-to-refresh and sorts reminders by next due date and urgency. |
| **Navigation** | To `/services/[id]` and `/services/add` |
| **Roles** | Any authenticated user |

### Add Service Reminder (`app/services/add.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Create a personal maintenance reminder for an appliance or recurring service |
| **Tables** | Writes: `user_services`; reads community providers from `service_providers` for optional linking |
| **Business rules** | Required: `service_name`, `category`, `last_serviced_on`, and `frequency_months`. Date cannot be in the future; frequency must be between 1 and 60 months. Category choice pre-fills the default reminder frequency from `lib/serviceCategories.ts`. Linking a provider is optional. The linked-provider dropdown supports search by provider name and phone number. Provider options refresh when the screen regains focus, so a newly added provider appears immediately after returning from the add-provider flow. When no providers are available, the form surfaces a direct shortcut to add a provider and return. |
| **Integrations** | `@react-native-community/datetimepicker` |

### Service Reminder Detail (`app/services/[id].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | View urgency, edit reminder details, mark work completed, find a technician, or delete the reminder |
| **Tables** | Reads directly from `user_services` by reminder ID; writes directly to `user_services`; RPC: `mark_service_done(p_service_id)` |
| **Business rules** | Mark-done uses optimistic UI then refreshes from the database source of truth. Editing reuses add validations and supports mapping or remapping to any saved community provider from the picker list, including search by provider name and phone number. Provider options refresh when the screen regains focus, so newly added providers are available immediately after returning. The completion flow supports optional provider, amount-paid, and note capture before the reminder is rolled forward. Delete requires confirmation. The technician shortcut routes users back to the Providers segment of the Help screen with a mapped category filter. |

### Home and Profile Surfaces

| Surface | Details |
|---------|---------|
| **Home card** | `components/UpcomingServicesCard.tsx` appears above the main Help content. In the zero-service state, it renders as a compact single-row inline banner with the wrench emoji, title, body text, an inline "Add service" CTA button, and a dismiss button — all in one ~40px row (previously a multi-row card with a full-width CTA button). The all-clear state and has-due states are similarly compacted with reduced padding (8px vertical, 12px horizontal) and smaller text sizes (13px titles, 12px links). |
| **Profile row** | `app/(tabs)/profile.tsx` shows a due-soon badge sourced from `get_my_due_soon_count()` and links into `/services`. |
| **Notifications** | `notify_due_services()` creates `service_reminder` notifications when reminders are due within 7 days and `notified_at` is empty. The fallback scheduler is the `check_due_services` edge function. |

---

## Cross-Community (Backend Only)

Cross-community backend foundations are live in the database: partnerships, groups, provider sharing, cross-community visit audiences, scoped fund metadata, announcements audiences, additive visibility helpers, and federation RPCs are now available for future product phases. The current app ships no user-facing cross-community UI yet, so existing screens and flows remain unchanged. See `docs/cross-community.md` for the full backend reference.

---

## My Community Network (MCN)

### Network Hub (`app/(tabs)/network.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | A local business directory plus social sharing surface for borrow/free needs. |
| **Tables** | Reads: `mcn_listings`, `mcn_products`, `mcn_business_categories`, `ratings`, `profiles`; writes: `mcn_posts` moderation actions |
| **Business rules** | Business listings are community-scoped and searchable with a 300ms debounce. A horizontal category chip bar (`All` + lookup categories) filters listings by `category_id`; tapping the active chip toggles back to `All`. Inactive listings remain visible in the feed with an inactive badge, while active listings are sorted first. Listing cards show business summary only (image, owner, category badge); offerings and prices are shown only after opening listing details. The Remove listing action is the permanent delete path. |
| **Navigation** | To `app/network/listing-add.tsx`, `app/network/listing/[id].tsx`, and owner manage routes |
| **Roles** | All residents can view and add posts. Community leads can moderate (delete) any post. |

### Add Post (`app/network/add.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Create a new business or borrow post. |
| **Tables** | Writes: `mcn_posts` |
| **Business rules** | Title is required (max 80 chars). Description is optional (max 280 chars). For Borrow & Share posts (`kind='borrow'`), contact info is mandatory; business-kind posts can still keep it optional. If a 10 digit number is extracted, it is normalized. |
| **Navigation** | From `app/(tabs)/network.tsx`. Routes back on success. |
| **Roles** | All residents can create posts. |

### My Posts (`app/network/my-posts.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Management screen for a user's own active and closed MCN posts. |
| **Tables** | Reads/Writes: `mcn_posts` |
| **Business rules** | In default mode, users can view their own posts grouped by Active and Closed and can close/delete their own posts. When launched from the Network hub Borrow & Share card, the screen runs in borrow-only community-feed mode (local businesses hidden) and shows borrow posts from the whole community; close/delete actions remain only for the signed-in user's own posts. |
| **Navigation** | From `app/(tabs)/profile.tsx`. The Borrow & Share card in `app/(tabs)/network.tsx` deep-links here in borrow-only community-feed mode. The floating add button creates a borrow post in borrow-only mode, otherwise it creates either a business listing (business segment) or borrow post (borrow segment). |

### Add Listing (`app/network/listing-add.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Create a new local business listing. |
| **Tables** | Reads: `mcn_business_categories`; writes: `mcn_listings` |
| **Business rules** | Business name is required (max 80 chars). Business category is required and selected from the `mcn_business_categories` lookup table. Description is optional (max 280 chars). Contact phone is required and normalized to a 10-digit number. |
| **Navigation** | From `app/(tabs)/network.tsx` (business segment FAB). Navigates to manage screen on success. |
| **Roles** | All residents can create listings. |

### Listing Detail & Order (`app/network/listing/[id].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | View business profile details, offerings, contact details, and place or update orders. |
| **Tables** | Reads: `mcn_listings`, `mcn_business_categories`, `mcn_products`, `mcn_orders`, `mcn_order_items`, `profiles` |
| **Business rules** | Quantity increments are: `0.5` for kg/litre; `1` for piece/dozen/box/pack. Min quantity is 0. Cart displays line items and subtotals. Note is optional. Action button places a new order or updates an existing pending order (removes old items and inserts new). Direct Call and WhatsApp communication links. |
| **Offerings UI** | The screen shows a category badge (emoji + name) and splits offerings by `item_type` into `Products` and `Services` sections. Each row shows name, optional description, availability state, and either `₹ amount / unit` or `Price on request` when `price` is `NULL`. |
| **Navigation** | From listing card click. |
| **Roles** | Any resident (except listing owner) can place orders. |

### Manage Listing (`app/network/listing/manage/[id].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Owner panel to toggle listing visibility, edit listing details, and manage products/services. |
| **Tables** | Reads/Writes: `mcn_listings`, `mcn_business_categories`, `mcn_products`, `mcn_orders` |
| **Business rules** | Owner can toggle listing active/paused. Listing details include editable business category. Offering modal supports `item_type` (`product` or `service`) and optional price. When price is blank, `NULL` is stored and shown as `Price on request` in UI. Deletion is restricted if the item has existing order-item references. |
| **Navigation** | From owner listing card "Manage" link. |
| **Roles** | Only the listing owner. |

### Orders Received (`app/network/listing/orders/[id].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | View and update orders placed against the business listing. |
| **Tables** | Reads/Writes: `mcn_orders`, `mcn_order_items`, `profiles`, `mcn_products` |
| **Business rules** | Orders grouped by status: Pending, Fulfilled, Cancelled. WhatsApp button includes pre-filled message with order items and total. Pending orders can be marked fulfilled or cancelled (requires confirmation popup). |
| **Navigation** | From Manage Listing screen. |
| **Roles** | Only the listing owner. |

### Food Pre-Orders & Flash Drops (`app/network/drops/index.tsx`, `app/network/drops/add.tsx`, `app/network/drops/[id].tsx`, `app/network/drops/manage/[id].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Enable food businesses and home chefs to post scheduled, time-gated food drops (e.g. Saturday pizza night closing Friday 9 PM) with cut-off deadlines. |
| **Tables** | Reads/Writes: `mcn_preorder_drops`, `mcn_preorder_items`, `mcn_preorder_orders`, `mcn_preorder_order_items`, `mcn_listings`, `profiles` |
| **Business rules** | Owners publish a drop specifying title, prep notes, delivery date/time slot, cut-off date/time deadline, and items offered (name, unit, price). Cut-off deadlines automatically block new resident orders when passed. Residents place pre-orders before the deadline with flat number and contact phone. The owner management dashboard (`app/network/drops/manage/[id].tsx`) automatically aggregates item totals across all pre-orders for kitchen preparation (e.g., "14x Margherita, 8x Garlic Bread") and provides a resident delivery roster with Call & WhatsApp shortcuts. Owners mark resident orders as `fulfilled` upon delivery and mark the drop `completed`. |
| **Navigation** | From MCN hub ("Food Pre-Orders & Flash Drops" tile), `/network/drops`, `/network/drops/add`, `/network/drops/[id]`, and `/network/drops/manage/[id]`. |
| **Roles** | All residents can view open drops, place/cancel pre-orders, and publish food drops. Drop creators can close orders early, manage orders, mark orders fulfilled, and complete drops. |

### Schools Directory & Parent Report Card (`app/network/schools/index.tsx`, `app/network/schools/[id].tsx`, `app/network/schools/review.tsx`, `app/network/schools/add.tsx`, `app/network/schools/compare.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Verified directory of 50+ regional schools plus a structured Parent Report Card review system. |
| **Tables** | Reads/Writes: `schools`, `school_reviews`, `profiles` |
| **Business rules** | Schools catalog aggregates curated regional data and community-submitted schools. The Parent Report Card replaces flat 1-5 star reviews with 7 aspect dimensions (Academics, Teachers, Infrastructure, Safety & Hygiene, Transport, Value for Money, Child's Happiness) rated on an emoji scale (😟 😕 😐 🙂 🤩). Parents select their child's grade and can add optional 140-char per-aspect notes. Aggregate aspect averages are stored on the `schools` table via database trigger. School detail page renders a 7-axis spider/radar chart (`SchoolRadarChart`), aspect score breakdown, parent review cards (`SchoolReviewCard`), and a report card CTA button (`app/network/schools/review.tsx`). School listing cards display parent review counts and review badges. |
| **Navigation** | From MCN hub ("Schools & Parent Corner" tile), `/network/schools`, `/network/schools/[id]`, `/network/schools/review`, `/network/schools/add`, and `/network/schools/compare`. |
| **Roles** | All residents can view schools, submit/edit their own report card, compare schools, and add schools. Community leads can delete school listings. |

---

## Removed Product Surface

### Resident Marketplace

The resident marketplace is not part of the current app. The business screens were removed from `app/`, the related marketplace tables were dropped in the `20260422010000_simplify_roles_and_remove_marketplace.sql` migration, and provider favorites and ratings are now single-target only.

---

## Role-Based Access Matrix

| Feature | Resident | Community Lead / Fund Admin | Treasurer | Collector |
|---------|----------|-----------------------------|-----------|-----------|
| View/search providers | Yes | Yes | - | - |
| Add provider | Yes | Yes | - | - |
| Rate or save provider | Yes | Yes | - | - |
| Report provider | Yes | Yes | - | - |
| Delete provider | No | Yes | - | - |
| Create visit | Yes | Yes | - | - |
| Join or leave visit | Yes | Yes | - | - |
| View funds | Yes | Yes | Yes | Yes |
| Create fund | No | Yes | - | - |
| Manage treasurers | No | Yes | - | - |
| Manage collectors | No | Yes | Yes | - |
| Add contribution | No | Yes | Yes | Yes |
| Add expense | No | Yes | Yes | No |
| View personal service reminders | Yes | Yes | Yes | Yes |
| View/Search MCN posts | Yes | Yes | - | - |
| Add MCN post | Yes | Yes | - | - |
| Edit/Close own MCN post | Yes | Yes | - | - |
| Delete own MCN post | Yes | Yes | - | - |
| Delete any MCN post | No | Yes | - | - |
| View/Search business listings | Yes | Yes | - | - |
| Filter listings by business category | Yes | Yes | - | - |
| Create business listing (with category & cover photo) | Yes | Yes | - | - |
| Edit/Toggle own listing active | Yes (own only) | Yes (own only) | - | - |
| Add/Edit/Delete listing products & services (optional price, item type, photo) | Yes (own only) | Yes (own only) | - | - |
| View orders received | Yes (own only) | Yes (own only) | - | - |
| Update order status (fulfill/cancel) | Yes (own only) | Yes (own only) | - | - |
| Place/Update order | Yes (not own) | Yes (not own) | - | - |
| Remove any listing | No | Yes | - | - |
| View own placed orders | Yes | Yes | - | - |
| Cancel own pending order | Yes | Yes | - | - |

---

## External Integrations Summary

| Integration | Used By | How |
|-------------|---------|-----|
| Google Sign-In | Login | `@react-native-google-signin/google-signin` with Supabase token exchange |
| Supabase Auth | Login, signup, password reset | Email and password auth with persisted session |
| Cloudinary | Business cover photos & product images | Direct unsigned HTTP upload to Cloudinary API via `expo-image-picker` |
| Supabase Realtime | Notifications | `postgres_changes` INSERT subscription on `notifications` |
| Expo Notifications | Notifications | Runtime permission request, Android channel setup, local alerts |
| Phone dialer | Provider and visit detail | `Linking.openURL('tel:...')` |
| WhatsApp | Provider and visit detail | `whatsapp://send` or `https://wa.me/` |
| Native Share | Community code and provider detail | `Share.share()` |
| DateTimePicker | Visit add and service reminder flows | `@react-native-community/datetimepicker` |
