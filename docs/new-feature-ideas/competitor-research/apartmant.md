# Apartmant Resident App: Product and UX Analysis

**Reviewed:** 15 November 2026

**Scope:** Public Apartmant product pages and their published UI images, compared with Wooru's repository documentation and current screen implementation.

## Executive summary

Apartmant (아파트먼트) presents itself as a connected apartment-operations platform, not just a resident social app. Its resident app links visitor and vehicle registration, access hardware, facility booking, fee information, community communication, surveys and voting to management and security workflows.

The most useful lesson for Wooru is the **complete service loop**: a resident can submit a request, see its status, and receive a management response, while staff can process and track the work in a connected operational surface. The reviewed Wooru documentation shows strong resident-to-resident services, events, emergency information and community-fund ledgers, but no general maintenance-issue tracker, official-notice feed, amenity-booking flow, visitor pass, or resident survey/vote flow.

**Recommendation:** improve access to Wooru's existing actions first; pilot a simple community notices and issue-tracking workflow with a named human owner; and validate amenity booking or visitor registration with individual societies before making either a core promise. Defer hardware-dependent access control, integrated maintenance-fee billing, and formal electronic voting until operating partners, costs, privacy safeguards and demand are established.

## 1. What Apartmant advertises

Apartmant's public materials describe several connected products:

- **Resident app:** visitor-vehicle pre-registration, A-PASS mobile access authentication, community-facility booking, community boards and Q&A, second-hand trading, surveys and votes, maintenance-fee checks, defect reports, moving/elevator reservations, and fire self-inspection.
- **Community V2:** facility discovery and booking, notices, orders and payments, QR entry and payment, booking/class management, and a connected operations dashboard.
- **Admin web:** household and parking information, resident vote setup and result aggregation, fee-data management, complaints, and commercial-facility operations.
- **Guard app and parking operations:** patrol/work logs, parking enforcement, visitor handling, access equipment and related integrations.

The resident-app home-screen image also depicts shortcuts for access QR, payment QR, reservations, orders and coupons, with a list of that day's booked facilities. These are features shown in a vendor image; availability and configuration may depend on the apartment and connected services.

Apartmant claims its community system has operational know-how from more than 200 complexes and describes a **30% labor-cost reduction** for operators. These are vendor statements, not independently verified benchmarks. This review did not test the installed app, obtain a customer reference, or validate availability of each capability in a specific complex.

## 2. UI and UX review

The observations below are based on Apartmant's product pages and published screenshots, not hands-on use of the app.

| UI example | What it communicates | Potential lesson for Wooru |
|---|---|---|
| [Resident app home screen](https://www.apartmant.co.kr/assets/community-app-home--ijIxK1Z.webp) | A personal overview surfaces access, payment, today's reservations, orders and coupons. | Consider a compact "Today / Needs attention" area using Wooru data that already exists, rather than adding more feature tiles. |
| [Facility booking screen](https://www.apartmant.co.kr/assets/resident-app-community-booking-DQbt9yQR.webp) | A facility's image, location, operating hours, open status, price and booking action sit together. | Present the information needed to decide beside the action. Make availability, price and any booking rules explicit. |
| [Visitor vehicle screen](https://www.apartmant.co.kr/assets/resident-app-visit-car-BZZzCG2y.webp) | Each vehicle has a visible registration period and a status such as scheduled, entered or overdue; repeat booking is offered. | If Wooru pilots visitor registration, make status, validity and correction/cancellation obvious. |
| [Community communication screen](https://www.apartmant.co.kr/assets/resident-app-communication-BAZ0qosz.webp) | Discussion, marketplace and Q&A are separated into labeled sections, with simple engagement counts. | Keep future community content categorized. Do not mix official notices, open discussion and sensitive complaints in one feed. |
| [Survey screen](https://www.apartmant.co.kr/assets/resident-app-survey-C917iTiJ.webp) | Active and completed surveys are separated, with deadline and participation information visible. | For any future polls, show the closing date, whether the resident responded and the result/next step. |
| [A-PASS image](https://www.apartmant.co.kr/assets/resident-app-apass-CV9sfm4f.webp) | The phone is presented as an access credential connected to physical access equipment. | Treat digital entry as a hardware-and-operations integration, not as a screen-only feature. |

### UX principles worth testing

1. **Personal relevance:** show today's events, upcoming service visits, open orders or reminders, and unread community notices in one prioritized overview.
2. **Clear state:** label processes as submitted, assigned, awaiting information, resolved or closed; do not make residents guess whether someone has acted.
3. **Action near context:** place booking, follow-up, contact or cancellation beside the details that explain the action.
4. **Separate content by intent:** distinguish official information, resident discussion, requests requiring staff action and transactions.
5. **Graceful failure:** physical access, visitor entry and urgent building information need a staffed or offline fallback when an app, network or device fails.

These are patterns to evaluate, not a recommendation to copy Apartmant's screens or visual style. Wooru should continue using its Verandah design system and test the discoverability of its existing five-tab navigation; its bottom navigation already supplies accessibility labels for the tabs.

## 3. Feature comparison with Wooru

This comparison reflects the repository's current feature documentation and screens. **"Not found" means no equivalent was identified in the reviewed sources; it is not proof that no prototype or unreviewed deployment exists.**

| Apartmant capability | Wooru evidence today | Assessment |
|---|---|---|
| Repair / defect reports and complaint-status management | Wooru supports provider directories and scheduled shared service visits. A building/common-area issue intake and assigned resolution workflow was not found. | **Meaningful gap.** A scheduled provider visit is not a maintenance ticket with an accountable staff owner and resident-visible status. |
| Official community notices | Wooru has community events and a notification feed, but no resident-facing official-notice module was identified. Announcement-related federation tables exist, but documentation says no screen uses them. | **Meaningful gap.** An event is not a substitute for a dated, acknowledged building notice. |
| Facility booking and classes | Community events can be listed; there is no timed amenity inventory, slot-capacity or facility-booking flow identified. | **Potential pilot.** Depends on facility rules, capacity and someone maintaining availability. |
| Visitor pre-registration and access | Wooru has resident onboarding, emergency information and service-visit coordination, but no visitor pass, vehicle registry or access hardware integration identified. | **Pilot only after operational validation.** Requires a staffed security workflow; access control also requires hardware and fallback procedures. |
| Surveys and electronic voting | No resident survey/voting flow identified. | **Start with non-binding pulse surveys.** Formal voting requires eligibility, auditability, privacy and society-specific rules. |
| Maintenance-fee review and settlement | Wooru has community-fund ledgers, payment-method recording and resident-visible CSV export. Its event-entry fee is display-only, and no maintenance-fee billing or payment settlement was identified. | **Do not equate the funds ledger with fee billing.** A billing/payment product introduces reconciliation and support obligations. |
| Resident discussion, Q&A and resale | Wooru's MCN contains resident businesses, pre-order food, parent connections and carpools. Borrow & Share is built but currently hidden; no general discussion board or Q&A forum was identified. | **Optional, not a first priority.** Moderation and abuse handling are essential; the hidden feature's low engagement is documented. |
| Move/elevator reservations | No equivalent was identified. | **Defer** unless a pilot society demonstrates frequent moving conflicts and can administer the schedule. |
| Fire self-inspection | Wooru's SOS surface provides emergency contacts and an opt-in donor list, not a fire inspection workflow. | **Defer.** The app must not imply it replaces required inspections or trained personnel. |
| Guard and parking operations | Wooru includes community leadership tools and an admin console, but a guard patrol, parking enforcement or gate-operations app was not identified. | **Do not build an operations suite by assumption.** Validate with guards and society managers; partner if integrations are required. |
| Integrated QR facility entry and payment | Wooru's pre-order flow allows pay-on-delivery by UPI or cash. It does not provide integrated facility QR entry or settlement. | **Later-stage opportunity.** Requires payment reconciliation, refunds, vendor operations and support. |
| Coupons / resident benefits | Coupons are shown in an Apartmant home-screen image; availability and commercial terms are unclear. No equivalent Wooru capability was identified. | **Low priority** until there is evidence of resident demand and a sustainable partner-funded model. |

### Wooru strengths to preserve

Wooru already focuses on trusted local providers, shared service visits, resident-run business listings, food pre-orders, parent connections, carpools, community events, transparent fund ledgers and emergency support. The opportunity is to make these experiences more discoverable and dependable, then fill validated operational gaps—not to displace the product's neighborhood-services focus.

## 4. Recommended priorities

### WhatsApp can be a channel, but two-way support is not live

Wooru already provides outbound Call/WhatsApp contact actions in several resident journeys and WhatsApp-ready shared links with previews. The repository does not contain an inbound WhatsApp webhook or Cloud API conversation flow, so residents cannot currently report an issue to Wooru or receive its status updates through a Wooru WhatsApp number.

A proposed extension is a single Wooru-owned WhatsApp number for residents to ask questions, place eligible orders or report issues, with the durable record and assigned owner kept in Wooru. Residents would need to link their Wooru account and opt in. This is a proposed channel for future pilots, not an implemented capability or a substitute for assigning staff to respond.

The pilot depends on a verified WhatsApp Business Platform setup, webhook and message handling, account-linking and unlinking, privacy controls, and monitoring for delivery failures. Free-form replies are limited to the 24-hour customer-service window; messages outside it require approved templates and may incur fees. This does not provide access to existing society WhatsApp groups. Validate eligibility, costs, consent and response ownership before making it a resident-facing promise.

### Priority 1 — Improve the resident's starting point

Test a compact dashboard or clearer "What's happening / Needs your attention" entry point using only existing Wooru data: upcoming events, the resident's own open orders, scheduled service visits, due reminders, relevant notifications and fund updates. Do not present community-wide counts as personal tasks. Measure time to find the action and whether residents complete it.

### Priority 2 — Pilot official notices and a basic issue tracker

Run a small pilot with one or two willing societies. The app can be the source of truth, with an opt-in WhatsApp channel considered for intake and status updates only after the setup and operating requirements above are met. A useful minimum workflow would include:

- a society-approved notice with author, date, category and expiry/archive behavior;
- a resident issue submission with category, location and optional photo;
- a named management/lead owner and clear status updates;
- a resident-visible history and a safe way to add information or reopen a request;
- permissions and retention rules appropriate to community-scoped records; and
- an operating agreement that identifies who responds and in what expected timeframe.

The main product risk is not lack of an input form; it is creating an expectation of response without assigning staff capacity. Validate ownership and response performance before promoting this as a service.

### Priority 3 — Validate reservations and visitor registration separately

Interview residents, community leads and security staff. For facility booking, confirm which amenities need slots, capacity limits, cancellation rules, fees and who updates availability. For visitors, map the actual gate process first; try a low-risk registration/notification pilot before integrating barriers or issuing digital credentials. Provide non-smartphone and outage alternatives.

### Defer pending proof

- **Access-control hardware, lobby phones, parking barriers and unmanned entry:** capital cost, on-site installation, security liability, maintenance and vendor dependence.
- **Maintenance-fee billing and integrated settlement:** a new financial and support responsibility; Wooru's existing fund ledger is not equivalent.
- **Binding electronic votes:** governance rules, voter eligibility, audit trail and dispute handling need validation.
- **Broad resident social feed, coupons and multiple commerce categories:** risk of moderation burden, low engagement and feature overload.
- **Fire inspections and regulatory workflows:** only with qualified operational guidance and clear accountability.

## 5. Business and operating implications

Apartmant's differentiator appears to be the **connected operating system** across resident, administrator, guard and physical-site workflows. This can create a stronger value proposition than a resident app alone, but it also means installation, configuration, staff adoption, training and ongoing support are part of the product.

For Wooru, a sensible progression is:

1. Improve adoption and reliability of existing resident features.
2. Verify whether communities will assign a real person to notices and issue follow-up.
3. Measure pilot activity and response time before proposing a paid operations tier.
4. Consider integrations only when target societies, hardware partners, deployment cost and support ownership are known.

The competitor's labor-reduction percentage, adoption footprint, and operational outcomes should not be used as Wooru forecasts or as independently proven results.

## 6. Risks and open questions

- **Vendor-claim risk:** public pages describe advertised capabilities; they do not prove availability, adoption, uptime or outcomes for every building.
- **Local-fit risk:** Apartmant is positioned for South Korean apartment complexes. Building governance, access equipment, payments, language and operational processes may differ in India.
- **Hardware and service dependency:** access, parking and QR operations depend on compatible devices, connectivity, site installation and staff processes.
- **Privacy and safety:** visitor/vehicle records, resident discussions, voting and issue photos can expose sensitive information. Data minimization, access controls, retention, moderation and escalation need to be designed.
- **Digital-access risk:** do not make gate entry, emergency assistance or society participation exclusive to residents with a compatible smartphone.
- **Operational-capacity risk:** a digital complaint channel can increase frustration if nobody owns the queue or provides updates.
- **Scope risk:** trying to match every listed feature could dilute Wooru's core resident-to-resident services and increase maintenance burden before demand is shown.

Questions to answer through discovery:

1. Which operational problems do Wooru's target societies currently handle in paper, WhatsApp or calls?
2. Who will own each incoming request, and what response-time promise can the society actually support?
3. Which amenities have enough demand and clear enough rules to justify reservations?
4. How do guards register visitors today, and what happens when the phone, network or access system is unavailable?
5. What level of financial recordkeeping and payment settlement do societies expect from Wooru?
6. What resident segment needs assisted or offline access?

## 7. Evidence and sources

### Apartmant product sources

- [Resident App](https://www.apartmant.co.kr/en/residentApp/) — advertised resident features and integration narrative.
- [Community V2](https://www.apartmant.co.kr/en/community/) — facility booking, notices, orders/payments and operational dashboard claims.
- [Admin Web](https://www.apartmant.co.kr/en/admin/) — household, parking, voting, complaint and commercial-management claims.
- [Platform overview](https://www.apartmant.co.kr/en/platform/) — resident app, community system, guard app and admin product descriptions.
- [Parking system](https://parking.apartmant.co.kr/en/parking/home/) — visitor access, enforcement and physical parking-control system claims.
- [Published resident-app home-screen image](https://www.apartmant.co.kr/assets/community-app-home--ijIxK1Z.webp).
- [Published facility-booking screen](https://www.apartmant.co.kr/assets/resident-app-community-booking-DQbt9yQR.webp).
- [Published visitor-vehicle screen](https://www.apartmant.co.kr/assets/resident-app-visit-car-BZZzCG2y.webp).
- [Published community-board screen](https://www.apartmant.co.kr/assets/resident-app-communication-BAZ0qosz.webp).
- [Published surveys screen](https://www.apartmant.co.kr/assets/resident-app-survey-C917iTiJ.webp).
- [Published A-PASS image](https://www.apartmant.co.kr/assets/resident-app-apass-CV9sfm4f.webp).

### Wooru repository sources

- [Application summary](../../../.github/app-summary.md) — current product modules and roles.
- [Feature contracts](../../features.md) — per-screen behavior, including the [Community tab](../../features.md#74-community-tab-app-tabscommunitytsx), [events](../../features.md#community-events--appevents), [funds](../../features.md#6-funds), and [notifications](../../features.md#8-notifications).
- [Feature status index](../../disabled-features.md) — in particular [hidden community-business ordering](../../disabled-features.md#2b-community-business-in-app-ordering--ui-hidden-2026-08-09).
- [Hidden schools and Borrow & Share detail](../../hidden-features/mcn-schools-and-borrow.md) — why some built features are not currently surfaced.
- [WhatsApp contact helpers](../../../lib/phone.ts) and [WhatsApp integration proposal](../../presentations/whatsapp-integration.html) — current outbound links versus the researched, unimplemented two-way design.
- [Global navigation](../../../components/GlobalBottomNav.tsx) — resident tab labels and screen-reader labels.
- [Community screen](../../../app/(tabs)/community.tsx) — events and funds overview.
- [MCN screen](../../../app/(tabs)/network.tsx) — resident business, food, parents and carpool modules.
- [Feature flags](../../../constants/featureFlags.ts) — current visibility of Schools Catalog and Borrow & Share.
