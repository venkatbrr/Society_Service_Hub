# Features Reference

> **AI agents must review this file before modifying any feature.**

This document describes the current user-facing product surface, the screens involved, the active tables touched, key business rules, navigation flows, role-based access, and live integrations.

---

## Authentication & Onboarding

### Login (`app/login.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Sign up or sign in via email/password or Google OAuth |
| **Tables** | Writes: `auth.users` through Supabase Auth. Trigger auto-creates `profiles` row. |
| **Business rules** | Email must contain `@`. Sign-up requires full name, matching password and confirm password. Google sign-in exchanges the native or web identity token with Supabase and always prompts account selection (does not silently reuse the last Google account). |
| **Navigation** | Entry point for unauthenticated users. Links to `/forgot-password`. Post-auth routing is handled by the root layout. |
| **Roles** | N/A (pre-auth) |
| **Integrations** | Supabase Auth, Google Sign-In |

### Community Select (`app/community-select.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Join an existing community by code or start the request flow for a new one |
| **Tables** | Writes: `profiles` via `join_community_by_code(p_code)` RPC |
| **Business rules** | Join code is a 6-character uppercase alphanumeric code. Joining is immediate; there is no resident approval queue. Successful joins call `refreshSession()` so auth state and `communityId` update before redirecting. |
| **Navigation** | From root redirect when authenticated users have no `community_id` and no active request. To `/(tabs)` after join, or `/community-request` for a new request. |
| **Roles** | Any authenticated user |

### Community Request (`app/community-request.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Submit a new community creation request for platform review |
| **Tables** | Writes: `community_requests` through `submit_community_request(...)` RPC |
| **Business rules** | Required: community name, city, pincode, flat or house number, and accuracy confirmation. Optional: area, address, community type, approximate units. New requests enter `pending` status. |
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
| **Business rules** | Providers are sorted by `avg_rating` descending. Service Visits split into Upcoming and Past buckets based on date. Cancelled visits stay in Upcoming until their planned date passes. The screen preserves the active segment and visit sub-tab in route params when users drill into details and return. The home stack also shows `UpcomingServicesCard` and `ActiveFundTeaser` above the main list. |
| **Navigation** | To `/provider/[id]`, `/provider/add`, `/visits/[id]`, `/visits/add`, `/notifications`, and `/(tabs)/profile` |
| **Roles** | All community members can browse and create providers or visits |
| **Components** | `UpcomingServicesCard`, `ActiveFundTeaser`, `ProviderCard`, `VisitCard`, `SearchBar`, `CategoryFilter`, `EmptyState` |

### Tab 2: Saved - Favorites (`app/(tabs)/favorites.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Show the current user's saved providers |
| **Tables** | Reads and writes: `favorites`, joined with `service_providers` |
| **Business rules** | Favorites are provider-only. Unfavoriting removes the item from the list immediately. `useFocusEffect` refreshes the screen whenever the tab regains focus. |
| **Navigation** | To `/provider/[id]` |
| **Roles** | Personal favorites only |

### Tab 3: Funds - Society Funds (`app/(tabs)/funds.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | List community funds with rolled-up totals and each viewer's effective fund role |
| **Tables** | Reads: `events`, `event_transactions`, `fund_roles`, `profiles` |
| **Business rules** | Funds display income, expense, and balance totals. The UI computes the viewer's role through `getEffectiveFundRole()`. The intended product rule is that community leads create funds and treasurers manage collections; some fund screens still contain legacy `community_admin` compatibility checks internally. |
| **Navigation** | To `/funds/[id]` and `/funds/add` |
| **Roles** | All residents can view funds. Fund creation and management actions are role-gated. |

### Tab 4: Profile - Personal Hub (`app/(tabs)/profile.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Show user identity, role, community details, service reminder entry point, community directory shortcut, and sign-out |
| **Tables** | Reads: `communities`; RPC: `get_my_due_soon_count()` |
| **Business rules** | Community leads see the 6-character join code and can share it. The profile screen surfaces a due-soon badge for personal service reminders and links into the residents directory. |
| **Navigation** | To `/services`, `/residents`, and `/login` after sign-out |
| **Roles** | Personal profile only |

---

## Community Directory

### Residents Directory (`app/residents.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Standalone community directory screen linked from the Profile tab |
| **Tables** | Reads via RPC: `get_residents_directory(p_include_phone)`; writes via RPC: `community_lead_remove_resident(p_target_profile_id)` |
| **Business rules** | Directory shows active residents only. Phone numbers are exposed only to community leads and platform admins. Community leads can open a resident sheet and remove non-lead residents. When launched from Profile, the screen uses `returnTo=profile` so the back action returns to the profile tab explicitly. |
| **Navigation** | Standalone route: `/residents` |
| **Roles** | All residents can view. Community leads can remove non-lead residents. Platform admins can view phone numbers. |

---

## Platform Admin Console (`app/platform/*`)

### Platform Tab Shell (`app/platform/_layout.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Dedicated platform-admin-only tab shell |
| **Business rules** | Root routing redirects platform admins into this area and blocks non-admins from entering it. Each screen exposes a logout action in the header. |
| **Navigation** | `/platform/approvals`, `/platform/communities` |
| **Roles** | Platform admin only |

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
| **Business rules** | Platform removals are soft deletes on the profile, reset the role to resident, and preserve last-lead protection. Counts exclude removed residents. |

---

## Service Providers

### Add Provider (`app/provider/add.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Register a trusted service provider for the current community |
| **Tables** | Writes: `service_providers` |
| **Business rules** | Required: name, phone, and category. Categories come from `constants/categories.ts`. The form supports category-specific structured details via `constants/providerDetails.ts`, optional description, and optional flat or block note. Phone accepts flexible input formats (for example with country code), then normalizes to a validated 10-digit mobile number before duplicate checks, fraud checks, and insert. If a provider with the same normalized phone already exists in the same community, the form routes users to that existing provider instead of creating a duplicate row. Provider creation runs the fraud check helper before insert and stores the resulting `fraud_status`. |
| **Navigation** | From the Help tab add action. Returns back on success. |
| **Roles** | All residents can add providers |

### Provider Detail (`app/provider/[id].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Show provider profile, ratings, save state, contact actions, and creator-only deletion |
| **Tables** | Reads: `service_providers`, `favorites`, `ratings`, `provider_hires`; writes: `favorites`, `ratings`, `provider_hires` |
| **Business rules** | Ratings are 1-5 stars with one upserted rating per user. Contact actions increment provider hire history. Creator-only deletion remains enforced in the UI and database. |
| **Navigation** | From the Help tab, Favorites, Visit Detail, and Service Reminder technician lookup |
| **Integrations** | Phone, WhatsApp, native Share |

---

## Service Visits

### Add Visit (`app/visits/add.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Schedule a group visit for a service, optionally linked to an existing provider |
| **Tables** | Reads: `service_providers`; writes: `service_visits` |
| **Business rules** | Required: title, category, provider context, and date. Users can link an existing provider or enter a manual provider name and phone. Manual phone and WhatsApp values accept flexible formats but are validated and normalized to 10-digit mobile numbers before save. New visits start as `upcoming`. |
| **Navigation** | From the Help tab add action. Returns back on success. |
| **Roles** | All residents can create visits |

### Visit Detail (`app/visits/[id].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Show visit details, joiners, join and leave actions, and creator-side status controls |
| **Tables** | Reads: `service_visits`, `visit_joiners`, `profiles`; RPC: `get_visit_joiners`; writes: `visit_joiners`, `service_visits.status` |
| **Business rules** | Joiners can add optional flat number and note. Only the creator can move the visit between `upcoming`, `in_progress`, `completed`, and `cancelled`. Back navigation preserves the prior Help tab state through route params. |
| **Navigation** | From Help and Notifications. Can deep-link to `/provider/[id]` when the visit is linked to a provider. |

---

## Fund Management

### Add Fund (`app/funds/add.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Create a fund and assign 1-2 treasurers |
| **Tables** | Reads: `profiles`; writes: `events`, `fund_roles` |
| **Business rules** | Fund title is required. At least one treasurer must be selected, with a max of two. The fund starts with `goal_amount = 0` and `event_date = now`. |
| **Navigation** | From the Funds tab action. Redirects to `/funds/[id]` after success. |
| **Roles** | Intended for community leads or equivalent fund admins |

### Fund Detail (`app/funds/[id].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Show ledger totals, transaction history, and role assignment controls |
| **Tables** | Reads: `events`, `event_transactions`, `fund_roles`, `profiles`; writes: `fund_roles` |
| **Business rules** | Treasurers can manage collectors and all transactions. Collectors can add contributions only. Residents stay view-only. Minimum treasurer count is one, max treasurers is two, and max collectors is six. |
| **Navigation** | To `/funds/add-transaction?event_id=...&type=income|expense` |

### Add Transaction (`app/funds/add-transaction.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Log either an income contribution or an expense against a fund |
| **Tables** | Reads: `events`, `fund_roles`, `event_transactions`, `profiles`; writes: `event_transactions` |
| **Business rules** | Contribution mode selects a resident and prevents duplicate paid entries. Expense mode requires title and amount and does not set `contributor_user_id`. Permissions are enforced both in the UI and through database rules. |
| **Roles** | Contributions: collector or treasurer. Expenses: treasurer only. |

---

## Notifications (`app/notifications.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Show a per-user notification feed with mark-as-read actions |
| **Tables** | Reads and writes: `notifications` |
| **Business rules** | Current notification UI handles `new_visit`, `community_approved`, `community_rejected`, `removed_from_community`, and `service_reminder` as active product flows. The screen also includes defensive icon and navigation handling for legacy promotion-related types. Users can mark individual rows or the full list as read. |
| **Navigation** | From the header bell on the Help tab. `new_visit` opens `/visits/[id]`; `service_reminder` opens `/services/[id]`; community-status notifications return users to onboarding screens. |
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
| **Business rules** | Required: `service_name`, `category`, `last_serviced_on`, and `frequency_months`. Date cannot be in the future; frequency must be between 1 and 60 months. Category choice pre-fills the default reminder frequency from `lib/serviceCategories.ts`. Linking a provider is optional. When no providers are available, the form surfaces a direct shortcut to add a provider and return. |
| **Integrations** | `@react-native-community/datetimepicker` |

### Service Reminder Detail (`app/services/[id].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | View urgency, edit reminder details, mark work completed, find a technician, or delete the reminder |
| **Tables** | Reads via `get_my_upcoming_services()`; writes directly to `user_services`; RPC: `mark_service_done(p_service_id)` |
| **Business rules** | Mark-done uses optimistic UI then refreshes from the RPC-backed source of truth. Editing reuses add validations and supports mapping or remapping to any saved community provider. Delete requires confirmation. The technician shortcut routes users back to the Providers segment of the Help screen with a mapped category filter. |

### Home and Profile Surfaces

| Surface | Details |
|---------|---------|
| **Home card** | `components/UpcomingServicesCard.tsx` appears above the main Help content. It can show urgent reminders, an all-clear state, or a dismissible onboarding prompt persisted in AsyncStorage. |
| **Profile row** | `app/(tabs)/profile.tsx` shows a due-soon badge sourced from `get_my_due_soon_count()` and links into `/services`. |
| **Notifications** | `notify_due_services()` creates `service_reminder` notifications when reminders are due within 7 days and `notified_at` is empty. The fallback scheduler is the `check_due_services` edge function. |

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