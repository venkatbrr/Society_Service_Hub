---
name: test
description: End-to-end tester for Society Service Hub. Use when you want to verify features, UI alignment, or regressions across all screens. Invoke by sending "test" or a specific area e.g. "test providers", "test visits". Automatically hands off all failures to the bug_fix agent after the run.
argument-hint: Area to test (e.g. "providers", "visits", "funds", "reminders", "notifications") or "all" for a full regression run. Leave blank to test everything.
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
- [ ] Provider cards show name, category, average rating, and favorite icon
- [ ] Search bar filters results in real-time (debounced, no lag)
- [ ] Category filter chips filter results correctly
- [ ] Tapping a provider opens Provider Detail screen
- [ ] Provider Detail shows rating stars, contact buttons (phone, WhatsApp, share)
- [ ] Toggling favorite on a provider updates the heart icon without reload
- [ ] Add Provider (+ FAB → add form)
  - [ ] Name, phone, and category are required — form shows errors when missing
  - [ ] Duplicate phone number routes to existing provider instead of creating a new one
  - [ ] Category-specific detail fields appear correctly (e.g. Photography, Decoration, Electrician)
  - [ ] Successful save returns to the list and provider appears in it

---

### 3. Help Tab — Service Visits Segment
- [ ] "Service Visits" segment loads Upcoming and Past sub-tabs
- [ ] Upcoming visits show correct date, provider, category, and joiner count
- [ ] Past visits appear under Past sub-tab
- [ ] Search and category filter work within visits
- [ ] Tapping a visit opens Visit Detail
  - [ ] Creator sees status controls (mark in-progress, complete, cancel)
  - [ ] Non-creator sees Join / Unjoin button
  - [ ] Joiner list is visible
- [ ] Add Visit (+ FAB)
  - [ ] Title, category, provider, and date are required
  - [ ] Existing provider can be selected or manual name entered
  - [ ] Manual phone/WhatsApp validated to 10-digit mobile
  - [ ] Saved visit appears in Upcoming list

---

### 4. Favorites Tab
- [ ] Saved providers appear in the Favorites tab
- [ ] Unfavoriting a provider removes it immediately from the list
- [ ] Tab refreshes when returning from provider detail

---

### 5. Funds Tab
- [ ] Community funds list with income, expense, and balance totals
- [ ] Tapping a fund opens Fund Detail
  - [ ] Transaction history visible
  - [ ] Role badge shows (viewer/collector/treasurer)
  - [ ] Treasurer can add income and expense transactions
- [ ] Add Fund button visible (community lead or above)

---

### 6. Profile Tab
- [ ] Displays full name, flat number, community name, and role badge
- [ ] Community join code visible (if community lead)
- [ ] "Service Reminders" card shows due-soon badge count
- [ ] Link to Residents Directory works
- [ ] Sign out navigates to Login

---

### 7. Personal Service Reminders
- [ ] Service Reminders list loads correctly sorted by urgency
- [ ] Add Reminder form
  - [ ] Service name, category, last serviced date, and frequency are required
  - [ ] Provider search dropdown is searchable by name and phone number
  - [ ] Correct provider is linked on save
- [ ] Reminder Detail / Edit screen
  - [ ] "Mark as serviced today" resets next-due date correctly
  - [ ] Edit form saves updated fields
  - [ ] Provider search in edit form is searchable by name and phone number
  - [ ] Delete shows confirmation and removes reminder on confirm

---

### 8. Notifications
- [ ] Notifications screen lists items from the feed
- [ ] Unread count badge on bell icon matches unread notifications
- [ ] Mark individual notification as read — badge decrements
- [ ] Mark all as read — badge clears
- [ ] Tapping a new_visit notification navigates to Visit Detail
- [ ] Tapping a service_reminder notification navigates to Service Reminder Detail

---

### 9. UI Alignment Checks (all screens)
For every screen visited above, verify:
- [ ] No text overflow or clipping
- [ ] Buttons fully visible and tappable (not obscured by safe-area insets)
- [ ] Glassmorphism cards have consistent rounded corners and border
- [ ] Primary gradient (#6C63FF to secondary) applied consistently to active chips, buttons, and FAB
- [ ] Empty states show the correct illustration and message text
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
| Favorites | pass/fail | ... |
| Funds | pass/fail | ... |
| Profile | pass/fail | ... |
| Reminders | pass/fail | ... |
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
