# Features Reference

> **AI agents must review this file before modifying any feature.**

This document describes the current user-facing product surface, the screens involved, the active tables touched, key business rules, navigation flows, role-based access, and live integrations.

---

## App Summary

Society Service Hub currently ships four main experiences: trusted provider discovery, community service-visit coordination, activation-gated community funds, and personal service reminders. Residents use the main tabs for everyday workflows, community leads manage local operations such as funds and optional block scoping, and platform admins review community requests plus funds-access requests.

The app surface is narrower than the backend schema by design. Cross-community federation tables and RPCs already exist, but the current UI remains centered on the resident's home community, with no exposed federation controls or cross-community browsing screens yet.

---

## Authentication & Onboarding

### Login (`app/login.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Sign up or sign in via email/password or Google OAuth |
| **Tables** | Writes: `auth.users` through Supabase Auth. Trigger auto-creates `profiles` row. |
| **Business rules** | Email must contain `@`. Sign-up requires full name, flat number, and matching password and confirm password. Flat numbers entered at sign-up are normalized to uppercase with spaces and hyphens removed before being sent as auth metadata, and `handle_new_user()` copies that value into `profiles.flat_number`. If sign-up is attempted with an already-registered email, the form switches to sign-in mode and prompts the user to sign in or use Forgot password. Google sign-in exchanges the native or web identity token with Supabase and always prompts account selection (does not silently reuse the last Google account). |
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
| **Purpose** | Capture an optional first block assignment immediately after a resident joins a block-enabled community |
| **Tables / RPCs** | Writes via RPC: `set_my_block(p_block_id)` |
| **Business rules** | This handoff appears only after a successful join into a community where both `funds_enabled` and `blocks_enabled` are true. Picking a block is optional; users can skip and still enter the app. |
| **Navigation** | From `/community-select` after successful join. To `/(tabs)` on save or skip. |
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
| **Business rules** | Providers are sorted by `avg_rating` descending. The provider filter uses a two-level grouped navigation: a group row (All Services, Home Support, Repairs, Personal, Events, Other) followed by a category chip row that shows only categories within the selected group. Selecting a group without a specific category filters the provider query to all categories in that group using an `IN` clause, so Events + All returns only Photography, Decoration, Catering, etc. and never shows Maid. Selecting a specific category adds a single equality filter. Service Visits split into Upcoming and Past buckets based on date. Cancelled visits stay in Upcoming until their planned date passes. Past visits do not display an `upcoming` status badge even if a stale row still has `status = 'upcoming'`. The screen preserves the active segment and visit sub-tab in route params when users drill into details and return. Provider and visit data are refreshed whenever the screen regains focus so newly added records appear immediately after returning. The header includes an Invite Neighbors action beside notifications that opens the native share sheet with the current community join code. The home stack also shows `UpcomingServicesCard` and `ActiveFundTeaser` above the main list. Provider search and visit search are debounced (300 ms) to avoid firing Supabase queries on every keystroke. The `provider_hires` query is scoped to the current `communityId`. The `visit_joiners` query is scoped to the ID set of the current page of visits only. |
| **Navigation** | To `/provider/[id]`, `/provider/add`, `/visits/[id]`, `/visits/add`, and `/notifications` |
| **Roles** | All community members can browse and create providers or visits |
| **Components** | `UpcomingServicesCard`, `ActiveFundTeaser`, `ProviderCard`, `VisitCard`, `SearchBar`, `CategoryFilter`, `EmptyState` |
| **State additions** | `selectedGroupCategories: string[] \| null` — set by `CategoryFilter` via `onSelectGroupCategories` callback; used to build the `IN` clause on the provider query when a group (but not specific category) is active. |

### Tab 2: Saved - Favorites (`app/(tabs)/favorites.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Show the current user's saved providers |
| **Tables** | Reads and writes: `favorites`, joined with `service_providers` |
| **Business rules** | Favorites are provider-only. Unfavoriting removes the item from the list immediately. `useFocusEffect` refreshes the screen whenever the tab regains focus. |
| **Navigation** | To `/provider/[id]` |
| **Roles** | Personal favorites only |

### Tab 3: Community (`app/(tabs)/community.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Consolidated building-level view: pulse updates, funds section, residents shortcut, and community info in one tab |
| **Tables / RPCs** | Reads: `communities`, `events`, `event_transactions`, `fund_roles`, `profiles`, `funds_access_requests`; RPCs: `get_community_pulse(p_limit)`, `get_my_community_funds_overview()`, `withdraw_funds_access_request(...)` |
| **Business rules** | Section order is fixed: pulse, funds, residents tile, community info. Top hero now shows only the community name. Pulse is read-only aggregated activity with no comments, reactions, or feed drill-down, and the entire section is hidden when empty. Fund-created activity is excluded from pulse so fund events are surfaced only in the dedicated funds flow. Funds are activation-gated: when `funds_enabled = false`, the section renders request/status cards (request CTA, pending, rejected retry, and previously-active note) instead of fund tiles. When `funds_enabled = true`, the section renders one merged Community funds card that includes fund health summary and the "Open community funds" action to route to the dedicated funds page. Community info includes a dedicated community-code tile with an Invite neighbors share action (same copy pattern as Home tab invite). Funds request CTA entry is only in this section. |
| **Navigation** | To `/funds`, `/funds/[id]`, `/funds/add`, and `/residents?returnTo=community` |
| **Roles** | All residents can view; create-fund action remains role-gated exactly as before. |

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

## Blocks (Optional)

Blocks are funds-gated and visible only when `funds_enabled = true` and `blocks_enabled = true`.

- Join flow: after `join_community_by_code`, users are routed to `/community-join-block` when blocks are enabled.
- Profile override: Profile tab shows "Your block" row and block picker modal only when blocks are active.
- Community lead setup: `/community/blocks` allows block toggling, create/rename/archive, and scoped management.
- Contribution flow: contributor options are loaded through `list_eligible_contributors_for_collector(...)` so block in-charges only see eligible residents.

### Community Blocks Management (`app/community/blocks.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Let a community lead enable or disable block scoping and manage the block roster |
| **Tables / RPCs** | Reads: `profiles`, `fund_roles`; RPCs: `list_community_blocks`, `set_community_blocks_enabled`, `add_community_block`, `rename_community_block`, `archive_community_block` |
| **Business rules** | Disabling blocks removes active block scoping for residents and block in-charges but preserves historical fund contributions. The screen surfaces resident counts and in-charge counts per block to support safe cleanup and archival decisions. |
| **Navigation** | Linked from funds-enabled community-management flows. |
| **Roles** | Community lead only |

### Tab 4: Profile - Personal Hub (`app/(tabs)/profile.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Account-level hub for user identity, personal service reminders, recent personal service history, and sign-out |
| **Tables / RPCs** | RPCs: `get_my_due_soon_count()`, `get_my_recent_service_history(p_limit)` |
| **Business rules** | Profile now avoids building-level sections. Community metadata and residents-directory access are rendered in the Community tab only. |
| **Navigation** | To `/services` and `/login` after sign-out |
| **Roles** | Personal profile only |

---

## Community Directory

### Residents Directory (`app/residents.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Standalone community directory screen linked from the Community tab |
| **Tables** | Reads via RPC: `get_residents_directory(p_include_phone)`; writes via RPC: `community_lead_remove_resident(p_target_profile_id)` |
| **Business rules** | Directory shows active residents only. Phone numbers are exposed only to community leads and platform admins. Community leads can open a resident sheet and remove non-lead residents. The screen supports a `returnTo` param to return to the caller tab context. |
| **Navigation** | Standalone route: `/residents` |
| **Roles** | All residents can view. Community leads can remove non-lead residents. Platform admins can view phone numbers. |

---

## Platform Admin Console (`app/platform/*`)

### Platform Tab Shell (`app/platform/_layout.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Dedicated platform-admin-only tab shell |
| **Business rules** | Root routing redirects platform admins into this area and blocks non-admins from entering it. Each screen exposes a logout action in the header. |
| **Navigation** | `/platform/approvals`, `/platform/communities`, `/platform/funds-requests`, `/platform/funds-access/[requestId]` |
| **Roles** | Platform admin only |

### Funds Requests (`app/platform/funds-requests.tsx`, `app/platform/funds-access/[requestId].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Review pending/decided funds-access requests, designate lead on approval, or reject with reason |
| **Tables / RPCs** | Reads: `funds_access_requests`, `communities`, `profiles`; writes via RPC: `platform_approve_funds_access_request`, `platform_reject_funds_access_request` |
| **Business rules** | Approval requires selecting a resident lead (default requester when possible). Rejection supports a 280-char reason. Both actions route back to list and emit notifications. |

### Community Approvals (`app/platform/approvals.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Review and act on pending community creation requests |
| **Tables** | Reads: `community_requests`, `profiles`; writes via RPC: `platform_approve_community_request`, `platform_reject_community_request`; audit RPC: `set_audit_actor` |
| **Business rules** | Approval creates the community, generates its join code, and assigns the requester to that community as `resident`. Rejection accepts an optional rejection reason. Reviewer cards show requester name, phone, email, flat number, and submitted location details. |

### Communities Directory and Detail (`app/platform/communities.tsx`, `app/platform/community/[id].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Inspect communities, see membership counts, and remove residents if required |
| **Tables** | Reads: `communities`, `profiles`; writes via RPC: `platform_soft_remove_resident` |
| **Business rules** | Platform removals are soft deletes on the profile, reset the role to resident, and preserve last-lead protection. Counts exclude removed residents. Detail screen now also includes funds status, revoke action, lead set/remove controls, block list management, and block in-charge removals across funds. The top identity card shows all active community leads for that community (or Not assigned) rather than the logged-in platform admin identity. |

---

## Service Providers

### Add Provider (`app/provider/add.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Register a trusted service provider for the current community |
| **Tables** | Writes: `service_providers` |
| **Business rules** | Required: name, phone, and category. Categories come from `constants/categories.ts` (including options such as Photography and Decoration). The category picker is grouped into high-level sections (for example Home Support, Repairs, Events) to make long service lists easier to navigate before choosing a specific category. The form supports category-specific structured details via `constants/providerDetails.ts`, optional description, and optional flat or block note. Phone accepts flexible input formats (for example with country code), then normalizes to a validated 10-digit mobile number before duplicate checks, fraud checks, and insert. If a provider with the same normalized phone already exists in the same community, the form routes users to that existing provider instead of creating a duplicate row. Provider creation runs the fraud check helper before insert and stores the resulting `fraud_status`. |
| **Navigation** | From the Help tab add action. Returns back on success. |
| **Roles** | All residents can add providers |

### Provider Detail (`app/provider/[id].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Show provider profile, ratings, save state, contact actions, and creator-only deletion |
| **Tables** | Reads: `service_providers`, `favorites`, `ratings`, `provider_hires`; RPC: `get_my_provider_history`; writes: `favorites`, `ratings`, `provider_hires` |
| **Business rules** | Ratings are 1-5 stars with one upserted rating per user. Users can submit or edit review text without re-tapping stars when an existing rating already exists. Contact actions increment provider hire history and schedule a local 24-hour feedback reminder. The detail screen includes a private, resident-only summary card for that resident's own provider history (`👍/👎/⏭`) and optional notes. Creator-only deletion remains enforced in the UI and database. |
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
| **Business rules** | Required: title, category, provider context, and date. Categories are drawn from the full shared list in `constants/categories.ts` and presented through the same two-level grouped picker (Home Support, Repairs, Personal, Events, Other) used on the Add Provider form. Users can link an existing provider or enter a manual provider name and phone. Manual phone and WhatsApp values accept flexible formats but are validated and normalized to 10-digit mobile numbers before save. New visits start as `upcoming`. |
| **Navigation** | From the Help tab add action. Returns back on success. |
| **Roles** | All residents can create visits |

### Visit Detail (`app/visits/[id].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Show visit details, joiners, join and leave actions, and creator-side status controls |
| **Tables** | Reads: `service_visits`, `visit_joiners`, `profiles`; RPC: `get_visit_joiners`; writes: `visit_joiners`, `service_visits.status` |
| **Business rules** | Joiners can add optional flat number and note. The join modal seeds the flat number from `profile.flat_number` when available and formats edited flat numbers to uppercase without spaces or hyphens on blur. Only the creator can move the visit between `upcoming`, `in_progress`, `completed`, and `cancelled`. Back navigation preserves the prior Help tab state through route params. |
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
| **Business rules** | Treasurers can manage collectors and all transactions. Collectors can add contributions only. Residents stay view-only. Minimum treasurer count is one, max treasurers is two. Collector assignment now supports optional block-scoped assignment when blocks are enabled. Fund detail explicitly shows: contribution status by resident, collection list (income entries), and expense list. If funds are inactive, stale links render a safe inactive state instead of loading ledger actions. |
| **Navigation** | To `/funds/add-transaction?event_id=...&type=income|expense` |

### Add Transaction (`app/funds/add-transaction.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Log either an income contribution or an expense against a fund |
| **Tables** | Reads: `events`, `fund_roles`, `event_transactions`; RPC read: `list_eligible_contributors_for_collector`; writes: `event_transactions` |
| **Business rules** | Contribution mode uses block-aware eligible contributor list and marks already-contributed residents as disabled. Expense mode requires title and amount and does not set `contributor_user_id`. If funds are inactive, screen shows a graceful error state. |
| **Roles** | Contributions: collector or treasurer. Expenses: treasurer only. |

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
| **Home card** | `components/UpcomingServicesCard.tsx` appears above the main Help content. It can show urgent reminders, an all-clear state, or a dismissible onboarding prompt persisted in AsyncStorage. |
| **Profile row** | `app/(tabs)/profile.tsx` shows a due-soon badge sourced from `get_my_due_soon_count()` and links into `/services`. |
| **Notifications** | `notify_due_services()` creates `service_reminder` notifications when reminders are due within 7 days and `notified_at` is empty. The fallback scheduler is the `check_due_services` edge function. |

---

## Cross-Community (Backend Only)

Cross-community backend foundations are live in the database: partnerships, groups, provider sharing, cross-community visit audiences, scoped fund metadata, announcements audiences, additive visibility helpers, and federation RPCs are now available for future product phases. The current app ships no user-facing cross-community UI yet, so existing screens and flows remain unchanged. See `docs/cross-community.md` for the full backend reference.

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
| Create visit | Yes | Yes | - | - |
| Join or leave visit | Yes | Yes | - | - |
| View funds | Yes | Yes | Yes | Yes |
| Create fund | No | Yes | - | - |
| Manage treasurers | No | Yes | - | - |
| Manage collectors | No | Yes | Yes | - |
| Add contribution | No | Yes | Yes | Yes |
| Add expense | No | Yes | Yes | No |
| View personal service reminders | Yes | Yes | Yes | Yes |

---

## External Integrations Summary

| Integration | Used By | How |
|-------------|---------|-----|
| Google Sign-In | Login | `@react-native-google-signin/google-signin` with Supabase token exchange |
| Supabase Auth | Login, signup, password reset | Email and password auth with persisted session |
| Supabase Realtime | Notifications | `postgres_changes` INSERT subscription on `notifications` |
| Expo Notifications | Notifications | Runtime permission request, Android channel setup, local alerts |
| Phone dialer | Provider and visit detail | `Linking.openURL('tel:...')` |
| WhatsApp | Provider and visit detail | `whatsapp://send` or `https://wa.me/` |
| Native Share | Community code and provider detail | `Share.share()` |
| DateTimePicker | Visit add and service reminder flows | `@react-native-community/datetimepicker` |
