# Society Service Hub Agent Context

This repository is an Expo React Native app for gated communities. It has two main product areas:

- Trusted local service providers shared within a community
- Community fund tracking with role-based permissions

Use this file as the first-stop context before making changes.

## Stack

- Expo Router app in `app/`
- React Native with TypeScript
- Supabase for auth, PostgreSQL, and RLS
- Google Sign-In via `@react-native-google-signin/google-signin`
- Toasts via `react-native-toast-message`

## Product Summary

- Users sign in with Google.
- After sign-in, users must join or create a community.
- Community-scoped users can add/view providers, rate them, and favorite them.
- The first registered user becomes app-level `admin`.
- Admin creates funds and assigns treasurers.
- Treasurers assign collectors.
- Residents are view-only for funds.

## Important Architectural Reality

The UI says "funds", but the database still uses older event-era table names:

- `events` = funds
- `event_transactions` = contributions + expenses

Do not rename those tables casually. Many screens and policies depend on them.

## Runtime Flow

Auth and bootstrapping live in `app/_layout.tsx` and `context/AuthContext.tsx`.

- If there is no session, route to `/login`
- If signed in but no `communityId`, route to `/community-select`
- If signed in and community is set, route to `/(tabs)`

`AuthContext` is the shared source for:

- `session`
- `user`
- `profile`
- `appRole`
- `communityId`
- `refreshSession()`
- `signOut()`

## Navigation Map

Main tabs are defined in `app/(tabs)/_layout.tsx`:

- `app/(tabs)/index.tsx` = provider home
- `app/(tabs)/favorites.tsx` = saved providers
- `app/(tabs)/funds.tsx` = funds overview
- `app/(tabs)/profile.tsx` = user/community/settings

Standalone routes:

- `app/login.tsx`
- `app/community-select.tsx`
- `app/provider/add.tsx`
- `app/provider/[id].tsx`
- `app/funds/add.tsx`
- `app/funds/add-transaction.tsx`
- `app/funds/[id].tsx`

## Database Model

Typed DB shapes are in `lib/database.types.ts`.

Core tables:

- `communities`
- `profiles`
- `service_providers`
- `favorites`
- `ratings`
- `provider_hires`
- `events`
- `event_transactions`
- `fund_roles`

Key role fields:

- `profiles.app_role` is `admin | resident`
- `fund_roles.role` is `treasurer | collector`

Contribution-specific fields:

- `event_transactions.title`
- `event_transactions.contributor_user_id`

## Migrations

Read these first before changing schema:

- `supabase/migrations/00000_init.sql`
- `supabase/migrations/20260414000001_add_event_funds.sql`
- `supabase/migrations/20260414000002_fix_rls_community_id.sql`
- `supabase/migrations/20260415000000_enhance_trust_and_funds.sql`
- `supabase/migrations/20260415010000_add_fund_roles_and_permissions.sql`

Current behavior enforced in SQL:

- First registered user becomes admin
- Only admins can create funds
- Admin manages treasurers
- Treasurers manage collectors
- Treasurers and collectors can add contributions
- Only admins and treasurers can add expenses
- Fund role limits are enforced in DB triggers and RLS

## Provider Feature Map

Home provider listing is in `app/(tabs)/index.tsx`.

It combines:

- provider search
- category filtering
- favorites state
- provider hire count
- community insights RPC
- active fund teaser

Provider-related UI components:

- `components/ProviderCard.tsx`
- `components/SearchBar.tsx`
- `components/CategoryFilter.tsx`
- `components/RatingStars.tsx`
- `components/EmptyState.tsx`
- `components/CommunityInsights.tsx`
- `components/ActiveFundTeaser.tsx`

Provider CRUD flow:

- Add provider in `app/provider/add.tsx`
- View provider detail in `app/provider/[id].tsx`
- Favorite toggles update `favorites`
- Ratings upsert into `ratings`
- Calls and WhatsApp can log a `provider_hires` record

## Fund Feature Map

Fund overview is in `app/(tabs)/funds.tsx`.

Key fund UI files:

- `app/funds/add.tsx`
- `app/funds/add-transaction.tsx`
- `app/funds/[id].tsx`
- `components/FundCard.tsx`
- `lib/fundRoles.ts`

Key fund helper rules in `lib/fundRoles.ts`:

- `MAX_TREASURERS = 2`
- `MIN_TREASURERS = 1`
- `MAX_COLLECTORS = 6`
- `getEffectiveFundRole(...)`
- `getFundPermissions(...)`
- `getRestrictionHint(...)`

Fund screen behavior:

- Funds tab shows aggregated totals and current user role per fund
- Create fund screen is admin-only
- Fund detail screen shows role visibility, contribution status, and expense list
- Treasurer management is admin-only
- Collector management is treasurer-only
- Contribution form selects a resident and marks them paid
- Expense form requires title and is treasurer/admin only

## Community and Auth Notes

Community setup happens in `app/community-select.tsx`.

Important nuance:

- The app updates `profiles.community_id`
- It also updates `user_metadata.community_id`
- RLS helper functions were originally app-metadata based, then updated to support `user_metadata`

Do not assume server-side metadata sync exists. The client currently depends on profile plus user metadata.

Google Sign-In setup is in `lib/auth.ts`.

Required env vars:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`

## Styling and UX Conventions

- The app is intentionally light-theme oriented
- Most screens use `Colors.light` directly
- Card-heavy UI, rounded corners, FABs, and soft shadows are common
- Ionicons are the icon system everywhere

If adding new UI, match the existing light visual language unless explicitly asked to redesign.

## Repo-Specific Gotchas

- "Funds" are still stored in `events` and `event_transactions`
- `docs/implementation_plan.md` is useful background but no longer reflects the full current app
- Some files still contain encoding artifacts such as mojibake rupee symbols in older strings
- `components/TransactionItem.tsx` exists but is not the current main renderer for fund detail rows
- There are very few tests; most validation is manual plus TypeScript
- This repo may already be mid-migration from older event naming to newer fund UX naming

## High-Value Files To Read Before Major Changes

- `app/_layout.tsx`
- `context/AuthContext.tsx`
- `lib/database.types.ts`
- `lib/fundRoles.ts`
- `app/(tabs)/index.tsx`
- `app/provider/[id].tsx`
- `app/(tabs)/funds.tsx`
- `app/funds/[id].tsx`
- `supabase/migrations/20260415010000_add_fund_roles_and_permissions.sql`

## Safe Change Guidelines For Agents

- Prefer extending existing patterns over introducing new architecture
- Keep provider changes community-scoped
- Keep fund permission logic consistent with both UI and SQL policies
- When changing fund roles, check both `lib/fundRoles.ts` and the latest fund-role migration
- When changing auth or community flow, verify `AuthContext` and `app/_layout.tsx` together
- If you change schema, update `lib/database.types.ts` too

## Useful Commands

- `npm start`
- `npm run android`
- `npm run web`
- `npm run db:push`
- `npx tsc --noEmit`

## Current Verification Baseline

At the time this context was written, `npx tsc --noEmit` passed.
