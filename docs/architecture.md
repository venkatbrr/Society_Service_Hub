# Architecture Reference

> **AI agents must review this file before modifying any code.**

This document covers the technical architecture: data flow, auth, database schema, real-time system, navigation, state management, type system, permissions, error handling, and storage.

---

## Data Flow

```
User Action
  → Component (local useState)
    → supabase.from('table').select/insert/update/delete()
      → Supabase PostgreSQL (RLS enforced by community_id in JWT)
        → Response
      → Component updates local state
    → UI re-renders
```

**Global state flows through two React Context providers:**

```
AuthProvider (context/AuthContext.tsx)
  ├── session, user, profile, communityId, appRole
  └── Consumed via useAuth() hook

NotificationProvider (context/NotificationContext.tsx)
  ├── notifications[], unreadCount
  └── Consumed via useNotifications() hook
```

**Typical screen data flow:**
1. Screen calls `useAuth()` → gets `communityId`
2. `useEffect` or `useFocusEffect` triggers fetch
3. Supabase query with `.eq('community_id', communityId)` filter
4. Results stored in local `useState`
5. User interaction → optimistic UI update → Supabase mutation → error reverts if needed

---

## Auth Architecture

### Supabase Client (`lib/supabase.ts`)

```typescript
// Custom AsyncStorage adapter (not SecureStore — Android 2KB limit)
const AsyncStorageAdapter = { getItem, setItem, removeItem }

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
})
```

### Auth Helpers (`lib/auth.ts`)

- `configureGoogleSignIn()` — sets web client ID for Google OAuth
- `signUpWithEmail(email, password, fullName)` — creates account + passes `full_name` in metadata
- `signInWithEmail(email, password)` — standard email/password auth
- `resetPassword(email)` — sends reset link to `societyservicehub://reset-password`
- `getAuthErrorMessage(error)` — maps Supabase auth errors to user-friendly messages

### Session Lifecycle (`context/AuthContext.tsx`)

```
App Boot
  → supabase.auth.getSession()
    → setSession, setUser
    → loadProfile(userId)
      → fetch profiles row by id
      → setCommunityId (fallback: profile → user_metadata → app_metadata)
      → setAppRole ('admin' | 'resident')
  → supabase.auth.onAuthStateChange(callback)
    → re-runs loadProfile on every auth event
```

**Community ID resolution order:**
1. `profile.community_id`
2. `session.user.user_metadata.community_id`
3. `session.user.app_metadata.community_id`
4. `null` (triggers redirect to `/community-select`)

### Exported AuthContext values

```typescript
type AuthContextType = {
  session: Session | null
  user: User | null
  profile: Tables<'profiles'> | null
  appRole: 'admin' | 'resident'
  communityId: string | null
  isLoading: boolean
  refreshSession: () => Promise<void>
  signOut: () => Promise<void>
}
```

---

## Database Schema

### Tables Overview

| Table | Purpose | Key Constraints |
|-------|---------|-----------------|
| `communities` | Society grouping | `code` UNIQUE |
| `profiles` | User extension of `auth.users` | PK = `auth.users.id`, `app_role` enum |
| `service_providers` | Trusted provider listings | `community_id` FK |
| `service_visits` | Group visit coordination | `provider_id` nullable, `status` enum |
| `visit_joiners` | Visit RSVPs | UNIQUE(`visit_id`, `user_id`) |
| `resident_businesses` | Resident-run businesses | UNIQUE(`owner_id`, `community_id`) |
| `business_offerings` | Business catalog items | `business_id` FK, `sort_order` |
| `business_inquiries` | Contact tracking | `inquiry_type`: whatsapp or call |
| `favorites` | Bookmarks | Dual-target: `provider_id` XOR `business_id` |
| `ratings` | 1–5 star reviews | Dual-target: `provider_id` XOR `business_id` |
| `provider_hires` | Hire interaction count | `user_id` + `provider_id` |
| `events` | Community funds | `goal_amount`, `event_date` |
| `event_transactions` | Fund ledger entries | `type`: income or expense, `amount > 0` |
| `fund_roles` | Per-fund role assignments | UNIQUE(`event_id`, `user_id`), `role` enum |
| `notifications` | User notifications | `data` JSONB, `is_read` boolean |

### Dual-Target Check Constraint (favorites, ratings)

```sql
CHECK (
  (provider_id IS NOT NULL AND business_id IS NULL) OR
  (provider_id IS NULL AND business_id IS NOT NULL)
)
```

### Database Functions

| Function | Purpose |
|----------|---------|
| `handle_new_user()` | Trigger: auto-creates `profiles` row on signup. First user in community gets `admin` role. |
| `get_user_community_id()` | Returns community_id from JWT (`app_metadata` → `user_metadata` fallback) |
| `is_admin(p_user_id)` | Checks if user has `app_role = 'admin'` |
| `get_fund_role(p_event_id, p_user_id)` | Resolves effective fund role (admin > assigned > resident) |
| `get_community_insights(p_community_id)` | RPC: returns most hired category, monthly spending, contribution % |
| `get_community_businesses(p_community_id)` | RPC: returns businesses with aggregated ratings + inquiry counts |
| `get_community_visits(p_community_id, p_user_id, p_status)` | RPC: returns visits with creator info + joiner counts. `p_status` supports comma-separated values (e.g. `'upcoming,cancelled'`). Default: `'upcoming'`. |
| `get_visit_joiners(p_visit_id)` | RPC: returns joiner details with profile info |
| `auto_complete_past_visits()` | Marks past visits as completed |

### Database Triggers

| Trigger | Table | Event | Action |
|---------|-------|-------|--------|
| `on_auth_user_created` | `auth.users` | INSERT | Auto-create profile row |
| `on_rating_change` | `ratings` | INSERT/UPDATE/DELETE | Recalculate `service_providers.avg_rating` |
| `fund_role_guard` | `fund_roles` | INSERT/UPDATE/DELETE | Validate treasurer/collector limits + community |
| `event_transaction_guard` | `event_transactions` | INSERT/UPDATE | Validate title, contributor community |
| `on_service_visit_created` | `service_visits` | INSERT | Notify all community members |

### RLS Policies

All tables have Row Level Security enabled. Community isolation enforced via `get_user_community_id()`.

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `profiles` | Own or same community | Own record | Own record | — |
| `service_providers` | Same community | Same community | Creator only | Creator only |
| `service_visits` | Same community | Same community | Creator only | Creator only |
| `visit_joiners` | Same community | Own (if visit is upcoming) | — | Own only |
| `resident_businesses` | Same community | Same community | Owner only | Owner only |
| `business_offerings` | Via business visibility | Business owner | Business owner | Business owner |
| `favorites` | Own only | Own only | — | Own only |
| `ratings` | Same community | Own only | Own only | — |
| `events` | Same community | Admin only | Admin only | Admin only |
| `event_transactions` | Same community | Role-gated (see below) | Role-gated | Role-gated |
| `fund_roles` | Same community | Admin or treasurer | Admin/treasurer | Admin/treasurer |
| `notifications` | Own only | System only | Own only | — |

**Transaction RLS detail:**
- Income: `get_fund_role()` must return `admin`, `treasurer`, or `collector`
- Expense: `get_fund_role()` must return `admin` or `treasurer`

---

## Real-Time System

### NotificationContext (`context/NotificationContext.tsx`)

```typescript
interface NotificationContextType {
  notifications: Notification[]
  unreadCount: number
  loading: boolean
  fetchNotifications: () => Promise<void>
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
}
```

**Subscription setup:**
```typescript
const channel = supabase
  .channel(`user_notifications_${user.id}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `user_id=eq.${user.id}`,
  }, (payload) => {
    // Prepend to local state
    // Increment unreadCount
    // Trigger native notification (non-web) via expo-notifications
  })
  .subscribe()
```

**Cleanup:** `supabase.removeChannel(channel)` on unmount or user logout.

**Notification trigger (database):** When a `service_visit` is inserted, a trigger inserts `notifications` rows for all other community members with `type = 'new_visit'`.

---

## Navigation Architecture

### Layout Hierarchy

```
app/_layout.tsx (RootLayout)
  ├── SafeAreaProvider
  ├── AuthProvider
  ├── NotificationProvider
  ├── RootLayoutNav (redirect logic)
  │   └── Slot (renders matched route)
  └── Toast
```

### Redirect Logic (`app/_layout.tsx`)

```
if (!session) → router.replace('/login')
else if (session && !communityId) → router.replace('/community-select')
else if (session && communityId && on auth page) → router.replace('/(tabs)')
```

### Tab Navigator (`app/(tabs)/_layout.tsx`)

5 tabs: Help (index), Market (business), Saved (favorites), Funds (funds), Profile (profile).

### Dynamic Routes

All detail screens use `[id].tsx` pattern. Params accessed via `useLocalSearchParams()`.

```
app/provider/[id].tsx   → /provider/abc-123
app/business/[id].tsx   → /business/abc-123
app/visits/[id].tsx     → /visits/abc-123
app/funds/[id].tsx      → /funds/abc-123
app/business/catalog/[id].tsx → /business/catalog/abc-123
```

### Navigation Patterns

```typescript
router.push('/business/add')                    // Stack push
router.push(`/business/${businessId}`)           // Dynamic route
router.replace('/login')                         // Replace (no back)
router.back()                                    // Go back
```

---

## State Management Patterns

### Three Layers

1. **Global Context** — `AuthContext` + `NotificationContext` (persists across app lifetime)
2. **Screen State** — `useState` for fetched data, loading, refreshing
3. **Component State** — minimal UI state in presentational components

### Data Fetching Patterns

**Pattern A — useEffect with dependencies:**
```typescript
useEffect(() => { fetchData() }, [fetchData])
```

**Pattern B — useFocusEffect (re-fetch on screen focus):**
```typescript
useFocusEffect(useCallback(() => { fetchData() }, [deps]))
```

**Pattern C — useCallback memoization:**
```typescript
const fetchData = useCallback(async () => {
  if (!communityId) return
  const { data } = await supabase.from('table').select('*').eq('community_id', communityId)
  setData(data)
}, [communityId])
```

**Pattern D — Parallel fetching:**
```typescript
const [result1, result2] = await Promise.all([query1, query2])
```

**Pattern E — Optimistic UI:**
```typescript
setItems(prev => prev.map(i => i.id === id ? { ...i, is_favorite: !i.is_favorite } : i))
// Then call API; if fails, next fetch corrects state
```

**Pattern F — Pull-to-refresh:**
```typescript
<FlatList refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} />
```

---

## Type System

### Generated Types (`lib/database.types.ts`)

Auto-generated from Supabase schema. Regenerate with:
```bash
npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj
```

Exports:
```typescript
type Tables<T>       // Row type for table T
type InsertTables<T> // Insert type for table T
type UpdateTables<T> // Update type for table T
```

### Enriched Domain Types

```typescript
// Provider with UI interaction state
type ProviderWithInteraction = Tables<'service_providers'> & {
  is_favorite?: boolean
  user_rating?: number | null
  hire_count?: number
}

// Business with aggregated data
type BusinessWithInteraction = Tables<'resident_businesses'> & {
  is_favorite?: boolean
  avg_rating?: number
  rating_count?: number
  inquiry_count?: number
  owner_name?: string
  owner_flat?: string
}

// Visit with creator + joiner info
type VisitWithJoinerData = Tables<'service_visits'> & {
  creator_name?: string
  joiner_count?: number
  has_user_joined?: boolean
}

// Fund with computed totals
type FundWithTotals = Tables<'events'> & {
  totals: { income: number; expense: number; balance: number }
  currentRole: FundAccessRole
  treasurerNames: string[]
  collectorCount: number
}
```

### Role Types

```typescript
type AppRole = 'admin' | 'resident'
type AssignmentRole = 'treasurer' | 'collector'
type FundAccessRole = 'admin' | AssignmentRole | 'resident'
```

---

## Fund Roles & Permissions (`lib/fundRoles.ts`)

### Constants

```typescript
MAX_TREASURERS = 2
MIN_TREASURERS = 1
MAX_COLLECTORS = 6
```

### Role Resolution

```typescript
getEffectiveFundRole(appRole, assignments, userId): FundAccessRole
// 1. If appRole === 'admin' → 'admin'
// 2. If userId in fund_roles → assigned role
// 3. Otherwise → 'resident'
```

### Permission Model

```typescript
getFundPermissions(role: FundAccessRole) → {
  canCreateFund:        role === 'admin'
  canManageTreasurers:  role === 'admin'
  canManageCollectors:  role === 'treasurer'
  canAddContribution:   role in ['admin', 'treasurer', 'collector']
  canAddExpense:        role in ['admin', 'treasurer']
}
```

### Helper Functions

- `formatRole(role)` — capitalizes role name for display
- `getRestrictionHint(role)` — returns descriptive text explaining what the role can do

### Database Enforcement

Fund role limits and transaction access are double-enforced:
1. **Client-side** via `getFundPermissions()` (UI gating)
2. **Database-side** via RLS policies + `fund_role_guard` and `event_transaction_guard` triggers

---

## Error Handling

### Centralized Error Detection (`lib/supabaseErrors.ts`)

```typescript
isSupabaseSchemaError(error)       // Detects PGRST200/204/205, schema cache errors
isMissingFundSchemaError(error)    // Schema error specific to fund tables
getMissingFundSchemaMessage()      // User-friendly message for fund schema errors
```

### Auth Error Messages (`lib/auth.ts`)

```typescript
getAuthErrorMessage(error) // Maps Supabase auth errors to friendly strings:
// 'Invalid login credentials' → 'Invalid email or password. Please try again.'
// 'User already registered' → 'An account with this email already exists.'
// etc.
```

### Standard Screen Pattern

```typescript
try {
  setLoading(true)
  const { data, error } = await supabase.from('table').select('*')
  if (error) {
    if (isMissingFundSchemaError(error)) {
      Toast.show({ type: 'error', text1: '...', text2: getMissingFundSchemaMessage() })
      return
    }
    throw error
  }
  setData(data)
} catch (error: any) {
  Toast.show({ type: 'error', text1: 'Error', text2: error.message })
} finally {
  setLoading(false)
}
```

### Toast Feedback

All user feedback via `react-native-toast-message`:
```typescript
Toast.show({ type: 'success' | 'error' | 'info', text1: 'Title', text2: 'Details' })
```

---

## Storage

### Business Photos Bucket

- Bucket name: `business-photos` (public)
- Used for: business cover photos, offering photos
- Upload flow: `expo-image-picker` → base64 → `supabase.storage.from('business-photos').upload(path, file)`
- Public URL: `supabase.storage.from('business-photos').getPublicUrl(path)`
- Rendered via `<Image source={{ uri: photoUrl }} />`

### No image storage for:
- Service providers (use icon placeholders)
- Profiles (use Google avatar URL from auth metadata)
