# Society document assistant: proposal

**Status:** proposal only. Nothing is built: no schema, storage bucket, server function or screen.
**Decisions taken (2026-11-16):** residents can ask questions in version 1, but only about documents marked public. Committee-only documents are planned from the start. The AI provider is not chosen yet.

## 1. The idea

A society's rules live in PDFs that few people read: bye-laws, AGM minutes, circulars, vendor contracts, the parking policy. When a question comes up, people ask the WhatsApp group, the secretary answers from memory and the same question comes back a month later.

With this feature, a committee lead uploads those documents once. A resident can then ask "Can I keep a pet?" or "What's the late fee on maintenance?" and get a short answer that quotes the document and page it came from. If the documents don't cover the question, the assistant says so and doesn't guess.

## 2. Why now: the competitor check

On 2026-11-16 we checked public product pages for MyGate, NoBrokerHood, ADDA, ApnaComplex, Emaar One, TownSq, Vantaca, AppFolio, Entrata, RealPage and ButterflyMX. On 2026-11-17, we added a homepage-level scan of 15 more society-platform vendors; the full evidence and limits are in the [Indian society-platform scan](../competitor-research/indian-society-platforms.md).

| Product | Closest feature | Document Q&A for residents or committees? |
|---|---|---|
| TownSq (US) | "Suggested Reply" drafts answers for managers from community documents and announcements ([townsq.io/ai](https://www.townsq.io/ai)) | Partly. It drafts replies for managers to send; residents and committees don't ask directly. |
| ADDA (India) | A resident chatbot for "everyday community questions", plus an AI helpdesk, invoice reading and a writing assistant ([adda.io](https://adda.io/)) | No public evidence that the chatbot answers from uploaded bye-laws or shows sources. |
| Vantaca (US) | Board packets, month-end financials, a staff "Knowledge Assistant" | It serves management staff, not committees or residents. |
| MyGate, NoBrokerHood, ApnaComplex, Emaar One | None found on their public pages | No public evidence. |
| Kamiti | Lists document management on its feature comparison | No resident document Q&A or cited answers were established on the reviewed homepage. |
| OSSAPP | Homepage metadata says "AI Society Book-keeping" | The visible page did not expose feature details, so this is not evidence of document Q&A. |
| Other 13 vendors in the 17 Nov scan | Society operations, gate/security, accounting and resident communication features; details in the linked scan | No reviewed homepage established resident document Q&A. |

**What the check did not cover.** These were public-page checks, not app tests or vendor demos. The 15-vendor scan was limited mainly to homepages and visible feature/pricing sections; it did not cover every product subpage, gated portal or app-store listing. Several other international HOA products and smaller bye-law chatbot vendors also remain unchecked. Treat this as a likely gap, not proof of uniqueness, and verify with vendors before making a competitive claim.

## 3. What Wooru has today

| Need | Today | Gap |
|---|---|---|
| Community scoping | Every community query is scoped with `get_user_community_id()` | None |
| Who uploads | `is_community_lead()` (president or vice-president) and `is_platform_admin()` | None |
| Server-side work | The app already calls hosted Supabase functions (`verify-phone-otp`, `fraud-check`) | Their source isn't in this repository; a new function would be |
| Vector search | Supabase Postgres supports the `pgvector` extension | Not enabled |
| File storage | Images go to Cloudinary through an unsigned, public upload preset. The `community-uploads` Supabase bucket exists but nothing writes to it | **Documents must not use Cloudinary.** They need a private bucket with access rules |
| AI provider | None | To be chosen (§7) |

## 4. How it works

1. **Upload.** A lead uploads a PDF, gives it a title and type (bye-laws, minutes, circular, contract, policy) and marks it **public** (all approved residents) or **committee** (leads only).
2. **Prepare.** A server function extracts the text, splits it into passages of a few paragraphs each, records each passage's page number and stores a search index alongside. The document shows "Ready" when this finishes, or "Couldn't read this file" if it fails.
3. **Ask.** A resident types a question on the assistant screen.
4. **Find.** The server searches only passages from documents the person may see: the same community, and public ones unless they're a lead.
5. **Answer.** The AI receives the question and the top few passages only. It must answer from them and cite each claim, for example *Bye-laws 2019, p. 14*. Tapping a citation opens the document at that page.
6. **No match.** If no passage is relevant enough, the reply is "Your society's documents don't seem to cover this. You may want to ask the committee." The question is logged so leads can see what people are asking that the documents don't answer.

## 5. Rules

- **Visibility is enforced in the database.** A resident's search never touches committee-only passages; it isn't left to the AI to hide them.
- **Answers always carry citations.** An answer without one isn't shown.
- **No guessing.** General knowledge, Indian law and other societies' rules are out of scope. Every answer carries the note *"Based on your society's documents. Not legal advice."*
- **Only leads upload, replace or remove documents.** Removing a document removes its passages and index at once.
- **Newer documents come first.** When two documents disagree, for example amended bye-laws, the answer prefers the newer one and mentions that an older version exists.
- **Limits.** Each resident gets a daily question limit (for example 20) to control cost and abuse.

## 6. Sketch of the data

The final names belong in `docs/architecture.md` once built.

- `society_documents`: community, title, type, visibility (`public` / `committee`), private storage path, effective date, status (`processing` / `ready` / `failed`), uploaded by.
- `society_document_chunks`: document, community, page, passage text, search vector. Row-level security repeats the document's visibility so a direct read can't bypass it.
- `society_document_questions`: who asked, question, whether an answer was found, cited passages, and a helpful/not-helpful flag. Leads see questions from their own community.
- A private storage bucket with read access limited by the same visibility rule.

## 7. Choosing a provider

Two jobs need AI: **indexing** passages for search and **writing** answers. Selection criteria:

- Contract terms that rule out training on customer data, and data handling that fits India's DPDP Act. Bye-laws and minutes can contain names, flat numbers and disputes.
- Good results in English first, then Telugu and Hindi.
- Cost per question. A rough, unverified estimate is under ₹10 to index a full set of society documents and ₹0.10 to ₹1 per question. Measure this in the pilot.

OpenAI and Google Gemini can do both jobs. Anthropic Claude writes answers but needs a separate indexing provider. Keep the provider behind the server function so it can change later without an app release.

## 8. Risks

| Risk | Mitigation |
|---|---|
| A confident wrong answer about a rule | Mandatory citations, the "not covered" reply, the not-legal-advice note and a helpful/not-helpful flag reviewed by leads |
| A committee-only document leaks to residents | Visibility enforced by row-level security on documents, passages and storage, not by the AI's instructions |
| Scanned PDFs have no text | Version 1 accepts text PDFs and flags scans as unreadable; text recognition comes in version 2 |
| Documents in Telugu or mixed languages | English only in version 1; test regional languages before promising them |
| Cost spikes | Daily limits per resident and per community, and a lead-visible usage count |
| Personal data in minutes | Privacy note at upload; leads can remove a document at any time |

## 9. Phases

**Version 1:** text PDF upload by leads, public and committee visibility, resident questions on public documents, cited answers, the "not covered" reply, a question log for leads, and daily limits.

**Version 2:** scanned PDFs, Telugu and Hindi, questions through WhatsApp once two-way messaging exists, answers that link to notices, and suggested FAQs drawn from frequent unanswered questions.

**Version 3:** owner-only documents, using the [owner and tenant visibility proposal](owner-tenant-visibility-proposal.md).

## 10. Open questions

1. Which AI provider will we use? (§7)
2. Will any document be visible to residents automatically, or must a lead choose a visibility each time?
3. Should leads be able to see who asked each question, or only the question text?
4. What daily limit will we use for the pilot?
5. Where does the assistant live: a card on the Community tab, or its own screen reached from it?

## 11. Pilot success measures

These are targets, not results:

- At least 70% of questions answered with a citation that leads judge correct.
- No case of a committee-only passage appearing in a resident's answer.
- Fewer repeat rule questions in the society's WhatsApp group, as reported by its committee.
