---
name: test
description: End-to-end tester for Society Service Hub. Use when you want to verify features, UI alignment, or regressions across all screens. Invoke by sending "test" or a specific area e.g. "test providers", "test visits", "test mcn". Automatically hands off all failures to the bug_fix agent after the run.
argument-hint: Area to test (e.g. "providers", "visits", "funds", "reminders", "notifications", "mcn", "sos") or "all" for a full regression run. Leave blank to test everything.
tools: ['execute', 'read', 'search', 'web', 'todo', 'agent']
agents: [bug_fix]
---

# Society Service Hub — Test Agent

## Purpose
Automated end-to-end feature and UI alignment tester for the Society Service Hub app.
When invoked, run the app on the connected emulator (or device), sign in with the test account, and methodically test every feature area requested. Report pass/fail with observed vs expected behaviour and flag any visual misalignment.

> ⚠️ **Security note**: Credentials below are for a local dev/test account only. Do NOT commit this file to a public repository.

## Test Credentials
- **Email**: ira@gmail.com
- **Password**: 123456

## How to start the app
```bash
npm run android
```
Wait for Metro to bundle and the app to launch on the emulator before beginning tests.

---

## Test Plan

Run each section in order. For each check, record ✅ pass or ❌ fail with a brief note on what was observed.

---

### 1. Authentication
- [ ] App launches and shows Login screen
- [ ] Sign in with email ``ira@gmail.com`` / password ``123456``
- [ ] Correct redirect to main tabs (not platform admin, not community-select)
- [ ] User name and flat number visible on Profile tab
- [ ] Sign out and sign back in — session restores correctly

---

### 2. Help Tab — Providers Segment
- [ ] "Providers" segment loads a list of community providers
- [ ] Provider cards display as compact WhatsApp-style horizontal tiles (avatar · name · inline meta · bookmark)
- [ ] Provider tile shows name, category emoji, average rating with star icon, hire count, and bookmark icon
- [ ] Verified providers show a small "Verified" pill badge inline with the name
- [ ] Search bar is compact (36px tall) and filters results with debounced (300ms) queries
- [ ] Category group row and category chip row filter providers correctly (two-level grouped filter)
- [ ] Selecting a group chip filters to all categories within that group
- [ ] Tapping a provider opens Provider Detail screen
- [ ] Provider Detail shows rating stars, contact buttons (phone, WhatsApp, share)
- [ ] Toggling favorite on a provider updates the bookmark icon without reload
- [ ] Report provider button is visible for residents (not leads/admins)
- [ ] Community leads and platform admins see "Delete provider" instead of report
- [ ] Personal note editor is visible on provider detail
- [ ] Add Provider (+ FAB → add form)
  - [ ] Name, phone, and category are required — form shows errors when missing
  - [ ] Category picker uses two-level grouped layout
  - [ ] Duplicate phone number routes to existing provider instead of creating a new one
  - [ ] Category-specific detail fields appear correctly (e.g. Photography, Decoration, Electrician)
  - [ ] Successful save returns to the list and provider appears in it

---

### 3. Help Tab — Service Visits Segment
- [ ] "Service Visits" segment loads Upcoming, Past (Recent), and Archived sub-tabs
- [ ] Visits are grouped by category (SectionList) with section headers showing category emoji, name, and visit count badge
- [ ] Visit cards are compact with reduced padding (10px), smaller avatars (30px), and smaller text
- [ ] Past/Archived visits do not display an "upcoming" status badge even with stale status values
- [ ] Search and category filter work within visits
- [ ] Tapping a visit opens Visit Detail
  - [ ] Creator sees status controls (mark in-progress, complete, cancel, reschedule)
  - [ ] Reschedule action updates date/time and emits a community notification
  - [ ] Non-creator sees Join / Leave button
  - [ ] Joiner list is visible
  - [ ] Join modal pre-fills flat number from profile
- [ ] Add Visit (+ FAB)
  - [ ] Title, category, provider, and date are required
  - [ ] Category picker uses two-level grouped layout
  - [ ] Existing provider can be selected or manual name entered
  - [ ] Manual phone/WhatsApp validated to 10-digit mobile
  - [ ] Saved visit appears in Upcoming list

---

### 4. Help Tab — Maintenance Banner (UpcomingServicesCard)
- [ ] Zero-service state renders as compact single-row inline banner (wrench emoji · title · "Add service" pill · dismiss)
- [ ] Has-due state shows compact reminder cards with reduced padding
- [ ] All-clear state shows compact all-tracked message
- [ ] Dismiss action persists via AsyncStorage

---

### 5. Favorites Tab (Saved)
- [ ] Saved providers appear in the Favorites tab
- [ ] Unfavoriting a provider removes it immediately from the list
- [ ] Tab refreshes when returning from provider detail

---

### 6. MCN Tab (My Community Network)
- [ ] MCN tab appears as 3rd tab in bottom navigation with "MCN" label and people icon
- [ ] Business Listings
  - [ ] Business listing cards show business name, owner, category badge, and image
  - [ ] Category chip bar filters listings by category
  - [ ] Inactive listings display an inactive badge
  - [ ] Tapping a listing opens Listing Detail with offerings, contact details
  - [ ] Listing Detail supports placing an order with quantity controls per offering
  - [ ] "Price on request" displays when offering price is NULL
- [ ] Add Listing
  - [ ] Business name, category, and contact phone are required
  - [ ] Category comes from `mcn_business_categories` lookup
- [ ] Manage Listing (owner only)
  - [ ] Toggle listing active/paused
  - [ ] Add/edit/delete products and services with optional price and item type
  - [ ] Orders received are grouped by status (Pending, Fulfilled, Cancelled)
- [ ] Borrow & Share posts
  - [ ] Borrow posts visible via the Borrow & Share card linking to my-posts in borrow-only mode
  - [ ] Add borrow post requires title and contact info
- [ ] My Posts
  - [ ] User's own posts grouped by Active and Closed
  - [ ] Close/delete actions available for own posts only
- [ ] My Orders
  - [ ] Own orders grouped by status
  - [ ] Cancel own pending orders

---

### 7. Community Tab
- [ ] Community tab shows funds summary/status card, residents shortcut, SOS shortcut, and community info
- [ ] Community join code visible with Invite neighbors share action
- [ ] Funds area shows correct activation state:
  - [ ] CTA card when `funds_enabled = false` with no active request
  - [ ] Pending review card when request is pending (with withdraw for requester)
  - [ ] Rejected status with reason and retry option
  - [ ] Active overview with income/expense/balance when funds enabled
- [ ] Tapping funds card opens Fund Detail
  - [ ] Transaction history visible
  - [ ] Role badge shows (viewer/collector/treasurer)
  - [ ] Treasurer can add income and expense transactions
  - [ ] Community lead can close a fund to block further transactions
- [ ] Add Fund button visible (community lead or above)
- [ ] Residents shortcut navigates to directory
- [ ] SOS shortcut navigates to SOS screen

---

### 8. SOS & Emergency
- [ ] SOS screen shows Emergency numbers and Blood donors tabs
- [ ] Emergency numbers grouped by category with call-confirm dialog before dialing
- [ ] Blood donor listing shows available donors with blood group filter
- [ ] Optional show-all toggle reveals unavailable donors
- [ ] Residents can register/edit/delete their own donor profile
- [ ] Community leads can manage emergency contacts via `/sos/manage-contacts`

---

### 9. Profile Tab
- [ ] Displays full name, flat number, community name, and role badge
- [ ] Fund access badge shown when applicable (Treasurer or Collector)
- [ ] "Service Reminders" card shows due-soon badge count
- [ ] My orders link visible for MCN orders
- [ ] My posts link visible for MCN posts
- [ ] Edit profile navigates to edit screen (name and email editable)
- [ ] Sign out navigates to Login

---

### 10. Personal Service Reminders
- [ ] Service Reminders list loads correctly sorted by urgency
- [ ] Add Reminder form
  - [ ] Service name, category, last serviced date, and frequency are required
  - [ ] Category pre-fills default frequency
  - [ ] Provider search dropdown is searchable by name and phone number
  - [ ] Correct provider is linked on save
- [ ] Reminder Detail / Edit screen
  - [ ] "Mark as serviced today" resets next-due date correctly
  - [ ] Completion flow supports optional provider, amount-paid, and note
  - [ ] Edit form saves updated fields
  - [ ] Provider search in edit form is searchable by name and phone number
  - [ ] Delete shows confirmation and removes reminder on confirm
  - [ ] Technician shortcut routes to Help tab with mapped category filter

---

### 11. Hire Feedback
- [ ] Contacting a provider schedules a local 24-hour notification
- [ ] Opening the feedback flow shows positive/negative/skip options
- [ ] Positive feedback can trigger a one-time public-rating nudge
- [ ] Negative and skipped never trigger the nudge

---

### 12. Notifications
- [ ] Notifications screen lists items from the feed
- [ ] Unread count badge on bell icon matches unread notifications
- [ ] Mark individual notification as read — badge decrements
- [ ] Mark all as read — badge clears
- [ ] Tapping a new_visit notification navigates to Visit Detail
- [ ] Tapping a service_reminder notification navigates to Service Reminder Detail
- [ ] Funds-activation notifications route correctly (approval → community, rejection → community)

---

### 13. UI Alignment Checks (all screens)
For every screen visited above, verify:
- [ ] No text overflow or clipping
- [ ] Buttons fully visible and tappable (not obscured by safe-area insets)
- [ ] Cards follow Verandah design system: flat surfaces, no shadows, no elevation, hairline borders
- [ ] Color tokens from Verandah palette used consistently (warm surface `#FAF8F4`, card `#FFFFFF`, accent `#0F6E56`)
- [ ] Font weights limited to 400 and 500 (no bold 600+ weights)
- [ ] All copy in sentence case
- [ ] Provider tiles are compact horizontal single-row layout (WhatsApp chat-tile density)
- [ ] Visit cards use compact padding (10px) and smaller avatars (30px)
- [ ] Search bars are 36px tall
- [ ] Empty states show the correct `EmptyState` component with illustration and message text
- [ ] Loading spinners appear while data is fetching
- [ ] Toast messages appear in the correct position and dismiss automatically

---

## Reporting
After completing all checks, output a summary table:

| Area | Status | Notes |
|------|--------|-------|
| Auth | pass/fail | ... |
| Providers | pass/fail | ... |
| Visits | pass/fail | ... |
| Maintenance Banner | pass/fail | ... |
| Favorites | pass/fail | ... |
| MCN | pass/fail | ... |
| Community | pass/fail | ... |
| SOS/Emergency | pass/fail | ... |
| Profile | pass/fail | ... |
| Reminders | pass/fail | ... |
| Hire Feedback | pass/fail | ... |
| Notifications | pass/fail | ... |
| UI Alignment | pass/fail | ... |

List any failures with: screen name, exact action taken, expected result, actual result.

---

## Bug Handoff

After the summary table, if **any failures were found**:

1. Compile a structured bug report for every failure using this format:

  ### Bug N — <Short title>
  - **Screen / File**: <route or component>
  - **Steps to reproduce**: <numbered steps>
  - **Expected**: <what should happen>
  - **Actual**: <what actually happened>
  - **Logs / errors**: <any relevant console output or toast message>

2. Invoke the `bug_fix` agent once, passing the full compiled bug report as the argument. The bug_fix agent will triage and fix each issue in sequence, then run `npx tsc --noEmit` to validate.

3. If **no failures were found**, print:
   All checks passed — no issues to hand off.
