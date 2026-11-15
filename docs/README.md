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
| Understand why a feature is missing | `disabled-features.md` → `hidden-features/` if it is listed as hidden | everything else |
| Hide a feature, or bring a hidden one back | `hidden-features/README.md` → the feature's own doc there | everything else |
| Write marketing copy / edit the landing page | `features.md` §12 (structure + editing rules) → `hidden-features/mcn-schools-and-borrow.md` §Landing page redesign (the live-vs-do-not-advertise list) | everything else |
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
| [`disabled-features.md`](disabled-features.md) | Intentionally disabled/removed/deferred behavior, plus the index of hidden features | Any feature disabled or re-enabled |
| [`hidden-features/`](hidden-features/README.md) | Built features flagged off in the UI, one doc each with a re-enable checklist | Any flag in `constants/featureFlags.ts` added or flipped |
| [`fixes/`](fixes/) | Audits, implementation briefs, and verified fixes for edge cases | Created per deep-review pass |
| [`supabase-mcp.md`](supabase-mcp.md) | Supabase MCP server: setup, per-IDE config, tools, security posture | MCP config, access mode, or enabled feature groups change |

### Federation — backend live, UI deferred

| File | Scope |
|------|-------|
| [`cross-community.md`](cross-community.md) | Canonical federation reference (schema, helpers, RPCs, roadmap) |
| [`cross-community-changelog.md`](cross-community-changelog.md) | Append-only log; **mandatory** entry for any federation change |
| [`decisions/0001-additive-rls-for-cross-community.md`](decisions/0001-additive-rls-for-cross-community.md) | ADR: why federation RLS is additive |

### Research presentations

- [Apartmant Resident App — product and UX analysis](competitor-analysis-apartmant.md) — sourced review of Apartmant's advertised resident, management, guard and parking capabilities; UI/UX observations; comparison with Wooru's documented current features; and adopt/pilot/defer recommendations. Product claims and screenshots are not independent validation.
- [Wooru one-app market and economics — HTML presentation](presentations/wooru-one-app-market-and-economics.html) — a 10-slide leadership briefing: a resident-complaint matrix across four Indian apps, a competitor gap table, examples abroad, Wooru's existing versus proposed layers (including a WhatsApp channel: live Call/WhatsApp buttons and link previews, proposed two-way Wooru number and opt-in updates), an issue-tracking timeline, phased build, revenue streams, a break-even chart and the 90-day pilot ask, with a Wooru resident-home phone concept showing the same WhatsApp distinction on the cover. It uses a flat editorial style (white slides, one cobalt accent, tables and charts rather than card grids) that intentionally differs from the in-app Verandah design system. The new notices, issue tracking, facility booking, visitor registration and resident polls are proposals, not live features. Slide view and Read all scale fixed 1280×720 slides without rearranging their content. It supports keyboard and touch navigation, full screen and print-to-PDF. Full screen hides the toolbars and fits the slide edge-to-edge even on iPhone Safari (which has no page Fullscreen API); browsers that allow it also enter native full screen and lock landscape. While presenting, tap the right/left of the slide or swipe to navigate, and use × or Esc to exit. The web build copies it to `/presentations/wooru-one-app-market-and-economics.html`.
- [Wooru one-app market and economics — PowerPoint](presentations/wooru-one-app-market-and-economics.pptx) — the earlier editable 10-slide briefing with sources and speaker notes; its slide 3 competitor table matches the HTML (what each app offers, what residents report missing, and what Wooru has or is adding), but it has not been updated with the redesigned HTML layouts or visual style. The web build also publishes it at `/presentations/wooru-one-app-market-and-economics.pptx`. Review themes are self-selected reports, competitor descriptions are vendor claims, and the proposed features, prices, costs and pilot targets are not current results.
- [Wooru feature and income strategy — HTML presentation](presentations/wooru-feature-and-income-strategy.html) — a standalone, responsive 25-slide CEO briefing with keyboard/swipe navigation, full-screen mode (hides the toolbars with floating back/next/exit controls, including on iPhone Safari), Read all, and print-to-PDF controls. The **Community issues** shortcut opens six research slides (20–25) covering ten user-reported pain points, dated examples, review sampling limitations, source links, and recommended Wooru validation. The existing web build copies it to `/presentations/wooru-feature-and-income-strategy.html`; append `#slide-20` to open the research directly. This is a public presentation, not a new signed-in app screen or landing-page comparison.
- [Wooru feature and income strategy — PowerPoint](presentations/wooru-feature-and-income-strategy.pptx) — the matching editable 25-slide CEO briefing: current features, prioritization, official-source competitors, proposed income streams, illustrative subscription economics, pilot gates, and community pain-point research. Prepared 2026-11-15. User reviews are self-selected reports, not verified defects or market-wide failure rates; vendor descriptions are not independent tests; proposed features and financial assumptions are not live capabilities or current revenue.

The web build publishes a canonical twelve-slide, 16:9 presentation at `/presentations/wooru-whatsapp-briefing.html`. It uses [`presentations/presentation.css`](presentations/presentation.css), opens locally with its adjacent [`presentations/cost-calculator.js`](presentations/cost-calculator.js), provides Read all for detailed research and an editable INR cost model, and exports a widescreen PDF without app sign-in. Buying circles, sponsorship funding, supplier/society dashboards, optional delivery, WhatsApp and AI journeys are proposed concepts, not live integrations.

The canonical deck's demo slides show two matching full-height phone replicas: a WhatsApp-style chat (teal header, wallpaper, tailed bubbles with read ticks, reply buttons, message bar and share sheet) and the Wooru app with a pinned bottom tab bar using icons. Role dashboards use their own scrollable frames. A presenter panel beside the phones holds the step count, Play, Back step, Next step, reset, speed, the milestone list and the caption. Earlier chat actions become inactive as the story progresses; completed journeys require an explicit replay. Group sharing includes a working cancel path, and the seller roster includes a return action. These controls manipulate fictional examples only.

- [Wooru community commerce and income briefing](presentations/wooru-whatsapp-briefing.html) — the twelve-slide executive discussion: documented food-order basis, four pilot questions, presenter-controlled seller → resident → human group-sharing journeys, a proposed "Make a wish" buy-together concept for groceries, food or services (shared by the resident to the society WhatsApp group) (not shipped in the app) shown on resident and lead/supplier Wooru phone replicas with a six-step presenter panel, role-screen demos, four feasibility gates, the proposed sponsor → association → separately contracted Wooru path, an evidence ledger with unknown quotes/costs, and a phased leadership decision. Slide view fits a fixed 1280×720 canvas to the available space, scaling the entire slide up or down (including on mobile) without rearranging it; it runs as a slideshow on a dark stage with a branded slide master (accent bar, logo, slide number), auto-hiding top and bottom controls (revealed on mouse move or tap), a Full screen button or F key, and swipe navigation on touch screens. Slide content is vertically centered in both the presentation and PDF, while Read all remains a responsive research view. The editable WhatsApp cost model and sources remain in Read all, not the business case. All demo prices, counts and sponsor placements are fictional—not pilot data or live integrations.
- **Reference archives (existing URLs remain available):** [WhatsApp integration and cost research](presentations/whatsapp-integration.html) retains the detailed one-number and optional seller-number models; [community concierge strategy](presentations/wooru-community-concierge.html) retains its original role-by-role animated narrative. Both link back to the unified presentation; neither represents a shipped WhatsApp feature.

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
4. When you delete a feature, move its entry to `disabled-features.md` rather than deleting it silently. When you only **hide** one (built, flagged off, coming back), write its re-enable doc in `hidden-features/` and leave a pointer line in `disabled-features.md`.
5. Federation changes require an entry in `cross-community-changelog.md` in the same change set.

---

## 5. Fast orientation (30 seconds)

- **Product**: multi-tenant community app for gated residential societies (India). One Expo codebase → Android, iOS, and an installable PWA. Plus a separate vanilla-JS web console for platform admins.
- **Stack**: Expo SDK 54 / React Native 0.81 / TypeScript strict / expo-router / Supabase (Postgres + Auth + Realtime + RPC + Edge Functions).
- **Tabs**: Help · Saved · MCN · Community · Profile.
- **Tenancy**: every resident belongs to one community. Community-scoped queries **must** filter by `communityId` from `useAuth()`; RLS enforces the same rule server-side.
- **Roles**: `admin` (platform, no community) · `president` / `vice_president` (community leads) · `resident`. Fund-level roles are separate: `treasurer` / `collector`.
- **Design**: Verandah — light mode only, flat surfaces, no shadows, font weights 400/500, sentence case.
