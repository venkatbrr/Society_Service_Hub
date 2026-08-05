# Documentation Index

**Start here.** This file is the routing table for all project documentation. Read it first, then open **only** the files your task needs — every other doc is a deep reference, not required reading.

---

## 1. Read-this-first order

| Step | File | Why |
|------|------|-----|
| 1 | This file | Know which doc answers your question |
| 2 | [`.github/app-summary.md`](../.github/app-summary.md) | Complete portrait of the app: modules, roles, data model, routes |
| 3 | [`CLAUDE.md`](CLAUDE.md) | The rules you must follow while editing (conventions, commands, workflows) |
| 4 | Task-specific file from the table below | Deep detail |

---

## 2. Which file for which task

| Your task | Open these (in order) | Skip |
|-----------|----------------------|------|
| Implement a new feature/screen | `CLAUDE.md` → `features.md` (nearest similar feature) → `architecture.md` §Database, §Navigation → `verandah.md` | app-summary, cross-community |
| Fix a UI bug | `CLAUDE.md` §Conventions → `verandah.md` → `features.md` entry for that screen | architecture, app-summary |
| Fix a data/query/RLS bug | `architecture.md` §Database Schema, §RLS, §RPC Index → `features.md` entry | verandah |
| Add or change a table/RPC | `architecture.md` §Database Schema → `CLAUDE.md` §Deploying Database Changes | features (until UI changes) |
| Change roles/permissions | `architecture.md` §Role System → `features.md` §Role Access Matrix | everything else |
| Work on the web admin console | `platform-admin.md` → `architecture.md` §Platform Admin RPCs | mobile-only docs |
| Onboard / get oriented | `.github/app-summary.md` only | everything else |
| Understand why a feature is missing | `disabled-features.md` | everything else |
| Touch federation / partnerships | `cross-community.md` → `decisions/0001-additive-rls-for-cross-community.md` | everything else |

---

## 3. File inventory

### Live references — keep in sync with code

| File | Scope | Update when |
|------|-------|-------------|
| [`.github/app-summary.md`](../.github/app-summary.md) | Master overview of the entire app | Any new module, tab, role, or major table |
| [`CLAUDE.md`](CLAUDE.md) | Agent operating manual: commands, conventions, workflows | New command, convention, dependency, or gotcha |
| [`architecture.md`](architecture.md) | Auth, roles, full schema, RLS, RPC index, navigation, types, patterns | Any schema, RPC, RLS, route, context, or type change |
| [`features.md`](features.md) | Per-screen contract: purpose, tables, rules, roles, navigation | Any user-visible behavior change |
| [`verandah.md`](verandah.md) | Design system: tokens, palette, type scale, component rules | Any design-token or shared-component change |
| [`platform-admin.md`](platform-admin.md) | Web admin console: pages, RPCs, setup, verification | Any admin-console or platform RPC change |
| [`disabled-features.md`](disabled-features.md) | Intentionally disabled/removed/deferred behavior | Any feature disabled or re-enabled |

### Federation — backend live, UI deferred

| File | Scope |
|------|-------|
| [`cross-community.md`](cross-community.md) | Canonical federation reference (schema, helpers, RPCs, roadmap) |
| [`cross-community-changelog.md`](cross-community-changelog.md) | Append-only log; **mandatory** entry for any federation change |
| [`decisions/0001-additive-rls-for-cross-community.md`](decisions/0001-additive-rls-for-cross-community.md) | ADR: why federation RLS is additive |

### Historical — do not treat as current

| Path | What it is |
|------|-----------|
| [`archive/`](archive/) | Superseded plans and one-off audits. Context only; never a source of truth. |
| [`schools_details/`](schools_details/) | Raw source data used to seed the schools catalog. |

---

## 4. Documentation rules for agents

1. **Docs are part of the change set**, not a follow-up task. A PR that changes behavior and not docs is incomplete.
2. Route each update to exactly one home. Duplicating the same fact into three files is how these docs drifted before:
   - user-visible behavior → `features.md`
   - schema / RLS / RPC / route / type / context → `architecture.md`
   - convention / command / dependency → `CLAUDE.md`
   - design token / shared component → `verandah.md`
   - admin console → `platform-admin.md`
   - a whole new module, tab, or role → also add a line to `.github/app-summary.md`
3. **Never restate schema columns in `features.md`.** Name the table; `architecture.md` owns the columns.
4. When you delete a feature, move its entry to `disabled-features.md` rather than deleting it silently.
5. Federation changes require an entry in `cross-community-changelog.md` in the same change set.

---

## 5. Fast orientation (30 seconds)

- **Product**: multi-tenant community app for gated residential societies (India). One Expo codebase → Android, iOS, and an installable PWA. Plus a separate vanilla-JS web console for platform admins.
- **Stack**: Expo SDK 54 / React Native 0.81 / TypeScript strict / expo-router / Supabase (Postgres + Auth + Realtime + RPC + Edge Functions).
- **Tabs**: Help · Saved · MCN · Community · Profile.
- **Tenancy**: every resident belongs to one community. Community-scoped queries **must** filter by `communityId` from `useAuth()`; RLS enforces the same rule server-side.
- **Roles**: `admin` (platform, no community) · `president` / `vice_president` (community leads) · `resident`. Fund-level roles are separate: `treasurer` / `collector`.
- **Design**: Verandah — light mode only, flat surfaces, no shadows, font weights 400/500, sentence case.
