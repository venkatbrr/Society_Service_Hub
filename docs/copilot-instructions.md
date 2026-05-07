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

- `index.tsx`: Help dashboard with Providers and Service Visits segments (debounced search, grouped category filter with two-level navigation: group row then category chip row; group selection applies an `IN` filter to the provider query)
- `favorites.tsx`: Saved providers
- `community.tsx`: Community pulse, funds overview, residents shortcut, and community info
- `profile.tsx`: Personal hub for identity, reminders, recent service history, and sign-out

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

### Cross-community backend foundation (UI deferred)

- `community_partnerships`
- `community_groups`
- `community_group_members`
- `provider_shares`
- `service_visit_communities`
- `community_announcements`
- `announcement_audiences`

These tables and supporting RPCs/helpers are active in the database, but the current app UI does not consume them yet. See `docs/cross-community.md` for full details.

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

Reserved cross-community notification types (not currently emitted by app UI):

- `partnership_request`
- `partnership_accepted`

The notification UI also contains legacy handling for some promotion-related payloads.

---

## UI and Implementation Conventions

- **Theme**: Light mode visual system using `constants/Colors.ts`
- **Icons**: Use `APP_EMOJIS` for tab and decorative iconography. Use `Ionicons` from `@expo/vector-icons` for interactive controls where the codebase already does so.
- **Toasts**: Use `react-native-toast-message` for user-visible feedback
- **Single-row fetches**: Prefer `.maybeSingle()`
- **Community filtering**: Filter community-scoped queries by `communityId`
- **Personal reminders**: `user_services` is user-scoped, not community-scoped
- **Debounced search**: Wrap any text-input-driven Supabase query with a 300 ms `setTimeout` debounce. Store the debounced value in a separate state variable and use that in fetch dependency arrays.
- **Provider phone search**: Provider picker dropdowns (e.g. in service reminder add/edit screens) must support search by both provider name and phone number. Strip non-digits with `replace(/\D/g, '')` before comparing phone strings. Placeholder text: `"Search by name or phone number..."`.
- **Flat/house number inputs**: Normalize to uppercase and strip spaces and hyphens on blur across signup, community-request, and visit-join flows.
- **Category grouping**: Categories in `constants/categories.ts` are also organised into groups via `CATEGORY_GROUPS` (`CategoryGroup[]`). The `CategoryFilter` component renders a two-level UI: a group chip row exposes `onSelectGroupCategories(categories: string[] | null)` so the host screen can build an `IN` query clause; a category chip row scoped to the active group provides single-category `eq` filtering. The same grouped picker (group row + filtered category scroll) is used in `app/provider/add.tsx` and `app/visits/add.tsx`.

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