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
npm run db:push        # Apply local migrations to Supabase
npm run db:link        # Link to Supabase project
```

Regenerate database types after schema changes:
```bash
npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj
```

## Architecture

### Layers

- **Screens** (`app/`): expo-router file-based routing. 4 bottom tabs in `app/(tabs)/`, feature screens under `app/visits/`, `app/funds/`, `app/provider/`.
- **Components** (`components/`): Reusable UI — `ProviderCard`, `VisitCard`, `FundCard`, `EmptyState`, `SearchBar`, `CategoryFilter`, etc.
- **State** (`context/`): Two React Context providers — `AuthContext` (session, profile, communityId, appRole, isCommunityLead, isPlatformAdmin) and `NotificationContext` (real-time via Supabase Realtime).
- **Backend** (`lib/`): Supabase client (`supabase.ts`), auth helpers (`auth.ts`), auto-generated DB types (`database.types.ts`), fund role logic (`fundRoles.ts`), error utilities (`supabaseErrors.ts`).
- **Migrations** (`supabase/migrations/`): SQL migration files applied via `npm run db:push`.

### Multi-Tenant Design

Every user belongs to a community. **All data queries must filter by `communityId`** from `useAuth()`. Supabase RLS policies enforce community-level isolation.

> **Exception — User-Scoped Data**: The `user_services` table (Personal Service Reminders feature) is **not** community-scoped. Its RLS uses `auth.uid() = user_id`. Queries do NOT pass `communityId`. This is the only table with this pattern.

### Auth Flow

1. Root layout (`app/_layout.tsx`) initializes Google Sign-In and wraps app in `AuthProvider` + `NotificationProvider`
2. `AuthContext` watches `supabase.auth.onAuthStateChange`, auto-fetches profile
3. Redirect logic: no session → `/login`; platform admin → `/platform/approvals`; no community + active request → `/community-request-submitted`; no community + no request → `/community-select`; community present → `/(tabs)`
4. Auth methods: Google OAuth (requires dev build, not Expo Go) and email/password
5. Session persisted via AsyncStorage adapter (not SecureStore, due to Android 2KB limit)

### Role System

- **App-level** (`profiles.app_role`): `admin` (platform admin), `community_lead`, or `resident`
  - `community_lead` is auto-assigned when a community request is approved — never promoted through a workflow
  - `isPlatformAdmin` = `app_role === 'admin' && !communityId`
  - `isCommunityLead` = `app_role === 'community_lead' && !!communityId`
- **Fund-level** (`fund_roles.role`): `treasurer` (manage fund, log expenses), `collector` (log contributions), `resident` (view only). Permissions checked via `lib/fundRoles.ts` — use `getEffectiveFundRole()` and `getFundPermissions()`.

## Key Conventions

- **Icons**: Render UI icons with inline `Text` emoji or unicode characters. Do not add vector icon components for app UI.
- **Date/Time inputs**: Always use `@react-native-community/datetimepicker`, never raw TextInput
- **Theme**: Enforced light mode. Colors in `constants/Colors.ts` — primary `#6C63FF` (soft indigo), secondary `#10B981` (emerald), accent `#FF6B6B` (coral). Glassmorphism style with `expo-linear-gradient` for gradient headers/buttons.
- **Style**: Rounded corners (20-24px border-radius), glassmorphism cards (`glass`, `glassBorder` from Colors.ts), soft indigo shadows (`shadowColor: '#6C63FF'`), premium pastel look
- **Toast feedback**: Use `react-native-toast-message` for user-facing messages
- **Single-row queries**: Use `.maybeSingle()` instead of `.single()`
- **TypeScript**: Strict mode enabled. Path alias `@/*` maps to project root

## Database

15 tables — key ones: `communities` (with `code` for join), `profiles`, `service_providers`, `service_visits`, `visit_joiners`, `events` (funds), `event_transactions`, `fund_roles`, `notifications`, `favorites`, `ratings`, `provider_hires`, `community_requests`, `profile_audit_log`, `user_services` (user-scoped, no community filter).

Storage bucket: `community-uploads` (public).

DB functions: `handle_new_user()` (auto-creates profile on signup), `join_community_by_code(p_code)` (instant join by 6-char code), `get_community_visits()` and `get_visit_joiners()` RPCs for aggregations, `get_my_upcoming_services()`, `get_my_due_soon_count()`, `mark_service_done(p_service_id)`, `notify_due_services()` (service reminder RPCs).

Edge Function `supabase/functions/check_due_services/index.ts` calls `notify_due_services()` daily. **Must be scheduled in the Supabase Dashboard** under Edge Functions → Schedules, cron expression `30 3 * * *` (3:30 UTC = 9 AM IST).
- **Service categories**: `lib/serviceCategories.ts` is the single source of truth for service category labels, emoji, and default frequencies. Import from there, not hardcoded strings.

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
