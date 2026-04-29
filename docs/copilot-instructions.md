# Society Service Hub - Technical & Functional Specifications

This document is a compact implementation brief for the current Expo + Supabase app.

---

## Technical Stack

- **Frontend**: Expo SDK 54, React Native 0.81, TypeScript strict mode
- **Routing**: `expo-router` with typed routes enabled
- **State**: React Context through `AuthProvider` and `NotificationProvider`
- **Backend**: Supabase PostgreSQL, Auth, Realtime, RPCs, Edge Functions
- **Feedback**: `react-native-toast-message`
- **Notifications**: `expo-notifications`
- **Native auth**: `@react-native-google-signin/google-signin`
- **Date input**: `@react-native-community/datetimepicker`

---

## Active App Surface

### Main tabs (`app/(tabs)/`)

- `index.tsx`: Help dashboard with Providers and Service Visits segments
- `favorites.tsx`: Saved providers
- `funds.tsx`: Community funds overview
- `profile.tsx`: User and community hub

### Standalone routes

- `login.tsx`
- `forgot-password.tsx`
- `community-select.tsx`
- `community-request.tsx`
- `community-request-submitted.tsx`
- `notifications.tsx`
- `residents.tsx`

### Feature route groups

- `/provider/*`: add and detail
- `/visits/*`: add and detail
- `/funds/*`: add, detail, transaction entry
- `/services/*`: reminder list, add, detail or edit
- `/platform/*`: platform approvals and community inspection

### Removed surface

The resident marketplace is not part of the current product. `app/business/*` is gone and the supporting tables were dropped in the marketplace-removal migration.

---

## Bootstrapping and Routing

1. `configureGoogleSignIn()` runs in `RootLayoutNav`
2. `AuthProvider` hydrates session and profile
3. `NotificationProvider` becomes active for signed-in users
4. Root redirects are:
   - No session -> `/login`
   - Platform admin -> `/platform/approvals`
   - No community with active request -> `/community-request-submitted`
   - No community and no request -> `/community-select`
   - Community member -> `/(tabs)`

---

## Data Model

### Core tables

- `communities`
- `profiles`
- `community_requests`
- `profile_audit_log`

### Service discovery and visits

- `service_providers`
- `favorites`
- `ratings`
- `provider_hires`
- `service_visits`
- `visit_joiners`

### Funds

- `events`
- `event_transactions`
- `fund_roles`

### Messaging and reminders

- `notifications`
- `user_services`

---

## Roles and Permissions

### App roles

- `admin`: platform admin only, and only when `community_id` is null
- `community_lead`: community-level lead role for approved requesters
- `resident`: default member role

### Fund roles

- `treasurer`
- `collector`
- `resident` view-only fallback

Notes:

- The intended product rule is community-lead-led fund administration.
- Some fund helpers and screens still accept legacy `community_admin` strings for compatibility.

---

## Notifications

`NotificationContext`:

- fetches the latest 50 notifications for the signed-in user
- subscribes to realtime INSERT events on `notifications`
- requests native permissions on mobile
- schedules a local alert when new rows arrive

Current notification flows include:

- `new_visit`
- `community_approved`
- `community_rejected`
- `removed_from_community`
- `service_reminder`

The notification UI also contains legacy handling for some promotion-related payloads.

---

## UI and Implementation Conventions

- **Theme**: Light mode visual system using `constants/Colors.ts`
- **Icons**: Use `APP_EMOJIS` for tab and decorative iconography. Use `Ionicons` from `@expo/vector-icons` for interactive controls where the codebase already does so.
- **Toasts**: Use `react-native-toast-message` for user-visible feedback
- **Single-row fetches**: Prefer `.maybeSingle()`
- **Community filtering**: Filter community-scoped queries by `communityId`
- **Personal reminders**: `user_services` is user-scoped, not community-scoped

---

## Commands

- `npm start`
- `npm run web`
- `npm run android`
- `npm run ios`
- `npx tsc --noEmit`
- `npm run db:push`
- `npm run db:link`

Database type generation:

```bash
npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj
```