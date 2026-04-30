# Society Service Hub - Application Summary

> **Purpose**: Single-source overview for AI agents and maintainers working in this repository.

---

## 1. What This App Is

Society Service Hub is a multi-tenant community management app for gated residential communities. The current product helps residents and admins:

- discover trusted local service providers
- coordinate shared service visits
- manage community funds with transparent role-based ledgers
- track personal maintenance reminders for appliances and recurring services
- handle community onboarding and platform-reviewed community creation
- receive realtime notifications about visits, onboarding outcomes, and due services

The app targets iOS, Android, and Web from one Expo codebase.

---

## 2. Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | Expo SDK 54 / React Native 0.81 | Dev client setup, typed routes enabled |
| Language | TypeScript | Strict mode |
| Routing | `expo-router` | File-based routing |
| Backend | Supabase | PostgreSQL, Auth, Realtime, RPCs, Edge Functions |
| State | React Context | `AuthContext` and `NotificationContext` |
| Notifications | `expo-notifications` | Local mobile alerts and Expo token registration |
| Auth | Supabase Auth + Google Sign-In | Email/password, reset password, Google token exchange |
| UI | Vanilla React Native + custom components | Light theme, glassmorphism styling |

### Key Dependencies

- `@supabase/supabase-js`
- `@react-native-google-signin/google-signin`
- `@react-native-community/datetimepicker`
- `expo-linear-gradient`
- `expo-notifications`
- `react-native-toast-message`
- `@expo/vector-icons`

---

## 3. Active Route Surface

### Root-level screens

- `/login`
- `/forgot-password`
- `/community-select`
- `/community-request`
- `/community-request-submitted`
- `/notifications`
- `/residents`

### Main tabs (`app/(tabs)`)

- `index.tsx`: Help dashboard with Providers and Visits segments
- `favorites.tsx`: Saved providers
- `funds.tsx`: Community fund list
- `profile.tsx`: Personal and community hub

### Feature route groups

- `/provider/[id]`, `/provider/add`
- `/visits/[id]`, `/visits/add`
- `/funds/[id]`, `/funds/add`, `/funds/add-transaction`
- `/services`, `/services/add`, `/services/[id]`
- `/platform/approvals`, `/platform/communities`, `/platform/community/[id]`

### Removed route area

The former marketplace routes under `app/business/*` do not exist in the current app.

---

## 4. Boot Flow and Routing Rules

### Startup

1. Root layout configures Google Sign-In
2. `AuthProvider` loads session and profile
3. `NotificationProvider` attaches notification state for authenticated users
4. Root redirect logic routes users into onboarding, platform admin, or main app areas

### Redirect Rules

```text
No session -> /login
Platform admin -> /platform/approvals
Authenticated, no community, active request -> /community-request-submitted
Authenticated, no community, no request -> /community-select
Authenticated with community -> /(tabs)
```

---

## 5. Core Feature Areas

### Providers and Visits

- Residents can add providers to the trusted provider list
- Residents can rate, save, call, message, and share provider contacts
- Existing ratings can be reused when updating review text without re-tapping stars
- Residents can create shared service visits and manage participation
- Past visits are shown without an `upcoming` status badge even when stale visit status values exist
- The Help tab preserves segment and visit-subtab state through route params

### Funds

- Community funds live in `events`
- Treasurers and collectors are assigned through `fund_roles`
- Ledger rows live in `event_transactions`
- The intended product rule is community-lead-administered funds, though some fund code still tolerates a legacy `community_admin` string internally

### Onboarding and Platform Review

- Residents can join communities instantly by code
- New communities require a platform approval workflow
- Approvals create the community and assign the requester to that community as `resident`

### Personal Service Reminders

- Users can maintain private reminders in `user_services`
- Reminder detail/edit screens read by reminder ID from `user_services` for reliable single-record edits
- Reminders can be mapped or remapped to any provider shown in the saved provider picker list
- Home and Profile both surface due-soon reminders
- Due reminders generate `service_reminder` notifications through the daily scheduler flow

---

## 6. Roles

### App roles

| Role | Meaning |
|------|---------|
| `admin` | Platform admin with no community assignment |
| `community_lead` | Lead for a specific community |
| `resident` | Default member |

### Fund roles

| Role | Meaning |
|------|---------|
| `treasurer` | Manage collectors and all ledger actions |
| `collector` | Record contributions only |
| `resident` | View-only fallback |

---

## 7. Active Tables

- `communities`
- `profiles`
- `community_requests`
- `profile_audit_log`
- `service_providers`
- `service_visits`
- `visit_joiners`
- `favorites`
- `ratings`
- `provider_hires`
- `events`
- `event_transactions`
- `fund_roles`
- `notifications`
- `user_services`

Removed marketplace tables:

- `resident_businesses`
- `business_offerings`
- `business_inquiries`

---

## 8. Notifications

Notification state is managed by `NotificationContext` and backed by Supabase Realtime plus `expo-notifications`.

Live product notification types include:

- `new_visit`
- `community_approved`
- `community_rejected`
- `removed_from_community`
- `service_reminder`

The notification screen also contains compatibility handling for some older promotion-related payloads.

---

## 9. UI Conventions

- Light theme only in practice, using `constants/Colors.ts`
- Rounded glassmorphism cards and gradient accents
- `APP_EMOJIS` for decorative and tab iconography
- `Ionicons` for interactive controls already implemented in the app
- `react-native-toast-message` for success and failure feedback

---

## 10. Storage and Assets

- The current product does not expose an active media-upload feature
- The Supabase setup still includes a public `community-uploads` bucket, but no current screen writes to it
- Profile avatars come from auth metadata when available

---

## 11. Commands

```bash
npm start
npm run web
npm run android
npm run ios
npx tsc --noEmit
npm run db:push
npm run db:link
npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj
```

---

## 12. Current Product Boundaries

- Marketplace is removed, not hidden
- Community membership does not use a resident approval queue
- `user_services` is user-scoped, not community-scoped
- Platform admins are separated from community members by the `admin` plus no-community rule