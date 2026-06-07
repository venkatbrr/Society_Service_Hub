# Society Service Hub — Enhancement Prompt

> **For AI coding agents (Cursor, Cline, Claude Code)**
>
> Before making any changes, review `docs/CLAUDE.md`, `docs/features.md`, `docs/architecture.md`, and `docs/verandah.md`. Follow all Verandah UI rules, existing naming conventions, and documentation-sync requirements. Apply all migrations with `npm run db:push` and regenerate types with `npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj` after any schema change.

---

## Enhancement 1 — Collector/Treasurer Pickers: Show Only 3 Names by Default

**Screens affected:**
- `app/funds/[id].tsx` — "Manage collectors" and "Manage treasurers" pickers
- Any other picker inside funds screens that renders a full resident list

**Requirement:**
In the search-driven resident pickers used for assigning collectors and treasurers, render only the first 3 resident names by default (before the user types anything). As soon as the user types in the search box, show all matching results normally. This prevents an overwhelming long list on first open.

**Implementation notes:**
- Keep the existing debounced search logic (300 ms) unchanged.
- Add a conditional: `if (debouncedSearchQuery.trim() === '') { display only residents.slice(0, 3) } else { display all filtered results }`
- Show a subtle hint below the truncated list, for example: *"Type to search all residents"* — use a `VerandahType` token for the hint text, colour `Verandah.textTertiary` or equivalent.
- Do not change how already-selected names are shown in the chip/tag area above the search box.

---

## Enhancement 2 — Expense Form: Contextual Placeholder Examples

**Screen affected:**
- `app/funds/add-transaction.tsx` — expense mode (`type = 'expense'`)

**Requirement:**
When the transaction type is `expense`, the title/description input's placeholder text must read something realistic and contextual, for example:

```
e.g. Grocery, Decoration, Tent house, Catering…
```

Replace the current generic placeholder with this contextual one only in expense mode. Income/contribution mode placeholder remains unchanged.

**Implementation notes:**
- The placeholder is set on the `TextInput` for the expense title field.
- Conditionally set `placeholder` based on `type === 'expense'`.

---

## Enhancement 3 — Reduce Card Height in Expenses, Contributions, and Fund Transparency Lists

**Screens affected:**
- `app/funds/[id].tsx` — Contributions list and Expenses list
- Fund transparency / overview section (wherever transaction rows are rendered for community-visible display)

**Requirement:**
Compact the row height of each transaction card/row so more items fit on screen without scrolling. Specifically:

- Reduce vertical padding inside each transaction row. Use `VerandahSpace.xs` or `VerandahSpace.sm` instead of larger spacing tokens.
- Remove any extra bottom margin between rows; use a thin divider line or minimal `VerandahSpace.xs` gap instead.
- Keep all displayed fields (name, amount, date, description) but reduce font sizes for secondary fields (date, note) to `VerandahType.caption` or equivalent small token.
- Primary amount and contributor/expense title remain at their current readable size.
- Do not remove any information — this is a density improvement, not a data removal.

---

## Enhancement 4 — Community Directory: Group Residents by Block / Tower

**Screen affected:**
- `app/residents.tsx`

**Requirement:**
When `blocks_enabled = true` for the community, group residents under their assigned block/tower instead of showing a flat alphabetical list. Use the community's `block_label` value (`Block` or `Tower`) for all headings.

**Layout:**
```
Block A  (or Tower A — use block_label)
  ├─ Resident Name  Flat A101
  ├─ Resident Name  Flat A102
  └─ ...

Block B
  ├─ ...
```

- Section headers should use `VerandahType.labelMd` or equivalent, with `Verandah.surface2` background to visually separate sections.
- Residents with no `block_id` assigned should appear at the bottom under a section labelled **"Unassigned"**.
- When `blocks_enabled = false`, keep the existing flat list unchanged.
- The block list must be sourced from the `list_community_blocks` RPC (already used in `app/community/blocks.tsx`) or by grouping the result of `get_residents_directory` by `block_id`.
- The existing search bar must still work — when the user types, filter across all blocks and show only matching residents (collapsing the block headers if no matches exist within a block, or keeping the header with only matching residents).
- Community leads must still be able to tap a resident and trigger removal from within a block section.

**Data note:** The `get_residents_directory` RPC should already return enough data; if `block_id` or `block_name` is not yet included in its result set, extend the RPC to return `block_id` and `block_name` alongside existing fields, and add the corresponding migration + type regeneration.

---

## Enhancement 5 — Fund Close/Open Toggle (Community Lead)

**Screens affected:**
- `app/funds/[id].tsx` — fund detail header area
- `app/funds/index.tsx` — fund list cards (show closed badge)

**Requirement:**
Community leads must be able to close a fund so that no new contributions or expenses can be recorded against it. Closing is reversible — the lead can re-open it at any time. This is a toggle, not a permanent action.

**Database changes required:**
1. Add a boolean column `is_closed` (default `false`) to the `events` table.
2. Create an RPC `set_fund_closed(p_event_id uuid, p_closed boolean)` that:
   - Verifies the caller is a community lead for the fund's community.
   - Updates `events.is_closed`.
   - Returns the updated row.
3. Add the migration file under `supabase/migrations/`, run `npm run db:push`, and regenerate types.

**UI — Fund Detail (`app/funds/[id].tsx`):**
- Visible to community lead only: show a toggle (use React Native `Switch` or a styled toggle button using Verandah tokens) near the fund title. Label: **"Fund open"** / **"Fund closed"**.
- When `is_closed = true`:
  - Hide or disable the "Add contribution" and "Add expense" action buttons for all roles (collector, treasurer, community lead).
  - Show a banner inside the fund detail: *"This fund is closed. No new transactions can be recorded."* — use `Verandah.warning` or `Verandah.textSecondary` colour.
  - The toggle remains visible and active for the community lead so they can re-open it.
- When `is_closed = false`: all existing behaviour applies.

**UI — Fund List (`app/funds/index.tsx` / `FundsList` component):**
- Add a small **"Closed"** badge on fund cards where `is_closed = true`. Use a muted chip style consistent with Verandah tokens.

**Guard in `app/funds/add-transaction.tsx`:**
- At screen load, fetch the parent fund's `is_closed` value.
- If `is_closed = true`, render a graceful error/info state identical to the existing inactive-fund guard, with copy: *"This fund is closed and is not accepting new transactions."*

---

## Enhancement 6 — Past Visits: Archive Visits Older Than 30 Days

**Screen affected:**
- `app/(tabs)/index.tsx` — Past visits sub-tab inside the Service Visits segment

**Requirement:**
In the Past visits list, split the display into two sections:

1. **Recent** — visits with a date within the last 30 days (shown as normal, current behaviour).
2. **Archived** — visits older than 30 days, shown in a collapsible section at the bottom labelled **"Archived"** with a count badge, e.g. *"Archived (12)"*.

**Implementation notes:**
- No database or RLS change is required — this is a pure UI grouping.
- Compute the split client-side: `const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);` then compare each visit's date (already parsed as local date-only) to `cutoff`.
- The archived section must be collapsed by default. A single tap on the "Archived" header expands or collapses it. Use a `useState` boolean for this.
- Archived visit cards are visually identical to regular past visit cards — no style change needed.
- Apply the same past-visit rule as documented: cancelled visits always go to Past regardless of date.
- If there are no archived visits, do not render the "Archived" section header at all.

---

## Enhancement 7 — Resident Profile: Editable Name and Email

**Screen affected:**
- `app/(tabs)/profile.tsx` (or a new edit screen if preferred)

**Requirement:**
Residents must be able to update their own display name and email address from the Profile tab.

**UI:**
- Add an **"Edit profile"** action (pencil icon or text link) in the profile header area of `app/(tabs)/profile.tsx`.
- Tapping it opens a modal or navigates to a new screen `app/profile/edit.tsx` containing:
  - **Full name** — pre-filled from `profile.full_name`, required, non-empty.
  - **Email** — pre-filled from `profile.email` or `user.email`, required, must pass basic `@` validation.
- **Save** button calls `supabase.from('profiles').update({ full_name })` scoped to `auth.uid()` and `supabase.auth.updateUser({ email })` for the email change.
- On success, call `refreshSession()` from `AuthContext` so the updated profile propagates throughout the app, then show a toast: *"Profile updated"*.
- If the email is changed, inform the user: *"A confirmation link has been sent to your new email address."*
- Validate that name is non-empty and email contains `@` before enabling Save.

**Do not** show flat number or block fields on this edit screen — those are managed separately during onboarding.

---

## Enhancement 8 — Collectors and Treasurers Can Edit Existing Contributions

**Screen affected:**
- `app/funds/[id].tsx` — Contributions list

**Requirement:**
Collectors and treasurers (and community lead) must be able to edit an already-recorded contribution entry — specifically the `amount` and optionally the `notes` field.

**UI:**
- Add a small **edit icon** (use `Ionicons` `pencil-outline`) at the right edge of each contribution row.
- Tapping it opens a bottom sheet or modal with:
  - **Amount** — pre-filled, numeric, required, > 0.
  - **Note** (optional) — pre-filled if present.
  - **Save** and **Cancel** actions.
- On save, call `supabase.from('event_transactions').update({ amount, notes }).eq('id', transactionId)`.
- After save, refresh the contributions list and fund totals.

**Access control:**
- The edit icon is visible only to collectors (for contributions they recorded), treasurers, and community leads.
- Residents (view-only) must not see the edit icon.
- Editing is blocked (icon hidden) when the fund is closed (`is_closed = true` — see Enhancement 5).

**Do not** allow changing the `contributor_user_id` (who paid) via this edit — amount and note only.

---

## Enhancement 9 — Admin Views: Show Email and Phone Below Resident Name

**Screens affected (all admin/lead views that render a resident list or resident row):**
- `app/residents.tsx` — community lead view
- `app/funds/[id].tsx` — collector/treasurer assignment pickers
- `app/funds/add-transaction.tsx` — contributor picker
- `app/platform/community/[id].tsx` — platform admin resident list
- `app/platform/approvals.tsx` — requester card
- Any other screen where a resident's name is shown in a list under admin/lead context

**Requirement:**
Wherever a resident's name appears in an admin or lead context (role checks: `isCommunityLead`, `isPlatformAdmin`, or fund-role `treasurer`), render the resident's email and phone number on a second line directly below the name in smaller text.

**Style:**
```
Ramana Venkata               ← VerandahType.bodyMd, weight 500
rvenkata@email.com · 9876543210   ← VerandahType.caption, Verandah.textSecondary
```

- Separator between email and phone: ` · ` (middle dot with spaces).
- If phone is not available, show email only. If neither is available, show nothing on the second line.
- This second line must not appear in resident-facing views (i.e. when a regular resident browses the directory).
- The `get_residents_directory` RPC already exposes phone to leads/admins via `p_include_phone`. Confirm that `email` is also returned; if not, extend the RPC to return `email` for callers with `community_lead` or `admin` role, and add the migration.

---

## Enhancement 10 — Categories: Add Missing Service Categories

**File affected:**
- `constants/categories.ts`

**Current state (already present — do not duplicate):**
`Tent House`, `Water Cans`, `Catering`, `Boutique` are already in both `CATEGORIES` and `CATEGORY_GROUPS`.

**Missing — add these:**
- `Notary` — does not exist. Add to `CATEGORIES` array and to the `government` group in `CATEGORY_GROUPS` (the group with `RTO Agent`, `Aadhar Centre`). Add a colour entry to `CATEGORY_COLORS`: `Notary: '#0F4C75'`.
- `Babysitter` — does not exist. Add to `CATEGORIES` array and to the `home_support` group alongside `Home Nurse / Nanny`. Add colour: `Babysitter: '#F9A8D4'`.

**Verification steps before adding:**
- Search `constants/categories.ts` for each of the six requested names (case-insensitive) to confirm which are missing.
- Only add the genuinely missing ones.
- After adding, verify the `CATEGORY_GROUPS` arrays are still in sync with `CATEGORIES` (every category in a group must exist in the flat `CATEGORIES` array).
- Also check `lib/serviceCategories.ts` — if `Notary` or `Babysitter` are relevant as personal-reminder categories, add them there too with a sensible default `frequencyMonths`.

---

## Documentation Updates (Mandatory)

After implementing all enhancements above, update the following docs to stay in sync with the code:

- **`docs/features.md`** — Update the Community Directory section (Enhancement 4), Fund Detail section (Enhancement 5), Service Visits section (Enhancement 6), Profile section (Enhancement 7), Add Transaction section (Enhancement 8).
- **`docs/architecture.md`** — Update the DB schema section if `events.is_closed` or `get_residents_directory` RPC changes were made (Enhancements 5, 9).
- **`docs/CLAUDE.md`** — Update the Database section if new RPCs or columns were added.

---

## Summary of Files Likely to Change

| File | Enhancements |
|------|-------------|
| `constants/categories.ts` | 10 |
| `app/funds/[id].tsx` | 1, 3, 5, 8 |
| `app/funds/add-transaction.tsx` | 2, 5 |
| `app/funds/index.tsx` | 5 |
| `app/residents.tsx` | 4, 9 |
| `app/(tabs)/index.tsx` | 6 |
| `app/(tabs)/profile.tsx` | 7 |
| `app/profile/edit.tsx` (new) | 7 |
| `app/platform/community/[id].tsx` | 9 |
| `supabase/migrations/` (new file) | 5, possibly 9 |
| `lib/database.types.ts` (regenerated) | 5, possibly 9 |
| `docs/features.md` | All |
| `docs/architecture.md` | 5, 9 |
