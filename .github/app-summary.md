# Society Service Hub — Application Summary

> **Purpose**: This document is a single-source summary for AI agents. It provides the full context needed to understand, navigate, modify, and extend the Society Service Hub application.

---

## 1. What Is This App?

**Society Service Hub** is a multi-tenant community management mobile application for **gated residential societies** (apartment complexes / housing communities). It helps residents:

- **Discover & share trusted service providers** (plumbers, electricians, maids, etc.)
- **Coordinate group service visits** to split costs and logistics
- **Manage community funds** with transparent ledger tracking
- **Browse resident-run home businesses** (marketplace — currently disabled)
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
| **UI** | Vanilla React Native + custom styling | Glassmorphism theme, Ionicons only |
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
│   ├── community-select.tsx      # Join or create a community
│   ├── notifications.tsx         # Notification list screen
│   ├── (tabs)/                   # Bottom tab navigator (5 tabs)
│   │   ├── _layout.tsx           # Tab bar configuration
│   │   ├── index.tsx             # Tab 1: Help — Services dashboard
│   │   ├── business.tsx          # Tab 2: Market — Resident marketplace (⚠️ HIDDEN)
│   │   ├── favorites.tsx         # Tab 3: Saved — Favorited providers
│   │   ├── funds.tsx             # Tab 4: Funds — Community fund management
│   │   └── profile.tsx           # Tab 5: Profile — User settings & info
│   ├── provider/                 # Service provider screens
│   │   ├── add.tsx               # Register new provider
│   │   └── [id].tsx              # Provider detail (ratings, contact, share)
│   ├── visits/                   # Service visit screens
│   │   ├── add.tsx               # Schedule a group visit
│   │   └── [id].tsx              # Visit detail (joiners, status management)
│   ├── funds/                    # Fund management screens
│   │   ├── add.tsx               # Create fund + assign treasurers (admin only)
│   │   ├── [id].tsx              # Fund ledger, roles, transactions
│   │   └── add-transaction.tsx   # Log contribution or expense
│   └── business/                 # Resident business screens (disabled in UI)
│       ├── add.tsx               # Create business listing
│       ├── manage.tsx            # Owner dashboard
│       ├── [id].tsx              # Public business storefront
│       ├── add-offering.tsx      # Add product/service to catalog
│       └── catalog/[id].tsx      # Full catalog view
├── components/                   # Reusable UI components
│   ├── ProviderCard.tsx          # Service provider list card
│   ├── VisitCard.tsx             # Visit coordination card
│   ├── BusinessCard.tsx          # Business marketplace card
│   ├── FundCard.tsx              # Fund overview card
│   ├── ActiveFundTeaser.tsx      # Home screen fund widget
│   ├── CommunityInsights.tsx     # Analytics widget
│   ├── SearchBar.tsx             # Universal search input
│   ├── CategoryFilter.tsx        # Horizontal category pills
│   ├── EmptyState.tsx            # Empty list placeholder
│   ├── ProviderSelector.tsx      # Provider search/select for visits
│   ├── JoinerListItem.tsx        # Visit joiner row
│   ├── TransactionItem.tsx       # Fund transaction row
│   ├── OfferingCard.tsx          # Business offering card
│   ├── RatingStars.tsx           # Star rating display
│   ├── VisitStatusBadge.tsx      # Visit status pill
│   └── BusinessStatusBadge.tsx   # Business open/closed badge
├── context/                      # React Context providers
│   ├── AuthContext.tsx            # Session, user, profile, communityId, appRole
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
│   └── migrations/               # 12 SQL migration files
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
2. Database trigger `handle_new_user()` auto-creates a `profiles` row
3. User joins an existing community (by invite code) or creates a new one
4. `communityId` is stored in `profiles.community_id` and session metadata
5. All subsequent queries are scoped: `.eq('community_id', communityId)`
6. Supabase RLS policies enforce community isolation server-side

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
No session           → /login
Session, no community → /community-select
Fully authenticated  → /(tabs)
```

### Intentionally Disabled

- **Email verification**: OFF in Supabase dashboard (pilot phase)
- **Password strength validation**: Removed for simplified onboarding

---

## 6. Role System

### App-Level Roles (`profiles.app_role`)

| Role | Capabilities |
|------|-------------|
| `admin` | Create funds, manage treasurers, full CRUD on fund transactions, all resident capabilities |
| `resident` | Browse providers, create visits, join visits, rate/favorite, view funds |

> First user to join a community is automatically assigned `admin`.

### Fund-Level Roles (`fund_roles.role`)

Per-fund assignments stored in the `fund_roles` table:

| Role | Capabilities |
|------|-------------|
| `treasurer` | Manage collectors, log contributions + expenses (max 2 per fund, min 1) |
| `collector` | Log contributions only (max 6 per fund) |
| `resident` | View-only |

Role resolution: `admin` > assigned fund role > `resident`.

### Permission Matrix

| Action | Resident | Admin | Treasurer | Collector |
|--------|----------|-------|-----------|-----------|
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

**14 tables** across 4 domains, all with Row Level Security (RLS) enabled.

### Foundation

| Table | Purpose |
|-------|---------|
| `communities` | Society groups with unique invite `code` |
| `profiles` | User profiles (extends `auth.users`), stores `app_role`, `community_id`, `full_name`, `flat_number` |

### Service Providers

| Table | Purpose |
|-------|---------|
| `service_providers` | Trusted provider listings (name, phone, category, avg_rating) |
| `favorites` | Bookmarks (dual-target: `provider_id` XOR `business_id`) |
| `ratings` | 1–5 star reviews (dual-target: `provider_id` XOR `business_id`) |
| `provider_hires` | Contact interaction counter |

### Service Visits

| Table | Purpose |
|-------|---------|
| `service_visits` | Scheduled group visits (status: upcoming → in_progress → completed/cancelled) |
| `visit_joiners` | RSVPs with optional flat_number and note |

### Marketplace (Disabled in UI)

| Table | Purpose |
|-------|---------|
| `resident_businesses` | Home business listings (1 per owner per community) |
| `business_offerings` | Product/service catalog items |
| `business_inquiries` | WhatsApp/call interaction logs |

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
| `handle_new_user()` | Trigger: auto-creates profile on signup; first user gets admin |
| `get_user_community_id()` | Extracts community_id from JWT metadata |
| `is_admin(user_id)` | Checks admin role |
| `get_fund_role(event_id, user_id)` | Resolves effective fund role |
| `get_community_insights(community_id)` | RPC: analytics (most hired category, spending, contributions) |
| `get_community_businesses(community_id)` | RPC: businesses with aggregated ratings |
| `get_community_visits(community_id, user_id, status)` | RPC: visits with creator info + joiner counts |
| `get_visit_joiners(visit_id)` | RPC: joiner details with profiles |
| `auto_complete_past_visits()` | Marks past visits as completed |

### Storage

- **Bucket**: `business-photos` (public) — business cover photos, offering images
- **Upload flow**: `expo-image-picker` → base64 → Supabase Storage upload
- **Provider images**: Icon placeholders (no uploads)
- **Profile avatars**: Google avatar URL from auth metadata

---

## 8. Feature Modules

### 8.1 Services Dashboard (Tab 1: Help)

The main screen with two segments:

- **Trusted Providers**: Browse, search, and filter community-vetted service providers by category. Cards show avg_rating, contact info.
- **Service Visits**: View upcoming and cancelled group visits. Schedule new visits linked to providers. Join existing visits to split costs.
- **Widgets**: Community Insights (analytics), Active Fund Teaser (ongoing collections), Notification bell with badge.

### 8.2 Resident Marketplace (Tab 2: Market) — ⚠️ DISABLED

Hidden from UI but fully implemented. Allows residents to list, browse, and contact home businesses. Features catalog management, ratings, and inquiry logging.

### 8.3 Favorites (Tab 3: Saved)

Personal bookmarks of favorited service providers. Toggle on/off with optimistic UI updates.

### 8.4 Fund Management (Tab 4: Funds)

- Admin creates funds with 1–2 assigned treasurers
- Transparent ledger: contributions (income) and expenses tracked per-resident
- Role-gated actions: admin > treasurer > collector > resident (view-only)
- Double-enforced permissions: client-side via `getFundPermissions()` + database-side via RLS + triggers

### 8.5 Profile (Tab 5)

User info, app role badge, community invite code for sharing, linked business status, sign-out.

### 8.6 Notifications

Real-time via Supabase Realtime channel. Database trigger creates notification rows when visits are scheduled. Bell icon with unread badge on home screen.

---

## 9. Real-Time System

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
| **Icons** | `Ionicons` from `@expo/vector-icons` only |
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
| Supabase Storage | Business photos | `business-photos` bucket, public URLs |
| Expo Notifications | Alerts | Local push on new notification INSERT |
| Phone Dialer | Provider detail, Visit detail | `Linking.openURL('tel:...')` |
| WhatsApp | Provider detail, Business detail | `whatsapp://send?phone=` or `https://wa.me/` |
| Native Share | Provider detail | `Share.share()` with provider contact info |
| Image Picker | Business add, Offering add | `expo-image-picker` → base64 → Supabase Storage |

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

- **AuthContext**: `session`, `user`, `profile`, `communityId`, `appRole`, `isLoading`, `refreshSession`, `signOut`
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
3. **Icons**: Only `Ionicons` from `@expo/vector-icons`
4. **Date inputs**: Always `@react-native-community/datetimepicker`
5. **Toast**: Use `react-native-toast-message` for user feedback
6. **Theme**: Light mode only. Use colors from `constants/Colors.ts`
7. **RLS**: All tables have Row Level Security. Community isolation is enforced server-side
8. **Types**: Regenerate `database.types.ts` after any schema change
9. **Docs**: Update `docs/` files when modifying code (architecture.md, features.md, CLAUDE.md, disabled-features.md)
10. **Migrations**: Deploy with `npm run db:push` → regenerate types → verify with `npx tsc --noEmit`

---

## 16. Current Status & Disabled Features

| Feature | Status | Reason |
|---------|--------|--------|
| Email verification | Disabled | Faster onboarding during pilot |
| Password strength validation | Removed | Simplified signup flow |
| Resident Marketplace (Market tab) | Hidden from UI | Deferred to later release; code fully intact |

### Re-enablement Plan

1. **Email verification**: Re-enable in Supabase dashboard, update login screen for verification phase
2. **Password strength**: Re-add validation in `validateForm()` in `app/login.tsx`
3. **Marketplace**: Restore tab `href` in `app/(tabs)/_layout.tsx`, uncomment business section in profile

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
