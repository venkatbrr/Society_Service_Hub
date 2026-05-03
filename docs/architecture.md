# Architecture Reference

> **AI agents must review this file before modifying the codebase.**

This document covers the active technical architecture: data flow, auth, schema, RLS, navigation, notifications, state management, fund permissions, storage, and the current route model.

---

## Data Flow

```
User interaction
  -> Screen state (`useState`, `useEffect`, `useFocusEffect`)
    -> Supabase query or RPC
      -> PostgreSQL tables, triggers, RPCs, and RLS
    -> Local screen state update
  -> UI re-render
```

Global state flows through two React Context providers:

```
AuthProvider (context/AuthContext.tsx)
  -> session, user, profile, appRole, communityId
  -> isPlatformAdmin, isCommunityLead
  -> activeCommunityRequest, isLoading

NotificationProvider (context/NotificationContext.tsx)
  -> notifications, unreadCount, loading
  -> fetchNotifications, markAsRead, markAllAsRead
  -> push-permission registration and realtime subscription
```

### Query Scoping Rule

Most application data is community-scoped and must be filtered by `communityId` from `useAuth()`. The main exception is `user_services`, which is user-scoped and protected by `auth.uid() = user_id` instead of community membership.
Database RLS uses `get_user_community_id()` which resolves from `profiles.community_id` first and falls back to JWT metadata for compatibility.

For personal reminders, the list view uses `get_my_upcoming_services()` while detail and edit flows read the target row directly from `user_services` by reminder ID.

### Debounced Search Pattern

The Help tab (`app/(tabs)/index.tsx`) uses a debounced search to prevent a Supabase query on every keystroke. The pattern:

```tsx
const [searchQuery, setSearchQuery] = useState('');
const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

useEffect(() => {
  const t = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
  return () => clearTimeout(t);
}, [searchQuery]);
```

`debouncedSearchQuery` (not `searchQuery`) is used in fetch dependency arrays. This pattern must be applied to any screen that filters a Supabase list via a text input. The `provider_hires` query on the Help tab is scoped to `communityId`. The `visit_joiners` query is scoped to only the current page's visit IDs to avoid full-table scans.

---

## Auth Architecture

### Root Layout (`app/_layout.tsx`)

`RootLayout` wraps the app in:

1. `SafeAreaProvider`
2. `AuthProvider`
3. `NotificationProvider`
4. `Toast`

`RootLayoutNav` configures Google Sign-In on mount and centralizes redirect logic.

### Redirect Logic

```text
No session -> /login
Platform admin session -> /platform/approvals
Authenticated, no community, active request -> /community-request-submitted
Authenticated, no community, no request -> /community-select
Authenticated with community -> /(tabs)
```

### AuthContext (`context/AuthContext.tsx`)

`AuthContext` loads the session from Supabase Auth, fetches the `profiles` row, resolves `communityId`, and loads the latest active community request when the user is still unassigned.

Community ID resolution order:

1. `profile.community_id`
2. `session.user.user_metadata.community_id`
3. `session.user.app_metadata.community_id`
4. `null`

Exception: if `profile.app_role = 'admin'`, `communityId` is forced to `null` even when auth metadata still has an old `community_id` value.

Compatibility note: legacy `community_lead` profiles created by older approval logic are normalized to `resident` by current app role resolution and migration backfills.

Exported shape:

```typescript
type AuthContextType = {
  session: Session | null
  user: User | null
  profile: Tables<'profiles'> | null
  appRole: 'admin' | 'community_lead' | 'resident'
  communityId: string | null
  isPlatformAdmin: boolean
  isCommunityLead: boolean
  activeCommunityRequest: { id, status, created_at, name } | null
  isLoading: boolean
  refreshSession: () => Promise<void>
  signOut: () => Promise<void>
}
```

### Auth Helpers (`lib/auth.ts`)

- `configureGoogleSignIn()`
- `signUpWithEmail(email, password, fullName)`
- `signInWithEmail(email, password)`
- `resetPassword(email)`
- `getAuthErrorMessage(error)`

---

## Database Schema

### Active Product Tables

| Table | Purpose | Scope |
|-------|---------|-------|
| `communities` | Community metadata and 6-character join code | Community |
| `profiles` | User profile extension of `auth.users` | Community or self |
| `community_requests` | Reviewed community creation requests | Requester or platform |
| `profile_audit_log` | Audit trail for profile mutations | Admin or internal |
| `service_providers` | Trusted provider listings | Community |
| `service_visits` | Group visit coordination | Community |
| `visit_joiners` | RSVPs for service visits | Community |
| `favorites` | Saved providers | User |
| `ratings` | Provider reviews | Community |
| `provider_hires` | Contact and hire history | Community |
| `events` | Community funds | Community |
| `event_transactions` | Fund ledger entries | Community |
| `fund_roles` | Treasurer and collector assignments per fund | Community |
| `notifications` | User notification feed | User |
| `user_services` | Personal service reminders | User |

### Removed Marketplace Tables

The marketplace tables `resident_businesses`, `business_offerings`, and `business_inquiries` were removed in the `20260422010000_simplify_roles_and_remove_marketplace.sql` migration. Provider favorites and ratings are now single-target tables.

### Key Database Functions

| Function | Purpose |
|----------|---------|
| `handle_new_user()` | Trigger helper that creates a `profiles` row after auth signup |
| `join_community_by_code(p_code)` | Join community immediately by code |
| `submit_community_request(...)` | Insert a new community request |
| `platform_approve_community_request(p_request_id)` | Create community, generate code, and assign requester to the community as resident |
| `platform_reject_community_request(p_request_id, p_rejection_reason)` | Reject pending community request |
| `community_lead_remove_resident(p_target_profile_id)` | Remove a non-lead resident from the lead's community |
| `platform_soft_remove_resident(p_target_profile_id, p_reason)` | Platform-admin soft removal |
| `get_residents_directory(p_include_phone)` | Community resident list with conditional phone visibility |
| `get_community_visits(...)` | Visit aggregation RPC |
| `get_visit_joiners(p_visit_id)` | Visit joiner detail RPC |
| `get_fund_role(p_event_id, p_user_id)` | Database-side fund role resolution |
| `get_my_upcoming_services()` | User-scoped reminders ordered by due date |
| `get_my_due_soon_count()` | Count reminders due within 7 days |
| `mark_service_done(p_service_id)` | Reset a reminder to serviced today |
| `notify_due_services()` | Create due-soon reminder notifications |
| `normalize_indian_mobile(p_value)` | Canonicalize flexible phone input to a validated 10-digit Indian mobile |
| `set_audit_actor(p_actor_id)` / `set_audit_context(...)` | Attach audit metadata to profile changes |

### Triggers

| Trigger | Table | Event | Action |
|---------|-------|-------|--------|
| `on_auth_user_created` | `auth.users` | INSERT | Create profile row |
| `on_rating_change` | `ratings` | INSERT/UPDATE/DELETE | Recompute provider rating aggregates |
| `user_services_compute_fields_trigger` | `user_services` | BEFORE INSERT/UPDATE | Recompute `next_due_on` and clear `notified_at` when relevant |
| `fund_role_guard` | `fund_roles` | INSERT/UPDATE/DELETE | Enforce fund assignment limits and community rules |
| `event_transaction_guard` | `event_transactions` | INSERT/UPDATE | Validate transaction semantics |
| `service_provider_phone_guard_trigger` | `service_providers` | BEFORE INSERT/UPDATE | Normalize provider phones and reject duplicates within the same community |
| `on_service_visit_created` | `service_visits` | INSERT | Insert visit notifications |

### RLS Summary

All active tables have RLS enabled.

| Table | Access model |
|-------|--------------|
| `profiles` | Own profile or same community |
| `community_requests` | Requester read access and platform review workflows |
| `service_providers` | Same community; creator manages own rows |
| `service_visits` | Same community; creator manages own rows |
| `visit_joiners` | Same community; users manage their own joins |
| `favorites` | User-owned only |
| `ratings` | Same community for reads; owner-managed writes |
| `provider_hires` | Community-scoped usage history |
| `events`, `event_transactions`, `fund_roles` | Community-scoped with role-gated writes |
| `notifications` | User-owned read and mark-read updates |
| `user_services` | User-owned only, independent of community filters |

Pending or rejected users are blocked from normal community content even if a stale `community_id` exists.

---

## Real-Time Notifications

### NotificationContext (`context/NotificationContext.tsx`)

`NotificationProvider`:

- loads the latest 50 rows from `notifications`
- tracks unread count in memory
- subscribes to `postgres_changes` INSERT events filtered by `user_id`
- requests notification permissions on mobile
- creates the Android `default` notification channel
- stores `profiles.expo_push_token` when Expo token registration succeeds

When a new notification arrives:

1. the row is prepended to local state
2. `unreadCount` increments
3. a local device notification is scheduled on iOS or Android

Current active notification flows:

- `new_visit`
- `community_approved`
- `community_rejected`
- `removed_from_community`
- `service_reminder`

The notification screen still contains defensive handling for some legacy promotion-related payloads.

---

## Navigation Architecture

### Route Hierarchy

```text
app/_layout.tsx
  -> /login
  -> /forgot-password
  -> /community-select
  -> /community-request
  -> /community-request-submitted
  -> /(tabs)
  -> /notifications
  -> /residents
  -> /provider/*
  -> /visits/*
  -> /funds/*
  -> /services/*
  -> /platform/*
```

### Main Tabs (`app/(tabs)/_layout.tsx`)

- Help
- Saved
- Funds
- Profile

Tab icons are currently rendered with `APP_EMOJIS` inside `Text` elements.

### Platform Tabs (`app/platform/_layout.tsx`)

- Approvals
- Communities

### Dynamic Detail Routes

- `/provider/[id]`
- `/visits/[id]`
- `/funds/[id]`
- `/services/[id]`
- `/platform/community/[id]`

### Route Parameter Patterns

- Help screen preserves state via params like `segment` and `visitTab`
- Residents screen can receive `returnTo=profile`
- Fund transactions use `event_id` and `type`

---

## State Management Patterns

### Common Fetching Shapes

1. `useEffect` for initial fetches and dependency-driven reloads
2. `useFocusEffect` for screens that must refresh when revisited
3. `useCallback`-wrapped loaders for stable dependencies
4. `Promise.all` for batched Supabase reads
5. Optimistic UI updates for lightweight user actions like marking notifications or toggling favorites

### Screen-State Conventions

- `loading` for initial fetch state
- `refreshing` for pull-to-refresh
- `isLoading` for form submission state
- Toasts for all user-visible success and failure messages

---

## Type System

### Generated Types

`lib/database.types.ts` is generated from Supabase and provides:

```typescript
type Tables<T>
type InsertTables<T>
type UpdateTables<T>
type Enums<T>
```

Regenerate with:

```bash
npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj
```

### Important App Types

```typescript
type AppRole = Tables<'profiles'>['app_role']
type AssignmentRole = Tables<'fund_roles'>['role']
type FundAccessRole = 'admin' | AssignmentRole | 'resident'
```

`lib/fundRoles.ts` still treats both `admin` and legacy `community_admin` values as fund-admin equivalents for compatibility. The active auth model exposed by `AuthContext` is `admin | community_lead | resident`.

Representative enriched types used in screens include:

- `ProviderWithInteraction`
- `VisitWithJoinerData`
- locally composed fund summary objects in the Funds tab
- `ServiceCardItem` for reminder list cards

---

## Fund Permissions (`lib/fundRoles.ts`)

Constants:

```typescript
MAX_TREASURERS = 2
MIN_TREASURERS = 1
MAX_COLLECTORS = 6
```

Helper behavior:

```typescript
getEffectiveFundRole(appRole, assignments, userId)
getFundPermissions(role)
formatRole(role)
getRestrictionHint(role)
```

Permission model returned by `getFundPermissions()`:

- `canCreateFund`
- `canManageTreasurers`
- `canManageCollectors`
- `canAddContribution`
- `canAddExpense`

Database rules remain the source of truth through RLS, `fund_role_guard`, and `event_transaction_guard`.

---

## Error Handling

### Shared Helpers

`lib/supabaseErrors.ts` detects schema and cache issues, especially around the funds feature:

- `isMissingFundSchemaError(error)`
- `getMissingFundSchemaMessage()`

`lib/auth.ts` maps Supabase auth failures into user-facing strings with `getAuthErrorMessage(error)`.

### UI Feedback Pattern

Every screen uses `react-native-toast-message` for success and failure feedback.

Typical shape:

```typescript
try {
  const { data, error } = await supabase.from('table').select('*')
  if (error) throw error
  setData(data)
} catch (error: any) {
  Toast.show({ type: 'error', text1: 'Error', text2: error.message })
} finally {
  setLoading(false)
}
```

---

## Storage

The current live UI does not have an active file-upload feature.

The database setup still includes the public `community-uploads` bucket, but no current screen writes to it. Profile avatars come from auth metadata, and provider or reminder flows do not upload media.