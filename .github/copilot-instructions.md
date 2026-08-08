# Copilot Instructions

Wooru — a multi-tenant community app for gated residential societies. **Expo (React Native) + TypeScript + Supabase + expo-router**, targeting Android, iOS, and an installable PWA, plus a separate vanilla-JS admin console.

## Where the documentation is

Start with [`docs/README.md`](../docs/README.md) — it is the routing table that tells you which doc answers your question. Open only what your task needs.

| File | Read it when |
|------|-------------|
| [`app-summary.md`](app-summary.md) | You need the whole-app picture: modules, roles, data model, routes |
| [`docs/CLAUDE.md`](../docs/CLAUDE.md) | Always, before editing — commands, conventions, traps |
| [`docs/features.md`](../docs/features.md) | Changing a screen's behavior |
| [`docs/architecture.md`](../docs/architecture.md) | Touching schema, RLS, RPCs, auth, routing, or types |
| [`docs/verandah.md`](../docs/verandah.md) | Writing any UI |
| [`docs/platform-admin.md`](../docs/platform-admin.md) | Working on the web admin console |
| [`docs/disabled-features.md`](../docs/disabled-features.md) | A feature seems missing |
| [`docs/cross-community.md`](../docs/cross-community.md) | Touching federation objects |

## Quick reference

- **Commands**: `npm start` · `npm run web` · `npm run android` · `npx tsc --noEmit` (the only validation gate — no test framework exists)
- **Tabs**: Help · Saved · MCN · Community · Profile
- **Multi-tenant**: scope every community query by `communityId` from `useAuth()`.
  Exceptions (user-scoped, never pass `communityId`): `user_services`, `user_service_history`, `hire_feedback`, `provider_public_rating_nudges`, `provider_personal_notes`, `favorites`.
- **Roles**: `admin` (platform, no community) · `president` / `vice_president` (community leads) · `resident`. Fund roles are separate: `treasurer` / `collector`.
  ⚠️ **`community_lead` is a dead legacy value.** Use `isCommunityLead` from `useAuth()`, or `public.is_community_lead(auth.uid())` in SQL.
- **Single-row reads**: `.maybeSingle()`, never `.single()`.
- **Icons**: `Ionicons` from `@expo/vector-icons` for every interactive control.
- **Toasts**: `react-native-toast-message` for all user feedback.
- **Confirmations**: platform-split — `window.confirm` on web, `Alert.alert` on native. RN `Alert` is a no-op on web.
- **Dates**: always `@react-native-community/datetimepicker`; store visit dates as local `YYYY-MM-DD`.
- **Search**: debounce 300 ms into a separate state and use *that* in fetch dependency arrays.
- **Categories**: import from `constants/categories.ts` (providers/visits), `lib/serviceCategories.ts` (reminders), `constants/schoolReviewAspects.ts` (school reviews). Never define local category arrays.
- **Navigation**: forward is always `router.push()`. **Never `router.replace()` to go back** — it overwrites the history entry instead of popping it, so browser-back skips a level and forward breaks. Header back calls `goBackSmart()`. Never intercept `popstate`. Adding a route under `app/mcn/` also requires a parent mapping in `getImmediateParentRoute()` (`lib/navigation.ts`).
- **Generated types**: `lib/database.types.ts` is generated — never hand-edit it.

## Design system — Verandah

Light-mode only, flat surfaces, **no shadows / elevation / glassmorphism**.

- Colors: `constants/Colors.ts` (`Verandah` — surface `#FAF8F4`, card `#FFFFFF`, primary `#0F3732`, accent `#0F6E56`)
- Type, spacing, radius, layout: `constants/Verandah.ts` (`VerandahType`, `VerandahSpace`, `VerandahRadius`, `VerandahLayout`)
- Font weights: **400 and 500 only**. Sentence case everywhere. No raw hex in feature UI.
- Shared components: `BaseCard`, `Avatar`, `Rupees`, `EmptyState`, `SearchBar`, `CategoryFilter`, `ImageUploader`
- The Help tab uses compact WhatsApp chat-tile density — new cards there must match.
- Web-specific rendering goes in a `.web.tsx` sibling, not a `Platform.OS` branch.

## Keeping docs in sync

Docs are part of the change set, not a follow-up. Route each update to exactly **one** home:

- User-visible behavior → `docs/features.md`
- Table / RLS / RPC / trigger / route / type / context → `docs/architecture.md`
- Command / convention / dependency → `docs/CLAUDE.md`
- Design token / shared component → `docs/verandah.md`
- Admin console → `docs/platform-admin.md`
- New module, tab, or role → also add a line to `.github/app-summary.md`
- Feature disabled or re-enabled → `docs/disabled-features.md`
- Anything touching federation → `docs/cross-community-changelog.md` (mandatory)

Do not restate schema columns in `features.md` — `architecture.md` owns them.

## Deploying database changes

When you create or modify a file in `supabase/migrations/`, finish the loop yourself:

1. `npm run db:push`
2. `npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj`
3. `npx tsc --noEmit`

Write idempotent SQL, enable RLS with explicit policies on every new table, and end schema-changing migrations with `NOTIFY pgrst, 'reload schema';`.
