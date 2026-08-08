```
FEATURE TEST:  <replace this line with the feature to audit>
```

> **Before you start:** check `docs/fixes/done/` for an existing report on this feature.
> Already audited and closed: Providers & Visits (Help tab), Carpooling, My Posts /
> My Orders, Parent Corner, Provider rules & moderation, Service Reminders. Re-auditing
> one of those is only useful if you say up front what changed since; otherwise pick a
> feature that has no report.

---

# Your mission

You are auditing the feature named above in the **Wooru** codebase
(Expo / React Native + TypeScript + Supabase + expo-router; Android, iOS, and an
installable PWA; plus a vanilla-JS admin console at `admin-dashboard/`).

Explore it the way a **resident of a gated community actually would** — not the way a
developer reading the happy path would. Hunt for edge cases, both **positive** (does the
intended flow genuinely work end to end?) and **negative** (what happens when input is
empty, oversized, duplicated, stale, out of order, offline, on the wrong platform, in the
wrong role, or at 1 AM?).

Residents depend on this app. A silent failure is worse than a loud one.

**You are the auditor, not the fixer.** Do not fix anything. Do not edit application code,
migrations, or docs. Your single deliverable is one Markdown report, written so a
*different* AI agent can implement every fix from it cold, without re-deriving your
analysis and without asking follow-up questions.

---

# Ground rules

1. **Read-only on the repo.** The only file you create is your report. Do not modify
   application code, SQL, or documentation.

2. **Read the project instructions before anything else:**
   - `CLAUDE.md` (root) — critical facts that are easy to get wrong
   - `docs/CLAUDE.md` — commands, conventions, and known traps. **Always, before editing.**
   - `docs/README.md` — the documentation routing table; it tells you which doc answers
     which question so you open only what the task needs. Do not read every doc.

   Facts you will otherwise get wrong: the role enum is exactly
   `admin · resident · president · vice_president` (`community_lead` and `community_admin`
   no longer exist); `public.is_admin()` is **not** a platform-admin check, it is an alias
   for `is_community_lead()` — the real override is `public.is_platform_admin(auth.uid())`;
   most queries scope by `communityId` from `useAuth()`, but `user_services`,
   `user_service_history`, `hire_feedback`, `provider_public_rating_nudges`,
   `provider_personal_notes`, and `favorites` are **user-scoped and never
   community-filtered**; `lib/database.types.ts` is generated and must never be hand-edited;
   `npx tsc --noEmit` is the only validation gate — there is no test framework and no lint
   script.

   Also know the house helpers, because a screen that hand-rolls any of them is itself a
   finding: `confirmAction` (`lib/confirm.ts`) for confirmations, `components/DateField.tsx`
   for date inputs, `buildWhatsAppUrl` / `normalizeIndianMobile` (`lib/phone.ts`) for phone
   links, `siteUrl()` (`lib/siteUrl.ts`) for any app URL, and `goBackSmart()`
   (`lib/navigation.ts`) for header back buttons.

3. **Never write to the database from SQL — and the live project is production.**
   `mbzvcaoulawdugfearmj` is the **prod** Supabase project behind `wooru.in`; there is no
   preprod project yet (the `:preprod` npm scripts still contain a literal
   `PREPROD_REF_TODO` and fail loudly). You may run read-only diagnostics. You may probe
   PostgREST function resolution with calls that provably cannot mutate a row (for example,
   passing a `00000000-…` UUID to a function whose `WHERE` clause also matches on
   `auth.uid()`), because resolution errors surface before execution. Never run `INSERT`,
   `UPDATE`, `DELETE`, or DDL. Never run `npm run db:push:prod`, `npm run db:push:preprod`,
   or `supabase db push` in any form.

4. **There are no test accounts — audit statically, and say so.** As of 2026-08-08 the prod
   project holds **3 auth users** in **1 community**: two platform admins
   (`thewooru@gmail.com`, `societyservicehub@gmail.com`, both `community_id IS NULL`) and a
   single `resident`. There are **zero** `president` / `vice_president` accounts. Any
   `ira@gmail.com` / `ira3@gmail.com` credentials you find in an older report or prompt are
   **dead** — those rows do not exist.

   Email/password sign-in is also **off**: `EMAIL_AUTH_UI_ENABLED = false` in
   `constants/authFlags.ts`, so the login screen offers Google only. You cannot mint
   yourself a test user, and you must not create, promote, or delete accounts to get one.

   What that means for this audit:
   - Base every finding on **code + migrations + read-only SQL against the live schema**
     (`pg_policies`, `pg_proc`, `pg_constraint`, `pg_trigger`, row counts).
   - Role-sensitive claims — "a resident can still reach this", "RLS blocks the cross-
     community read" — must be proven from the **policy text and RPC guards**, and each one
     must state explicitly that it was **not** exercised live and name the account that
     would settle it.
   - You may still run the app with `npm run web` and audit every **signed-out** and
     **static** surface: the login screen, deep links, route resolution, web-only rendering
     (`Alert.alert` no-ops, `null` date pickers, `Share.share`), layout, and console errors.
     That is a real evidence source — mark those findings `[live]`.
   - If the user hands you working credentials mid-audit, use them and upgrade the affected
     findings from inferred to verified. Do not change any account's password, role, or
     community membership, and do not delete data you did not create.

5. **Do not guess when you can check.** If a column, constraint, function, or route might
   or might not exist, verify it — in `lib/database.types.ts`, in
   `supabase/migrations/`, or against the live PostgREST endpoint. A report full of
   "possibly" is worthless to the agent that has to act on it.

6. **Read the sibling reports first.** Closed audits live in **`docs/fixes/done/`** —
   `providers-and-visits-review.md` and `service-reminders-review.md` are the best models.
   Open audits stay at the top level of `docs/fixes/` (currently
   `wooru-rebrand-remaining.md`, which also lists live-environment risks worth knowing).
   They establish the house style, depth, and evidence standard your report must match.

   Note that the older reports predate the two-environment split and still print
   `npm run db:push`. That command **no longer exists** — see the loop in the *Deliverable*
   section below. Copy their structure, not their commands.

---

# Investigation method

Work through these in order. Do not skip step 1 — features here span more files than the
obvious folder.

### 1. Map the whole surface area

Find every file the feature touches, not just the screen folder:

- Route screens under `app/` (including the `app/(tabs)/` surfaces that render summary
  cards or badges for the feature)
- Shared components under `components/`
- Helpers, types, and constants under `lib/` and `constants/`
- Context providers under `context/`
- Every migration in `supabase/migrations/` that creates or alters the feature's tables,
  RLS policies, triggers, or RPCs — **read them in filename order**, because later
  migrations frequently redefine earlier ones and only the final state is real
- Edge functions under `supabase/functions/`
- The admin console at `admin-dashboard/`, if the feature is manageable from there
- Entry points: which screens navigate *into* this feature, and the parent-route mapping
  in `getImmediateParentRoute()` (`lib/navigation.ts`)

### 2. Trace each user journey end to end

For every action a resident can take — create, read, list, edit, mark/complete, cancel,
delete, share, notify — follow the value from the input control, through client
validation, through the network call, into the RLS policy and any trigger, and back out to
the re-render. State disagreements between layers are where the bugs live.

### 3. Sweep this edge-case catalogue

Not every row applies to every feature. Consider every row, and report the ones that bite.

| Category | What to probe |
|---|---|
| **Empty & boundary input** | Empty string, whitespace-only, single character, exactly-at-limit, one-over-limit, zero, negative, very large numbers, leading zeros, emoji, RTL text, `'`/`"`/`\`/`%`/`<` in text that gets serialized or embedded in a tag or URL |
| **Field limits vs DB limits** | Does the client's `maxLength` match the DB `CHECK`? If several fields are **serialized into one column**, does the *combined* length still fit? Compute it with real-world values and show the numbers |
| **Dates & timezones** | The DB runs on **UTC**; residents are on **IST (UTC+5:30)**. Any `CURRENT_DATE`/`now()` comparison against a client-supplied local date is suspect between 00:00 and 05:30 IST. Look for `toISOString().split('T')[0]` — it converts local midnight to the previous UTC day. Check that server-computed and client-computed day counts agree |
| **Web vs native** | `Alert.alert` is a **no-op on web** — every confirmation must go through `confirmAction` (`lib/confirm.ts`), never a hand-rolled `Platform.OS` branch and never a bare `Alert.alert`. `@react-native-community/datetimepicker` renders **`null` on web** — date fields must use `components/DateField.tsx`. WhatsApp links must use `buildWhatsAppUrl` (`lib/phone.ts`), not a raw `whatsapp://` scheme or a bare 10-digit `wa.me` number. `Share.share` rejects on desktop web when `navigator.share` is absent. Check image pickers, `tel:` links, clipboard, and back-button handling on both |
| **Hardcoded URLs & brand** | Any absolute app URL must come from `siteUrl()` (`lib/siteUrl.ts`) so preprod links stay on preprod; the deep-link scheme is `wooru://`. Grep the feature for a literal `https://`, for the old names (`society service hub`, `commloom`, `gatebond`), and for a hand-written OAuth client ID. Admin-console config must be a `__PLACEHOLDER__` registered in `build-admin.js`, not `process.env` |
| **Refresh & staleness** | A screen fetching in a plain `useEffect` never refetches when you navigate back to it, and tab screens stay mounted for the whole session. After create / edit / delete, does every surface showing this data actually update — the list, the tab badge, the home card? |
| **Loading, empty, and error states** | Can the spinner get stuck (an early `return` before `setLoading(false)`)? Does a failed fetch render as "you have nothing" instead of an error? Is a genuine failure distinguishable from an empty result? **Count the states the screen can actually render** — a screen with only *loading* / *empty* has no error state, so every failure lands on the empty copy, often with a "be the first!" call to action while the toast fades. Also check that a sticky flag (`isMissingSchema`, `notFound`) is cleared on **every** path, not just on success |
| **Text identity & grouping** | Any free-text field whose value is later used as a **key** — deduped into filter chips, compared with `===`, grouped into sections, matched against a hard-coded list. Curly vs. straight apostrophes (`’` U+2019 vs `'` U+0027) are the classic trap: dump the code points of every hard-coded suggestion/option literal (`node -e "…charCodeAt(0)>127…"`) rather than trusting your eyes, and check case and trailing-space handling. Two chips that look identical but list different people is the symptom. Also check that a picker's option list on the **write** screen matches the filter list on the **read** screen element-for-element |
| **Optimistic updates** | If the UI updates before the server confirms, is the optimistic value *correct*, and is it rolled back on failure? |
| **Concurrency & double submit** | Double-tap the primary button. Two devices acting on the same row. Is the button disabled in flight? Is the invariant enforced in the DB, or only in the render? |
| **Roles & permissions** | Walk the feature as `resident`, `president`/`vice_president`, and platform `admin`. Is every UI-hidden action *also* blocked by RLS or an RPC guard? Can a user act on another user's or another community's row by ID? Does a shared table leak columns it shouldn't? |
| **RLS & RPC correctness** | Does every new table have RLS enabled with explicit policies? Does an `UPDATE` policy have both `USING` **and** `WITH CHECK`? Are `SECURITY DEFINER` functions pinned with `SET search_path`? Are `GRANT`s present? |
| **Function overloads** | If a migration adds parameters via a new signature instead of replacing the old one, both functions now exist and PostgREST may fail to resolve calls (`PGRST203`). Check every RPC the feature calls |
| **Data lifecycle** | What happens on `ON DELETE CASCADE` / `SET NULL`? If a linked row (provider, listing, community) is deleted or becomes invisible, does the UI degrade gracefully — or does saving an unrelated edit silently null the link? What happens when a user leaves or switches community? |
| **Navigation** | Deep-link straight to the screen in a fresh tab: does `router.back()` become a no-op? Does the header back button land on the right parent (`getImmediateParentRoute()`)? Android hardware back inside modals? |
| **Notifications** | Does the feature create `notifications` rows? Do they repeat sensibly or fire exactly once and then go silent forever? Does the tap route to the right screen? Is there a delivery channel at all when the app is closed? `pg_cron` is **not installed** — nothing scheduled server-side can exist, so any "we'll remind them later" path must be client-scheduled or trigger-driven |
| **Money & phone** | Currency parsing, negative and fractional amounts, and whether phone numbers go through `lib/phone.ts` rather than ad-hoc string handling |
| **Design system** | Hard-coded colours or spacing instead of Verandah tokens (`docs/verandah.md`) |
| **Scale** | Does the list query paginate? Does search hit the DB or filter client-side over everything? |

### 4. Quantify

Where a limit, a length, or a count is in question, **measure it** — a short Node script
or SQL query — and paste the output into the report. One table of real numbers is worth a
page of prose.

---

# Evidence standard

- Cite **`file.tsx:LINE`** for every claim, as a clickable relative markdown link from the
  report's location in `docs/fixes/` (so: `[app/services/add.tsx:169](../../app/services/add.tsx#L169)`).
- Quote the offending code inline — a few lines, enough to see the defect.
- State the **resident impact** in plain language, not just the technical fault. "Tapping
  the date field does nothing on the PWA, so every reminder starts from today" beats
  "DateTimePicker is unsupported on web".
- Separate what you **verified** from what you **inferred**, and say *how* you verified it:
  read from code, confirmed against `lib/database.types.ts` or a migration, queried the live
  database read-only, or **observed live in the running app signed in as the president or
  resident test account**. If you could not confirm something, say so explicitly and say
  what would confirm it. Never present a hypothesis as a finding.
- If a suspicious-looking thing turns out to be fine, do not report it. No filler.

---

# Deliverable

Write **one** file:

```
docs/fixes/<feature-slug>-review.md
```

`<feature-slug>` is the feature name, lowercased and hyphenated
(`My Service Reminders` → `service-reminders-review.md`). Write it at the **top level** of
`docs/fixes/` — that is where open work lives. `docs/fixes/done/` is for reports whose plan
has been fully implemented; do not write there, and do not move anything into it.

The report must be **self-contained**: the agent that reads it will not have your context,
your conversation, or your tool output. Everything it needs must be on the page.

## Required structure

Follow this outline. Match the tone and density of the existing reports in `docs/fixes/done/`.

1. **Title & header block** — feature name, date, status, scope (the file list from step 1),
   method, baseline (`npx tsc --noEmit` state before any change), and a one-line result:
   *"N issues — X blocking, Y high, Z minor."*

2. **`## READ THIS FIRST — rules for the implementing agent`** — the non-negotiables:
   read `CLAUDE.md` and `docs/CLAUDE.md` first; `npx tsc --noEmit` is the only automated
   gate **and it will not catch these bugs**, so the verification checklist must be walked;
   the SQL in the document is a specification, not tested code; flag any step that rewrites
   live resident data as dry-run-first; and state an explicit **scope boundary** naming any
   shared file the agent may touch only narrowly.

   Two facts the report must spell out, because getting either wrong reaches production:

   - **Commits go straight to `main`, and `main` is Vercel's production branch.** There is
     no PR gate and nothing runs `tsc` before deploy. Whatever the agent lands is live on
     `wooru.in` within minutes.
   - **After touching `supabase/migrations/`, the deploy loop is environment-suffixed —
     there is deliberately no bare `npm run db:push`:**
     ```
     npm run db:push:preprod     # preprod first (fails loudly until PREPROD_REF_TODO is real)
     npm run types:preprod
     # then RE-APPEND the hand-maintained enriched-types block at the bottom of
     # lib/database.types.ts (ProviderWithInteraction / VisitWithJoinerData /
     # VisitJoinerWithProfile) — gen types overwrites the whole file. docs/CLAUDE.md §6.
     npx tsc --noEmit
     npm run db:push:prod        # only after the change is on main
     npm run types:prod
     ```
     Migrations are **not** applied by CI. Merging deploys code, not schema; the prod step
     is manual and skipping it breaks prod.

3. **`## Severity summary`** — one table: number, issue, severity (P0/P1/P2), area, and the
   task that fixes it, linked to its anchor.

4. **`# PART 1 — FINDINGS`** — issues numbered continuously across three sections:
   - `# P0 — blocks real use` (broken, data loss, or security)
   - `# P1 — high` (user-visible defects, silent wrongness)
   - `# P2 — smaller` (cosmetic, performance, cleanup)

   Each issue gets its own `##` heading with a plain-language title, the cited code, the
   resident impact, and — where relevant — a note on how the *rest of the codebase* already
   solves the same problem correctly. That comparison is what tells the fixer what "right"
   looks like here.

5. **`# PART 2 — RESOLVED DESIGN DECISIONS`** — a table of every question your analysis
   raised, each with a **decision and its rationale**. Do not leave the implementing agent
   an "A or B"; it will either pick arbitrarily or stall. Decide, and say why. This section
   also fixes the **migration filename**: run `ls supabase/migrations/ | sort | tail`, and
   name the new file with a timestamp strictly **after** the latest existing one — a
   too-early timestamp sorts before already-applied migrations and breaks `db push`.

6. **`# PART 3 — IMPLEMENTATION PLAN`**
   - A **sequencing** table: group the work into 2–3 change sets (P0 first), each ending
     with a clean `tsc` and its slice of the verification checklist.
   - **Database tasks** (`M1`, `M2`, …) with the **actual SQL written out**, idempotent,
     including: verification queries to run *before* destructive statements, dry-run
     `SELECT`s before any data backfill, re-run guards, RLS policies on new tables, and
     `NOTIFY pgrst, 'reload schema';` at the end. Call out non-obvious Postgres traps you
     hit — for example that `CHECK` constraints reject non-`IMMUTABLE` functions, or that
     adding a column to a `RETURNS TABLE` function requires `DROP FUNCTION` first.
   - **Client tasks** (`C1`, `C2`, …) per file, with diffs or precise code direction, each
     tagged with the issue numbers it closes.
   - **Fold dead code removal into the task that causes it.** If a migration drops a
     function, the task must also name the call site to delete, so the agent cannot land
     half of it.

7. **`# VERIFICATION`** — the section that makes the report trustworthy. Open by stating
   that `tsc` catches none of the findings. Then a checklist split by environment
   (**Database** / **Web (PWA)** / **Native** / **Regression sweep**), each row tied to an
   issue number with a concrete, observable expected result. Include the awkward ones:
   timezone behaviour at 01:00 IST, notification cadence caps, cascade deletes, empty
   states, and the parent-route back button.

   Name the **role** each row must be walked as (`resident`, `president`/`vice_president`,
   platform `admin`). Do **not** print credentials — there are no working test accounts
   (ground rule 4), so open the checklist by saying so plainly: sign-in is Google-only,
   prod holds two platform admins and one resident, and there is no president account.
   Split the checklist into rows that can be walked **signed out or from code/SQL** and
   rows that are **blocked pending a real account**, and mark the blocked ones as such
   rather than pretending they are runnable. Mark any row you verified live during the
   audit as already observed, and state its actual result.

8. **`# DOCUMENTATION UPDATES`** — route each fact to **exactly one** owning file;
   duplicating facts across docs is what caused the last round of drift:
   - user-visible screen behaviour → `docs/features.md`
   - table, RLS, RPC, trigger, route, type, or context → `docs/architecture.md`
   - command, convention, dependency, or trap → `docs/CLAUDE.md` (§9 for traps)
   - design token or shared component → `docs/verandah.md`
   - admin console → `docs/platform-admin.md`
   - a whole new module, tab, or role → also `.github/app-summary.md`
   - feature disabled, removed, or re-enabled → `docs/disabled-features.md`
   - anything touching federation → `docs/cross-community-changelog.md` (mandatory)

   Do not restate schema columns in `docs/features.md` — `docs/architecture.md` owns them.

---

# Scope discipline

- If a defect is **already documented** as a known limitation (check
  `docs/disabled-features.md`), say so, cite it, and mark it out of scope rather than
  proposing to build it. Note its effect on this feature's severity, then move on.
- If a fix would balloon into a separate project, say that plainly and keep it out of the
  plan.
- Do not propose refactors, renames, or redesigns that no finding requires.

- **Never propose deleting cross-community / federation functionality.** The federation
  layer is **backend-live and UI-deferred on purpose** — partnership tables, `list_visible_*`
  / `can_user_see_*` / `set_*_visibility` / `*_community_partnership` RPCs,
  `get_user_partner_community_ids()`, and the additive partner-community RLS policies are
  **kept for future work**, not dead code. It is normal for an audit to find them
  unreferenced by any screen; that is the deferred UI, not an orphan. Do not recommend
  dropping, inlining, or "cleaning up" any of them, and do not count them as unused code in
  a finding. If your feature genuinely touches a federated object, say so and note that an
  entry in `docs/cross-community-changelog.md` is **mandatory in the same change set**
  (`docs/CLAUDE.md` §5). Otherwise state plainly in the report that the change set adds no
  federation object and removes none, and add a regression-sweep row proving it — e.g.
  `git diff` shows zero hits for `partner`, `partnership`, `list_visible_`, `can_user_see_`,
  `get_user_partner_community_ids`. Canonical reference: `docs/cross-community.md`.

- **A shared defect is not this feature's defect.** Before writing up a fault, check whether
  the identical code exists elsewhere (`grep` the pattern across `app/` and `components/`).
  If five other screens carry it verbatim — the `Share.share` web fallback, `fontWeight:
  '600'`, FAB `elevation`, hand-written row interfaces instead of `Tables<'x'>` — fixing it
  in one screen makes the app *less* consistent and leaves the others broken. Record it in
  **Part 2** as explicitly checked and deliberately out of scope, with the grep result and a
  note that it deserves its own change set, so the next auditor does not re-derive it. Only
  report it as a finding if this feature is where it actually bites.

---

# When you are done

Reply with a short summary — not the whole report:

1. The file path you created.
2. The issue count by severity.
3. The three findings that matter most, one line each, in resident-impact terms.
4. Anything you could **not** verify and what would settle it.

Then stop. Do not implement anything — not even a one-line fix you are certain of, and not
even if you found a P0. The report is the whole deliverable, and it gets reviewed before a
single line changes. A fix you land now is a fix nobody decided to make.
