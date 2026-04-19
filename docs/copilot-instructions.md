# Society Service Hub - Technical & Functional Specifications

This document provides comprehensive technical and functional context for the Society Service Hub, an Expo-based community management platform.

---

## 🚀 Technical Stack & Architecture

### Core Framework
- **Frontend**: Expo (React Native) with TypeScript.
- **Routing**: `expo-router` (File-based routing).
- **State Management**: React Context via `AuthProvider`.
- **Auth**: Supabase Auth (Supporting Google OAuth, Email/Password, and Password Reset).
- **Backend**: Supabase (PostgreSQL, Realtime, Storage, Edge Functions).

### Key Libraries & Native Modules
- **UI Components**: `react-native-paper` (if used, otherwise vanilla components with custom styling).
- **Images**: `expo-image-picker` for business/profile photos.
- **Date/Time**: `@react-native-community/datetimepicker` for native entry.
- **Notifications/Feedback**: `react-native-toast-message`.
- **Authentication**: `@react-native-google-signin/google-signin` for native Google integration.

### Data Flow & Bootstrapping
1. **Auth Initialization**: `configureGoogleSignIn()` is called in `RootLayoutNav`.
2. **Session Monitoring**: `AuthProvider` listens to `onAuthStateChange`.
3. **Profile hydration**: Upon login, the app fetches the user's profile from `profiles`.
4. **Community Scoping**: `communityId` is resolved from `profiles` or `session.user.user_metadata`.
5. **Redirection Logic** (`_layout.tsx`):
   - No Session → `/login`.
   - Session but no `community_id` → `/community-select`.
   - Fully Auth'd → `/(tabs)`.

---

## 📂 Project Structure (App Directory)

### Navigation Tabs (`app/(tabs)/`)
- `index.tsx`: **Services Dashboard**. Top-level switcher between "Trusted Providers" and "Service Visits".
- `business.tsx`: **Resident Marketplace**. Browse home-based businesses within the community.
- `funds.tsx`: **Financial Dashboard**. Community fund stats and active collection teasers.
- `profile.tsx`: **Personal Hub**. Manage linked businesses, role info, and settings.

### Feature Screens (`app/`)
- **/visits/**: `add.tsx` (Schedule a visit), `[id].tsx` (Visit details/Joiner list).
- **/business/**: `add.tsx` (Register business), `manage.tsx` (Dashboard), `[id].tsx` (Public storefront), `catalog/` (Offering management).
- **/funds/**: `add.tsx` (Create fund), `[id].tsx` (Fund ledger/roles), `add-transaction.tsx` (Debit/Credit log).
- **/provider/**: `add.tsx` (Register technician), `[id].tsx` (Provider profile, reviews).

---

## 🛠️ Database Schema & Logic

### Tables (`lib/database.types.ts`)
- **Foundation**: `communities`, `profiles`.
- **Providers**: `service_providers`, `favorites`, `ratings`.
- **Marketplace**: `resident_businesses`, `business_offerings`, `business_inquiries`.
- **Logistics**: `service_visits`, `visit_joiners`.
- **Finance**: `events` (Funds), `event_transactions`, `fund_roles`.

### Storage Buckets
- `business-photos`: Publicly accessible images for business catalogs and profiles.

### PostgreSQL Logic
- `handle_new_user()` trigger: Automatically creates a `profile` row when a user signs up via Supabase Auth.
- **Verification Policy**: Email confirmation is intentionally simplified/omitted for faster onboarding (requires "Confirm email" to be OFF in Supabase Dashboard settings).
- `get_community_visits()` RPC: Aggregates visits with join counts for faster performance.

---

## 👤 Roles & Permissions

The app uses a hybrid role system (Global + Local):

### App-Level Roles (`profiles.app_role`)
- **Admin**: Can create new Communities, approve global providers, and initialize Community Funds/Events.
- **Resident**: Default role. Can use all browsing, favorite, and visiting features.

### Fund-Level Roles (`fund_roles.role`)
Controlled via `lib/fundRoles.ts`:
- **Treasurer**: Assigned to a specific Fund. Can manage Collectors and log **Expenses (Debits)**.
- **Collector**: Assigned to a specific Fund. Can log **Contributions (Credits)**.
- **Resident (Observer)**: Can view the ledger transparently but cannot log transactions.

---

## 🎨 UI & UX Standards

- **Visual Style**: Premium, minimalistic, light-theme oriented.
- **Components**: Rounded corners (`border-radius: 20-24`), soft shadows, clean typography.
- **Icons**: Use inline `Text` emoji or unicode characters for UI icons instead of vector icon components.
- **Shared Components**:
  - `EmptyState`: Standardized placeholder for empty lists.
  - `VisitCard` / `BusinessCard`: High-trust cards showing user identity.
  - `ActiveFundTeaser`: Home screen widget for ongoing collections.
- **Input Patterns**: Always use `@react-native-community/datetimepicker` for dates; never raw text inputs.

---

## 🛡️ Implementation Guidelines

1. **Security**: Every data query MUST filter by `community_id`.
2. **Identity**: This is a high-trust platform. User profiles (names, flat numbers) must be prominent in collaborative features (Visits, Businesses).
3. **TypeScript**: Strict typing is mandatory. Update `database.types.ts` whenever the schema changes.
4. **Offline Resilience**: Use `maybeSingle()` and robust error handling for network-dependent Supabase calls.
5. **Native Rebuilds**: Adding new libraries (e.g. `expo-camera`) requires a full `npm run android` to rebuild the dev client.

---

## 💡 Common Commands
- `npm run android`: Build and run on emulator.
- `npm run web`: Preview on web (best for layout testing).
- `npm run db:push`: Apply local migrations to Supabase.
- `npx tsc --noEmit`: Verify type integrity.
