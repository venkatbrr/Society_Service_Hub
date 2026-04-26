# Society Service Hub — Application Summary

> **Purpose**: This document is a single-source summary for AI agents. It provides the full context needed to understand, navigate, modify, and extend the Society Service Hub application.

---

## 1. What Is This App?

**Society Service Hub** is a multi-tenant community management mobile application for **gated residential societies** (apartment complexes / housing communities). It helps residents:

- **Discover & share trusted service providers** (plumbers, electricians, maids, etc.)
- **Coordinate group service visits** to split costs and logistics
- **Manage community funds** with transparent ledger tracking
- **Receive real-time notifications** when neighbors schedule service visits

The app is built for **iOS, Android, and Web** using a single codebase.

---

## 2. Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Framework** | Expo SDK 54 (React Native 0.81) | Managed workflow with dev client |
| **Language** | TypeScript (strict mode) | Path alias `@/*` → project root |
| **Routing** | expo-router v6 | File-based routing with typed routes |
| **Backend** | Supabase | PostgreSQL, Auth, Realtime, Storage, Edge Functions |
| **Auth** | Supabase Auth | Google OAuth + Email/Password + Password Reset |
| **State** | React Context | `AuthContext` + `NotificationContext` |
| **UI** | Vanilla React Native + custom styling | Glassmorphism theme, emoji/text icons (no vector icon library) |
| **Notifications** | Supabase Realtime + expo-notifications | In-app + native push |
| **Build** | EAS Build | Android package: `com.gatebond.app` |

### Key Dependencies

| Package | Purpose |
|---------|---------|
| `@supabase/supabase-js` | Backend client |
| `@react-native-google-signin/google-signin` | Google OAuth |
| `@react-native-community/datetimepicker` | Date/time input |
| `expo-image-picker` | Photo selection |
| `expo-linear-gradient` | Gradient UI elements |
| `expo-notifications` | Native push alerts |
| `react-native-toast-message` | Toast feedback |
| `react-native-reanimated` | Animations |
| `expo-image` | Optimized image rendering |

---

## 3. Project Structure

```
Society_Service_Hub/
├── app/                          # Screens (expo-router file-based routing)
│   ├── _layout.tsx               # Root layout: AuthProvider, NotificationProvider, redirect logic
│   ├── login.tsx                 # Email/password + Google Sign-In (dual mode: sign in / sign up)
│   ├── forgot-password.tsx       # Password reset flow
│   ├── community-select.tsx      # Join by 6-char code or request a new community
│   ├── community-request.tsx     # Submit a new community creation request
│   ├── community-request-submitted.tsx # Status screen: pending / approved (shows join code) / rejected
│   ├── notifications.tsx         # Notification list screen
│   ├── residents.tsx             # Community residents directory; community lead can remove residents
│   ├── platform/                 # Platform admin console
│   │   ├── _layout.tsx           # Platform tab shell (approvals + communities)
│   │   ├── approvals.tsx         # Community request approvals
│   │   ├── communities.tsx       # Community directory
│   │   └── community/[id].tsx    # Community detail + resident removal
│   ├── (tabs)/                   # Bottom tab navigator (4 tabs)
│   │   ├── _layout.tsx           # Tab bar configuration
│   │   ├── index.tsx             # Tab 1: Help — Services dashboard
│   │   ├── favorites.tsx         # Tab 2: Saved — Favorited providers
│   │   ├── funds.tsx             # Tab 3: Funds — Community fund management
│   │   └── profile.tsx           # Tab 4: Profile — User settings, community code (leads)
│   ├── provider/                 # Service provider screens
│   │   ├── add.tsx               # Register new provider
│   │   └── [id].tsx              # Provider detail (ratings, contact, share)
│   ├── visits/                   # Service visit screens
│   │   ├── add.tsx               # Schedule a group visit
│   │   └── [id].tsx              # Visit detail (joiners, status management)
│   └── funds/                    # Fund management screens
│       ├── add.tsx               # Create fund + assign treasurers (community lead only)
│       ├── [id].tsx              # Fund ledger, roles, transactions
│       └── add-transaction.tsx   # Log contribution or expense
├── components/                   # Reusable UI components
│   ├── ProviderCard.tsx          # Service provider list card
│   ├── VisitCard.tsx             # Visit coordination card
│   ├── FundCard.tsx              # Fund overview card
│   ├── ActiveFundTeaser.tsx      # Home screen fund widget
│   ├── SearchBar.tsx             # Universal search input
│   ├── CategoryFilter.tsx        # Horizontal category pills
│   ├── EmptyState.tsx            # Empty list placeholder
│   ├── ProviderSelector.tsx      # Provider search/select for visits
│   ├── JoinerListItem.tsx        # Visit joiner row
│   ├── TransactionItem.tsx       # Fund transaction row
│   ├── RatingStars.tsx           # Star rating display
│   └── VisitStatusBadge.tsx      # Visit status pill
├── context/                      # React Context providers
│   ├── AuthContext.tsx            # Session, user, profile, appRole, communityId, isCommunityLead, isPlatformAdmin, activeCommunityRequest
│   └── NotificationContext.tsx   # Real-time notifications via Supabase Realtime
├── lib/                          # Backend utilities
│   ├── supabase.ts               # Supabase client (AsyncStorage adapter)
│   ├── auth.ts                   # Auth helpers (Google, email, password reset)
│   ├── database.types.ts         # Auto-generated Supabase types (25KB)
│   ├── fundRoles.ts              # Fund role logic & permissions
│   └── supabaseErrors.ts        # Error detection & user-friendly messages
├── constants/
│   ├── Colors.ts                 # Theme colors & glassmorphism tokens
│   └── categories.ts             # Service provider categories
├── supabase/
│   └── migrations/               # 19 SQL migration files
├── assets/                       # Images, icons, splash screens
├── app.json                      # Expo configuration
├── package.json                  # Dependencies & scripts
├── tsconfig.json                 # TypeScript configuration
└── docs/                         # Detailed documentation
    ├── CLAUDE.md                 # Commands, conventions, key patterns
    ├── architecture.md           # Data flow, auth, schema, RLS, state, types
    ├── features.md               # Every feature spec in detail
    ├── copilot-instructions.md   # Technical & functional specifications
    └── disabled-features.md      # Intentionally disabled features
```

---

## 4. Multi-Tenant Architecture

The app is **community-scoped**. Every data table is filtered by `community_id`.

### Community Lifecycle

1. User signs up (email/password or Google)
2. Database trigger `handle_new_user()` auto-creates a `profiles` row with `resident` role
3. User either joins an existing community instantly via 6-character code, or submits a new-community request for platform review
4. Code join calls `join_community_by_code()` — sets `profiles.community_id` immediately, no approval needed
5. On joining, Supabase RLS grants access to all community-scoped data
6. Community requests that are approved auto-set the requester as `community_lead` and generate a join code

### Community ID Resolution (Priority Order)

1. `profile.community_id`
2. `session.user.user_metadata.community_id`
3. `session.user.app_metadata.community_id`
4. `null` → redirects to `/community-select`

---

## 5. Authentication

### Supported Methods

| Method | Implementation |
|--------|---------------|
| **Google OAuth** | `@react-native-google-signin/google-signin` → Supabase `signInWithIdToken()` |
| **Email/Password** | Supabase Auth `signUp` / `signInWithPassword` |
| **Password Reset** | Supabase `resetPasswordForEmail` with deep link `societyservicehub://reset-password` |

### Session Management

- Persisted via `AsyncStorage` (not SecureStore — Android 2KB limit)
- Auto-refresh tokens enabled
- `AuthContext` watches `onAuthStateChange` and re-hydrates profile on every event

### Redirect Logic (Root Layout)

```
No session                                      → /login
Session, platform admin                         → /platform/approvals
Session, no community, active request           → /community-request-submitted
Session, no community, no request               → /community-select
Session, community                              → /(tabs)
```

### Intentionally Disabled

- **Email verification**: OFF in Supabase dashboard (pilot phase)
- **Password strength validation**: Removed for simplified onboarding

---

## 6. Role System

### App-Level Roles (`profiles.app_role` — typed as `app_role_type` ENUM)

| Role | Capabilities |
|------|-------------|
| `admin` | **Platform admin**: approve/reject community creation requests, inspect all communities, soft-remove residents from any community. Identified by `app_role = 'admin'` **and** `community_id IS NULL`. |
| `community_lead` | **Community lead**: create funds, remove residents from their community, view community join code, see resident phone numbers. Auto-assigned when a community request is approved — never promoted through a workflow. Identified by `app_role = 'community_lead'` and `community_id IS NOT NULL` and `removed_at IS NULL`. |
| `resident` | Browse providers, create visits, join visits, rate/favorite, view funds |

> Community membership requires no approval — residents join instantly via the community's 6-character join code.

### Helper Functions for Role Checks

| Function | What it checks |
|----------|---------------|
| `is_platform_admin(user_id)` | `app_role = 'admin'` AND `community_id IS NULL` |
| `is_community_lead(user_id)` | `app_role = 'community_lead'` AND `community_id IS NOT NULL` AND `removed_at IS NULL` |
| `is_admin(user_id)` | Alias for `is_community_lead()` — kept for backward-compatible RLS policies |

### Fund-Level Roles (`fund_roles.role`)

Per-fund assignments stored in the `fund_roles` table:

| Role | Capabilities |
|------|-------------|
| `treasurer` | Manage collectors, log contributions + expenses (max 2 per fund, min 1) |
| `collector` | Log contributions only (max 6 per fund) |
| `resident` | View-only |

Role resolution: `community_lead` > assigned fund role > `resident`.

### Permission Matrix

| Action | Resident | Community Lead | Treasurer | Collector |
|--------|----------|----------------|-----------|-----------|
| View/search providers | ✅ | ✅ | — | — |
| Add provider | ✅ | ✅ | — | — |
| Rate/favorite | ✅ | ✅ | — | — |
| Delete provider | Creator | Creator | — | — |
| Create visit | ✅ | ✅ | — | — |
| Join/leave visit | ✅ | ✅ | — | — |
| Manage visit status | Creator | Creator | — | — |
| View funds | ✅ | ✅ | ✅ | ✅ |
| Create fund | ❌ | ✅ | — | — |
| Manage treasurers | ❌ | ✅ | — | — |
| Manage collectors | ❌ | ✅ | ✅ | — |
| Add contribution | ❌ | ✅ | ✅ | ✅ |
| Add expense | ❌ | ✅ | ✅ | ❌ |

---

## 7. Database Schema

**14 tables** across 5 domains, all with Row Level Security (RLS) enabled.

### Foundation

| Table | Purpose |
|-------|---------|
| `communities` | Society groups with unique 6-char `code` for instant joining |
| `profiles` | User profiles (extends `auth.users`), stores `app_role`, `community_id`, `full_name`, `flat_number`, `email`, `phone_number`, `removed_at` |

### Onboarding Requests

| Table | Purpose |
|-------|---------|
| `community_requests` | Review queue for new community creation requests. Statuses: `pending`, `needs_info`, `approved`, `rejected`. Stores `rejection_reason`, `resulting_community_id`, requester flat number and address. |

### Audit

| Table | Purpose |
|-------|---------|
| `profile_audit_log` | Immutable audit trail of `app_role` and `community_id` changes on `profiles`. Fields: `profile_id`, `actor_id`, `field`, `old_value`, `new_value`, `reason`. |

### Service Providers

| Table | Purpose |
|-------|---------|
| `service_providers` | Trusted provider listings (name, phone, category, avg_rating) |
| `favorites` | Provider bookmarks (`provider_id` only) |
| `ratings` | 1–5 star reviews (`provider_id` only) |
| `provider_hires` | Contact interaction counter |

### Service Visits

| Table | Purpose |
|-------|---------|
| `service_visits` | Scheduled group visits (status: upcoming → in_progress → completed/cancelled) |
| `visit_joiners` | RSVPs with optional flat_number and note |

### Fund Management

| Table | Purpose |
|-------|---------|
| `events` | Community funds with `goal_amount` |
| `event_transactions` | Ledger entries (income/expense), `amount > 0` |
| `fund_roles` | Per-fund role assignments (treasurer/collector) |

### Notifications

| Table | Purpose |
|-------|---------|
| `notifications` | User notifications with JSONB `data`, `is_read` boolean |

### Key Database Functions

| Function | Purpose |
|----------|---------|
| `handle_new_user()` | Trigger: auto-creates profile on signup with `resident` role |
| `get_user_community_id()` | Extracts community_id from JWT metadata |
| `is_platform_admin(user_id)` | Checks `app_role = 'admin'` AND `community_id IS NULL` |
| `is_community_lead(user_id)` | Checks `app_role = 'community_lead'` AND `community_id IS NOT NULL` AND `removed_at IS NULL` |
| `is_admin(user_id)` | Alias for `is_community_lead()` — kept for backward-compatible RLS policies |
| `is_user_approved(user_id)` | Checks `community_id IS NOT NULL AND removed_at IS NULL` |
| `generate_community_code()` | Generates a random unique 6-char uppercase alphanumeric code |
| `set_audit_actor(actor_id)` | Sets `app.audit_actor_id` session config for audit trail |
| `set_audit_context(actor_id, reason)` | Sets both actor and reason for audit trail |
| `get_fund_role(event_id, user_id)` | Resolves effective fund role |
| `join_community_by_code(p_code)` | RPC: resident joins a community by 6-char code instantly |
| `submit_community_request(...)` | RPC: creates a `community_requests` row for platform review |
| `community_lead_remove_resident(target_profile_id)` | RPC: community lead removes a non-lead resident |
| `platform_approve_community_request(request_id)` | Platform admin creates community + sets requester as `community_lead` + generates join code |
| `platform_reject_community_request(request_id, reason)` | Platform admin rejects a community creation request |
| `platform_soft_remove_resident(target_profile_id, reason)` | Platform admin removes a resident from their community |
| `get_community_visits(p_community_id, p_user_id, p_status, p_time_scope)` | RPC: visits with creator info + joiner counts |
| `get_visit_joiners(visit_id)` | RPC: joiner details with profiles |
| `get_residents_directory(include_phone)` | RPC: active residents in caller's community. Phone visible to community leads and platform admins. |
| `auto_complete_past_visits()` | Marks past visits as completed |

### Key Database Triggers

| Trigger | Function | Event |
|---------|----------|-------|
| `on_auth_user_created` | `handle_new_user()` | AFTER INSERT on `auth.users` |
| `profile_audit_log_on_profiles` | `profile_audit_log_trigger()` | AFTER UPDATE on `profiles` when `app_role` or `community_id` changes |
| `enforce_profile_role_change_permissions_on_profiles` | `enforce_profile_role_change_permissions()` | BEFORE UPDATE on `profiles` — blocks non-platform-admins from changing `app_role` via API |

### Storage

- **Bucket**: `community-uploads` (public) — community-related file uploads
- **Profile avatars**: Google avatar URL from auth metadata (no upload flow)

---

## 8. Feature Modules

### 8.1 Services Dashboard (Tab 1: Help)

The main screen with two segments:

- **Trusted Providers**: Browse, search, and filter community-vetted service providers by category. Cards show avg_rating, contact info.
- **Service Visits**: Two sections:
  - **Upcoming Visits** — visits with `visit_date ≥ today`, statuses: `upcoming` + `cancelled`. Cancelled visits remain here until their planned date passes.
  - **Past Visits** — visits with `visit_date < today`, all statuses. Collapsible section, hidden by default.
  - Schedule new visits linked to providers. Join existing visits to split costs.
- **Widgets**: Active Fund Teaser (ongoing collections), Notification bell with badge.

### 8.2 Resident Marketplace — ⚠️ REMOVED

All marketplace tables (`resident_businesses`, `business_offerings`, `business_inquiries`), screens, and components have been permanently deleted. The `business_id` columns have been removed from `favorites` and `ratings`.

### 8.3 Favorites (Tab 2: Saved)

Personal bookmarks of favorited service providers. Toggle on/off with optimistic UI updates.

### 8.4 Fund Management (Tab 3: Funds)

- Community leads create funds with 1–2 assigned treasurers
- Transparent ledger: contributions (income) and expenses tracked per-resident
- Role-gated actions: community_lead > treasurer > collector > resident (view-only)
- Double-enforced permissions: client-side via `getFundPermissions()` + database-side via RLS

### 8.5 Profile (Tab 4)

User info, app role badge, community details (name/location/type). Community leads see their 6-char join code with a Share button. All members can open the residents directory. Sign-out.

### 8.6 Onboarding

- **Join by code**: Enter the community's 6-character join code → `join_community_by_code()` RPC → immediate `community_id` set → redirected to `/(tabs)`. No approval needed.
- **Request new community**: Fill in community details → `submit_community_request()` RPC → routed to request-status holding screen.
- **Request status screen**: Shows pending/approved/rejected state. When approved: displays join code with Share + WhatsApp buttons, "Enter my community" refreshes session. When rejected: shows reason + "Request again" option.

### 8.7 Platform Admin Console (`app/platform/`)

A dedicated tab shell accessible only to `app_role = 'admin'` users with `community_id = null`. Screens:

| Screen | Purpose |
|--------|---------|
| `app/platform/approvals.tsx` | Review and approve/reject new community creation requests. Approval creates community, generates 6-char join code, sets requester as `community_lead`. Calls `platform_approve_community_request()` / `platform_reject_community_request()`. |
| `app/platform/communities.tsx` | List all communities with member/lead counts. |
| `app/platform/community/[id].tsx` | Community detail: resident list, soft-remove a resident via `platform_soft_remove_resident()`. |

### 8.8 Notifications

Real-time via Supabase Realtime channel. Database trigger creates notification rows when visits are scheduled. On mobile, the app requests notification permission, configures Android channel `default`, and triggers local native alerts for new notification rows while active. Bell icon shows unread badge on home screen.

Notification types used across the system:

| Type | Trigger |
|------|---------|
| `community_approved` | Platform admin approves a new community request (includes join code in data) |
| `community_rejected` | Platform admin rejects a new community request |
| `removed_from_community` | Platform admin or community lead soft-removes a resident |
| `visit_scheduled` | A new service visit is scheduled in the community |
| `service_reminder` | Daily cron via `notify_due_services()` — fires when a service is due within 7 days. Data: `{ service_id, service_name, category, next_due_on, days_until_due }`. |

---

## 9. Real-Time System
### 8.9 Personal Service Reminders

User-scoped feature. Each user can track home appliances/services (AC, RO, pest control, etc.) with periodic reminders. Data is private — RLS enforces `auth.uid() = user_id` on all rows.

**New table:** `user_services` — `id`, `user_id`, `community_id` (nullable), `service_name`, `category`, `last_serviced_on`, `frequency_months`, `next_due_on` (auto-computed by trigger), `notes`, `notified_at`.

**New RPCs:** `get_my_upcoming_services()`, `get_my_due_soon_count()`, `mark_service_done(p_service_id)`, `notify_due_services()`.

**Screens:** `app/services/index.tsx` · `app/services/add.tsx` · `app/services/[id].tsx`.

**Cron:** Edge Function `supabase/functions/check_due_services/index.ts` at `30 3 * * *` UTC (9:00 AM IST). Configure schedule in Supabase Dashboard.

**UI entry points:** Home dashboard card (`UpcomingServicesCard`) + Profile tab nav row with due-soon badge.

---


```
service_visit INSERT
  → Database trigger: on_service_visit_created
    → INSERT notification rows for all community members
      → Supabase Realtime: postgres_changes event
        → NotificationContext receives INSERT
          → Updates local state (notifications[], unreadCount)
          → Fires native push alert via expo-notifications (non-web)
```

---

## 10. UI/UX Design System

| Token | Value |
|-------|-------|
| **Primary** | `#6C63FF` (Soft Indigo) |
| **Secondary** | `#10B981` (Emerald) |
| **Accent** | `#FF6B6B` (Coral) |
| **Theme** | Light mode only |
| **Style** | Glassmorphism, rounded corners (20-24px), soft indigo shadows |
| **Gradients** | `expo-linear-gradient` for headers and buttons |
| **Icons** | Emoji/Text characters via inline `Text` | No vector icon libraries used in app UI |
| **Typography** | Clean, system fonts |
| **Feedback** | `react-native-toast-message` for all user-facing messages |
| **Date inputs** | `@react-native-community/datetimepicker` (never raw TextInput) |

---

## 11. External Integrations

| Integration | Where Used | How |
|-------------|-----------|-----|
| Google Sign-In | Login | `@react-native-google-signin/google-signin` → `signInWithIdToken()` |
| Supabase Auth | Login, Signup, Reset | Email/password, session persistence via AsyncStorage |
| Supabase Realtime | Notifications | `postgres_changes` INSERT on `notifications` table |
| Supabase Storage | Community uploads | `community-uploads` bucket, public URLs |
| Expo Notifications | Alerts | Runtime permission + Android channel setup + local native alert on new notification INSERT |
| Phone Dialer | Provider detail, Visit detail | `Linking.openURL('tel:...')` |
| WhatsApp | Provider detail | `whatsapp://send?phone=` or `https://wa.me/` |
| Native Share | Provider detail, Community code | `Share.share()` |
| Image Picker | Provider add | `expo-image-picker` |

---

## 12. Commands Reference

| Command | Purpose |
|---------|---------|
| `npm start` | Launch Expo dev server |
| `npm run web` | Preview on web (best for layout testing) |
| `npm run android` | Build and run on Android emulator |
| `npm run ios` | Build and run on iOS simulator |
| `npx tsc --noEmit` | Type-check (no test framework configured) |
| `npm run db:push` | Apply local migrations to Supabase |
| `npm run db:link` | Link to Supabase project |
| `npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj` | Regenerate DB types |

---

## 13. State Management Patterns

### Layer 1: Global Context

- **AuthContext**: `session`, `user`, `profile`, `communityId`, `appRole`, `isPlatformAdmin`, `isCommunityLead`, `activeCommunityRequest`, `isLoading`, `refreshSession`, `signOut`
- **NotificationContext**: `notifications[]`, `unreadCount`, `loading`, `fetchNotifications`, `markAsRead`, `markAllAsRead`

### Layer 2: Screen State

- Local `useState` for fetched data, loading, refreshing states
- `useEffect` or `useFocusEffect` for data fetching
- `useCallback` memoization for fetch functions
- `Promise.all` for parallel queries

### Layer 3: Component State

- Minimal UI state in presentational components
- Optimistic UI updates with error revert on failure
- Pull-to-refresh via `RefreshControl`

---

## 14. Error Handling

| Utility | Purpose |
|---------|---------|
| `isSupabaseSchemaError(error)` | Detects schema cache/PGRST errors |
| `isMissingFundSchemaError(error)` | Schema error specific to fund tables |
| `getMissingFundSchemaMessage()` | User-friendly message for fund schema errors |
| `getAuthErrorMessage(error)` | Maps auth errors to friendly strings |

Standard pattern: `try/catch` → `Toast.show()` → `finally { setLoading(false) }`

---

## 15. Key Conventions for AI Agents

1. **Multi-tenant**: ALL queries must filter by `communityId` from `useAuth()`
2. **Single-row queries**: Use `.maybeSingle()` not `.single()`
3. **Icons**: Use emoji/text characters in inline `<Text>` elements. Do NOT add vector icon components
4. **Date inputs**: Always `@react-native-community/datetimepicker`
5. **Toast**: Use `react-native-toast-message` for user feedback
6. **Theme**: Light mode only. Use colors from `constants/Colors.ts`
7. **RLS**: All tables have Row Level Security. Community isolation is enforced server-side
8. **Types**: Regenerate `database.types.ts` after any schema change
9. **Docs**: Update `docs/` files when modifying code (architecture.md, features.md, CLAUDE.md)
10. **Migrations**: Deploy with `npm run db:push` → regenerate types → verify with `npx tsc --noEmit`

---

## 16. Current Status & Disabled Features

| Feature | Status | Reason |
|---------|--------|--------|
| Email verification | Disabled | Faster onboarding during pilot |
| Password strength validation | Removed | Simplified signup flow |
| Resident Marketplace | Permanently removed | Tables, screens, and components deleted |

### Re-enablement Plan

1. **Email verification**: Re-enable in Supabase dashboard, update login screen for verification phase
2. **Password strength**: Re-add validation in `validateForm()` in `app/login.tsx`

### Known DB Quirks

- The `enforce_profile_role_change_permissions` trigger blocks `app_role` changes via API for non-platform-admins. When running direct SQL in the Supabase Dashboard, `auth.uid()` is `NULL`; the guard was updated to `auth.uid() IS NOT NULL AND NOT is_platform_admin(auth.uid())` to allow dashboard SQL updates.
- `community_admin` enum value still exists in `app_role_type` as an orphaned value — it cannot be dropped without `DROP TYPE CASCADE` which would destroy all RLS policies. No code sets this value; all logic uses `community_lead`.

---

## 17. Documentation Map

| File | Content |
|------|---------|
| `.github/copilot-instructions.md` | Quick-reference entry point, links to all docs |
| `.github/app-summary.md` | **This file** — comprehensive AI agent summary |
| `docs/architecture.md` | Data flow, auth, database schema, RLS, state, types, storage |
| `docs/features.md` | Every feature: screens, tables, business rules, roles, integrations |
| `docs/CLAUDE.md` | Commands, conventions, key patterns, architecture overview |
| `docs/copilot-instructions.md` | Technical and functional specifications |
| `docs/disabled-features.md` | Intentionally disabled features and re-enablement plan |
| `docs/implementation_plan.md` | Original implementation plan and schema design |
