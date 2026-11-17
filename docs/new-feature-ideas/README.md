# New feature ideas

This folder collects proposals for Wooru and the competitor research behind them. Proposed features here are not built; the research describes other products and is not evidence of Wooru functionality. For what the app does today, read [`features.md`](../features.md).

The [feature landscape implementation plan](implementation-plan.md) expands the partner presentation into dependency-aware delivery phases, gates, and pilot measures. It is a working plan, not an approved scope or delivery commitment.

## Proposals

Designed features that haven't been built.

| Proposal | What it adds |
|---|---|
| [Owner and tenant visibility](proposals/owner-tenant-visibility-proposal.md) | Flat membership, lead approval and access rules. Includes posts and events for owners, tenants, one household/flat, a block or a group, with official notices reserved for leads. Also checks competitor evidence. |
| [Society document assistant](proposals/society-document-assistant-proposal.md) | Residents ask questions about uploaded society documents (bye-laws, AGM minutes, circulars) and get answers that cite the page. Covers the competitor gap, visibility rules, risks and phases. |

## Competitor and UX research

Where many of the ideas came from. These describe other products, not Wooru.

| Document | What it covers |
|---|---|
| [Apartmant](competitor-research/apartmant.md) | Advertised resident, management, guard and parking features, UX notes, gaps, and which ideas to adopt, pilot or defer. |
| [Emaar One](competitor-research/emaar-one.md) | Feature and screenshot review from Google Play, UX patterns Wooru could adapt, and reported usability problems. |
| [Courali](competitor-research/courali-ux-reference.md) | A gated-community design concept on Behance: end-to-end request ownership, visible status steps and recovery patterns. It's a portfolio piece, so its research and screens aren't proof that real users want these features. |
| [Indian society-platform scan](competitor-research/indian-society-platforms.md) | Public-page review of 15 additional vendors, their advertised features and pricing, plus limitations and relevance to Wooru. |

## Related material kept elsewhere

- **Presentations** stay in [`../presentations/`](../presentations/), because the web build publishes that folder at `/presentations/`. The [market and economics deck](../presentations/wooru-one-app-market-and-economics.html) summarises most of these ideas (slide 3 compares competitors and slide 7 covers the document assistant).
- **Implementation plan:** [feature landscape implementation plan](implementation-plan.md) covers the proposed capabilities represented in the partner deck and separates current Wooru behavior from proposals and vendor-dependent concepts.
- **Engineering plans** that were written before these discussions, such as cross-community pre-orders and the two-environment setup, stay in [`../new_features_to_implement/`](../new_features_to_implement/).

When a proposal gets built, move its feature description into [`features.md`](../features.md) and its schema into [`architecture.md`](../architecture.md), then delete it from this folder or mark it as done.
