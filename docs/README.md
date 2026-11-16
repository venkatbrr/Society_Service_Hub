# Wooru Documentation Guide

Use this page to find the right source of truth without reading every document.

## Start here

- **New to Wooru?** Read the [application summary](../.github/app-summary.md) for the product, users, modules and routes.
- **Changing code or documentation?** Read the [agent operating manual](CLAUDE.md) first. It contains required conventions, commands and known traps.
- **Need a specific answer?** Choose your task in the routing table below, then read the linked feature or architecture reference.

Product and architecture documents describe the current implementation unless they explicitly label something proposed, hidden, deferred or historical. Research documents describe external products or concepts; they are not proof that those capabilities exist in Wooru.

## Find the right document for your task

| If you are... | Read these documents |
|---|---|
| Adding a feature or screen | [`CLAUDE.md`](CLAUDE.md) → nearest related entry in [`features.md`](features.md) → [`architecture.md`](architecture.md) for data/navigation → [`verandah.md`](verandah.md) for UI |
| Fixing a UI issue | [`CLAUDE.md`](CLAUDE.md) conventions → [`verandah.md`](verandah.md) → relevant screen in [`features.md`](features.md) |
| Fixing a query, permission or RLS issue | Relevant schema, RLS or RPC section in [`architecture.md`](architecture.md) → related screen in [`features.md`](features.md) |
| Adding or changing a table or RPC | [`architecture.md`](architecture.md) → database-change workflow in [`CLAUDE.md`](CLAUDE.md) |
| Changing roles or access | Role system and access rules in [`architecture.md`](architecture.md) → role matrix in [`features.md`](features.md) |
| Working on the admin console | [`platform-admin.md`](platform-admin.md) → platform-admin RPCs in [`architecture.md`](architecture.md) |
| Finding why a feature is unavailable | [`disabled-features.md`](disabled-features.md) → the linked entry in [`hidden-features/`](hidden-features/README.md), if applicable |
| Hiding or restoring a hidden feature | [`hidden-features/README.md`](hidden-features/README.md) → that feature's implementation checklist |
| Editing marketing copy or the landing page | [`features.md`](features.md) §12 → landing-page guidance in [`hidden-features/mcn-schools-and-borrow.md`](hidden-features/mcn-schools-and-borrow.md) |
| Changing federation behavior | [`cross-community.md`](cross-community.md) → [federation RLS decision](decisions/0001-additive-rls-for-cross-community.md); record the change in [`cross-community-changelog.md`](cross-community-changelog.md) |

---

## Current product and engineering references

These documents are the maintained references for the live product and its engineering rules.

| File | Scope | Update when |
|------|-------|-------------|
| [`.github/app-summary.md`](../.github/app-summary.md) | Master overview of the entire app | Any new module, tab, role, or major table |
| [`CLAUDE.md`](CLAUDE.md) | Agent operating manual: commands, conventions, workflows | New command, convention, dependency, or gotcha |
| [`architecture.md`](architecture.md) | Auth, roles, full schema, RLS, RPC index, navigation, types, patterns | Any schema, RPC, RLS, route, context, or type change |
| [`features.md`](features.md) | Per-screen contract: purpose, tables, rules, roles, navigation | Any user-visible behavior change |
| [`verandah.md`](verandah.md) | Design system: tokens, palette, type scale, component rules | Any design-token or shared-component change |
| [`platform-admin.md`](platform-admin.md) | Web admin console: pages, RPCs, setup, verification | Any admin-console or platform RPC change |
| [`disabled-features.md`](disabled-features.md) | Intentionally disabled/removed/deferred behavior, plus the index of hidden features | Any feature disabled or re-enabled |
| [`hidden-features/`](hidden-features/README.md) | Built features flagged off in the UI, one doc each with a re-enable checklist | Any flag in `constants/featureFlags.ts` added or flipped |
| [`fixes/`](fixes/) | Audits, implementation briefs, and verified fixes for edge cases | Created per deep-review pass |
| [`supabase-mcp.md`](supabase-mcp.md) | Supabase MCP server: setup, per-IDE config, tools, security posture | MCP config, access mode, or enabled feature groups change |

### Federation: backend live, UI deferred

| File | Scope |
|------|-------|
| [`cross-community.md`](cross-community.md) | Canonical federation reference (schema, helpers, RPCs, roadmap) |
| [`cross-community-changelog.md`](cross-community-changelog.md) | Append-only log; **mandatory** entry for any federation change |
| [`decisions/0001-additive-rls-for-cross-community.md`](decisions/0001-additive-rls-for-cross-community.md) | ADR: why federation RLS is additive |

### New feature ideas: proposals and competitor research

Everything from the product discussions lives in one folder, [`new-feature-ideas/`](new-feature-ideas/README.md). Nothing in it is built.

| File | Scope |
|------|-------|
| [`proposals/owner-tenant-visibility-proposal.md`](new-feature-ideas/proposals/owner-tenant-visibility-proposal.md) | Owner versus tenant types, flat membership, lead approval, visibility rules, and a competitor evidence check. |
| [`proposals/society-document-assistant-proposal.md`](new-feature-ideas/proposals/society-document-assistant-proposal.md) | Residents ask questions about uploaded society documents (bye-laws, minutes, circulars) and get answers with citations. Includes a competitor check, visibility rules, risks and phases. |
| [`competitor-research/apartmant.md`](new-feature-ideas/competitor-research/apartmant.md) | Apartmant Resident App: advertised resident, management, guard and parking features; UX observations; gaps and adopt/pilot/defer recommendations. |
| [`competitor-research/emaar-one.md`](new-feature-ideas/competitor-research/emaar-one.md) | Emaar One: Google Play feature and screenshot review, UX patterns Wooru could adapt, and reported usability issues. |
| [`competitor-research/courali-ux-reference.md`](new-feature-ideas/competitor-research/courali-ux-reference.md) | Courali: an independent design concept covering request ownership, visible status milestones and recovery patterns. Not validated product evidence. |

Engineering plans written before these discussions (cross-community pre-orders, two-environment setup, and the completed plans under `done/`) stay in [`new_features_to_implement/`](new_features_to_implement/).

## Leadership presentations

Research and concept reviews are useful for comparison and ideation. They do **not** establish that a feature is live in Wooru or validated with residents. Presentations stay in `presentations/` because the web build publishes that folder.

### Wooru presentations

| Presentation | Format and purpose |
|---|---|
| [One app, market and economics](presentations/wooru-one-app-market-and-economics.html) | Redesigned 11-slide leadership deck covering competitors (including owner/tenant evidence, an AI-on-documents column and the limits of public permission data), Wooru's current versus proposed features, two-way WhatsApp, the proposed society document assistant with a worked example, phased delivery and illustrative economics. The web build publishes it at `/presentations/wooru-one-app-market-and-economics.html`. |
| [One app, market and economics — editable deck](presentations/wooru-one-app-market-and-economics.pptx) | Earlier PowerPoint version with sources and notes. Its content and layout differ from the current HTML deck. |
| [Feature and income strategy](presentations/wooru-feature-and-income-strategy.html) | 25-slide CEO briefing on current features, priorities, competitors, proposed revenue and community pain-point research. Slides 20–25 contain the issue-research section. |
| [Feature and income strategy — editable deck](presentations/wooru-feature-and-income-strategy.pptx) | Matching PowerPoint version of the 25-slide strategy deck. |
| [Community commerce and income briefing](presentations/wooru-whatsapp-briefing.html) | 12-slide discussion of food orders, community commerce, WhatsApp journeys, sponsorship hypotheses, feasibility gates and leadership decisions. Includes interactive demos and an editable cost model. |
| [WhatsApp integration and cost research](presentations/whatsapp-integration.html) and [community concierge strategy](presentations/wooru-community-concierge.html) | Earlier reference presentations retained for their detailed integration models and role-based narrative; use the newer community-commerce briefing for the current overview. |

**Important:** presentations may show proposed features, fictional demo data, unverified competitor claims or illustrative prices and targets. Treat them as discussion material, not proof of implementation, demand or results. The community-commerce deck's "Make a wish" journey, sponsorship model and optional delivery are concepts, not live integrations. The one-app HTML deck's visitor registration, facility booking, notices and polls are also proposals.

### Historical references — not current product guidance

| Path | What it is |
|------|-----------|
| [`archive/`](archive/) | Superseded plans and one-off audits. Context only; never a source of truth. |
| [`schools_details/`](schools_details/) | Raw source data used to seed the schools catalog. |

## Documentation maintenance rules

1. **Docs are part of the change set**, not a follow-up task. A PR that changes behavior and not docs is incomplete.
2. Route each update to exactly one home. Duplicating the same fact into three files is how these docs drifted before:
   - user-visible behavior → `features.md`
   - schema / RLS / RPC / route / type / context → `architecture.md`
   - convention / command / dependency → `CLAUDE.md`
   - design token / shared component → `verandah.md`
   - admin console → `platform-admin.md`
   - a whole new module, tab, or role → also add a line to `.github/app-summary.md`
3. **Never restate schema columns in `features.md`.** Name the table; `architecture.md` owns the columns.
4. When you delete a feature, move its entry to `disabled-features.md` rather than deleting it silently. When you only **hide** one (built, flagged off, coming back), write its re-enable doc in `hidden-features/` and leave a pointer line in `disabled-features.md`.
5. Federation changes require an entry in `cross-community-changelog.md` in the same change set.

---

## Wooru at a glance

- **Product**: multi-tenant community app for gated residential societies (India). One Expo codebase → Android, iOS, and an installable PWA. Plus a separate vanilla-JS web console for platform admins.
- **Stack**: Expo SDK 54 / React Native 0.81 / TypeScript strict / expo-router / Supabase (Postgres + Auth + Realtime + RPC + Edge Functions).
- **Tabs**: Help · Saved · MCN · Community · Profile.
- **Tenancy**: every resident belongs to one community. Community-scoped queries **must** filter by `communityId` from `useAuth()`; RLS enforces the same rule server-side.
- **Roles**: `admin` (platform, no community) · `president` / `vice_president` (community leads) · `resident`. Fund-level roles are separate: `treasurer` / `collector`.
- **Design**: Verandah — light mode only, flat surfaces, no shadows, font weights 400/500, sentence case.
