# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

Society Service Hub — a multi-tenant community app for gated residential societies. **Expo (React Native) + TypeScript + Supabase + expo-router**, targeting Android, iOS, and an installable PWA, plus a separate vanilla-JS admin console at `admin-dashboard/`.

## Read this first

**[docs/README.md](docs/README.md)** is the documentation routing table — it tells you which file answers your question so you open only what the task needs. Do not read every doc.

| File | Read it when |
|------|-------------|
| [.github/app-summary.md](.github/app-summary.md) | You need the whole-app picture: modules, roles, data model, route map |
| [docs/CLAUDE.md](docs/CLAUDE.md) | **Always, before editing** — commands, conventions, and known traps |
| [docs/features.md](docs/features.md) | Changing a screen's behavior |
| [docs/architecture.md](docs/architecture.md) | Touching schema, RLS, RPCs, triggers, auth, routing, or types |
| [docs/verandah.md](docs/verandah.md) | Writing any UI |
| [docs/platform-admin.md](docs/platform-admin.md) | Working on the web admin console |
| [docs/disabled-features.md](docs/disabled-features.md) | A feature seems missing |
| [docs/cross-community.md](docs/cross-community.md) | Touching federation objects (backend live, UI deferred) |
| [docs/archive/](docs/archive/) | Historical context only — never a source of truth |

## Critical facts that are easy to get wrong

- **`app_role === 'community_lead'` is dead.** That value was migrated to `president` on 2026-06-16. Use `isCommunityLead` from `useAuth()`, or `public.is_community_lead(auth.uid())` in SQL. `president` and `vice_president` have identical powers.
- **Scope community queries by `communityId`** from `useAuth()`. Exceptions (user-scoped, never community-filtered): `user_services`, `user_service_history`, `hire_feedback`, `provider_public_rating_nudges`, `provider_personal_notes`, `favorites`.
- **`npx tsc --noEmit` is the only validation gate** — there is no test framework and no lint script.
- **`lib/database.types.ts` is generated.** Never hand-edit it.
- **`Alert.alert` is a no-op on web.** Confirmations must split on `Platform.OS` and use `window.confirm` on web.
- **Adding a route under `app/mcn/`** also requires a parent mapping in `getImmediateParentRoute()` (`lib/navigation.ts`), or back navigation breaks.

The full list is in [docs/CLAUDE.md](docs/CLAUDE.md) §9.

## Keeping docs in sync

Docs are part of the change set, not a follow-up. Route each update to exactly **one** owning file — duplicating facts across files is what caused the last round of drift:

- User-visible screen behavior → `docs/features.md`
- Table, RLS, RPC, trigger, route, type, or context → `docs/architecture.md`
- Command, convention, dependency, or trap → `docs/CLAUDE.md`
- Design token or shared component → `docs/verandah.md`
- Admin console → `docs/platform-admin.md`
- A whole new module, tab, or role → also add a line to `.github/app-summary.md`
- Feature disabled, removed, or re-enabled → `docs/disabled-features.md`
- Anything touching federation → `docs/cross-community-changelog.md` (mandatory)

Do not restate schema columns in `docs/features.md` — `docs/architecture.md` owns them.

## Deploying database changes

When you create or modify a file in `supabase/migrations/`, finish the loop yourself:

1. `npm run db:push` — apply migrations to Supabase
2. `npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj` — regenerate `lib/database.types.ts`
3. `npx tsc --noEmit` — verify

Do not leave a migration unapplied or types unregenerated. Write idempotent SQL, enable RLS with explicit policies on every new table, and end schema-changing migrations with `NOTIFY pgrst, 'reload schema';`.
