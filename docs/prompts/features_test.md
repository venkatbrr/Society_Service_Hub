```
FEATURE TEST:  "Providers" and "Visits" feaures under provicers screen.
```

---

# Your mission

You are auditing the feature named above in the **Society Service Hub** codebase
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

3. **Never write to the database from SQL.** You may run read-only diagnostics. You may
   probe PostgREST function resolution with calls that provably cannot mutate a row (for
   example, passing a `00000000-…` UUID to a function whose `WHERE` clause also matches on
   `auth.uid()`), because resolution errors surface before execution. Never run `INSERT`,
   `UPDATE`, `DELETE`, or DDL against the live project. Never run `supabase db push`.

4. **Test accounts — use them if you exercise the running app.** The app is **not yet in
   production**; the Supabase project holds pilot/test data only, so signing in and driving
   real flows through the UI (create a reminder, submit a form, tap through a list) is
   allowed and encouraged when static reading cannot settle a question. Writes made *through
   the app as these users* are fine; direct SQL writes are still forbidden (rule 3).

   | Role | Email | Password |
   |---|---|---|
   | `president` | `ira@gmail.com` | `123456` |
   | `resident` | `ira3@gmail.com` | `123456` |

   Walk the role-sensitive findings as **both** accounts — a UI-hidden action that is still
   reachable for a resident is a P0, and the only way to prove it is to be logged in as one.
   There is no platform-`admin` test account here; for `admin` behaviour, reason from RLS
   and the `platform_*` RPCs and say explicitly that you could not exercise it live.

   Start the app with `npm run web` for the fastest loop (this also surfaces the web-only
   defects in the catalogue below — `Alert.alert`, date pickers). Do not change these
   accounts' passwords, roles, or community membership, and do not delete data you did not
   create.

5. **Do not guess when you can check.** If a column, constraint, function, or route might
   or might not exist, verify it — in `lib/database.types.ts`, in
   `supabase/migrations/`, or against the live PostgREST endpoint. A report full of
   "possibly" is worthless to the agent that has to act on it.

6. **Read the sibling reports in `docs/fixes/` first** (for example
   `service-reminders-review.md`). They establish the house style, depth, and evidence
   standard your report must match.

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
| **Web vs native** | `Alert.alert` is a **no-op on web** — confirmations must branch on `Platform.OS` and use `window.confirm`. `@react-native-community/datetimepicker` renders **`null` on web** — every date/time field needs a web branch. Check image pickers, share sheets, linking (`tel:`, `wa.me`), clipboard, and back-button handling on both |
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
| **Notifications** | Does the feature create `notifications` rows? Do they repeat sensibly or fire exactly once and then go silent forever? Does the tap route to the right screen? Is there a delivery channel at all when the app is closed? |
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
(`My Service Reminders` → `service-reminders-review.md`). Create `docs/fixes/` if it does
not exist.

The report must be **self-contained**: the agent that reads it will not have your context,
your conversation, or your tool output. Everything it needs must be on the page.

## Required structure

Follow this outline. Match the tone and density of the existing reports in `docs/fixes/`.

1. **Title & header block** — feature name, date, status, scope (the file list from step 1),
   method, baseline (`npx tsc --noEmit` state before any change), and a one-line result:
   *"N issues — X blocking, Y high, Z minor."*

2. **`## READ THIS FIRST — rules for the implementing agent`** — the non-negotiables:
   read `CLAUDE.md` and `docs/CLAUDE.md` first; `npx tsc --noEmit` is the only automated
   gate **and it will not catch these bugs**, so the verification checklist must be walked;
   after touching `supabase/migrations/`, finish the loop
   (`npm run db:push` → `npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj`
   → `npx tsc --noEmit`); the SQL in the document is a specification, not tested code;
   flag any step that rewrites live resident data as dry-run-first; and state an explicit
   **scope boundary** naming any shared file the agent may touch only narrowly.

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

   Name the **account** each row must be walked as, and repeat the credentials in the
   report so the implementing agent does not have to hunt for them:
   president `ira@gmail.com` / `123456`, resident `ira3@gmail.com` / `123456` (test users;
   the app is pre-production). Mark any row you verified live during the audit as already
   observed, and state its actual result.

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

Then stop. Do not begin implementing fixes — a separate agent will act on your report.
