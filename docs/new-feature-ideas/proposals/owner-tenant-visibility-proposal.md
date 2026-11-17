# Owner and tenant visibility — proposal

**Status:** proposal only, nothing built. No schema, RLS or UI exists for this yet.
**Decisions already taken:** owners who live elsewhere are included; the resident picks their type and a president or vice-president approves it; the split covers funds, dues, governance, notices, issues, flat records, the directory and community roles.
Residents and community leads can target posts and events to an audience. Only presidents and vice-presidents publish official notices. A household audience means the approved members of one specific flat.

## 1. Why

In an Indian gated society, owners and tenants have different stakes in the same flat:

- **Owners** pay maintenance and corpus contributions, vote in the association (RWA) under its bye-laws, can be elected to its committee, and keep the flat's records.
- **Tenants** live there every day: they raise issues, receive visitors, use amenities and take part in community life. Most bye-laws don't give them association votes or access to the society's finances beyond what affects them.

Wooru treats everyone the same way today, so it can't show an owner-only notice, run an owners-only vote or let an owner who lives elsewhere follow their flat.

## 2. What exists today

| Concept | Today | Gap |
|---|---|---|
| Account ↔ flat | `profiles.flat_id` / `flat_number`: exactly **one** flat per account, one community | An owner with two flats, or one living elsewhere, can't be represented |
| Flat inventory | `community_flats` (verified units; `occupant_name` is a best-guess label taken from the fund ledger) | No record of who owns a flat versus who lives in it |
| Roles | `app_role`: `admin`, `resident`, `president`, `vice_president`; fund roles `treasurer` and `collector` | No owner/tenant dimension |
| Funds | Per-flat contribution roll, collectors, public aggregate links | Everyone in the community can see the roll |
| Directory | `get_residents_directory`: name, flat, role badge, and phone for leads only | No type badge |
| Notices, polls, dues, issue reports | **Not built** | The split can be designed into them from the start |

## 3. Proposed model

### 3.1 Resident types

| Type | Who | Lives in the flat |
|---|---|---|
| `owner_resident` | Owner living in the flat | Yes |
| `owner_absentee` | Owner who rents the flat out or lives elsewhere | No |
| `tenant` | Lease holder living in the flat | Yes |
| `household` | Family member or co-occupant of an owner or tenant | Yes |

`household` inherits **resident** rights (issues, visitors, events) from the flat but never **owner** rights (votes, dues, owner notices) unless the association explicitly allows a nominated co-owner.

### 3.2 Flat membership, not a profile field

Store the relationship on a new **flat membership** record — one row per person per flat — instead of a single column on `profiles`. Reasons:

- An absentee owner belongs to a flat they don't live in, and may own several.
- A flat can have an owner and a tenant at the same time; each needs their own row.
- Tenancies end. Keeping history (start and end dates) avoids losing the owner's record when a tenant moves out.

Conceptual fields: community, flat, person, type, status (`pending`, `active`, `ended`, `rejected`), approved by, approved at, valid from, valid until, and the reason for any rejection or ending.

`profiles.flat_id` stays as the person's **home flat** for existing screens. For an absentee owner it would be empty or point to where they live, if that's in the same society.

### 3.3 Approval flow

1. During onboarding (or from Profile), the resident chooses their flat and type.
2. The membership is created as **pending**. Until it's approved, the person gets ordinary community access (directory, MCN, events) but nothing owner-only.
3. A president or vice-president sees the request in the existing flat-request queue (`list_pending_flat_addition_requests` is the natural home) and approves or rejects it with a reason.
4. Approval activates the membership; the resident gets a toast and a notification.
5. **Conflicts are flagged, not blocked:** a second owner on the same flat, a tenant on a flat with no owner, or someone claiming owner on a flat already marked as rented. The lead decides; joint owners are legitimate.
6. A tenant moving out is ended by the tenant, the owner or a lead. The owner is notified.
7. A lead can't approve their own owner claim; another lead or the platform admin must do it. In a society with only one lead, it goes to the platform admin.

Documentary proof (sale deed, rental agreement) is **not** collected in v1. It raises the DPDP storage burden; the lead's local knowledge is the check, and every decision is audited.

## 4. Visibility and permission matrix

✅ = full · 👁 = limited view · ❌ = none · (L) = leads also see everything, as today

| Area | Owner (resident) | Owner (absentee) | Tenant | Household | Notes |
|---|---|---|---|---|---|
| **Community funds**: totals, spending, balance | ✅ | ✅ | ✅ | ✅ | Aggregates are already public through fund links |
| Funds: per-flat contribution roll | ✅ | ✅ | 👁 own flat only | 👁 own flat only | Avoids tenants auditing owners' payments |
| Funds: contribute / be recorded as payer | ✅ | ✅ | ✅ | ✅ | Payment is voluntary; whoever pays is recorded |
| Treasurer / collector role | ✅ | ✅ remote treasurer only if the lead agrees | ✅ collector only | ❌ | Treasurer holds association money and should be an owner |
| **Dues** (future): invoices and statement for the flat | ✅ | ✅ | 👁 if the owner shares it | ❌ | The owner is liable; the tenant often pays in practice |
| Dues: pay | ✅ | ✅ | ✅ | ❌ | Payment is credited to the flat, not the person |
| **Governance** (future): owners' polls, AGM votes | ✅ one vote per flat | ✅ one vote per flat | ❌ | ❌ | Joint owners nominate who votes |
| Governance: community opinion polls | ✅ | ✅ | ✅ | ✅ | For things like an event date or an amenity timing |
| Governance: meeting minutes and resolutions | ✅ | ✅ | 👁 resolutions that affect residents | 👁 same as tenant | |
| **Notices** (future): "everyone" | ✅ | ✅ | ✅ | ✅ | The author picks the audience |
| Notices: "owners only" | ✅ | ✅ | ❌ | ❌ | Dues revisions, AGM, legal matters |
| Notices: "residents only" | ✅ | ❌ | ✅ | ✅ | Water shutdown, pest control |
| **Issues** (future): raise for own flat | ✅ | ✅ | ✅ | ✅ | |
| Issues: raise for common areas | ✅ | ❌ | ✅ | ✅ | An absentee owner can't see common areas |
| Issues: follow their rented flat's issues | — | ✅ status only | — | — | The owner is told about structural or major issues |
| **Flat records**: parking, household members, documents | ✅ | ✅ | 👁 their household and vehicles | 👁 read-only | The owner controls the flat's permanent records |
| Flat: approve or end a tenant | ✅ | ✅ | ❌ | ❌ | The lead remains the fallback |
| **Directory**: appear in it | ✅ | ✅ in an "Owners elsewhere" section | ✅ | ✅ | The type badge is visible only to leads, plus "Tenant" for neighbours if the community chooses to show it |
| Directory: see phone numbers | (L) | (L) | (L) | (L) | Unchanged: leads only |
| **Community roles**: president / vice-president | ✅ | ⚠ only if the bye-laws allow it | ❌ | ❌ | A platform-admin setting per community |
| Block in-charge, event coordinator | ✅ | ❌ | ✅ | ✅ | Hands-on roles; anyone who lives there |
| Moderation: report listings, drops, providers | ✅ | ✅ | ✅ | ✅ | Unchanged |
| MCN, providers, carpools, events | ✅ | ✅ | ✅ | ✅ | Community life; absentee owners mostly browse |

### Things deliberately *not* split

- Providers, saved items, ratings, MCN business listings, food drops and carpools: these are about daily living and the neighbourhood economy, not ownership.
- SOS and emergency numbers: everyone, always.
- Public fund aggregates: already public by design (`architecture.md` → Public fund RPCs).

## 5. Enforcement rules

- **Every owner-only rule is enforced in the database (RLS or a `SECURITY DEFINER` check), not just hidden in the UI.** The precedent is the resident-email work: hiding it in the UI alone would have been "theatre".
- Add helpers alongside `is_community_lead()`: `is_flat_owner(uid, flat_id)`, `is_owner_in_community(uid)` and `resident_type_for(uid, flat_id)`. Policies call these instead of reading the membership table inline.
- The app reads the user's active memberships once through `useAuth()` (in the same way as `isCommunityLead`) and exposes `isOwner`, `isTenant` and `ownedFlatIds`.
- A **pending** membership grants nothing beyond today's resident access.
- When a membership ends, access stops immediately; history (past contributions, past votes) stays attributed.
- The platform admin keeps the override through `platform_*` functions.
- Audit every create, approve, reject and end action with the existing `set_audit_actor` / `set_audit_context` pattern.

## 6. Edge cases

| Case | Handling |
|---|---|
| Joint owners (spouses, siblings) | Several owner memberships on one flat; one is marked as **voting nominee** |
| Owner sells the flat | The lead ends the old owner's membership and approves the new one; the old owner's history stays |
| Tenant becomes owner | End the tenant membership and create an owner one; no new account |
| Absentee owner and their tenant both have Wooru | Two memberships on the flat. The owner sees flat-level dues and issues; the tenant sees daily life |
| Owner of two flats | Two memberships. Dues and votes are per flat; the UI has a flat switcher (Emaar-style property bar) |
| Absentee owner in a different Wooru society | Out of scope for v1. Today, `profiles.community_id` allows one community per account. Federation could cover it later |
| A lead's tenancy ends | They lose the lead role only if the bye-laws require owners. The platform admin is told |
| Nobody approves (no lead) | Memberships wait as pending, and the platform admin can approve them. This matches today's leaderless-community behaviour |
| Wrong type claimed (tenant says owner) | The lead rejects it with a reason; repeated claims are visible in the audit log |

## 7. User experience

- **Onboarding:** after choosing a flat, the resident sees "I am the… Owner, living here / Owner, living elsewhere / Tenant / Family member", then the message "Your president will confirm this. You can use Wooru normally until then."
- **Profile:** a "My flats" card lists each flat with its type and status (Pending / Active). Here a resident can add a flat or end a tenancy.
- **Lead queue:** one combined "Flat requests" list showing the claimed type and any conflict warning.
- **Absentee owner home:** a lighter view with their flat's dues, issues, owner notices and polls first; community life follows.
- **Posts, events and notices composer:** an audience picker, described below. Only leads get the official-notice option. Formal polls still follow their separate voting rules.
- Use plain wording: say "Owner" and "Tenant", never "absentee". Badges are visible to leads only by default.

### 7.1 Choose who sees a post or event

**Proposed, not built.** Events already exist; audience restrictions would be new. This does not change the visibility of existing events automatically.

When creating a post or event, the author chooses **Who can see this?** before publishing. The same choice controls the feed, event details, attachments, comments, RSVPs, search and notifications.

| Audience | Who receives it | Example |
|---|---|---|
| Everyone in this society | All approved community members, including owners living elsewhere | A society anniversary event |
| Owners only | Active, approved resident and non-resident owners | A discussion about a proposed corpus contribution |
| Tenants only | Active, approved tenant members, not everyone registered at a rented flat | A tenant welcome session |
| Residents living here | Resident owners, tenants and household members; not owners living elsewhere | Pest-control preparation |
| One household / flat | Active, approved members of the selected flat, including its non-resident owner | A discussion among B-204's members about a repair visit |
| One block | Approved members linked to flats in the selected block | A Block B cleaning day |
| A group | Active members of a permission-controlled Wooru group | A gardening-group meetup |

These are Wooru audiences, not existing WhatsApp groups. Groups and group membership controls would also need to be built. For the first release, allow one audience per item; combined filters can wait.

**Who can publish**

- Residents and leads can create ordinary posts and events. Resident-created content is labelled with the author's name, not presented as an official announcement.
- Residents can target a restricted audience only if they belong to it. An owner cannot post to tenants only just because they own a rented flat. A resident can select only their own approved flat, block or groups.
- Presidents and vice-presidents can address any audience within their society for community business. An admin role does not make someone an owner or give them an association vote.
- Only presidents and vice-presidents can publish an **official notice**. A resident can suggest an announcement, but cannot apply the official label.
- A household post is private to the selected flat's members and its author. Being president does not put someone into every household conversation. Any moderation or platform-admin access must be explicitly authorised and audited, not granted through the normal feed.

**Publishing flow**

1. Choose Post or Event and enter the details.
2. Select the audience. No audience is preselected for a new item.
3. Review a plain-language summary, for example: "Owners only, including owners living elsewhere." Show the recipient count, not a private membership list.
4. Publish. The server checks the author's permission and recipients' approved memberships before saving or sending anything.
5. Eligible members see the item and, where enabled, receive a notification. Ineligible members get neither the item nor a revealing notification preview.

**Privacy and membership changes**

- Enforce the audience in database permissions, not just feed filters. Copying a link must not expose the title, attachment, comments or RSVP list to someone outside the audience.
- Recheck access when opening an item and when sending a queued notification. Ended memberships lose access; newly approved members can see relevant items still available to their audience. Previously delivered messages cannot be recalled.
- Once published, keep the audience fixed. To widen it, create a new item and review it again, so private comments or attendee details are not exposed accidentally.
- Notifications and any future WhatsApp delivery must use the same permission checks. Keep sensitive content out of push previews; do not send household or owner-only content to a public society chat.
- RSVP eligibility follows the event audience. An RSVP is not a governance vote and never grants owner permissions.
- Everyone still receives emergency and safety alerts; an audience filter must not hide these.

**Examples**

- A president publishes an official AGM notice to owners only. Approved tenants do not see its contents. Any voting entitlement still follows the society's bye-laws.
- A tenant organises a tenants-only welcome meetup. It appears as a resident event, not an official society notice.
- A member of B-204 posts a repair-visit update to B-204's household. Other flats cannot open it, even with its link.

## 8. Delivery phases

| Phase | Scope | Depends on |
|---|---|---|
| **1. Foundation** | Membership table, RLS, helpers, onboarding choice, lead approval, Profile "My flats", lead-only directory badge | — |
| **2. Funds split** | Per-flat roll limited to owners and own flat; treasurer must be an owner | Phase 1 |
| **3. Audience-based publishing** | Audience controls for new posts and existing events; lead-only official notices; protected attachments, comments, RSVPs and notifications. Group targeting waits for permission-controlled groups | Phase 1 |
| **4. Issues** | Flat and common-area issues; owners follow issues on their rented flat | Phase 1 |
| **5. Governance and dues** | Owners' polls (one vote per flat), dues statements and payments | Phases 1 and 3, plus the payment gateway |
| **6. Absentee owner experience** | Flat switcher, owner home view, multi-flat | Phase 1 |

Each phase needs: an idempotent migration with RLS and `NOTIFY pgrst, 'reload schema';` → `npm run db:push:prod` → `npm run types:prod` → `npx tsc --noEmit`, plus updates to `architecture.md` (schema, RLS, helpers), `features.md` (screen rules and the role matrix) and `.github/app-summary.md` (new role dimension).

## 9. Open questions for the committee

1. Can an absentee owner be president or vice-president in your bye-laws? (Make this a per-community setting.)
2. Should neighbours see a "Tenant" badge in the directory, or only leads?
3. When a tenant pays the dues, does the owner see the receipt automatically?
4. Can a nominated tenant vote on behalf of an absentee owner (proxy)?
5. Must the treasurer be an owner, or only the president and vice-president?
6. Do family members of owners get owner notices?
7. Should a request expire if a lead doesn't approve or reject it within N days?

## 10. Competitor reality check

**Conclusion:** distinguishing owners from tenants is not new to the market. Competitors already maintain resident, tenant, occupant or owner-related records. The reviewed public materials do **not** establish that Wooru's proposed permission model is unique—or prove that competitors lack comparable controls. Treat differentiated owner/tenant access as expected product capability and a hypothesis to validate, not a competitive claim.

| Product | What public sources establish | What they do not establish |
|---|---|---|
| **MyGate** | Its resident page advertises resident features including visitors, helpdesk, dues and amenities; signup requires the society admin to provide the resident's email. | The reviewed public materials do not document separate owner-versus-tenant permissions, approval rules, or absentee-owner/multi-flat access. |
| **NoBrokerHood** | Its official residents-and-flats page says approved residents upload documents and the system records each apartment's current legal owners and occupants. | It does not publish the exact owner/tenant visibility matrix for dues, voting, notices or issues. |
| **ADDA** | Its official resident-app page describes a "My Unit" area for managing residents, tenants and family details. | It does not specify which data or governance actions differ by owner, tenant or household role. |
| **ApnaComplex / ANACITY** | Their reviewed public pages advertise resident, accounting, helpdesk, communications, facility and gate-management capabilities. | The reviewed pages did not establish the owner/tenant data model or a role-by-role permission matrix. Do not interpret that absence as proof the controls do not exist. |
| **Emaar One** | The Google Play listing advertises property management and service requests. One user review describes filling a tenant-registration form. | The review is a user report, not official documentation of Emaar's authorization rules; no public owner/tenant permission matrix was found in the listing. |
| **Courali** | Its Behance case study depicts separate tenant and owner (including non-resident owner) concepts. | Courali is an independent portfolio concept with synthesized research, not a released competitor product or validated feature set. |

### What may still distinguish Wooru

The proposal's potential value is in the **specific combination and enforcement**, not the labels:

- one approved membership per person per flat, with support for joint owners, tenants and owners of multiple flats;
- explicit, privacy-conscious rules for who sees per-flat contribution records, future dues, owner notices, resident notices and governance actions;
- limited access for an owner living elsewhere to their own flat, without granting resident access to common-area issues;
- community-configurable governance rules, with permissions enforced in the database rather than only hidden in the interface.

None of these has been verified as absent from competitor products. Before marketing this as a differentiator, test the actual apps with owner and tenant accounts, ask vendors for their access-control documentation, and compare the same scenarios (shared flat, absent owner, joint ownership, tenant move-out, dues, notices and votes). Also validate all voting and committee rules against each society's bye-laws; the proposal is not legal advice.

### Sources reviewed

- [MyGate resident features](https://mygate.com/community-management/residents/) and [resident signup](https://api.mygate.com/resident/signup) — vendor pages; signup says the resident's email must be provided by the society admin.
- [NoBrokerHood: Residents and Apartments Management](https://nobrokerhood.com/residents-and-flats-management) — vendor product page.
- [ADDA Community Super App](https://ind.adda.io/community-super-app) — vendor product page; "My Unit" feature.
- [ANACITY services](https://www.anacity.com/services) — vendor service overview.
- [Emaar One on Google Play](https://play.google.com/store/apps/details?id=com.emaartechnologies.emaarone&hl=en) — app listing and user-submitted reviews.
- [Courali case study on Behance](https://www.behance.net/gallery/257082685/Courali-Gated-Community-App-UIUX-Case-Study) — independent design concept.
