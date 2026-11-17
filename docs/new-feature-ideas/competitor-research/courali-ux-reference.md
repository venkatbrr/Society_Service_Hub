# Courali: Gated Community UX Reference

**Reviewed:** 15 November 2026

**Scope:** Desk review of the public Behance case study and its visual presentation. Courali is an independent portfolio concept, not a released product. Its author describes its research and personas as synthesized and the prototype as a concept; its workflows and screens are not evidence of validated resident demand or working integrations.

## Summary

Courali explores a gated-community app connecting apartment records, access, resident services and community life with the teams that receive and complete requests. The portfolio presents 33 task families, seven resident/operational workspaces and 140 screen containers. Those figures describe the concept's design scope, not a shipped product.

The strongest idea for Wooru is the end-to-end service journey: a resident should know what was recorded, who owns the next step, what milestone has been reached and how to recover if the result is delayed or wrong. Wooru should test this principle on one complete journey, such as issue tracking, rather than trying to reproduce Courali's breadth.

## Product and workflow patterns

| Courali concept | Potential Wooru application | Wooru status and caveat |
|---|---|---|
| **Personal Home overview** with community context, assigned bills, repair status and today's activity | Consider a concise "Needs your attention" area using only the resident's own existing events, reminders, orders and service visits. | Candidate UX improvement. Do not invent personal counts or display workflows that are not implemented. |
| **Issue journey:** request recorded → owner assigned → visit scheduled → completion reviewed | Pilot an issue record with a reference, category/location, optional evidence, named owner, resident-visible milestones, and accept/reopen actions. | Proposed; a general issue-tracking workflow was not identified in Wooru. Society staffing and response expectations must be agreed before launch. |
| **Order fulfilment milestones** for grocery and laundry | Make each stage clear to both the resident and the person fulfilling it; distinguish an order being submitted from being accepted or delivered. | Wooru has community pre-orders. Review the current flow before deciding whether additional status visibility is needed. |
| **Event participation** with capacity, guest rules and waitlist | Extend event RSVP only if societies need registration caps, guest counts or waitlists. Show confirmation and next steps. | Wooru events and RSVP exist; capacity and waitlist behavior require validation before being promised. |
| **Amenity journey:** availability → slot and guest details → approval → booking/pass | For a later facility-booking pilot, distinguish a request from a confirmed reservation and show capacity, rules and cancellation path. | Not identified as a current Wooru capability. Requires someone at the society to maintain availability and handle exceptions. |
| **Visitor journey:** invitation → identity/time details → gate validation → arrival or exception | If piloted, make the visitor's validity and gate decision explicit; a resident invitation must not imply automatic entry. | Visitor passes and gate validation are not current Wooru capabilities. Security operations, privacy and offline alternatives are prerequisites. |
| **Payment journey:** review charge → submit payment → reconcile → confirm settled status | If dues payments are introduced, show the payment state and receipt separately from the society ledger's settlement state. | Wooru's community-fund ledger is not maintenance-fee billing or payment settlement. Finance reconciliation and support are prerequisites. |
| **Role-specific workspaces** for management, finance, security and service providers | Begin with the smallest operational surface needed for a pilot, such as a lead's issue queue. Add separate staff views only when roles and handoffs are proven. | Wooru has lead/admin surfaces, but the concept's seven workspaces should not be treated as a Wooru scope requirement. |
| **Different resident and household roles** (tenant, non-resident owner, household member) | Validate whether society policies require different permissions and task visibility. | Requires product and governance discovery; do not infer permissions from the visual concept. |

## UX principles worth testing

1. **One shared record:** resident and receiving team refer to the same request, order or booking and its reference.
2. **Visible responsibility:** identify the team or person expected to act, or clearly state that the item is waiting for assignment.
3. **Meaningful milestones:** distinguish submitted, received, scheduled, in progress, completed and accepted where those states apply. A payment receipt, visitor invitation or repair completion is not automatically the final outcome.
4. **Actionable next step:** say what happens next and whether the resident needs to do anything.
5. **Recovery path:** provide a way to correct details, cancel, retry or reopen when the workflow permits it.
6. **Reuse patterns:** use the same progress, status and confirmation conventions across issues, orders and future bookings.
7. **Design for both sides:** each resident-facing action needs a practical receiving workflow and a named operational owner.

These are interaction principles to test, not a recommendation to copy Courali's interface. Wooru should follow its Verandah design system.

## What not to copy

- **The full scope:** 33 task families and seven workspaces are a concept's portfolio breadth, not a validated Wooru roadmap.
- **Unverified integrations:** access credentials, payment settlement, service dispatch and delivery tracking require real partners, operations, data and fallback behavior.
- **The visual direction:** Courali's purple gradients, glossy device mockups and 3-D imagery differ from Wooru's light, flat Verandah system.
- **Concept research as evidence:** synthesized personas and scenarios do not prove demand, usability, service capacity or measurable outcomes.

## Suggested Wooru sequence

1. **Review current journeys:** verify that existing pre-orders, events, provider visits and reminders communicate confirmation and the next step clearly.
2. **Pilot one complete issue workflow:** agree on ownership and response expectations, then provide a reference, status history, update path and resident acceptance/reopen step.
3. **Validate event capacity and waitlists:** add only if pilot societies identify a real coordination problem and can administer the rules.
4. **Defer amenity booking, visitor passes and dues settlement:** first establish demand, permissions, operational ownership, privacy protections and failure handling.

## Evidence and sources

- [Courali — Gated Community App | UI/UX Case Study](https://www.behance.net/gallery/257082685/Courali-Gated-Community-App-UIUX-Case-Study) — independent design portfolio by Hameed Hassan Ali; viewed 15 November 2026.
- The case-study description identifies Courali as a concept prototype and says its research/personas are synthesized. Screens and feature descriptions are design artifacts, not proof of a functioning product.
- [Wooru feature contracts](../../features.md) and [Verandah design guidance](../../verandah.md) — references for Wooru's documented current behavior and design constraints.
