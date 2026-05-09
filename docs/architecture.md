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

### UI Conventions (Verandah)

Verandah is the only active UI language in the app. UI surfaces must follow these principles:

- Calm, utility-first presentation for quick in-and-out tasks.
- Light-mode-only canvas and card hierarchy.
- No decorative gradients for cards, chrome, or CTA fills.
- No elevation/shadow-based depth for cards.
- Font weights capped to `400` and `500`.

Token sources:

- Colors: `constants/Colors.ts` -> `Verandah`
- Typography and scales: `constants/Verandah.ts` -> `VerandahType`, `VerandahSpace`, `VerandahRadius`

Hardcoded visual primitives are not allowed for product UI (hex values, ad-hoc spacing, custom radii, or one-off typography values) when an equivalent Verandah token exists.

Shared component requirements:

- `components/BaseCard.tsx`: base shell for card-like surfaces.
- `components/Avatar.tsx`: deterministic initials avatar for people references.
- `components/Rupees.tsx`: all rupee amounts should render through this component where feasible.
- `components/EmptyState.tsx`: empty-list and empty-workflow surfaces.

Out-of-register items:

- Any temporary legacy visual pattern that cannot yet move to tokens must be documented in `docs/verandah.md` under the out-of-register appendix.
- Out-of-register entries must include: screen/component path, reason, and migration follow-up.

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

### Category Group Filter Pattern

The Help tab provider list supports a two-level category filter:

1. `selectedCategory: string | null` — set when a specific category chip is tapped; applied as `.eq('category', selectedCategory)` in the query.
2. `selectedGroupCategories: string[] | null` — set via the `onSelectGroupCategories` callback on `CategoryFilter` when a group chip is tapped; applied as `.in('category', selectedGroupCategories)` in the query when no specific category is active.

When switching tabs or clearing the search the group categories state is also reset to `null`. Both states are passed as dependencies to `fetchProviders`.

The `CategoryFilter` component in `components/CategoryFilter.tsx` derives groups from `CATEGORY_GROUPS` in `constants/categories.ts`. The same grouped-picker pattern (group row + filtered category scroll) is used in `app/provider/add.tsx` and `app/visits/add.tsx` for consistent category selection UX across the app.

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
  fundsEnabled: boolean
  blocksEnabled: boolean
  myBlockId: string | null
  activeCommunityRequest: { id: string; status: string; created_at: string; name: string } | null
  myFundsAccessRequest: { id: string; status: string; rejection_reason: string | null } | null
  isLoading: boolean
  refreshSession: () => Promise<void>
  signOut: () => Promise<void>
}
```

### Auth Helpers (`lib/auth.ts`)

- `configureGoogleSignIn()`
- `signUpWithEmail(email, password, fullName, flatNumber?)`
- `signInWithEmail(email, password)`
- `resetPassword(email)`
- `getAuthErrorMessage(error)`

---

## Database Schema

### Active Product Tables

| Table | Purpose | Scope |
|-------|---------|-------|
| `communities` | Community metadata, join code, and funds/block activation flags (`funds_enabled`, `blocks_enabled`) | Community |
| `profiles` | User profile extension of `auth.users`, including `flat_number` from signup metadata and optional `block_id` when blocks are enabled | Community or self |
| `community_requests` | Reviewed community creation requests | Requester or platform |
| `profile_audit_log` | Audit trail for profile mutations | Admin or internal |
| `service_providers` | Trusted provider listings | Community |
| `service_visits` | Group visit coordination | Community |
| `visit_joiners` | RSVPs for service visits | Community |
| `favorites` | Saved providers | User |
| `ratings` | Provider reviews | Community |
| `provider_hires` | Contact and hire history | Community |
| `hire_feedback` | Private per-hire resident sentiment log | User |
| `provider_public_rating_nudges` | One-time public-rating nudge memory per resident-provider pair | User |
| `events` | Community funds | Community |
| `event_transactions` | Fund ledger entries | Community |
| `fund_roles` | Treasurer and collector assignments per fund, optionally block-scoped via `block_id` | Community |
| `funds_access_requests` | Resident requests to activate funds in a community | Community + platform |
| `community_blocks` | Optional block definitions used for scoped fund collection | Community |
| `funds_access_revocations` | Platform-admin audit trail for funds access revocation | Platform admin |
| `notifications` | User notification feed | User |
| `user_services` | Personal service reminders | User |
| `community_partnerships` | Pairwise federation relationships across communities | Cross-community (backend only) |
| `community_groups` | Named clusters of communities for federation scopes | Cross-community (backend only) |
| `community_group_members` | Community memberships inside federation groups | Cross-community (backend only) |
| `provider_shares` | Explicit provider share targets by community/group/partnership | Cross-community (backend only) |
| `service_visit_communities` | Community audience mapping for cross-community visits | Cross-community (backend only) |
| `community_announcements` | Cross-community-capable announcements authored by communities | Cross-community (backend only) |
| `announcement_audiences` | Explicit announcement audience targets | Cross-community (backend only) |

### Removed Marketplace Tables

The marketplace tables `resident_businesses`, `business_offerings`, and `business_inquiries` were removed in the `20260422010000_simplify_roles_and_remove_marketplace.sql` migration. Provider favorites and ratings are now single-target tables.

### Key Database Functions

| Function | Purpose |
|----------|---------|
| `handle_new_user()` | Trigger helper that creates a `profiles` row after auth signup and copies `raw_user_meta_data.flat_number` into `profiles.flat_number` |
| `join_community_by_code(p_code)` | Join community immediately by code |
| `submit_community_request(...)` | Insert a new community request |
| `platform_approve_community_request(p_request_id)` | Create community, generate code, and assign requester to the community as resident |
| `platform_reject_community_request(p_request_id, p_rejection_reason)` | Reject pending community request |
| `community_lead_remove_resident(p_target_profile_id)` | Remove a non-lead resident from the lead's community |
| `platform_soft_remove_resident(p_target_profile_id, p_reason)` | Platform-admin soft removal |
| `get_residents_directory(p_include_phone)` | Community resident list with conditional phone visibility |
| `get_community_pulse(p_limit)` | Read-only community activity pulse aggregation for the caller's home community |
| `get_my_community_funds_overview()` | Home-community funds totals plus caller contribution status |
| `get_community_visits(...)` | Visit aggregation RPC |
| `get_visit_joiners(p_visit_id)` | Visit joiner detail RPC |
| `get_fund_role(p_event_id, p_user_id)` | Database-side fund role resolution |
| `get_my_upcoming_services()` | User-scoped reminders ordered by due date |
| `get_my_due_soon_count()` | Count reminders due within 7 days |
| `mark_service_done(p_service_id, p_provider_id?, p_cost_paid?, p_note?)` | Reset a reminder to serviced today and append optional private history details (backward compatible) |
| `get_service_history(p_service_id)` | List private history rows for a single reminder |
| `get_my_recent_service_history(p_limit)` | List latest private service history rows across reminders |
| `record_hire_feedback(p_hire_id, p_signal, p_note?)` | Upsert private feedback signal for one hire |
| `get_my_provider_history(p_provider_id)` | Return the caller's private hire/feedback timeline for one provider |
| `should_show_public_rating_nudge(p_provider_id)` | Gate one-time positive-flow public-rating prompt per provider |
| `mark_public_rating_nudge(p_provider_id, p_outcome)` | Persist one-time nudge outcome (`rated`, `dismissed`, `pending`) |
| `notify_due_services()` | Create due-soon reminder notifications |
| `normalize_indian_mobile(p_value)` | Canonicalize flexible phone input to a validated 10-digit Indian mobile |
| `set_audit_actor(p_actor_id)` / `set_audit_context(...)` | Attach audit metadata to profile changes |
| `get_user_partner_community_ids(...)` | Resolve caller-visible community set for a capability (`providers`, `visits`, `funds`, `announcements`) |
| `can_user_see_provider(...)` | Provider visibility predicate for additive cross-community read policies |
| `can_user_see_visit(...)` | Visit visibility predicate for additive cross-community read policies |
| `can_user_see_announcement(...)` | Announcement visibility predicate for additive cross-community read policies |
| `request_community_partnership(...)` | Community-lead RPC to initiate/reset partnerships |
| `accept_community_partnership(...)` | Community-lead RPC to accept pending partnerships |
| `set_partnership_status(...)` | Community-lead RPC to pause/revoke/reactivate partnerships |
| `set_provider_visibility(...)` | Creator/lead RPC to widen provider visibility and optional explicit targets |
| `list_visible_providers(...)` | Read RPC returning providers visible to the caller across federation rules |
| `list_partner_communities()` | Read RPC listing partner communities and scope metadata |
| `is_funds_enabled(p_community_id)` / `is_blocks_enabled(p_community_id)` | Activation predicates for funds and block-scoped features |
| `submit_funds_access_request(...)` / `withdraw_funds_access_request(...)` | Resident funds-support request workflow |
| `platform_approve_funds_access_request(...)` / `platform_reject_funds_access_request(...)` | Platform-admin approval decisions for funds activation |
| `platform_revoke_funds_access(...)` | Platform-admin revocation flow (demotes lead, disables funds/blocks, keeps ledger history) |
| `set_community_blocks_enabled(...)`, `add_community_block(...)`, `archive_community_block(...)`, `rename_community_block(...)` | Community-lead block lifecycle management |
| `set_resident_block(...)`, `set_my_block(...)` | Lead override and resident self-declaration block assignment |
| `assign_block_in_charge(...)` / `remove_block_in_charge(...)` | Community-lead block in-charge assignment/removal |
| `platform_set_community_lead(...)` / `platform_remove_community_lead(...)` | Platform-admin lead management in funds-enabled communities |
| `platform_add_community_block(...)`, `platform_archive_community_block(...)` | Platform-admin block management |
| `platform_assign_block_in_charge(...)` / `platform_remove_block_in_charge(...)` | Platform-admin block in-charge management |
| `list_community_blocks(...)` / `list_eligible_contributors_for_collector(...)` / `get_funds_access_status(...)` | Funds-activation and block-scoped UI read APIs |

### Triggers

| Trigger | Table | Event | Action |
|---------|-------|-------|--------|
| `on_auth_user_created` | `auth.users` | INSERT | Create profile row |
| `on_rating_change` | `ratings` | INSERT/UPDATE/DELETE | Recompute provider rating aggregates |
| `user_services_compute_fields_trigger` | `user_services` | BEFORE INSERT/UPDATE | Recompute `next_due_on` and clear `notified_at` when relevant |
| `fund_role_guard` | `fund_roles` | INSERT/UPDATE/DELETE | Enforce funds-enabled gate, treasurer cap, global collector cap, and per-block collector cap |
| `event_transaction_guard` | `event_transactions` | INSERT/UPDATE | Enforce funds-enabled gate and block-scope checks for block in-charges |
| `profile_block_guard` | `profiles` | BEFORE INSERT/UPDATE | Ensure `profiles.block_id` belongs to the same community |
| `fund_role_block_guard` | `fund_roles` | BEFORE INSERT/UPDATE | Ensure `fund_roles.block_id` belongs to the fund's community |
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
| `hire_feedback` | User-owned only (`auth.uid() = user_id`) |
| `provider_public_rating_nudges` | User-owned only (`auth.uid() = user_id`) |
| `events`, `event_transactions`, `fund_roles` | Community-scoped with role-gated writes |
| `funds_access_requests` | Community-visible reads for status; writes are RPC-only |
| `community_blocks` | Community-visible reads; writes are RPC-only |
| `funds_access_revocations` | Platform-admin reads only; writes are RPC-only |
| `notifications` | User-owned read and mark-read updates |
| `user_services` | User-owned only, independent of community filters |

Pending or rejected users are blocked from normal community content even if a stale `community_id` exists.

### Funds Activation Lifecycle

- Stage 1 (default): community exists with `funds_enabled = false`, `blocks_enabled = false`, and no valid `community_lead`.
- Stage 2 (activated): platform admin approves a funds-access request and in the same transaction sets `funds_enabled = true` plus promotes a designated resident to `community_lead`.
- Revocation: platform admin can revoke via `platform_revoke_funds_access(...)`, which sets `funds_enabled = false`, `blocks_enabled = false`, demotes the lead to `resident`, and clears block scopes without deleting or mutating ledger history (`events`/`event_transactions`).
- Trigger guardrails: both `fund_role_guard` and `event_transaction_guard` hard-reject writes when funds are inactive for the target community.

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
- `funds_access_requested`
- `funds_access_approved`
- `funds_access_rejected`
- `community_lead_appointed`
- `funds_access_revoked`

Hire feedback uses local `expo-notifications` scheduling with a 24-hour trigger after a successful `provider_hires` insert. No server-side fan-out is used for this flow.

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
  -> /community-join-block
  -> /community/blocks
  -> /(tabs)
  -> /notifications
  -> /residents
  -> /provider/*
  -> /hire-feedback/*
  -> /visits/*
  -> /funds/*
  -> /funds-access/request
  -> /services/*
  -> /platform/*
```

### Main Tabs (`app/(tabs)/_layout.tsx`)

- Help
- Saved
- Community
- Profile

Tab icons are currently rendered with `APP_EMOJIS` inside `Text` elements.

The community tab consolidates the read-only pulse line, funds list and summary, residents-directory shortcut, and community information card. Fund detail and create/transaction flows remain in `/funds/*` top-level routes.

### Platform Tabs (`app/platform/_layout.tsx`)

- Approvals
- Communities
- Funds requests

### Dynamic Detail Routes

- `/provider/[id]`
- `/hire-feedback/[hireId]`
- `/visits/[id]`
- `/funds/[id]`
- `/services/[id]`
- `/platform/community/[id]`

### Route Parameter Patterns

- Help screen preserves state via params like `segment` and `visitTab`
- Residents screen can receive `returnTo=profile` or `returnTo=community`
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
- Flat or house number inputs should normalize to uppercase and strip spaces and hyphens on blur so values stay consistent across signup, onboarding, and visit joins

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
- locally composed fund summary objects in the Community tab funds section
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

---

## Cross-Community Federation (Backend Foundation)

The cross-community backend foundation is now active at the database layer only. New federation tables, helper predicates, and RPCs have been added without changing existing UI behavior.

- Tables and schema surface are documented in `docs/cross-community.md` Section 4.
- Helper functions and predicates are documented in `docs/cross-community.md` Section 5.
- The additive RLS approach (new permissive SELECT policies that union with existing policies) is documented in `docs/cross-community.md` Section 6.

No UI consumes these objects today. See `docs/cross-community.md` for the full reference and `docs/cross-community-changelog.md` for the change log.