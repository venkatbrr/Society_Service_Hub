# Emaar One: Product and UX Reference

**Reviewed:** 15 November 2026

**Scope:** Emaar One's public Google Play listing, six published app screenshots, and selected user reviews. This is a desk review, not hands-on testing; advertised features and review reports are not independently validated.

## Summary

Emaar One is a property-owner and resident app for Emaar developments. Its UX brings property details, payments, home services, amenity bookings and service requests into one property-focused experience. Some capabilities, such as digital handover, construction updates and sales launches, are specific to a property developer and are not a fit for Wooru's community-management product.

Wooru should borrow useful interaction patterns, not Emaar's visual styling or its developer-specific feature set. Any proposed Wooru capability below remains a proposal until it is implemented and validated.

## UX patterns Wooru can adapt

| Emaar One pattern | Potential Wooru adaptation | Status and caveat |
|---|---|---|
| **Home screen with quick actions** for services, amenities, requests and contractor access | Surface a small set of high-use actions such as report an issue, find a provider, view events or contact the help desk. Prioritize completed journeys over adding more tiles. | Use only actions that are available to that resident. Keep labels short and avoid partially hidden horizontal tiles. |
| **Property context shown across service screens** with a Change action | Show the resident's flat and community context on tasks where it prevents acting on the wrong home. | A context label is a UX safeguard, not a promise of multiple-community support. Wooru users are scoped to a community. |
| **A "What's new" area** on Home | Preview a few relevant upcoming events and community updates, with a clear route to the full list. | Events exist in Wooru; an official-notice feed is not identified as a current feature. Avoid mixing official notices with resident discussion. |
| **Prominent status or warranty message** | Show genuinely actionable personal information, such as an assigned issue update or an upcoming reminder. | Do not show issue counts or workflow statuses until those data and workflows exist. |
| **WhatsApp contact affordance** visible from service screens | Keep a clear help/contact route near the task, with consistent behavior. | Wooru has outbound contact actions. A Wooru-owned two-way WhatsApp conversation and status updates are proposed, not live. |
| **Search, booking history and service categories together** | Make it easy to find a local provider and return to a resident's own prior service activity. | Build on Wooru's local-provider model; do not imply that Wooru is integrated with Emaar's paid service catalogue. |
| **Amenity booking in a short sequence:** choose facility, date, duration and time, then confirm | If facility booking is validated, use clear availability, simple date/time choices, and an always-visible confirmation action. | Facility booking is not identified as a current Wooru feature. Society-specific capacity, rules, cancellation and ownership need validation first. |
| **Payments grouped by purpose** with due dates and history | For a future dues feature, show amount, reason, due date, payment state and receipt/history together. | Wooru's community-fund ledger is not maintenance-fee billing or payment settlement. Auto-pay would require explicit authorization and support for cancellation/reconciliation. |
| **Profile settings grouped by topic** | Group account, security and help settings so residents can scan them quickly. | Apply within Wooru's existing navigation and Verandah design system. |
| **Vacation mode** | Explore an optional away-period setting if residents and societies identify a clear use, such as pausing noncritical reminders. | This is an idea only; avoid implying that it changes gate access, emergency coverage or delivery handling without integrations and operating rules. |
| **Shareable guest passes, QR booking passes, calendar actions and voice requests** | Consider WhatsApp-shareable visitor details, calendar links for events/bookings, and voice-note intake in a future issue-reporting flow. | Visitor passes, QR credentials, facility booking and two-way WhatsApp are not current Wooru capabilities. Each needs operational, privacy and fallback design. |

## Reliability and usability lessons

Some Play Store reviews report form data being lost after switching apps, pages or images failing to load, a primary button being obscured by system navigation, and a tenancy-renewal process that does not match the resident's actual task. These are individual user reports, not independently reproduced defects, but they point to useful quality checks for Wooru:

- Preserve in-progress input when a user changes apps or returns to a form.
- Keep primary actions visible above device safe areas and test on small screens.
- Make loading, failure, retry and completion states explicit.
- Give every submitted request a reference, a visible status and a clear next step.
- Design the workflow around the real task, not a sequence of unrelated workarounds.

## What not to copy

- **Developer-only journeys:** property handover, construction updates, sales launches, developer loyalty offers and warranty administration.
- **Unvalidated operational commitments:** a booking, visitor-pass or issue-report UI is not enough without staff ownership, availability data, response expectations and offline alternatives.
- **The visual treatment:** Emaar's blue gradients and raised cards do not match Wooru's Verandah design system. Reuse the information hierarchy and interaction ideas, not the styling.
- **Feature density for its own sake:** quick actions should remain concise and complete on the screen; do not hide core actions in clipped or ambiguous carousels.

## Recommended Wooru priorities

1. **Low-dependency UX improvements:** clarify the flat/community context on relevant screens, keep contact access close to tasks, improve the visibility of existing events and provider journeys, and test that primary actions remain visible on small screens.
2. **Only after the underlying workflows exist:** add personal issue status and a focused "Needs attention" summary. Never display placeholder counts or promise response times the society cannot meet.
3. **Validate before building:** facility reservations, visitor passes, dues payments, vacation mode and WhatsApp voice intake. Confirm demand, operational ownership, privacy requirements and failure handling with pilot societies.

## Evidence and sources

- [Emaar One on Google Play](https://play.google.com/store/apps/details?id=com.emaartechnologies.emaarone&hl=en) — public listing, feature descriptions, screenshots, update notes and user reviews.
- Emaar One's six screenshots reviewed from the Google Play listing on 15 November 2026. The screenshots are visual references, not proof that every feature is available to every resident.
- Review comments summarized above are user-submitted Play Store reports and were not reproduced in the app.
- [Wooru feature contracts](features.md) and [Verandah design guidance](verandah.md) — references for current Wooru behavior and design constraints.
