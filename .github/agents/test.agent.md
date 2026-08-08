---
name: test
description: End-to-end tester for Wooru. Use when you want to verify features, UI alignment, or regressions across all screens. Invoke by sending "test" or a specific area e.g. "test providers", "test carpools", "test mcn". Automatically hands off all failures to the bug_fix agent after the run.
argument-hint: Area to test (e.g. "providers", "visits", "funds", "reminders", "notifications", "mcn", "drops", "carpools", "parents", "schools", "sos") or "all" for a full regression run. Leave blank to test everything.
tools: ['execute', 'read', 'search', 'web', 'todo', 'agent']
agents: [bug_fix]
---

# Wooru — Test Agent

## Purpose
Automated end-to-end feature and UI tester. Run the app, sign in with the test account, and methodically test the requested areas. Report pass/fail with observed vs expected behavior and flag visual misalignment.

There is **no automated test suite** in this repo — this agent is the manual regression pass. `npx tsc --noEmit` is the only static gate.

> ⚠️ **Security note**: the credentials below are a local dev/test account only. Do not publish this file to a public repository.

## Test credentials
- **Email**: `ira@gmail.com`
- **Password**: `123456`

## Starting the app
```bash
npm run android     # native regression
npm run web         # faster for layout and web-specific checks
```
Wait for Metro to bundle and the app to launch before starting.

Test **both targets** for anything involving confirmations, pull-to-refresh, back navigation, or safe-area layout — these behave differently on web and native by design.

---

## Test plan

Record ✅ pass or ❌ fail per check with a note on what was observed.

### 1. Authentication
- [ ] Login screen appears on launch
- [ ] Sign in with `ira@gmail.com` / `123456`
- [ ] Redirect lands on the main tabs (not admin, not community-select)
- [ ] Name and flat number visible on Profile
- [ ] Sign out, sign back in — session restores
- [ ] Deep link while signed out (e.g. `/mcn/drops/<id>` on web) returns to that route after login

### 2. Help tab — Providers
- [ ] Providers segment lists community providers, sorted by rating
- [ ] Cards render as compact single-row tiles (avatar · name · inline meta · bookmark)
- [ ] Tile shows category emoji, average rating, hire count; verified providers show a Verified pill
- [ ] Search bar is 36 px and filters with a 300 ms debounce
- [ ] Group chip row filters to all categories in that group; category chip row narrows further
- [ ] Tapping a provider opens Provider Detail
- [ ] Detail shows rating stars and contact buttons (phone, WhatsApp, share)
- [ ] Toggling favorite updates the bookmark without a reload
- [ ] Residents see "Report provider"; leads and platform admins see "Delete provider" instead
- [ ] Personal note editor is present and private
- [ ] Reviews list collapses to 3 with Load more / Show less
- [ ] Add Provider: name, phone, category required; grouped category picker; category-specific detail fields appear
- [ ] **Duplicate phone routes to the existing provider instead of creating a new row**
- [ ] Saved provider appears in the list on return

### 3. Help tab — Service Visits
- [ ] Upcoming / Past / Archived sub-tabs load
- [ ] Visits render as a SectionList grouped by category with emoji, name, and count badge; busiest section first; empty categories hidden
- [ ] Cards are compact (10 px padding, 30 px avatars)
- [ ] Past/Archived rows never show an "upcoming" badge
- [ ] Cancelled visits move to Past/Archived immediately
- [ ] Creator sees status controls and reschedule; non-creator sees Join / Leave
- [ ] Reschedule updates date/time and emits a community notification
- [ ] Join modal pre-fills flat number from the profile
- [ ] Add Visit: title, category, provider, date required; manual phone validated to 10 digits; date does not roll back a day

### 4. Help tab — Maintenance banner
- [ ] Zero-service state is a single-row inline banner (emoji · title · "Add service" pill · dismiss)
- [ ] Has-due state shows compact reminder cards
- [ ] All-clear state shows the compact all-tracked message
- [ ] Dismiss persists via AsyncStorage

### 5. Saved tab
- [ ] Saved providers appear
- [ ] Unfavoriting removes the item immediately
- [ ] Refreshes when returning from provider detail

### 6. MCN hub
- [ ] MCN is the 3rd tab with a people icon
- [ ] Quick actions: My Orders, My Submissions
- [ ] Four section cards render with live counts: Pre-order Food & Community Business, Community Carpooling, Parent Corner, Schools Catalog & Compare
- [ ] Counts refresh on focus and on pull-to-refresh
- [ ] Each card navigates to the right route

### 7. MCN — Business listings
- [ ] Listings grouped by category into collapsible sections; active before paused
- [ ] Category chip bar filters; tapping the active chip returns to All
- [ ] Inactive listings show an inactive badge
- [ ] Search debounces 300 ms
- [ ] Detail shows category badge and splits offerings into Products and Services
- [ ] `NULL` price renders as "Price on request"
- [ ] Quantity steppers use 0.5 for kg/litre and 1 for piece/box/pack/dozen
- [ ] Placing an order works; re-ordering updates the existing pending order
- [ ] Add Listing: name, category, contact phone required; category from `mcn_business_categories`
- [ ] Manage (owner): toggle active/paused, add/edit/delete offerings with item type and optional price
- [ ] **Manage is also reachable by a community lead**; a non-owner non-lead is redirected out
- [ ] Deleting a product referenced by an order item is blocked
- [ ] Orders Received grouped Pending / Fulfilled / Cancelled; WhatsApp message pre-fills items and total

### 8. MCN — Pre-order food drops
- [ ] Catalog tabs: Active / Closed / My drops
- [ ] Cards show host name + flat, linked business, and close/delivery timing chips
- [ ] **Signed-out browsing works** — open a drop link in a private window
- [ ] Add drop: title, fulfillment date, fulfillment time, cutoff required
- [ ] **Delivery time must be later than the cutoff** — earlier is rejected
- [ ] Items accept unit, price, and optional max quantity
- [ ] Ordering past the cutoff is blocked
- [ ] A resident can place multiple orders while the drop is open
- [ ] `confirmed` orders can be edited and cancelled by the buyer
- [ ] Once marked fulfilled, the order shows Delivered and is immutable
- [ ] Exceeding an item's max quantity is rejected (trigger-enforced — verify it fails even if the UI allows it)
- [ ] Manage dashboard aggregates item totals and splits the roster into active / delivered / cancelled
- [ ] "Mark delivered" is hidden on cancelled orders
- [ ] **Creator and community lead can both delete a drop** from detail header and manage dashboard
- [ ] Delete confirmation appears on **both** web (`window.confirm`) and native (`Alert.alert`)

### 9. MCN — Carpools
- [ ] Tabs: All / Offering / Seeking / My rides
- [ ] Status badges: Active (green), Paused (amber), Cancelled (red)
- [ ] Search matches title, start point, end point, and vehicle info
- [ ] Add ride: title, start point, end point required; recurring days, seats, pricing type, price per seat, contact phone captured
- [ ] Join request is offered only on `active` + `offering` rides, and not to the owner
- [ ] Rider submits seats and note; host sees the request
- [ ] Host can accept and reject pending requests
- [ ] Owner can pause, cancel, and delete; **a community lead can also delete**

### 10. MCN — Parent Corner
- [ ] Directory lists entries with student, school, grade, parent, flat
- [ ] Filters work: institution type, board, school
- [ ] Sorting works: school, grade, flat, recent
- [ ] Search debounces 300 ms
- [ ] Add entry: student name, school name, class, parent name, flat, phone all required
- [ ] Own entry can be edited and deleted; **a community lead can edit/delete any**
- [ ] Call and share actions work

### 11. MCN — Schools & Parent Report Card
- [ ] Catalog merges curated and community-submitted schools
- [ ] Cards show syllabus, level, distance, fee range, review count
- [ ] Selecting a 4th school for comparison is refused with an info toast
- [ ] Compare view renders up to 3 schools side by side
- [ ] Detail renders the 8-axis radar chart, aspect breakdown, and review cards
- [ ] Report card: 8 aspects on the emoji scale, child grade, optional 140-char per-aspect notes, overall comment
- [ ] Submitting updates the school's aggregate averages and review count
- [ ] Add school: name, distance, fee range required; phone must be 10 digits

### 12. MCN — Posts and orders
- [ ] My Submissions groups own posts into Active and Closed with close/delete
- [ ] Borrow-only community-feed mode shows all community borrow posts but limits close/delete to own rows
- [ ] Add borrow post requires title and contact info
- [ ] My Orders has Pre-order food and Business tabs, both scoped to the signed-in buyer
- [ ] Pending business orders and confirmed pre-orders can be cancelled; fulfilled/cancelled are read-only

### 13. Community tab
- [ ] Section order: funds → residents tile → SOS tile → community info
- [ ] Join code visible with an Invite neighbors share action
- [ ] Funds activation state renders correctly (CTA / pending with withdraw / rejected with reason / previously-active / active overview)
- [ ] Funds card opens Fund Detail with transaction history and a role badge
- [ ] Treasurer can add income and expense; collector can add contributions only
- [ ] Existing contributions are editable by collectors and treasurers
- [ ] A community lead can close a fund, which blocks further transactions
- [ ] Add Fund requires exactly one treasurer; leads and admins are excluded from the picker
- [ ] In a block-enabled community, collector assignment requires choosing a block
- [ ] Residents and SOS shortcuts navigate correctly

### 14. Blocks / towers
- [ ] `/community/blocks` is lead-only
- [ ] All labels use the community's `block_label` (Block or Tower)
- [ ] Create, rename, and archive work; per-block resident and in-charge counts show
- [ ] **Re-adding an archived block name restores it** rather than erroring
- [ ] Toggling blocks off preserves historical contributions

### 15. SOS & emergency
- [ ] Emergency numbers and Blood donors tabs load
- [ ] Numbers merge global defaults with community rows, grouped by category
- [ ] **Every dial shows a call-confirm dialog first**
- [ ] Donor list defaults to available donors; blood-group filter and show-all toggle work
- [ ] Resident can register, edit, and delete their own donor profile
- [ ] `/sos/manage-contacts` is lead/admin only

### 16. Residents directory
- [ ] Active residents listed, grouped by block when blocks are on
- [ ] Emails shown; **phone numbers only for leads and platform admins**
- [ ] Role badges render President / Vice President / Resident
- [ ] A lead can remove a non-lead resident
- [ ] `returnTo` param returns to the calling tab

### 17. Profile tab
- [ ] Name, flat number, community, and role badge display
- [ ] Fund access badge (Treasurer / Collector) appears when applicable
- [ ] Service Reminders card shows the due-soon count
- [ ] My Submissions link works
- [ ] Edit profile updates the name; an email change sends a verification link
- [ ] Sign out returns to Login

### 18. Personal service reminders
- [ ] List loads sorted by urgency
- [ ] Add: name, category, last-serviced date, frequency required; category pre-fills default frequency
- [ ] Provider picker searches by **name and phone number**
- [ ] Provider options refresh after adding a provider mid-flow
- [ ] Mark-as-serviced resets the next-due date correctly
- [ ] Completion captures optional provider, amount paid, and note
- [ ] Delete confirms before removing
- [ ] Technician shortcut opens the Help tab with the mapped category filter

### 19. Hire feedback
- [ ] Contacting a provider schedules the local 24-hour notification
- [ ] Feedback flow offers positive / negative / skip
- [ ] Positive can trigger a one-time public-rating nudge
- [ ] Negative and skipped never trigger the nudge
- [ ] No public rating is ever auto-created

### 20. Notifications
- [ ] Feed lists notifications; unread badge matches
- [ ] Mark one as read decrements the badge; mark all clears it
- [ ] `new_visit` opens Visit Detail; `service_reminder` opens the reminder
- [ ] Funds-activation notifications route to the Community tab
- [ ] Realtime: a new row appears without a manual refresh

### 21. Navigation (web + native)
- [ ] Header back arrow lands on the **immediate logical parent** for every `/mcn/*` screen
- [ ] Browser back matches the header back on web
- [ ] Android hardware back matches the header back
- [ ] Browser refresh on a deep `/mcn/*` route restores that screen

### 22. UI alignment (every screen visited)
- [ ] No text overflow or clipping
- [ ] Buttons fully visible, not obscured by safe-area insets
- [ ] Flat surfaces, hairline borders — **no shadows or elevation**
- [ ] Verandah palette used consistently (surface `#FAF8F4`, card `#FFFFFF`, accent `#0F6E56`)
- [ ] Font weights 400/500 only — no 600+
- [ ] All copy in sentence case
- [ ] Search bars 36 px; provider tiles single-row; visit cards 10 px padding
- [ ] Empty states use `EmptyState`
- [ ] Loading spinners appear during fetches
- [ ] Toasts appear correctly and auto-dismiss
- [ ] Web: tab bar stays locked to the bottom and never scrolls off
- [ ] Web: pull-to-refresh works via the custom gesture on list screens

---

## Reporting

Output a summary table:

| Area | Status | Notes |
|------|--------|-------|
| Auth | pass/fail | … |
| Providers | pass/fail | … |
| Visits | pass/fail | … |
| Maintenance banner | pass/fail | … |
| Saved | pass/fail | … |
| MCN hub | pass/fail | … |
| Business listings | pass/fail | … |
| Food drops | pass/fail | … |
| Carpools | pass/fail | … |
| Parent Corner | pass/fail | … |
| Schools | pass/fail | … |
| Posts & orders | pass/fail | … |
| Community & funds | pass/fail | … |
| Blocks | pass/fail | … |
| SOS | pass/fail | … |
| Residents | pass/fail | … |
| Profile | pass/fail | … |
| Reminders | pass/fail | … |
| Hire feedback | pass/fail | … |
| Notifications | pass/fail | … |
| Navigation | pass/fail | … |
| UI alignment | pass/fail | … |

List every failure with: screen name, exact action taken, expected result, actual result.

---

## Bug handoff

If **any** check failed:

1. Compile a structured report per failure:

   ### Bug N — <short title>
   - **Screen / file**: <route or component>
   - **Platform**: web / android / both
   - **Steps to reproduce**: <numbered>
   - **Expected**: <what should happen>
   - **Actual**: <what happened>
   - **Logs / errors**: <console output or toast text>

2. Invoke the `bug_fix` agent **once**, passing the full compiled report. It triages and fixes each issue in sequence, then runs `npx tsc --noEmit`.

If nothing failed, print: `All checks passed — no issues to hand off.`
