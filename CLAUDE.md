# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**All documentation lives in `docs/`.** Before making any changes, review the relevant files:

- [docs/CLAUDE.md](docs/CLAUDE.md) — Commands, conventions, and key patterns
- [docs/architecture.md](docs/architecture.md) — Data flow, auth, database schema, state management, type system
- [docs/features.md](docs/features.md) — Every feature: screens, tables, business rules, roles, integrations
- [docs/copilot-instructions.md](docs/copilot-instructions.md) — Technical and functional specifications
- [docs/disabled-features.md](docs/disabled-features.md) — Intentionally disabled features and re-enablement plan
- [docs/implementation_plan.md](docs/implementation_plan.md) — Original implementation plan and schema design

## Keeping Docs in Sync

**When you modify code, update the corresponding documentation in `docs/`.** Specifically:

- **New or changed screens/features** → update `docs/features.md`
- **Architecture changes** (new tables, RLS policies, context providers, navigation routes, auth flow, types) → update `docs/architecture.md`
- **New commands, conventions, or dependencies** → update `docs/CLAUDE.md`
- **Disabled or re-enabled features** → update `docs/disabled-features.md`

Do not leave documentation out of sync with the code. Treat doc updates as part of the implementation, not a follow-up task.

## Deploying Database Changes

**When you create or modify Supabase migration files (`supabase/migrations/`)**, deploy them automatically:

1. Run `npm run db:push` to apply migrations to Supabase
2. Run `npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj` to regenerate `lib/database.types.ts`
3. Verify no TypeScript errors with `npx tsc --noEmit`

Do not leave database changes unapplied. Treat migration deployment and type regeneration as part of the implementation.
