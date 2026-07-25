# Copilot Instructions

All project documentation lives in `docs/`. **Read these files before making changes:**

- [docs/CLAUDE.md](../docs/CLAUDE.md) — Commands, conventions, key patterns
- [docs/architecture.md](../docs/architecture.md) — Data flow, auth, database schema, state management, type system
- [docs/features.md](../docs/features.md) — Every feature: screens, tables, business rules, roles, integrations
- [docs/copilot-instructions.md](../docs/copilot-instructions.md) — Technical and functional specifications
- [docs/verandah.md](../docs/verandah.md) — Verandah design system reference (tokens, palette, typography, component rules)
- [docs/disabled-features.md](../docs/disabled-features.md) — Intentionally disabled features and re-enablement plan

## Quick Reference

- **Stack**: Expo (React Native) + TypeScript + Supabase + expo-router
- **Commands**: `npm start`, `npm run web`, `npx tsc --noEmit`
- **Icons**: Only `Ionicons` from `@expo/vector-icons` for interactive controls
- **Design System**: Verandah — light-mode-only, flat surfaces, no shadows/elevation/glassmorphism
  - Colors: `constants/Colors.ts` (`Verandah` palette — surface `#FAF8F4`, card `#FFFFFF`, accent `#0F6E56`)
  - Typography, spacing, radius: `constants/Verandah.ts` (`VerandahType`, `VerandahSpace`, `VerandahRadius`)
  - Font weights: 400 and 500 only. Sentence case everywhere.
  - Shared components: `BaseCard`, `Avatar`, `Rupees`, `EmptyState`
- **Tabs**: 5 bottom tabs — Help, Saved, MCN (My Community Network), Community, Profile
- **Multi-tenant**: All queries must filter by `communityId` from `useAuth()`
- **Single-row queries**: Use `.maybeSingle()` not `.single()`
- **Toast**: Use `react-native-toast-message` for user feedback
- **Date inputs**: Always use `@react-native-community/datetimepicker`
- **Categories**: Import from `constants/categories.ts` (providers/visits) and `lib/serviceCategories.ts` (personal reminders)
- **Compact UI**: The Help tab uses WhatsApp chat-tile inspired density for provider and visit cards

## Keeping Docs in Sync

**When you modify code, update the corresponding documentation in `docs/`:**

- New or changed screens/features → update `docs/features.md`
- Architecture changes (tables, RLS, context, routes, types) → update `docs/architecture.md`
- New commands, conventions, or dependencies → update `docs/CLAUDE.md`
- Disabled or re-enabled features → update `docs/disabled-features.md`

Treat doc updates as part of the implementation, not a follow-up task.

## Deploying Database Changes

When you create or modify migration files (`supabase/migrations/`), deploy them automatically:

1. Run `npm run db:push` to apply migrations to Supabase
2. Run `npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj` to regenerate `lib/database.types.ts`
3. Verify no TypeScript errors with `npx tsc --noEmit`

Do not leave database changes unapplied.
