# Features Reference

> **AI agents must review this file before modifying any feature.**

This document describes every user-facing feature, the screens involved, database tables touched, business rules, navigation flows, role-based access, and external integrations.

---

## Authentication & Onboarding

### Login (`app/login.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Sign up or sign in via email/password or Google OAuth |
| **Tables** | Writes: `auth.users` (via Supabase Auth). Trigger auto-creates `profiles` row. |
| **Business rules** | Email must contain `@`. Sign-up requires full name, matching password + confirm. Google returns `idToken` exchanged with Supabase via `signInWithIdToken()`. |
| **Navigation** | Entry point for unauthenticated users. On success → `/community-select`. Link to `/forgot-password`. |
| **Roles** | N/A (pre-auth) |
| **Integrations** | Google Sign-In (`@react-native-google-signin/google-signin`), Supabase Auth |

### Community Select (`app/community-select.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Step 1 of onboarding: find an existing community by exact pincode, then request to join it |
| **Tables** | Reads: `communities` via `search_communities_by_pincode` RPC. Writes: `profiles` (`community_id`, `flat_number`, `phone_number`, `join_note`, `approval_status`, `requested_at`), `auth.users` user_metadata. |
| **Business rules** | Pincode is required and server-side exact match for v1. Search filters the pincode-scoped list client-side by name. Continue is disabled until a community is selected. Submitting stores onboarding details and leaves the user in `approval_status = 'pending'`. |
| **Navigation** | From: root layout (session exists, no `community_id`). To: `/pending` after submit, `/community-request` if community is missing. |
| **Roles** | Any authenticated user |

### Community Request (`app/community-request.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Replace self-serve community creation with a reviewed request flow |
| **Tables** | Writes: `community_requests` via `submit_community_request` RPC |
| **Business rules** | Required: name, type, city, pincode, requester role, accuracy confirmation. Optional: area, approximate units, nominated admin details. Requests default to `pending`. |
| **Navigation** | From: community select empty state or rejected screen. To: `/community-request-submitted` on success. |
| **Roles** | Any authenticated user |

### Community Request Submitted (`app/community-request-submitted.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Holding screen for users with an active community request and no community assignment |
| **Tables** | Reads: `community_requests` (latest active row for requester) |
| **Business rules** | Root routing sends signed-in users here whenever they have an active request but no `community_id`. |
| **Navigation** | From: `community-request`, root layout redirects. |

### Pending Approval (`app/pending.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Hold users who have requested to join a community but are still awaiting admin approval |
| **Tables** | Reads: `communities` basic fields for the selected community |
| **Business rules** | Pending users cannot access providers, visits, funds, favorites, ratings, or notifications. |
| **Navigation** | From: community select submit, root layout redirects while `approval_status = 'pending'`. |

### Rejected Request (`app/rejected.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Show the rejected join state and route the resident toward a new community request |
| **Tables** | None directly |
| **Business rules** | Rejected users can request a community directly or sign out. |
| **Navigation** | From: root layout redirects while `approval_status = 'rejected'`. To: `/community-request` or `/login` after sign-out. |

### Forgot Password (`app/forgot-password.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Send password reset email |
| **Tables** | None (Supabase Auth handles) |
| **Business rules** | Email must contain `@`. Redirect URL: `societyservicehub://reset-password`. |
| **Navigation** | From: `/login`. To: `/login` after success. |

---

## Tab 1: Help — Services Dashboard (`app/(tabs)/index.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Main discovery hub with two segments: **Trusted Providers** and **Service Visits** |
| **Tables** | Reads: `service_providers`, `visit_joiners`, `favorites`, `provider_hires`, `events`, `event_transactions`, `profiles`. |
| **Business rules** | Providers sorted by `avg_rating` DESC. Service Visits segment has two sections: **Upcoming Visits** (visit_date ≥ today, statuses: `upcoming` + `cancelled`) and **Past Visits** (visit_date < today, all statuses — collapsible, hidden by default). Cancelled visits remain in Upcoming Visits until their planned date passes, then move to Past Visits. Opening a visit card carries segment/sub-tab context so the detail back action returns to the same Service Visits state (including Past tab). Community insights via `get_community_insights` RPC (most hired category, monthly spending, contribution %). Active fund teaser shows ongoing collection. |
| **Navigation** | To: `/provider/[id]`, `/visits/[id]`, `/provider/add`, `/visits/add`, `/notifications`, `/(tabs)/profile`. |
| **Roles** | All residents view. All can add providers/visits. |
| **Integrations** | None directly (detail screens handle calls/WhatsApp). Notification badge from `NotificationContext`. |
| **Components** | `ProviderCard`, `VisitCard`, `ActiveFundTeaser`, `CommunityInsights`, `SearchBar`, `CategoryFilter`, `EmptyState` |

---

## Tab 2: Market — Resident Marketplace (`app/(tabs)/business.tsx`) ⚠️ DISABLED

> **This feature is currently hidden from the UI.** The tab is set to `href: null` in `_layout.tsx` and the business section is removed from the Profile screen. All code and database objects remain intact. See `disabled-features.md` for re-enablement steps.

| Aspect | Details |
|--------|---------|
| **Purpose** | Browse resident-owned home businesses with search and category filtering |
| **Tables** | Reads: `resident_businesses`, `favorites`. Uses RPC: `get_community_businesses` (aggregates ratings + inquiry counts). |
| **Business rules** | 8 business categories: Food, Baked Goods, Crafts, Beauty, Tailoring, Tutoring, Other. Each resident can own max 1 business per community. Search is case-insensitive across name, description, category. |
| **Navigation** | To: `/business/[id]` (detail), `/business/add` (create). On create attempt: if business exists, redirects to `/business/manage`. |
| **Roles** | All residents view and favorite. Only business owners edit/manage. |
| **Components** | `BusinessCard`, `SearchBar`, `CategoryFilter`, `EmptyState` |

---

## Tab 3: Saved — Favorites (`app/(tabs)/favorites.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Show all favorited service providers |
| **Tables** | Reads: `favorites` joined with `service_providers`. Writes: `favorites` (toggle). |
| **Business rules** | Currently shows providers only (not businesses). Toggling removes from list immediately. `useFocusEffect` re-fetches on tab focus. |
| **Navigation** | To: `/provider/[id]` |
| **Roles** | Personal favorites only |
| **Components** | `ProviderCard`, `EmptyState` |

---

## Tab 4: Funds — Society Funds (`app/(tabs)/funds.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | List all community funds with aggregate totals (collected, spent, balance) |
| **Tables** | Reads: `events`, `event_transactions`, `fund_roles`, `profiles`. |
| **Business rules** | Only community admins can create funds. Each fund has 1–2 treasurers (min 1, max 2) and 0–6 collectors. Balance = sum(income) − sum(expense). Schema validation checks for missing fund tables before displaying. |
| **Navigation** | To: `/funds/add` (admin only), `/funds/[id]` (detail). |
| **Roles** | All residents see funds. Admin-only FAB for creating. Role-based permissions per fund. |
| **Components** | `FundCard`, `EmptyState` |

---

## Tab 5: Profile — Personal Hub (`app/(tabs)/profile.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Display user info, app role, community details, sign out, community directory entry point, and approval management entry point |
| **Tables** | Reads: `profiles`, `communities`. |
| **Business rules** | Invite code sharing is removed. Community admins see a member approvals card with pending count and can open the approval queue. All approved members can open the residents directory. |
| **Navigation** | To: `/admin/approvals`, `/residents`, `/community-select` (after sign-out). |
| **Roles** | Personal profile only |

### Admin Approvals (`app/admin/approvals.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Review pending residents and request/cancel community-admin promotions for approved residents |
| **Tables** | Reads: `profiles`, `community_admin_requests`. Writes: membership decisions via `approve_profile_membership` and `reject_profile_membership`; promotion requests via `create_community_admin_request` and `cancel_community_admin_request`. |
| **Business rules** | Pending queue remains community-scoped. A promotion request can be raised for approved residents and may be cancelled only by the requester while still pending. |
| **Navigation** | From: Profile tab community-admin card. |

### Residents Directory (`app/residents.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Community-level approved resident directory with optional promotion request actions for community admins |
| **Tables** | Reads via RPC `get_residents_directory` and `community_admin_requests`. Writes via `create_community_admin_request` and `cancel_community_admin_request`. |
| **Business rules** | Directory includes approved residents only. Phone numbers are included only for community admins. Community admins can tap a resident name to open a contact details sheet (flat, phone, role). Promotion requests show pending/cancel states based on requester ownership. When opened from Profile, the directory back action returns to the Profile tab. |
| **Navigation** | From: Profile tab card. |
| **Roles** | Approved residents can view. Community admins can request promotions. |

---

## Platform Admin Console (`app/platform/*`)

### Platform Tabs (`app/platform/_layout.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Dedicated platform-only tab shell for approvals, promotions, and community inspection |
| **Business rules** | Root routing redirects platform admins into this area and blocks non-platform users from accessing it. Each platform screen header includes a logout action for app admins. |
| **Navigation** | `/platform/approvals`, `/platform/promotions`, `/platform/communities` |
| **Roles** | Platform admin only (`profiles.app_role = 'admin'` with `community_id = null`) |

### Community Approvals (`app/platform/approvals.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Process pending `community_requests` |
| **Tables** | Reads: `community_requests`, `profiles`. Writes via RPC: `platform_approve_community_request`, `platform_reject_community_request`. |
| **Business rules** | Approval creates the community and promotes requester to community admin. Rejection supports optional reason and triggers user notification. |

### Promotion Reviews (`app/platform/promotions.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Process pending `community_admin_requests` |
| **Tables** | Reads: `community_admin_requests`, `communities`, `profiles`. Writes via RPC: `platform_approve_community_admin_request`, `platform_reject_community_admin_request`. |
| **Business rules** | Community admin cap is enforced server-side (max 5). Rejections can include optional reason. |

### Communities Directory + Detail (`app/platform/communities.tsx`, `app/platform/community/[id].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Search communities, inspect membership/admin counts, and remove residents where required |
| **Tables** | Reads: `communities`, `profiles`. Writes via RPC: `platform_soft_remove_resident`. |
| **Business rules** | Platform removal is soft-delete style on profile (`removed_at`, `removed_by`) and resets role to resident. Last-community-admin guard is enforced before removal. |

---

## Service Providers

### Add Provider (`app/provider/add.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Register a new trusted service provider contact |
| **Tables** | Writes: `service_providers` |
| **Business rules** | Required: name, phone, category. 10 category options from `constants/categories.ts`. Auto-fills: `avg_rating=0`, `rating_count=0`, `is_verified=false`, `is_trending=false`. |
| **Navigation** | From: Home FAB (Providers segment). To: back on success. |
| **Roles** | All residents can add |

### Provider Detail (`app/provider/[id].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Full provider profile with ratings, favorites, contact, and delete |
| **Tables** | Reads: `service_providers`, `favorites`, `ratings`, `provider_hires`. Writes: `favorites`, `ratings` (upsert on `user_id, provider_id`), `provider_hires` (on contact). |
| **Business rules** | Rating 1–5 stars, upsert per user. Hire count incremented on each contact attempt. Verified badge shown if `is_verified=true`. Only creator can delete. |
| **Navigation** | From: Home providers list, Favorites, Visit detail. |
| **Roles** | All residents view and rate. Creator can delete. |
| **Integrations** | WhatsApp (`whatsapp://send?phone=` or `https://wa.me/`), Phone (`tel:`), Native Share intent |

---

## Resident Businesses

### Add Business (`app/business/add.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Create a resident home business listing with optional cover photo |
| **Tables** | Reads: `resident_businesses` (check existing). Writes: `resident_businesses`. Storage: `business-photos` bucket. |
| **Business rules** | Required: name, category, description, whatsapp_number. Photo upload: base64 → JPEG in Supabase Storage. 7 business categories. One business per owner per community (unique constraint). |
| **Navigation** | From: Home FAB (Business segment) or Profile CTA. To: `/business/manage` on success or if existing. |
| **Roles** | All residents can create (one per community) |
| **Integrations** | Image picker, Supabase Storage upload |

### Business Detail (`app/business/[id].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Public storefront: offerings, reviews, contact, favorite |
| **Tables** | Reads: `resident_businesses`, `business_offerings`, `favorites`, `ratings`, `business_inquiries`, `profiles`. Writes: `favorites`, `ratings` (upsert on `user_id, business_id`), `business_inquiries`. |
| **Business rules** | Inquiry logging tracks type (`whatsapp` or `call`). Offerings ordered by `sort_order`. First 3 offerings shown, "See all" links to catalog. Owner sees "Manage Business" instead of contact buttons. |
| **Navigation** | From: Market tab. To: `/business/manage` (owner), `/business/catalog/[id]`, `/business/add-offering` (owner). |
| **Roles** | All residents view and rate. Owner manages. |
| **Integrations** | WhatsApp, Phone, inquiry logging |

### Manage Business (`app/business/manage.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Owner dashboard: toggle accepting orders, manage offerings, view stats |
| **Tables** | Reads: `resident_businesses`, `business_offerings`, `ratings`. Writes: `resident_businesses.is_accepting_orders`, deletes `business_offerings`. |
| **Business rules** | Optimistic UI on toggle (revert on error). Delete offering requires confirmation alert. |
| **Navigation** | From: Business detail (owner), Profile. To: `/business/add-offering`. |
| **Roles** | Owner only |

### Add Offering (`app/business/add-offering.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Create or edit a product/service in business catalog |
| **Tables** | Reads: `business_offerings` (category suggestions). Writes: `business_offerings`. Storage: `business-photos`. |
| **Business rules** | Required: name, price. Price unit defaults to "per item". Availability options: Always available, Weekends only, Pre-order, Seasonal. Photo optional. `is_available` defaults to `true`. |
| **Navigation** | From: Manage Business. To: back on success. |
| **Roles** | Owner only |
| **Integrations** | Image picker, Supabase Storage |

### Business Catalog (`app/business/catalog/[id].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Full catalog view with category filter tabs |
| **Tables** | Reads: `resident_businesses`, `business_offerings` |
| **Business rules** | Categories extracted dynamically from offerings. "All" always first. Client-side filtering. |
| **Navigation** | From: Business detail "See all". To: `/business/add-offering` (owner FAB). |
| **Roles** | All residents view. Owner sees add FAB. |

---

## Service Visits

### Add Visit (`app/visits/add.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Schedule a group service visit, optionally linking to an existing provider |
| **Tables** | Reads: `service_providers` (if linking). Writes: `service_visits`. |
| **Business rules** | Required: title, category, provider (existing or manual name). Two modes: link existing provider or manual entry (requires phone). Visit date min = today. Time slot formatted as "HH:MM AM/PM – HH:MM AM/PM". Status auto-set to `upcoming`. `provider_id` null if manual entry. |
| **Navigation** | From: Home FAB (Visits segment). To: back on success. |
| **Roles** | All residents can create |
| **Components** | `ProviderSelector` for provider search/selection |

### Visit Detail (`app/visits/[id].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Visit details, joiner list, join/leave, status management |
| **Tables** | Reads: `service_visits`, `visit_joiners`, `profiles`. Writes: `visit_joiners`, `service_visits.status`. Uses RPC: `get_visit_joiners`. |
| **Business rules** | Status: `upcoming` → `in_progress` → `completed` or `cancelled`. Max joiners enforced (disable join if full). Only creator can update status. Joiner can add optional flat_number and note. Creator shown as first joiner. Leave requires confirmation. |
| **Navigation** | From: Home visits list, Notifications (for `new_visit` type). To: `/provider/[id]` (if provider has profile). |
| **Roles** | All residents join/leave. Creator manages status. |
| **Integrations** | Phone/WhatsApp links for provider contact |
| **Components** | `JoinerListItem` |

---

## Fund Management

### Add Fund (`app/funds/add.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Admin-only: create a community fund and assign 1–2 treasurers |
| **Tables** | Reads: `profiles`. Writes: `events`, `fund_roles`. |
| **Business rules** | Admin-only (redirects if not admin). Must select 1–2 treasurers from non-admin residents. Fund created with `goal_amount=0`. `event_date` set to current date. |
| **Navigation** | From: Funds tab FAB. To: `/funds/[id]` on success. |
| **Roles** | Admin only |

### Fund Detail (`app/funds/[id].tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Fund ledger dashboard: totals, contribution status, expenses, role management |
| **Tables** | Reads: `events`, `event_transactions`, `fund_roles`, `profiles`. Writes: `fund_roles` (upsert/delete). |
| **Business rules** | Role-based UI: admin (manage treasurers, all transactions), treasurer (manage collectors, all transactions), collector (contributions only), resident (view only). Min 1 treasurer always. Max 2 treasurers, max 6 collectors. Balance = income − expense. Contribution links to a resident and marks them as paid. |
| **Navigation** | From: Funds tab. To: `/funds/add-transaction?event_id=...&type=income\|expense`. |
| **Roles** | Heavily role-gated per `fund_roles` assignment |
| **Components** | `TransactionItem` |

### Add Transaction (`app/funds/add-transaction.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Log a contribution (income) or expense against a fund |
| **Tables** | Reads: `events`, `fund_roles`, `event_transactions`, `profiles`. Writes: `event_transactions`. |
| **Business rules** | **Contribution mode** (collector/treasurer): select resident (filters already-paid), enter amount. Resident can't be marked paid twice. **Expense mode** (treasurer only): enter name, amount, optional notes. No `contributor_user_id` for expenses. Amount must be positive. |
| **Navigation** | From: Fund detail action buttons. To: back on success. |
| **Roles** | Contributions: collector + treasurer. Expenses: treasurer only. |

---

## Notifications (`app/notifications.tsx`)

| Aspect | Details |
|--------|---------|
| **Purpose** | List all user notifications with mark-as-read actions |
| **Tables** | Reads: `notifications` (limit 50, ordered by `created_at` DESC). Writes: `notifications.is_read`. |
| **Business rules** | Types include `new_visit`, `generic`. Tapping a `new_visit` notification navigates to visit detail. Mark individual or all as read. |
| **Navigation** | From: Header bell icon on Home tab (with badge count). To: `/visits/[visit_id]` for `new_visit` type. |
| **Roles** | Personal notifications only |
| **Real-time** | Supabase Realtime channel listens for INSERT on `notifications` table filtered by `user_id`. On mobile, app requests notification permissions, configures Android channel `default`, and triggers native local alerts via `expo-notifications` for new INSERT rows while the app is active. |

---

## Role-Based Access Matrix

| Feature | Resident | Admin | Treasurer | Collector |
|---------|----------|-------|-----------|-----------|
| View/search providers | Yes | Yes | — | — |
| Add provider | Yes | Yes | — | — |
| Rate/favorite provider | Yes | Yes | — | — |
| Contact provider (call/WhatsApp) | Yes | Yes | — | — |
| Delete provider (creator only) | Creator | Creator | — | — |
| View/search businesses | Yes | Yes | — | — |
| Create business (1 per community) | Yes | Yes | — | — |
| Manage own business | Owner | Owner | — | — |
| Create visit | Yes | Yes | — | — |
| Join/leave visit | Yes | Yes | — | — |
| Mark visit complete/cancel | Creator | Creator | — | — |
| View funds | Yes | Yes | Yes | Yes |
| Create fund | No | Yes | — | — |
| Manage treasurers | No | Yes | — | — |
| Manage collectors | No | Yes | Yes | — |
| Add contribution | No | Yes | Yes | Yes |
| Add expense | No | Yes | Yes | No |

> **App-level roles** (`admin`/`resident`) apply globally. **Fund-level roles** (`treasurer`/`collector`) are per-fund assignments stored in `fund_roles`.

---

## External Integrations Summary

| Integration | Used By | How |
|-------------|---------|-----|
| Google Sign-In | Login | `@react-native-google-signin/google-signin` → `signInWithIdToken()` |
| Supabase Auth | Login, Signup, Password Reset | Email/password, session persistence via AsyncStorage |
| Supabase Realtime | Notifications | `postgres_changes` INSERT on `notifications` table |
| Supabase Storage | Business photos | `business-photos` bucket, public URLs |
| Expo Notifications | Notifications | Runtime permission + Android channel setup + local alerts on new notification INSERT |
| Phone dialer | Provider detail, Visit detail | `Linking.openURL('tel:...')` |
| WhatsApp | Provider detail, Business detail | `whatsapp://send?phone=` or `https://wa.me/` |
| Native Share | Provider detail | `Share.share()` with provider contact info |
| Image Picker | Business add, Offering add | `expo-image-picker` → base64 → Supabase Storage |
| DateTimePicker | Visit add | `@react-native-community/datetimepicker` |
