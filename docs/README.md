# Documentation Index

**Start here.** This file is the routing table for all project documentation. Read it first, then open **only** the files your task needs â€” every other doc is a deep reference, not required reading.

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
| Implement a new feature/screen | `CLAUDE.md` â†’ `features.md` (nearest similar feature) â†’ `architecture.md` Â§Database, Â§Navigation â†’ `verandah.md` | app-summary, cross-community |
| Fix a UI bug | `CLAUDE.md` Â§Conventions â†’ `verandah.md` â†’ `features.md` entry for that screen | architecture, app-summary |
| Fix a data/query/RLS bug | `architecture.md` Â§Database Schema, Â§RLS, Â§RPC Index â†’ `features.md` entry | verandah |
| Add or change a table/RPC | `architecture.md` Â§Database Schema â†’ `CLAUDE.md` Â§Deploying Database Changes | features (until UI changes) |
| Change roles/permissions | `architecture.md` Â§Role System â†’ `features.md` Â§Role Access Matrix | everything else |
| Work on the web admin console | `platform-admin.md` â†’ `architecture.md` Â§Platform Admin RPCs | mobile-only docs |
| Onboard / get oriented | `.github/app-summary.md` only | everything else |
| Understand why a feature is missing | `disabled-features.md` â†’ `hidden-features/` if it is listed as hidden | everything else |
| Hide a feature, or bring a hidden one back | `hidden-features/README.md` â†’ the feature's own doc there | everything else |
| Write marketing copy / edit the landing page | `features.md` Â§12 (structure + editing rules) â†’ `hidden-features/mcn-schools-and-borrow.md` Â§Landing page redesign (the live-vs-do-not-advertise list) | everything else |
| Touch federation / partnerships | `cross-community.md` â†’ `decisions/0001-additive-rls-for-cross-community.md` | everything else |

---

## 3. File inventory

### Live references â€” keep in sync with code

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

### Federation â€” backend live, UI deferred

| File | Scope |
|------|-------|
| [`cross-community.md`](cross-community.md) | Canonical federation reference (schema, helpers, RPCs, roadmap) |
| [`cross-community-changelog.md`](cross-community-changelog.md) | Append-only log; **mandatory** entry for any federation change |
| [`decisions/0001-additive-rls-for-cross-community.md`](decisions/0001-additive-rls-for-cross-community.md) | ADR: why federation RLS is additive |

### Research presentations

The web build publishes a canonical twelve-slide, 16:9 presentation at `/presentations/wooru-whatsapp-briefing.html`. It uses [`presentations/presentation.css`](presentations/presentation.css), opens locally with its adjacent [`presentations/cost-calculator.js`](presentations/cost-calculator.js), provides Read all for detailed research and an editable INR cost model, and exports a widescreen PDF without app sign-in. Buying circles, sponsorship funding, supplier/society dashboards, optional delivery, WhatsApp and AI journeys are proposed concepts, not live integrations.

The canonical deck's demo slides show two matching full-height phone replicas: a WhatsApp-style chat (teal header, wallpaper, tailed bubbles with read ticks, reply buttons, message bar and share sheet) and the Wooru app with a pinned bottom tab bar using icons. Role dashboards use their own scrollable frames. A presenter panel beside the phones holds the step count, Play, Back step, Next step, reset, speed, the milestone list and the caption. Earlier chat actions become inactive as the story progresses; completed journeys require an explicit replay. Group sharing includes a working cancel path, and the seller roster includes a return action. These controls manipulate fictional examples only.

- [Wooru community commerce and income briefing](presentations/wooru-whatsapp-briefing.html) â€” the twelve-slide executive discussion: documented food-order basis, four pilot questions, presenter-controlled seller â†’ resident â†’ human group-sharing journeys, a proposed "Make a wish" buy-together concept for groceries, food or services (not shipped in the app) shown on resident and lead/supplier Wooru phone replicas with a six-step presenter panel, role-screen demos, four feasibility gates, the proposed sponsor â†’ association â†’ separately contracted Wooru path, an evidence ledger with unknown quotes/costs, and a phased leadership decision. Slide view fits a fixed 1280Ã—720 canvas to the available space, scaling the entire slide up or down (including on mobile) without rearranging it; it runs as a slideshow on a dark stage with a branded slide master (accent bar, logo, slide number), auto-hiding top and bottom controls (revealed on mouse move or tap), a Full screen button or F key, and swipe navigation on touch screens. Slide content is vertically centered in both the presentation and PDF, while Read all remains a responsive research view. The editable WhatsApp cost model and sources remain in Read all, not the business case. All demo prices, counts and sponsor placements are fictionalâ€”not pilot data or live integrations.
- **Reference archives (existing URLs remain available):** [WhatsApp integration and cost research](presentations/whatsapp-integration.html) retains the detailed one-number and optional seller-number models; [community concierge strategy](presentations/wooru-community-concierge.html) retains its original role-by-role animated narrative. Both link back to the unified presentation; neither represents a shipped WhatsApp feature.

### Historical â€” do not treat as current

| Path | What it is |
|------|-----------|
| [`archive/`](archive/) | Superseded plans and one-off audits. Context only; never a source of truth. |
| [`schools_details/`](schools_details/) | Raw source data used to seed the schools catalog. |

---

## 4. Documentation rules for agents

1. **Docs are part of the change set**, not a follow-up task. A PR that changes behavior and not docs is incomplete.
2. Route each update to exactly one home. Duplicating the same fact into three files is how these docs drifted before:
   - user-visible behavior â†’ `features.md`
   - schema / RLS / RPC / route / type / context â†’ `architecture.md`
   - convention / command / dependency â†’ `CLAUDE.md`
   - design token / shared component â†’ `verandah.md`
   - admin console â†’ `platform-admin.md`
   - a whole new module, tab, or role â†’ also add a line to `.github/app-summary.md`
3. **Never restate schema columns in `features.md`.** Name the table; `architecture.md` owns the columns.
4. When you delete a feature, move its entry to `disabled-features.md` rather than deleting it silently. When you only **hide** one (built, flagged off, coming back), write its re-enable doc in `hidden-features/` and leave a pointer line in `disabled-features.md`.
5. Federation changes require an entry in `cross-community-changelog.md` in the same change set.

---

## 5. Fast orientation (30 seconds)

- **Product**: multi-tenant community app for gated residential societies (India). One Expo codebase â†’ Android, iOS, and an installable PWA. Plus a separate vanilla-JS web console for platform admins.
- **Stack**: Expo SDK 54 / React Native 0.81 / TypeScript strict / expo-router / Supabase (Postgres + Auth + Realtime + RPC + Edge Functions).
- **Tabs**: Help Â· Saved Â· MCN Â· Community Â· Profile.
- **Tenancy**: every resident belongs to one community. Community-scoped queries **must** filter by `communityId` from `useAuth()`; RLS enforces the same rule server-side.
- **Roles**: `admin` (platform, no community) Â· `president` / `vice_president` (community leads) Â· `resident`. Fund-level roles are separate: `treasurer` / `collector`.
- **Design**: Verandah â€” light mode only, flat surfaces, no shadows, font weights 400/500, sentence case.
