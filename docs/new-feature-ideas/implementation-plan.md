# Wooru feature landscape - implementation plan

**Status:** working plan for partner discussion; not an approved scope, delivery commitment, or statement that proposed features are built.

**Prepared:** 17 November 2026

**Related material:** [partner presentation](../presentations/wooru-one-app-market-and-economics.html), [owner and tenant visibility proposal](proposals/owner-tenant-visibility-proposal.md), [society document assistant proposal](proposals/society-document-assistant-proposal.md), and [Indian society-platform scan](competitor-research/indian-society-platforms.md).

## 1. Purpose and status language

This document expands the presentation's feature landscape into a dependency-aware delivery plan. It covers the concepts discussed for Wooru and the operational capabilities advertised by other society platforms. It does not claim that public competitor pages prove demand, product quality, or the absence of an unadvertised feature.

Use these status labels throughout:

- **In Wooru today:** evidenced in the current repository and existing product documentation.
- **Proposed:** a feature concept to validate, design, and scope before implementation.
- **Partner/vendor dependent:** requires an external provider, device, business account, integration agreement, or operational service.
- **Future exploration:** a larger or regulated workflow that needs separate discovery and approval.

The phases below order work by prerequisites such as identity, permissions, and external dependencies. They are not a CEO recommendation, a product priority score, or a commitment to deliver every item. Scope, staffing, costs, and dates require partner and engineering confirmation.

## 2. Current product baseline

The plan builds on the following capabilities already described in the Wooru repository:

- Authentication, community membership, community leads, and a resident directory.
- Service providers, shared service visits, community events, resident businesses, food pre-orders, carpools, parent connections, and the community-funds ledger.
- Notifications with realtime delivery and web-push support.
- Emergency contacts and an opt-in blood-donor list. These are not a one-tap SOS broadcast.
- WhatsApp and phone hand-off links in selected user journeys. These do not let Wooru read or send messages inside existing society groups.
- Borrow & Share is implemented but hidden. It is not a new feature in this plan.

The product's current role model does not distinguish owners, tenants, or household members. Community events are implemented, but audience-restricted publishing and official notices are not. Wooru's community-funds ledger is not maintenance billing, double-entry accounting, payment settlement, or UPI reconciliation.

The following items remain proposals or externally dependent concepts:

| Area | Proposed capability | Status / boundary |
|---|---|---|
| Identity and access | Verified owner, tenant, and household membership for one or more flats | Proposed; no membership model or UI exists |
| Communication | Audience-based posts and events; lead-only official notices | Proposed; existing events are not audience-restricted |
| Service follow-through | Issues with photos, an accountable owner, status, and updates | Proposed; no issue-management workflow exists |
| Messaging | Two-way conversation and opt-in status updates through a Wooru WhatsApp number | Proposed; requires Meta business setup, templates, webhooks, consent, and operating support |
| Society information | Private document library and cited answers from permitted society documents | Proposal only; no document storage, indexing, AI provider, or assistant screen exists |
| Resident tools | Amenity booking, polls, one-tap SOS, public society page, meeting records, and vehicle/parking registry | Proposed; confirm boundaries against existing events, directory, SOS, and funds features |
| Society operations | Visitor/gate workflows, guard tools, RFID/intercom, maintenance billing, accounting, UPI reconciliation, payroll, patrol tracking, and water monitoring | Competitor-advertised categories; require separate partner/vendor discovery and are not assumed to be Wooru features |

For source detail on present behavior, see [`features.md`](../features.md) and [`architecture.md`](../architecture.md). Competitor claims and their research limits are in the [vendor scan](competitor-research/indian-society-platforms.md).

## 3. Delivery map and dependencies

| Phase | Scope | Main dependency / exit condition |
|---|---|---|
| 0. Partner discovery and pilot definition | Validate workflows, policies, target societies, measures, and operational owners | Partner confirms pilot participants, decisions, and data/access rules |
| 1. Membership and audience foundations | Flat membership, owner/tenant/household claims, approval, audit, and access helpers | Permissions and ownership rules are documented and testable |
| 2. Posts, events, groups, and official notices | Audience-aware publishing and notices; groups only when membership controls exist | Audience access works for feeds, details, links, search, attachments, and notifications |
| 3. Issue tracking | Report, triage, assign, update, and close issues | Responsibility, status definitions, and escalation expectations agreed |
| 4. WhatsApp integration | Opt-in inbound and outbound messaging on a Wooru business number | Business verification, privacy review, templates, webhook operations, and costs approved |
| 5. Document assistant | Private documents, processing, permission-filtered retrieval, cited answers | Storage and AI-provider terms approved; access and answer-quality tests pass |
| 6. Resident tools and records | Amenity booking, polls, emergency alert workflow, meeting records, parking registry | Each tool has its own rules, accountable operator, and privacy boundary |
| 7. Society-operation integrations | Visitor/gate, billing/accounting, payments, payroll, patrol, water, and device connections | Named vendor, supported API/device, commercial terms, support model, and security review |

Phases can be piloted separately where their prerequisites are satisfied. In particular, public/committee document Q&A does not have to wait for every owner/tenant feature, but must not be extended to owner-only or household content before those access rules exist.

## 4. Phase 0 - partner discovery and pilot definition

### Work

1. Select 3-5 pilot societies and name a Wooru contact and a society contact for each.
2. Map how each society currently handles notices, issues, visitor entry, amenities, records, and maintenance/accounting.
3. Separate common requirements from society-specific rules. Collect existing notice templates, issue categories, booking rules, and document types where the society is authorised to share them.
4. Confirm resident types and flat-approval authority, including joint owners, absentee owners, tenant changes, household members, and leaderless communities.
5. Confirm whether formal voting, dues, payment collection, visitor entry, or security alerts are in scope. These carry different legal, operational, and data obligations from an ordinary poll or event.
6. Baseline the pilot measures before launch; label every target as a hypothesis until measured.

### Deliverables and gate

- Pilot society list, contacts, and operating hours.
- Approved workflow maps and a decision log for the open questions in the two feature proposals.
- Data inventory and retention/privacy review, including who can view personal phone numbers, flat records, documents, issues, and message content.
- A scope register that labels each item as in-pilot, later phase, vendor-dependent, or out of scope.
- **Exit gate:** each pilot society confirms its audience rules, escalation owner, and how residents can report errors or request support.

## 5. Phase 1 - membership and audience foundations

### Scope

Implement a flat-membership model for owner-residents, owners living elsewhere, tenants, and household members. Preserve the existing community role model (`resident`, `president`, `vice_president`, and platform `admin`); ownership is a separate relationship, not a new community role.

### Implementation steps

1. Model membership history with pending, active, ended, and rejected states, validity dates, approver, and decision reason.
2. Add database helpers for membership type and flat-level access. Keep `profiles.flat_id` behavior intact for existing screens while multiple-flat and absentee-owner behavior is introduced deliberately.
3. Add a request flow to onboarding/Profile and a lead review queue. Pending requests retain ordinary resident access only.
4. Prevent self-approval of an owner's own claim. Define the platform-admin fallback where a society has no independent lead.
5. Record approval, rejection, and end actions in the audit trail; notify the requester of the result.
6. Show "My flats" and membership status in Profile. Expose resident-type labels only to audiences agreed in the partner policy.
7. Add audience resolution for everyone, owners, tenants, residents living at the society, one approved flat, and one block. Restrict members to audiences they are allowed to address.
8. Defer group targeting until Wooru groups have explicit membership, ownership, moderation, and access rules.

### Acceptance checks

- A pending or rejected claim never grants owner-only access.
- A tenant cannot gain owner access by changing client state or directly calling the database.
- A member of one flat cannot read another flat's household data.
- Multiple legitimate owners can be represented; lead decisions and conflicts are auditable.
- Ending a membership immediately removes current access while preserving historical attribution.
- A lead cannot approve their own owner claim; a second lead or authorised platform-admin path handles it.
- Existing one-flat resident journeys continue to work until a deliberate migration path is complete.

## 6. Phase 2 - audience-based posts, events, and official notices

### Scope

Extend community publishing without changing existing items' audience retroactively. Reuse the existing event workflow where possible. Add ordinary posts and a distinct official-notice type; only community leads may publish the official label.

### Implementation steps

1. Agree post/event categories, permitted audiences, publication and expiry behavior, and whether comments or RSVP are included.
2. Add an audience picker with a plain-language recipient summary and recipient count. Do not expose a list of private recipients.
3. Enforce audience membership in database reads and writes, not just in feed filtering. Apply the same rule to details, attachments, comments, search, RSVP, exports, and notification fan-out.
4. Ensure notification previews do not reveal private titles or content to ineligible members.
5. Keep emergency/safety broadcasts separate from optional audience filters.
6. Provide author identity, edit history, cancellation/expiry states, and a report/moderation path. Keep ordinary resident posts visually distinct from official notices.
7. Add permission-controlled groups only after the group membership lifecycle is delivered; do not model arbitrary WhatsApp groups as Wooru groups.

### Acceptance checks

- A user outside the selected audience cannot access the item by direct URL, stale notification, search, attachment URL, or copied link.
- Only a lead can create or retain the official-notice label.
- Audience-specific pushes go only to eligible members; changes to membership are rechecked at delivery and when opening the item.
- Existing events remain visible under their current rules unless explicitly migrated or replaced.
- Posts/events can target the approved household, owners, tenants, residents, or block without leaking the audience membership list.

## 7. Phase 3 - issue tracking

### Scope

Create a lifecycle for resident-reported flat and common-area issues: description, optional photo, category, location, responsible person/team, status, updates, and closure. An issue report is not a financial claim or emergency alert.

### Implementation steps

1. Define issue categories, priority definitions, statuses, who triages, and the expected first-response/update cadence with pilot societies.
2. Let an authorised resident create a report for their flat or a permitted common area. Support a private contact path and a public/committee-visible report mode only if its audience is explicit.
3. Give leads a queue to assign an owner, change status, request information, and record a resolution.
4. Notify the reporter on assignment and meaningful status changes; keep message previews privacy-safe.
5. Add filters for open/closed state, category, block, and age; provide an audit trail for status and assignment changes.
6. Add escalation reminders only after pilot data establishes the cadence and responsible recipient.

### Acceptance checks

- Residents see only issues they are entitled to see; leads see issues for their own community.
- A reported item always has a clear next state and an identifiable responsible role.
- Photo uploads follow an explicit storage and retention policy; do not place confidential documents in public image hosting.
- Repeated webhooks, push events, or user taps do not create duplicate issue records or updates.
- Closed issues retain their history and can be reopened through a documented permission path.

## 8. Phase 4 - two-way WhatsApp

### Scope

Use a dedicated Wooru business number for opted-in resident conversations and status messages. Existing app call/WhatsApp buttons and shared-link previews remain separate capabilities.

### Implementation steps

1. Complete Meta business verification and choose the business account, number, BSP/API setup, webhook host, and operational owner.
2. Define opt-in text, capture and withdrawal, message templates, business-initiated messaging rules, retention, support hours, and who can see conversation history.
3. Route inbound messages to a verified resident/community context. If identity cannot be verified, offer a safe link or human hand-off rather than exposing society data.
4. Connect supported intents to the issue workflow first; add questions or orders only after their own authorization and data mapping are specified.
5. Send opt-in status updates for assignment, order readiness, or official notices. Use idempotency keys and store provider message IDs/statuses for delivery troubleshooting.
6. Provide opt-out, failed-delivery, rate-limit, abuse, and human escalation paths. Do not read, scrape, or post into existing society groups.
7. Track per-society message volume and fees; configure limits and a pause switch before a pilot.

### Acceptance checks

- No outbound message is sent without valid, recorded consent and an allowed template/window.
- Opt-out takes effect for later messages and is visible to the resident.
- Inbound events are authenticated, replay-safe, community-scoped, and logged without retaining unnecessary message content.
- A resident cannot use a phone number alone to retrieve another flat's private information.
- Wooru can pause outbound traffic and route unresolved requests to a human.

## 9. Phase 5 - society document assistant

Use the [document assistant proposal](proposals/society-document-assistant-proposal.md) as the product behavior reference; this phase adds delivery and verification detail.

### Implementation steps

1. Choose an AI/search provider after reviewing data-processing terms, regional-language quality, deletion behavior, service availability, and measured cost. Keep provider credentials server-side.
2. Create a private document-storage path. Do not use the current unsigned Cloudinary image-upload flow for society documents.
3. Let leads upload text-based PDFs with title, type, effective date, and an explicit public/committee visibility. Show processing, ready, and failure states.
4. Process documents server-side: validate file type/size, extract text with page boundaries, split into passages, index, and retain the source version. Failed extraction must surface an actionable error.
5. Search only documents and passages the requester is authorised to access. Enforce community and visibility boundaries before content reaches the AI provider.
6. Generate answers only from retrieved passages. Require citations for factual claims; otherwise return a no-answer response and a link to ask the committee.
7. Add lead-visible unanswered-question and feedback views, with a privacy decision on whether the questioner's identity is shown.
8. Add daily/per-community usage limits, cost telemetry, retention/deletion controls, and a lead kill switch.

### Acceptance checks

- Direct storage URLs and row queries do not allow residents to read committee-only documents.
- A resident's retrieval request never fetches committee-only text into application or model context.
- Every answer opens the cited document at the cited page; uncited answers are not shown as factual responses.
- Irrelevant or missing evidence produces the no-answer reply rather than a guessed answer.
- Removing a document also removes or invalidates its passages and search index.
- Pilot evaluation measures citation correctness and unsupported-answer rate on a reviewed question set before enabling resident access.
- Text-PDF v1 clearly reports scanned/unreadable files; OCR, Telugu/Hindi, WhatsApp Q&A, and owner-only document permissions remain later work unless explicitly approved.

## 10. Phase 6 - resident tools and records

Each item below requires its own rules and acceptance criteria; they are not one combined module.

| Capability | Delivery outline | Critical boundary |
|---|---|---|
| Amenity booking | Define inventory, operating hours, slot length, capacity, blackout dates, cancellation, approval, fees (if any), and booking reminders; enforce conflicts and capacity server-side | Do not imply payment or guaranteed availability until the society and payment flow support it |
| Community polls | Add a simple non-binding poll with question, options, audience, open/close time, and result visibility | Clearly distinguish opinion polls from formal association votes |
| Formal owner voting | Define eligible voters, one-vote-per-flat nominee, proxy rules, ballot secrecy, audit, quorum, and dispute process with each society's bylaws | Separate approval and legal review before implementation; never infer voter eligibility from a self-declared profile |
| One-tap SOS | Define emergency categories, confirmation behavior, recipient list, location sharing, acknowledgment/escalation, false-alarm handling, and service availability | Existing emergency contacts and donor directory are not an SOS alerting service; never promise emergency response |
| Public society page | Define fields safe for public access, lead publishing controls, contact/privacy settings, unlisted vs indexed behavior, and abuse reporting | Public pages must not expose resident lists, flat details, private notices, or join credentials |
| Meeting/AGM records | Add permissioned agenda, minutes, resolutions, attachments, and version history | Apply owner/tenant and document visibility rules; do not make committee material public by default |
| Vehicle/parking registry | Define flat-to-vehicle membership, plate visibility, parking allocation, guest vehicle lifecycle, and update/removal permissions | Vehicle identifiers are personal data; collect only what the workflow needs |

For every capability, add a product brief and data/access design before a migration or route is started. Formal voting and payments must not be represented as a simple poll or display-only event fee.

## 11. Phase 7 - society-operation integrations

The competitor scan contains capabilities beyond Wooru's current community product. Treat each as a separate integration or product discovery, not as a feature already available through a vendor label.

| Capability group | Discovery and implementation work | External dependency |
|---|---|---|
| Visitor and gate workflows | Define pre-invite, arrival approval, delivery/service entry, guard shift, offline mode, audit history, and resident/guard/support interfaces | Guard deployment, identity verification, and possibly a gate vendor |
| RFID, intercom, access control | Inventory supported devices/protocols, event ownership, authorization, outages, and physical safety fallback before designing app controls | Hardware vendor, integration API, installation, and on-site support |
| Maintenance billing and accounting | Define unit ledger, invoices, adjustments, arrears, financial periods, audit, exports, and reconciliation model; distinguish it from the existing community-fund ledger | Accounting/payment provider and society finance process |
| UPI/payment reconciliation | Define payment initiation, provider callbacks, refunds, settlement, idempotency, dispute handling, and reconciliation ownership | Payment gateway, bank/UPI provider, commercial and compliance approval |
| Payroll and staff/vendor workflows | Define employment/vendor records, role boundaries, attendance, approvals, and payroll export; do not assume Wooru becomes the payroll system | Society's payroll/HR provider and data-processing terms |
| Patrol tracking and water monitoring | Define devices, event frequency, alert thresholds, exception handling, and manual fallback | Sensors/devices, connectivity, hardware and maintenance contracts |

**Exit gate for each integration:** a named partner/vendor, documented API or device capability, data-sharing and retention terms, outage behavior, support owner, complete cost model, and a tested sandbox/demo. If a vendor has no supported integration, keep the workflow out of scope rather than relying on scraping or undocumented access.

## 12. Pilot and 90-day planning view

This planning view expands the presentation's 90-day concept. It is conditional on partner staffing, scope decisions, and environment readiness; it is not a delivery promise.

| Window | Product and engineering | Society onboarding and measurement | Gate |
|---|---|---|---|
| Days 1-30 | Confirm requirements and access decisions; baseline reliability of sign-in, alerts, and funds; detail notice and issue flows; complete WhatsApp provider, consent, and template setup | Interview residents and leads; record baseline issue follow-ups, response times, support effort, and willingness-to-pay evidence | Pilot-ready scope, named owners, and privacy/access review complete |
| Days 31-60 | Build and test official notices and issue tracking; complete WhatsApp inbound/outbound path only after provider approval; instrument delivery and support | Onboard society contacts; train them on moderation, escalation, opt-out, and issue ownership; weekly support review | Daily use in pilot societies; no open critical access-control defect |
| Days 61-90 | Fix measured issues; review operational burden, delivery reliability, and support workflow; prepare next-step options | Weekly resident/committee check-ins; compare results with the days 1-30 baseline | Expand, repeat with changes, or stop based on agreed criteria |

Document Q&A, owner/tenant foundations, formal voting, dues/payment processing, gate hardware, and other vendor integrations are not implicitly part of this 90-day pilot. Add them only after their prerequisites and separate gates are met.

### Measures

Use the presentation's targets as working hypotheses, not achieved results:

- 25% fewer repeat follow-ups on similar reported issues versus the days 1-30 baseline.
- Name an owner on each issue within one working day.
- Log support effort per society each week and compare against the illustrative variable-cost assumption.
- Test association willingness to pay against the illustrative monthly price with actual partner conversations.
- For WhatsApp, track opt-in rate, delivery/failure rate, opt-out rate, unresolved-to-human hand-off, and message cost.
- For notices, track eligible reach, read rate, and resident-reported clarity; do not treat read receipts as proof of comprehension.
- For document Q&A, use a separately approved evaluation set and the document proposal's citation-correctness and no-leak measures.

Agree thresholds, data collection method, and accountable reviewer before the pilot starts. Report actuals separately from targets and anecdotes.

## 13. Cross-cutting engineering and release gates

1. **Community isolation:** every community read/write is scoped to the signed-in user's community; database RLS is authoritative.
2. **Authorization:** test resident, lead, platform admin, owner, tenant, household, pending, ended, and unauthenticated states where relevant. A hidden button is not a permission check.
3. **Private content:** test direct IDs, links, notifications, attachments, search results, exports, and stale sessions for unauthorized access.
4. **Audit and deletion:** define which changes need an audit record, how long records are kept, and what deletion means for derived indexes, external providers, and backups.
5. **Reliability:** make notification/webhook work idempotent; expose failures to the right operator; do not silently mark an item sent, processed, or paid when the provider did not confirm it.
6. **Platforms:** validate critical flows on Android, iOS, and PWA/web, including deep links, browser back, uploads, push permissions, and offline/error states.
7. **Design and accessibility:** follow the Verandah rules; provide readable status, keyboard/focus behavior on web, and accessible labels for interactive controls.
8. **Database changes:** use idempotent migrations, explicit RLS policies on every new table, server-enforced invariants, generated types, and `NOTIFY pgrst, 'reload schema';` at the end of schema-changing migrations.
9. **Validation:** `npx tsc --noEmit` is the documented validation gate; add focused behavioral checks where test infrastructure is introduced.
10. **Deployment readiness:** follow the environment-suffixed migration/type workflow in [`CLAUDE.md`](../CLAUDE.md). The preprod project reference is currently a placeholder, so provision/verify a usable preprod environment before relying on preprod rollout steps. Do not apply a proposed schema as part of this planning document.
11. **Documentation:** when work ships, move implemented user behavior into [`features.md`](../features.md), schema/access details into [`architecture.md`](../architecture.md), and update `.github/app-summary.md` only for a new module, tab, role, or major table.

## 14. Decisions to close before implementation

### Product and society policy

- Who may be president/vice-president under each society's bylaws, and can a non-resident owner hold the role?
- Which resident types and audience labels may be visible to neighbours?
- Who may approve owner, tenant, and household membership, including when a society has no lead?
- Which posts/events need comments or RSVP, and who moderates them?
- What issue statuses, response expectations, and escalation responsibilities are supported?
- Are polls advisory only, or is a separate formal voting product required?

### Data, providers, and operations

- Which data is sent to WhatsApp, AI, payment, gate, accounting, or hardware providers, under what terms, and for how long?
- Which private storage and document-processing approach meets the access and deletion requirements?
- Which WhatsApp and AI provider, business account, template approval, and operating owner are selected?
- What payment/accounting reconciliation and refund process is owned by the society versus Wooru?
- What support hours and emergency fallback apply to issues, SOS, visitor access, and device outages?
- What is the approved per-society budget and the decision owner for recurring third-party costs?

Record answers in the partner decision log before the dependent phase is treated as committed work.

## 15. Risks and controls

| Risk | Control / release gate |
|---|---|
| Owner/tenant claim grants the wrong person access | Lead approval, conflict handling, audit, and database-enforced membership checks |
| Private post, flat, or document leaks through a direct URL or notification | Permission checks at every read and delivery path; role-based test matrix |
| AI returns confident unsupported rules | Retrieval-only answer policy, page citations, no-answer state, human feedback, and pre-release evaluation |
| Sensitive files are exposed through image hosting | Private storage with access policy; no unsigned public document uploads |
| WhatsApp message reaches someone without consent or to the wrong flat | Explicit opt-in/out, verified identity, permission checks, template controls, and pause switch |
| Visitor, SOS, or gate service is unavailable during an incident | Documented human/manual fallback; never claim emergency response guarantees |
| Wooru is mistaken for a full accounting or payment platform | Product copy distinguishes the existing fund ledger from billing, settlement, and reconciliation |
| Integration cost or operating effort exceeds the model | Measure actual support and provider fees during pilot; require cost and support gate per integration |
| Competitor claim is repeated as verified fact | Keep public-page evidence caveats; ask vendors for a demonstration before claiming feature parity or absence |

## 16. Completion criteria

A proposed feature is ready to be called implemented only when:

- Its user workflow, roles, data access, error states, and operator responsibilities are documented and accepted.
- UI, server/database enforcement, notification behavior, and any external provider path are implemented end-to-end.
- Access-control and failure-mode checks pass for all relevant roles and platforms.
- Usage, support, privacy, cost, and rollback/disable mechanisms are in place.
- The production documentation states what is live, what limitations remain, and who operates the workflow.
- The pilot result is reported separately from the implementation claim; targets are not presented as outcomes.
