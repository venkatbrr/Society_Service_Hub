# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Society Service Hub is a community management platform for gated residential societies. Built with **Expo (React Native) + TypeScript + Supabase + expo-router**. Targets iOS, Android, and Web.

## Commands

```bash
npm start              # Launch Expo dev server
npm run web            # Preview on web (best for layout testing)
npm run android        # Build and run on Android (required for Google Sign-In)
npm run ios            # Build and run on iOS
npx tsc --noEmit       # Type-check (no test framework configured)
npm run db:login       # Authenticate Supabase CLI locally
npm run db:push        # Apply local migrations to Supabase
npm run db:link        # Link to Supabase project
```

Regenerate database types after schema changes:
```bash
npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj
```

## Architecture

### Layers

- **Screens** (`app/`): expo-router file-based routing. 4 bottom tabs in `app/(tabs)/` (Help, Saved, Community, Profile), onboarding and status routes such as `community-select`, `community-request`, and `community-join-block`, plus feature screens under `app/visits/`, `app/funds/`, `app/funds-access/`, `app/provider/`, `app/services/`, `app/community/`, `app/profile/`, and `app/platform/`.
- **Components** (`components/`): Reusable UI — `ProviderCard`, `VisitCard`, `FundCard`, `EmptyState`, `SearchBar`, `CategoryFilter`, etc.
- **State** (`context/`): Two React Context providers — `AuthContext` (session, profile, communityId, appRole, isCommunityLead, isPlatformAdmin) and `NotificationContext` (real-time via Supabase Realtime).
- **Backend** (`lib/`): Supabase client (`supabase.ts`), auth helpers (`auth.ts`), auto-generated DB types (`database.types.ts`), fund role logic (`fundRoles.ts`), error utilities (`supabaseErrors.ts`).
- **Migrations** (`supabase/migrations/`): SQL migration files applied via `npm run db:push`.

### Multi-Tenant Design

Every user belongs to a community. **All data queries must filter by `communityId`** from `useAuth()`. Supabase RLS policies enforce community-level isolation.

> **Exception — User-Scoped Data**: The `user_services`, `user_service_history`, `hire_feedback`, `provider_public_rating_nudges`, and `provider_personal_notes` tables are **not** community-scoped. Their RLS uses `auth.uid() = user_id` with no same-community read policy and no platform-admin override. Queries do NOT pass `communityId` for these tables.

### Auth Flow

1. Root layout (`app/_layout.tsx`) initializes Google Sign-In and wraps app in `AuthProvider` + `NotificationProvider`
2. `AuthContext` watches `supabase.auth.onAuthStateChange`, auto-fetches profile
3. Redirect logic: no session → `/login`; platform admin → `/platform/approvals`; no community + active request → `/community-request-submitted`; no community + no request → `/community-select`; community present → `/(tabs)`
4. Successful `join_community_by_code()` calls in `app/community-select.tsx` can branch to `/community-join-block` before `/(tabs)` when the joined community has both `funds_enabled` and `blocks_enabled`
5. Auth methods: Google OAuth (requires dev build, not Expo Go) and email/password; email sign-up collects full name and password on the first screen while `profiles.flat_number` remains optional
6. Session persisted via AsyncStorage adapter (not SecureStore, due to Android 2KB limit)

### Role System

- **App-level** (`profiles.app_role`): `admin` (platform admin), `community_lead`, or `resident`
  - approved community requesters are assigned as `resident` by default; `community_lead` is no longer auto-assigned in that flow
  - `community_lead` is valid only in communities where `communities.funds_enabled = true`
  - the UI label "Fund admin" is contextual on fund/block management surfaces and is not a distinct role
  - `isPlatformAdmin` = `app_role === 'admin' && !communityId`
  - `isCommunityLead` = `app_role === 'community_lead' && !!communityId`
- **Fund-level** (`fund_roles.role`): `treasurer` (manage fund, log expenses), `collector` (log contributions), `resident` (view only). Permissions checked via `lib/fundRoles.ts` — use `getEffectiveFundRole()` and `getFundPermissions()`.

Funds activation is gated by platform-admin approval. A community without `funds_enabled = true` has no active community lead in app logic. All funds-related RPCs and trigger guards check `is_funds_enabled(community_id)` before downstream validation. Existing collectors with `block_id = NULL` continue to work in non-block-enabled communities.

## Key Conventions

- **Icons**: Use `Ionicons` from `@expo/vector-icons` for bottom-tab and other interactive controls. Reserve `APP_EMOJIS` for decorative and non-interactive iconography only.
- **Date/Time inputs**: Always use `@react-native-community/datetimepicker`, never raw TextInput
- **Theme**: Enforced light mode. Colors in `constants/Colors.ts` — primary `#6C63FF` (soft indigo), secondary `#10B981` (emerald), accent `#FF6B6B` (coral). Glassmorphism style with `expo-linear-gradient` for gradient headers/buttons.
- **Style**: Rounded corners (20-24px border-radius), glassmorphism cards (`glass`, `glassBorder` from Colors.ts), soft indigo shadows (`shadowColor: '#6C63FF'`), premium pastel look
- **Toast feedback**: Use `react-native-toast-message` for user-facing messages
- **Single-row queries**: Use `.maybeSingle()` instead of `.single()`
- **Information architecture**: Community-level info is rendered in the Community tab. Profile tab is account-level only.
- **Debounced search**: When a text input drives a Supabase list query, always debounce 300 ms using a `debouncedSearchQuery` state updated in a `setTimeout` effect. Use `debouncedSearchQuery` in fetch dependency arrays, not the raw input state.
- **Provider phone search**: When filtering providers in a picker, strip non-digits from both the query and stored phone value (`replace(/\D/g, '')`) before comparing. Display placeholder `"Search by name or phone number..."`.
- **Flat/house number inputs**: Normalize to uppercase and strip spaces and hyphens on blur. Use placeholders like `A101` or `A412`, not hyphenated examples.
- **TypeScript**: Strict mode enabled. Path alias `@/*` maps to project root
- **Android dev networking**: Keep `android.usesCleartextTraffic=true` so development builds can load Metro bundles over HTTP
- **Bundled image assets**: Keep import extensions aligned with the real file type. The Community tab funds overview background is `assets/images/funds_bg.jpg`; importing it as `.png` breaks Android release resource compilation.

### Verandah UI Rules

- Use Verandah tokens only:
  - `constants/Colors.ts` (`Verandah`)
  - `constants/Verandah.ts` (`VerandahType`, `VerandahSpace`, `VerandahRadius`)
- Do not hardcode visual values in feature UI:
  - no raw color hex values
  - no ad-hoc font sizes when a Verandah type token fits
  - no card shadows/elevation
- Reuse shared building blocks instead of local variants:
  - `BaseCard` for card shells
  - `Avatar` for people avatars
  - `Rupees` for rupee amounts
  - `EmptyState` for empty screens/lists
- Keep typography weights in product UI at `400` or `500`.
- Keep user-facing copy in sentence case.

## Database

Active tables include: `communities` (with `code` for join), `profiles`, `service_providers`, `service_visits`, `visit_joiners`, `events` (funds), `event_transactions`, `fund_roles`, `notifications`, `favorites`, `ratings`, `provider_hires`, `provider_personal_notes`, `mcn_posts`, `mcn_listings`, `mcn_products`, `mcn_orders`, `mcn_order_items`, `community_requests`, `profile_audit_log`, `user_services` (user-scoped, no community filter), plus funds-activation and cross-community support tables documented in `docs/architecture.md`.

Storage bucket: `community-uploads` (public).

DB functions: `handle_new_user()` (auto-creates profile on signup and copies signup `flat_number` metadata into `profiles.flat_number`), `join_community_by_code(p_code)` (instant join by 6-char code), `get_community_visits()` and `get_visit_joiners()` RPCs for aggregations, `get_my_upcoming_services()`, `get_my_due_soon_count()`, `mark_service_done(p_service_id)`, `notify_due_services()` (service reminder RPCs).

Edge Function `supabase/functions/check_due_services/index.ts` calls `notify_due_services()` daily. **Must be scheduled in the Supabase Dashboard** under Edge Functions → Schedules, cron expression `30 3 * * *` (3:30 UTC = 9 AM IST).
- **Service categories**: `lib/serviceCategories.ts` is the single source of truth for service category labels, emoji, and default frequencies used in personal reminders. Import from there, not hardcoded strings.
- **Provider/visit categories**: `constants/categories.ts` owns the full provider and visit category list (`CATEGORIES`) and the group taxonomy (`CATEGORY_GROUPS`). Do not define local category arrays in screens — always import from `constants/categories.ts`. The `CategoryFilter` component builds two-level grouped UI from this. On the Help tab, group selection flows through the `onSelectGroupCategories` callback and is applied as an `IN` clause in the provider query.

## Cross-Community Conventions

- **RPC naming pattern**: Use `list_visible_*`, `can_user_see_*`, `set_*_visibility`, and `*_community_partnership` for new cross-community database functions.
- **Delivery rule**: Backend may evolve independently, but any new UI consuming cross-community objects must be shipped in a dedicated task and must append an entry to `docs/cross-community-changelog.md`.
- **Helper rule**: Never modify `get_user_community_id()` for federation behavior. Use `get_user_partner_community_ids()` for cross-community access-set checks.
- **References**: `docs/cross-community.md` is the canonical federation reference and `docs/decisions/0001-additive-rls-for-cross-community.md` captures the additive-RLS decision.

## Intentionally Disabled Features

- **Email verification**: Turned off in Supabase for faster onboarding during pilot
- **Password strength validation**: Removed for simplified signup flow

See `disabled-features.md` for details.

## Additional References

Before making changes, also review these companion docs:

- [architecture.md](architecture.md) — Data flow, auth, database schema, RLS, state management, type system
- [features.md](features.md) — Every feature: screens, tables, business rules, roles, integrations
- [copilot-instructions.md](copilot-instructions.md) — Technical and functional specifications
- [disabled-features.md](disabled-features.md) — Intentionally disabled features and re-enablement plan
- [implementation_plan.md](implementation_plan.md) — Original implementation plan and schema design

## Keeping Docs in Sync

**When you modify code, update the corresponding documentation.** Specifically:

- **New or changed screens/features** → update `features.md`
- **Architecture changes** (new tables, RLS policies, context providers, navigation routes, auth flow, types) → update `architecture.md`
- **New commands, conventions, or dependencies** → update this file (`CLAUDE.md`)
- **Disabled or re-enabled features** → update `disabled-features.md`

Do not leave documentation out of sync with the code. Treat doc updates as part of the implementation, not a follow-up task.

## Deploying Database Changes

**When you create or modify migration files (`supabase/migrations/`)**, deploy them automatically:

1. Run `npm run db:push` to apply migrations to Supabase
2. Run `npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj` to regenerate `lib/database.types.ts`
3. Verify no TypeScript errors with `npx tsc --noEmit`

Do not leave database changes unapplied. Treat migration deployment and type regeneration as part of the implementation.
