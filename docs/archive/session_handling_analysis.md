# Session Handling Audit & Observations

## 1. Executive Summary

This document presents a comprehensive audit of session lifecycle, authentication persistence, token refreshes, navigation guards, and error resilience across the **Society Service Hub** mobile and web app, as well as the admin web dashboard.

---

## 2. Current Session Architecture Overview

- **Auth Provider**: Supabase JS Client (`@supabase/supabase-js`)
- **Storage Layer**:
  - **Native (iOS/Android)**: `@react-native-async-storage/async-storage` via custom adapter to bypass Android `SecureStore` 2048-byte limit.
  - **Web**: Browser `localStorage` (default).
- **State Management**: React `AuthContext` (`context/AuthContext.tsx`), wrapping the application root (`app/_layout.tsx`).
- **Navigation Guard**: Centralized `useEffect` in `app/_layout.tsx` watching `session`, `communityId`, `activeCommunityRequest`, and `isPlatformAdmin`.

---

## 3. Key Observations & Issues Identified

### Observation 1: Missing `AppState` Foreground Resume Re-validation (Mobile)
- **Current Behavior**: `AuthContext.tsx` initializes session checking on mount (`fetchSession()`). When the app is backgrounded on iOS/Android for hours or days, access tokens expire. When the user resumes the app into the foreground (`AppState` transitions from `background` -> `active`), no session re-validation or proactive token refresh takes place.
- **Impact**: The user sees stale content. Their first interactive action (e.g. submitting a visit, requesting funds) fails with a 401 JWT error.
- **Standard Requirement**: Listen to `AppState` change events. When `AppState.current === 'active'`, invoke `supabase.auth.getSession()` or `refreshSession()` to ensure token validity before user interactions.

---

### Observation 2: Incomplete `onAuthStateChange` Event Handling
- **Current Behavior**:
  ```tsx
  supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session);
    setUser(session?.user ?? null);
    loadProfile(session?.user?.id, session).finally(() => setIsLoading(false));
  });
  ```
  The listener ignores the specific event type (`SIGNED_OUT`, `TOKEN_REFRESHED`, `USER_UPDATED`, `PASSWORD_RECOVERY`, `INITIAL_SESSION`).
- **Impact**:
  1. When `_event === 'SIGNED_OUT'`, `clearLocalSession()` (which executes `supabase.auth.signOut({ scope: 'local' })`) is not explicitly called. Stale tokens may remain in `AsyncStorage`.
  2. When `_event === 'TOKEN_REFRESHED'` fails or yields a null session, local state is not cleanly reset.
  3. No support for handling `PASSWORD_RECOVERY` event redirects on deep links.

---

### Observation 3: Network Interruption Misclassified as "Missing Community"
- **Current Behavior**: In `loadProfile()` inside `AuthContext.tsx`:
  ```tsx
  if (error) {
    console.error('Error loading profile:', error);
    setProfile(null);
    setFundsEnabled(false);
    ...
    return;
  }
  ```
  If fetching the profile fails due to temporary network disconnection or server 5xx:
  - `session` remains active non-null.
  - `profile` becomes `null`.
  - `communityId` becomes `null`.
  - `RootLayoutNav` sees `session && !communityId` and automatically redirects the user away from their current screen to `/community-select`.
- **Impact**: Users experiencing a 2-second cellular network drop get involuntarily kicked to the community selection screen instead of staying on their current page with a network retry warning.

---

### Observation 4: Lack of Intended Route / Deep Link Memory on Unauthenticated Redirect
- **Current Behavior**: When an unauthenticated user opens a deep link (e.g. `/services/123`, `/funds/add`) or their session expires mid-session, `RootLayoutNav` replaces the route with `/login`.
- **Impact**: Upon logging back in, the user is always dumped at `/(tabs)` or `/community-select`. Their original target screen context is lost.
- **Standard Requirement**: Preserve `redirectUrl` / target path prior to forcing `/login`, and redirect back to `redirectUrl` upon successful sign-in.

---

### Observation 5: No Global 401 / Invalid JWT Interceptor for Supabase Queries
- **Current Behavior**: Individual screens execute direct `supabase.from(...)` or `supabase.rpc(...)` calls. When a query returns a `401 Unauthorized`, `PGRST301` (JWT expired), or `invalid_claim` error, screens catch it generically and show `Toast.show({ type: 'error' })` without attempting to refresh the session or transition the user out of a broken state.
- **Impact**: User stays trapped on broken screens with failing buttons.

---

### Observation 6: Realtime Channel Cleanups on Sign-Out
- **Current Behavior**: `NotificationContext.tsx` opens a Supabase Postgres Changes channel `user_notifications_${user.id}`. When sign-out occurs, `user` becomes null, but explicit channel cleanup (`supabase.removeChannel`) depends solely on effect teardown.
- **Impact**: Potential memory leak or orphaned channel subscriptions during fast sign-out / sign-in switching.

---

### Observation 7: Admin Web Dashboard (`admin-dashboard/js/auth.js`) Session Refresh Gap
- **Current Behavior**: Admin dashboard checks `onAuthStateChange` on init, but doesn't handle periodic session refreshing or token expiry during long admin sessions. If the tab stays open overnight, subsequent API operations fail silently or lock up in the UI.

---

## 4. Standard Session Handling Checklist

| Standard Requirement | Current Status | Remediation Plan |
|---|---|---|
| Persistent Storage (Native & Web) | ✅ Handled | Configured in `lib/supabase.ts` |
| Foreground App Resume Validation | ❌ Missing | Add `AppState` listener in `AuthContext` |
| Explicit `onAuthStateChange` Routing | ⚠️ Partial | Distinguish `SIGNED_OUT`, `TOKEN_REFRESHED`, `PASSWORD_RECOVERY` |
| Network Error vs Missing Profile Handling | ❌ Misclassified | Do not wipe profile/community state on transient network errors |
| Intended Destination Redirect | ❌ Missing | Save target route before redirecting to `/login` |
| Token Refresh on 401 Query Error | ❌ Missing | Helper wrapper or error interceptor for Supabase requests |
| Session Health / Token Expiry Safeguards | ⚠️ Basic | Validate user existence on app resume & handle refresh errors |

---

## 5. Summary & Next Steps

To bring the application up to commercial session handling standards:
1. Update `AuthContext.tsx` to handle `AppState` foreground resume, explicit `onAuthStateChange` event types, and resilient network error handling in `loadProfile`.
2. Enhance `RootLayoutNav` (`app/_layout.tsx`) and `login.tsx` to support target URL preservation on auth redirects.
3. Add session error interceptor / helper to handle expired token retries across screens.
4. Update `admin-dashboard/js/auth.js` to handle token refresh gracefully.
