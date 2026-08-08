# Providers — Rules, Validations, Spam & Reporting: Audit, Bug Report & Fix Plan

**Date:** 2026-08-08
**Status:** Audit complete. **Nothing in the repo was changed by this pass** — this document is the only file created.

**Scope.** Every rule, validation, and abuse control that governs a service provider and the content attached to one: creation validation, phone normalization and duplicate handling, the fraud/spam pipeline, ratings and reviews, the report flow, moderation and delete powers, trust signals (`is_verified`, `avg_rating`, `rating_count`, contact count), and the platform-admin surface over all of it.

**Files traced:**
[`app/provider/add.tsx`](../../app/provider/add.tsx) · [`app/provider/[id].tsx`](../../app/provider/[id].tsx) · [`app/(tabs)/index.tsx`](../../app/(tabs)/index.tsx) · [`app/(tabs)/favorites.tsx`](../../app/(tabs)/favorites.tsx) · [`app/notifications.tsx`](../../app/notifications.tsx) · [`components/ProviderCard.tsx`](../../components/ProviderCard.tsx) · [`components/ProviderSelector.tsx`](../../components/ProviderSelector.tsx) · [`lib/fraudCheck.ts`](../../lib/fraudCheck.ts) · [`lib/phone.ts`](../../lib/phone.ts) · [`constants/providerDetails.ts`](../../constants/providerDetails.ts) · [`supabase/functions/fraud-check/index.ts`](../../supabase/functions/fraud-check/index.ts) · [`admin-dashboard/js/providers.js`](../../admin-dashboard/js/providers.js) · migrations `00000_init.sql`, `20260415000000_enhance_trust_and_funds.sql`, `20260417200000_fix_ratings_business_constraint.sql`, `20260417300000_fix_provider_rating_trigger.sql`, `20260418210000_onboarding_approval.sql`, `20260422010000_simplify_roles_and_remove_marketplace.sql`, `20260427000000_fraud_detection.sql`, `20260429113000_enforce_unique_provider_phone_per_community.sql`, `20260503120100_fix_ratings_select_policy.sql`, `20260507000000_cross_community_foundation.sql`, `20260509000000_hire_feedback.sql`, `20260606170000_provider_reports.sql`, `20260606193000_provider_personal_notes.sql`, `20260606194500_allow_residents_view_reports.sql`, `20260607194000_fix_provider_insert_policy.sql`, `20260620180000_platform_admin_extensions.sql`, `20260625000000_add_listing_ratings.sql`, `20260822000000_repoint_dead_community_lead_checks.sql`

**Baseline:** `npx tsc --noEmit` **passes clean** before any change (verified 2026-08-08 from the project root). There is no test framework and no lint script.

**Method.** Every rule was traced from the input control, through client validation, through the network call, into the **live** RLS policy / trigger / grant, and back out to the render. Read-only diagnostics were run against the live Supabase project `mbzvcaoulawdugfearmj` via MCP — `pg_policies`, `pg_proc`, `information_schema.columns`, `information_schema.column_privileges`, `auth.users` metadata shape, row counts and status breakdowns — plus `list_edge_functions`. **No `INSERT`/`UPDATE`/`DELETE`/DDL was executed and no migration was pushed.**

Findings are tagged **[live]** (reproduced or read out of the running project, output pasted in), **[code]** (provable from source plus the live schema), or **[runtime]** (high-confidence inference; confirm with a click-through before closing).

**Relationship to the previous audit.** [`done/providers-and-visits-review.md`](done/providers-and-visits-review.md) (2026-08-08) covered the Help tab and visits. Its provider findings have largely landed — `.maybeSingle()`, the platform-split delete with `.select('id')` assertion, `goBackSmart`, `siteUrl()`, the `.or()` sanitiser, the visit RPC lockdown (`20260831000100`) and visit lifecycle (`20260831000200`) are all present. **This pass deliberately does not re-report any of that.** Everything below is new, with two exceptions that are explicitly labelled as extensions of prior findings (#12, #16).

**Result: 23 findings — 4 blocking, 11 high, 8 minor.**

**Decisions taken (2026-08-08).** Eight open questions in this plan were resolved by the product owner before handover. They are binding — do not re-litigate them, and do not substitute a "better" option:

| # | Question | Decision |
|---|---|---|
| D1 | How do migrations reach the database, given there is no preprod? | **The agent writes migrations and runs pre-flight `SELECT`s. The agent never runs `db:push`.** The product owner applies. See [rule 3](#read-this-first--rules-for-the-implementing-agent). |
| D2 | M5 — contact dedupe | **Option A.** Generated `contact_date` + unique index on `(user_id, provider_id, contact_date)`, and every read becomes `COUNT(DISTINCT user_id)`. |
| D3 | Public report banner threshold | **2 independent unresolved reports.** Leads and platform admins see the first one immediately. |
| D4 | R-R6 severity | **Downgrade `HARD_BLOCK` → `FLAG`**, paired with the precondition copy in [C2 §6](#c2--appprovideridtsx). |
| D5 | `is_verified` | **Keep the column, lock it down.** Only `set_provider_moderation_state` may set it; a lead verifies from the moderation UI. |
| D6 | `description` / `details` (finding #18) | **Render them** on the provider detail screen, using the six orphaned styles already in the file. |
| D7 | Handover scope | **Tranche 1 + Tranche 2** (22 of 23 findings). **F1 is not delegated** — the product owner deploys the Edge Function. |
| D8 | Handover prompt | Included as [PART 3 — HANDOVER](#part-3--handover) below. |

---

## READ THIS FIRST — rules for the implementing agent

1. **Read [`CLAUDE.md`](../../CLAUDE.md) and [`docs/CLAUDE.md`](../CLAUDE.md) first.** §9 of the latter already names several traps below by name.

2. **`npx tsc --noEmit` will not catch a single finding in this document.** Every issue here type-checks perfectly today; they are grant, RLS, platform-deployment, and data-shape defects. The [VERIFICATION](#verification) checklist is the only gate that matters.

3. **DO NOT APPLY MIGRATIONS. This overrides `docs/CLAUDE.md` §6 for this change set only (decision D1).**

   `docs/CLAUDE.md` §6 tells you to finish the deployment loop yourself, preprod first. **You cannot, and you must not improvise around it.** The preprod project does not exist — every `:preprod` script is a literal placeholder:

   ```
   db:push:preprod   = npx supabase link --project-ref PREPROD_REF_TODO && supabase db push --linked
   types:preprod     = npx supabase gen types typescript --project-id PREPROD_REF_TODO > lib/database.types.ts
   fn:deploy:preprod = npx supabase functions deploy --project-ref PREPROD_REF_TODO
   ```

   These fail loudly by design. **When they fail, stop. Do not substitute `db:push:prod`, `types:prod`, `fn:deploy:prod`, `supabase db query`, `supabase migration up`, or the MCP `apply_migration` tool.** Prod is the live project: **171 providers, 18 real users, one live community.** This plan revokes a table-wide grant and rewrites five RLS policies; none of it has ever been executed anywhere.

   What you do instead:

   - Write the migration files into `supabase/migrations/` and leave them **unapplied**.
   - Run every pre-flight `SELECT` in this document **read-only** (MCP `execute_sql` is fine for reads) and paste the actual counts into your summary. If one returns a non-zero violation count, report it and stop — do not "fix" live data to make an `ALTER` succeed.
   - Types cannot be regenerated until the migrations are applied, so any client change referencing a new column will not type-check yet. Name those files explicitly in your summary. **Do not hand-edit `lib/database.types.ts`** to silence the error (`docs/CLAUDE.md` §2.3).
   - Everything not depending on the migrations must still type-check. `npx tsc --noEmit` passes on `main` today — do not regress it.

   The product owner then runs `db:push:prod`, `types:prod`, **re-appends the hand-maintained enriched-types block** (`ProviderWithInteraction` / `VisitWithJoinerData` / `VisitJoinerWithProfile`) that `types:*` overwrites, and re-runs `npx tsc --noEmit`.

4. **The SQL in this document is a specification, not tested code.** It was written against the live catalogue but has never been executed. Read it before you run it.

5. **F1 is not yours (decision D7).** `npm run fn:deploy:prod` changes live enforcement for every resident the instant it lands. Do not run it, do not call `supabase functions deploy` directly, and do not treat finding #1 as closeable by this change set. You **may** edit [`supabase/functions/fraud-check/index.ts`](../../supabase/functions/fraud-check/index.ts) per [F1 §2/§3](#f1--deploy-the-fraud-check-function-issue-1) — add the provider-side spam rules, downgrade R-R6 to `FLAG` per D4 — and leave it undeployed for the product owner to ship.

6. **Migration timestamps.** The last applied migration is `20260901000000_rebrand_platform_admin_email.sql`. This plan uses `20260902000000`, `20260902000100`, `20260902000200`. Re-check with `npx supabase migration list --linked` before you write the files — concurrent sessions collide.

7. **Scope boundary — files you may touch only narrowly.**
   - [`lib/database.types.ts`](../../lib/database.types.ts) — **regenerate only.** Never hand-edit (`docs/CLAUDE.md` §2.3).
   - [`app/(tabs)/index.tsx`](../../app/(tabs)/index.tsx) — fix the hires query and the fraud filter placement. Do not restructure `fetchProviders`, and do not touch the visits half of the file.
   - [`admin-dashboard/js/providers.js`](../../admin-dashboard/js/providers.js) — after editing, run `node build-admin.js` and hard-refresh. Editing the source alone shows nothing (`docs/CLAUDE.md` §9).
   - Do not touch `app/mcn/*`, `app/services/*`, `app/visits/*`, or funds. They are cited only as examples of what "right" already looks like.

8. **Federation is deferred, NOT removed.** `service_providers_select_cross_community`, `can_user_see_provider()`, `provider_shares`, `service_providers.visibility` and `shared_by_community_id` must all survive intact. Read [`cross-community.md`](../cross-community.md) and [`decisions/0001-additive-rls-for-cross-community.md`](../decisions/0001-additive-rls-for-cross-community.md). **M1 narrows `visibility` to a lead-controlled column and M2 adds a provider-community predicate to the `ratings` INSERT policy — both touch federation-visible behaviour, so an entry in [`cross-community-changelog.md`](../cross-community-changelog.md) is mandatory in the same change set.** Nothing here deletes or disables a federation object.

---

## Severity summary

| # | Finding | Sev | Area | Tag | Fixed by |
|---|---------|-----|------|-----|----------|
| 1 | **The `fraud-check` Edge Function is not deployed.** Every spam/fraud rule in the product is inert and always returns PASS | **P0** | Platform | live | [F1](#f1--deploy-the-fraud-check-function-issue-1), [C1](#c1--libfraudcheckts) |
| 2 | Any resident can set `is_verified = true`, reset `fraud_status`, and write their own `avg_rating` / `rating_count` on a provider they created | **P0** | DB (grants + RLS) | live | [M1](#m1--lock-down-provider-column-writes-issues-2-8-9) |
| 3 | `ratings` INSERT has **no provider-community check** — any approved user can rate any provider on the platform by id, and the trigger folds it into the public average | **P0** | DB (RLS) | live | [M2](#m2--scope-and-moderate-ratings-issues-3-7) |
| 4 | Flagged and blocked reviews are fully public **and still count toward the rating** — the whole review half of the fraud pipeline changes nothing | **P0** | DB + Client | code | [M2](#m2--scope-and-moderate-ratings-issues-3-7), [C2](#c2--appprovideridtsx) |
| 5 | Reports can never be resolved: `status`, `reviewed_by`, `reviewed_at` and a lead UPDATE policy all exist and **nothing ever writes them** | P1 | Client + admin | live | [C2](#c2--appprovideridtsx), [C4](#c4--admin-dashboardjsprovidersjs) |
| 6 | One resident's free text is published to the whole community as a permanent "Community Reports" banner — no threshold, no moderation, no withdrawal | P1 | Client + DB | code | [M3](#m3--report-integrity-issues-6-14-23), [C2](#c2--appprovideridtsx) |
| 7 | Stored **XSS** in the platform admin console via resident-supplied report details and provider name | P1 | Admin console | code | [C4](#c4--admin-dashboardjsprovidersjs) |
| 8 | A `hidden` / `blocked` provider is still reachable, shareable and reviewable — the filter is client-side in 3 of 5 read paths | P1 | Client + DB | code | [M1](#m1--lock-down-provider-column-writes-issues-2-8-9), [C3](#c3--the-three-list-read-paths) |
| 9 | Nothing in the product can ever **un-hide** a provider. `fraud_status` is write-once from the add flow | P1 | DB + admin | code | [M1](#m1--lock-down-provider-column-writes-issues-2-8-9), [C4](#c4--admin-dashboardjsprovidersjs) |
| 10 | The Help tab's contact count is **always 0** — the hires query filters on a column that does not exist and the error is swallowed | P1 | Client | live | [C3](#c3--the-three-list-read-paths) |
| 11 | The admin console cannot see `fraud_status`, `is_verified`, or **any review text** — the one moderation action available is hard delete | P1 | DB (RPC) + admin | live | [M4](#m4--give-the-admin-console-the-moderation-data-issues-11-13), [C4](#c4--admin-dashboardjsprovidersjs) |
| 12 | `hire_count` is unbounded-inflatable **and is the only gate on reviewing** — one Call tap self-authorizes a review (extends prior finding 20) | P1 | Client + DB | code | [M5](#m5--dedupe-provider-contacts-issue-12), [C2](#c2--appprovideridtsx) |
| 13 | Provider creation has **no spam rule at all** beyond duplicate phone — no profanity, no contact-in-name, no per-user creation velocity | P1 | Edge fn | code | [F1](#f1--deploy-the-fraud-check-function-issue-1), [M4](#m4--give-the-admin-console-the-moderation-data-issues-11-13) |
| 14 | No length or content bound on any provider-authored text; the one column that **does** have a bound surfaces its violation as a generic error | P1 | DB + Client | live | [M3](#m3--report-integrity-issues-6-14-23), [C2](#c2--appprovideridtsx) |
| 15 | `20260607194000` dropped `is_user_approved()` from the provider INSERT policy; a removed resident with stale JWT metadata can still create providers | P1 | DB (RLS) | live | [M1](#m1--lock-down-provider-column-writes-issues-2-8-9) |
| 16 | Report reasons other than `other` silently discard details the reporter typed, and cannot carry an explanation at all | P2 | Client | code | [C2](#c2--appprovideridtsx) |
| 17 | The Report button renders for a cross-community provider, then fails with a generic toast because the INSERT policy is community-scoped | P2 | Client | live | [C2](#c2--appprovideridtsx) |
| 18 | `description` and every category-specific `details` field are collected and **never rendered anywhere** in the app | P2 | Client | code | [C2](#c2--appprovideridtsx) |
| 19 | `number` detail fields are stored into JSONB as raw unparsed strings — `"abc"` persists | P2 | Client | code | [C5](#c5--appprovideraddtsx) |
| 20 | The client fraud filter runs **after** `.limit(100)`, so hidden rows consume page slots and silently shrink the list | P2 | Client | code | [C3](#c3--the-three-list-read-paths) |
| 21 | Unbounded reads: every rating for a provider plus every reviewer profile, no `.limit()` | P2 | Client | code | [C2](#c2--appprovideridtsx) |
| 22 | Doc drift: the fraud check is documented as operative, and app-summary says leads get delete *instead of* report | P2 | Docs | code | [DOCUMENTATION UPDATES](#documentation-updates) |
| 23 | `provider_reports.reason` is unconstrained `TEXT` — any string is insertable and renders raw in the public banner | P2 | DB | live | [M3](#m3--report-integrity-issues-6-14-23) |

---

# PART 1 — FINDINGS

# P0 — blocks real use

## 1. The entire fraud and spam pipeline is not deployed. Every rule returns PASS

**[live]** This is the headline finding and it invalidates every other spam control in the product.

`list_edge_functions` against `mbzvcaoulawdugfearmj`, 2026-08-08:

```
{ "functions": [] }
```

**There are no Edge Functions deployed on this project.** `supabase/functions/fraud-check/` and `supabase/functions/check_due_services/` exist in the repo and have never been pushed.

Both call sites in [`lib/fraudCheck.ts`](../../lib/fraudCheck.ts) treat an invoke failure as a pass — [lines 60-69](../../lib/fraudCheck.ts#L60-L69):

```ts
if (error) {
  console.warn('Fraud check failed, defaulting to PASS:', error.message);
  return createDefaultPassVerdict('provider', 'new');
}
```

and [lines 107-120](../../lib/fraudCheck.ts#L107-L120) returns `action: 'PASS'`, `flag_count: 0`, `hard_block_triggered: false`. So `checkProviderFraud` and `checkReviewFraud` are, today, constant functions.

Corroborated by the data. Live counts:

```
providers_total            171
providers_not_pass           0        fraud_status breakdown: { "pass": 171 }
provider_ratings             1        fraud_status breakdown: { "pass": 1 }
fraud_verdicts_logged        0        verdict breakdown: {}
verified_providers           0
```

The Edge Function writes one `fraud_verdicts` row per invocation, unconditionally, on **every** path including PASS ([`index.ts:462-471`](../../supabase/functions/fraud-check/index.ts#L462-L471)). **Zero rows across 171 provider creations** is direct proof it has never executed once.

**What is inert.** Thirteen rules, all written, all reviewed, none running:

| Rule | Name | Severity | What it was meant to stop |
|---|---|---|---|
| R-P1 | Duplicate phone | HARD_BLOCK | Same number re-added under a second name |
| R-R1 | New account review | FLAG | Sock-puppet account reviewing within 24 h of signup |
| R-R2 | User velocity | FLAG | >3 reviews from one account in an hour |
| R-R3 | Provider velocity | FLAG | >10 reviews on one provider in 24 h (review bombing / boosting) |
| R-R4 | Duplicate text | FLAG | Copy-pasted review text (>0.90 bigram similarity) |
| R-R6 | **No transaction** | **HARD_BLOCK** | Reviewing a provider you never contacted |
| R-R7 | Minimum length | FLAG | <10-word reviews |
| R-R8 | All-caps spam | FLAG | >70 % uppercase |
| R-R9 | Link/contact in review | FLAG | URL, phone, or email smuggled into review text |
| R-R10 | Rating-only abuse | FLAG | ≥5 textless ratings from one account |
| R-R11 | Extreme bias | FLAG | All 5★ or all 1★ across ≥5 reviews |
| R-R13 | Profanity | FLAG | 28-word English + Hindi blocklist |
| R-R15 | Rapid sequential | FLAG | ≥3 distinct providers reviewed in 5 minutes |

Two of these are the product's only hard gates, and both are open: **anyone can rate a provider they have never contacted** (R-R6), and **the same phone number can be registered twice** — that second one is separately caught by the `service_provider_phone_guard_trigger` (`20260429113000`), which is live and does work, so R-P1 is the only rule with a database backstop.

**What deploying it today would do — read this before you run `fn:deploy`.** R-R6 is `HARD_BLOCK`, and the only thing that creates a `provider_hires` row is tapping **Call** or **WhatsApp** on the provider screen ([`app/provider/[id].tsx:210-234`](../../app/provider/[id].tsx#L210-L234)). Live there are **3** hire rows total against 171 providers. So on the day the function ships, essentially every resident who taps **Submit review** gets:

> **Submission blocked**
> Blocked by R-R6.

with no explanation of what to do differently, because the Rate card ([lines 811-847](../../app/provider/[id].tsx#L811-L847)) says nothing about needing to contact the provider first. That is why F1 is sequenced after M3/C2 and paired with a copy change.

**Not in scope but the same root cause:** `check_due_services` — the daily service-reminder sweep that `.github/app-summary.md` says must be scheduled at `30 3 * * *` — is also undeployed, so personal service reminders never fire either. Flagged here only so it is not lost; it belongs to the reminders feature.

## 2. Any resident can award themselves the "Verified" badge, clear a moderation hide, and write their own rating

**[live]** Two facts combine.

**Fact one — the grant is table-wide.** `information_schema.column_privileges` for `service_providers`:

```
authenticated | UPDATE | details, id, avg_rating, phone, description, is_trending,
                         rating_count, created_at, name, is_verified,
                         shared_by_community_id, fraud_status, visibility,
                         updated_at, flat_block, community_id, category, created_by
```

`UPDATE` is granted on **all eighteen columns**. There is no column-level grant anywhere on this table.

**Fact two — RLS only asks who created the row.** From `pg_policies`:

| cmd | policy | `USING` | `WITH CHECK` |
|---|---|---|---|
| UPDATE | Users can update providers they created | `created_by = auth.uid() AND is_user_approved(auth.uid())` | `created_by = auth.uid() AND is_user_approved(auth.uid())` |

Neither clause mentions a single one of the columns that carry trust. So the resident who added a provider can `PATCH /rest/v1/service_providers?id=eq.<theirs>` with:

- `is_verified: true` → the **Verified** pill renders on the provider header ([`app/provider/[id].tsx:634-638`](../../app/provider/[id].tsx#L634-L638)). Nothing else in the product ever sets this column — live count of verified providers is **0** — so today the badge means "someone claimed it" and nothing more. There is no verification workflow anywhere in the repo for it to contradict.
- `avg_rating: 5.0, rating_count: 40` → the stat tile, the sort order on the Help tab (`.order('avg_rating', { ascending: false })`, [`app/(tabs)/index.tsx:155`](../../app/(tabs)/index.tsx#L155)), and the share message all read from these columns. They are *supposed* to be trigger-owned: `update_provider_rating()` (`20260417300000`) recomputes them from `ratings`. But the trigger only fires on `ratings` writes, so a direct `service_providers` write **is never corrected** until someone happens to leave a review.
- `fraud_status: 'pass'` → undoes a moderation hide (see #9 — this is currently the *only* way to undo one).
- `visibility: 'public'` → `can_user_see_provider()` grants `visibility = 'public'` to **every community on the platform**, so this exports the provider's name and mobile number out of the society. Live, all 171 rows are `'community'`; the default is `'community'`; and per [`cross-community.md`](../cross-community.md) no UI sets this yet — which is exactly why an unguarded column write is the wrong thing to leave lying around.
- `community_id: <another society>` → `WITH CHECK` does not pin the tenant column. This is the trap written out verbatim in `docs/CLAUDE.md` §9: *"An RLS `UPDATE` policy with `USING` but no `WITH CHECK` … If `USING` does not mention `community_id`, a resident can move their own row into another community."* Here both clauses exist and **neither** mentions it.

I did not execute any of these writes (audit rule: read-only). The finding rests on the grant table and the policy text quoted above, both independently checkable in one query.

There is no provider edit screen in the app — [`app/provider/`](../../app/provider/) contains only `add.tsx` and `[id].tsx` — so **no legitimate client code needs `UPDATE` on this table at all.** That makes the fix cheap and low-risk: revoke the grant down to what a future edit screen would need, and pin the columns in the policy.

## 3. Anyone can rate any provider in any community, and it lands in the public average

**[live]** The complete live `ratings` policy set:

| cmd | policy | `USING` | `WITH CHECK` |
|---|---|---|---|
| SELECT | Users can view ratings in their community | provider **or** listing is in caller's community, and approved | — |
| INSERT | Users can insert their own ratings | — | `user_id = auth.uid() AND is_user_approved(auth.uid())` |
| UPDATE | Users can update their own ratings | `user_id = auth.uid() AND is_user_approved(auth.uid())` | same |
| DELETE | *(none)* | | |

The `SELECT` policy is carefully community-scoped. **The `INSERT` policy is not scoped to anything but the caller's own user id.** It never checks that `provider_id` names a provider the caller can see, is in their community, or exists in their society at all.

So any approved resident of any society can `POST /rest/v1/ratings` with `{ user_id: <self>, provider_id: <any provider uuid>, rating: 1 }`, and `update_provider_rating()` (`SECURITY DEFINER`, recomputes from scratch) immediately folds it into that provider's `avg_rating` and `rating_count`.

What makes this worse than a normal scoping miss: because the `SELECT` policy *is* scoped, **the victim community can never see the row that moved their number.** The provider's rating drops from 4.6 to 3.9, the Community Reviews list shows nothing new, and no lead, president, or platform admin has a screen that would surface it. `platform_get_provider_details` does return every rating regardless of community — but it does not return the reviewer's community, so even there the anomaly is invisible.

Provider ids are not secret: the app's own Share button emits `siteUrl('/provider/<id>')` into WhatsApp ([`app/provider/[id].tsx:239`](../../app/provider/[id].tsx#L239)).

**And there is no `DELETE` policy.** Consequences in both directions:
- A resident cannot delete their own review. The Rate card only ever upserts ([lines 316-328](../../app/provider/[id].tsx#L316-L328)), so once you have rated, you can change the stars but never withdraw.
- A community lead or platform admin cannot remove a single abusive review. The only lever is deleting the entire provider, which also destroys every legitimate review, favourite, hire, and personal note on it (`ON DELETE CASCADE`).

This is the trap in `docs/CLAUDE.md` §9 — *"A table with only SELECT/INSERT policies that the app also deletes from"* — arriving from the other side: the app doesn't delete, because it can't, because the policy was never written.

## 4. Flagged and blocked reviews are fully public and still count toward the rating

**[code]** Suppose #1 is fixed and the Edge Function starts producing verdicts. The verdict still changes nothing, because nothing reads `ratings.fraud_status`.

**The rating trigger ignores it.** `update_provider_rating()` (`20260417300000_fix_provider_rating_trigger.sql`):

```sql
UPDATE public.service_providers
SET rating_count = (SELECT COUNT(*) FROM public.ratings WHERE provider_id = target_provider_id),
    avg_rating   = COALESCE((SELECT ROUND(AVG(rating)::numeric, 1) FROM public.ratings
                             WHERE provider_id = target_provider_id), 0)
WHERE id = target_provider_id;
```

No `fraud_status` predicate. A `HIDE_PENDING_REVIEW` verdict — the outcome for 2 or 3 simultaneous flags — moves the average exactly as much as a clean review does. So does a `blocked` row, if one ever reaches the table.

**The review list ignores it.** [`app/provider/[id].tsx:437-441`](../../app/provider/[id].tsx#L437-L441):

```tsx
const { data, error } = await supabase
  .from('ratings')
  .select('id, rating, review_text, created_at, user_id')
  .eq('provider_id', providerId)
  .order('created_at', { ascending: false });
```

No filter. Every flagged review, with its full text, renders in **Community Reviews** under the reviewer's real name and flat number.

**The RLS `SELECT` policy ignores it** too, so this is not fixable in the client alone.

The user-facing copy actively lies about it. [`lib/fraudCheck.ts:139-143`](../../lib/fraudCheck.ts#L139-L143) tells the submitter:

> **Under review**
> Your submission has been flagged and will be reviewed by a moderator.

There is no moderator queue, no moderator screen, and the content was published in full the instant they tapped Submit. The same is true of the `QUEUE_LOW_PRIORITY` copy — *"will be visible after a quick review"* — which is doubly wrong, because [`app/(tabs)/index.tsx:202-204`](../../app/(tabs)/index.tsx#L202-L204) treats `queued_low` as **visible**, not pending.

Net effect: the review half of the fraud system is a `fraud_status` column that nothing consumes and three toast messages describing a workflow that does not exist.

---

# P1 — high

## 5. A report can be filed but never resolved

**[live]** `provider_reports` was built for a moderation lifecycle. `20260606170000_provider_reports.sql` gives it `status TEXT NOT NULL DEFAULT 'pending'` (documented `'pending' | 'reviewed' | 'dismissed'`), `reviewed_by`, `reviewed_at`, and a dedicated policy:

```sql
CREATE POLICY "Leads and admins can update provider reports"
  ON public.provider_reports FOR UPDATE
  USING (is_user_approved(auth.uid()) AND (is_community_lead(auth.uid()) OR is_platform_admin(auth.uid())))
  WITH CHECK (…same…);
```

Confirmed live in `pg_policies`. Now grep every writer of that table across the whole repo:

```
$ grep -rn "provider_reports" app/ components/ lib/ admin-dashboard/
app/provider/[id].tsx:357     .from('provider_reports')      -- SELECT (own report)
app/provider/[id].tsx:497     .from('provider_reports')      -- INSERT
app/provider/[id].tsx:533     .from('provider_reports')      -- SELECT (all)
```

Three reads and one insert. **No `UPDATE` anywhere, in the app or in the admin console.** `status` is written once by its `DEFAULT` and never again; `reviewed_by` and `reviewed_at` have never been non-null. Live: `reports_total = 1`, breakdown `{ "pending": 1 }`.

The admin console *displays* the status it can never change — [`admin-dashboard/js/providers.js:140`](../../admin-dashboard/js/providers.js#L140) computes `statusClass` for `pending` / `reviewed` / `dismissed` and renders a badge. Three states, one reachable.

So the moderation loop the notification promises is open at the far end. `handle_provider_report_notification()` (correctly repointed to president/vice_president in `20260822000000`) tells every lead *"Tap to review."*; [`app/notifications.tsx:78-79`](../../app/notifications.tsx#L78-L79) now routes them correctly to `/provider/<id>` — and there, the lead's only options are the same **Report provider** button every resident sees, and **Delete provider**. There is no "dismiss this report", no "mark reviewed", no way to record that they looked.

## 6. One resident's free text becomes a permanent public accusation, with no threshold and no withdrawal

**[code]** [`app/provider/[id].tsx:774-809`](../../app/provider/[id].tsx#L774-L809) renders, to **every resident in the community**:

```tsx
{reports.length > 0 && (
  <View style={styles.detailsCard}>
    <Text style={…}>Community Reports ({reports.length})</Text>
    …
    {group.details.map((detail, idx) => (
      <Text key={idx} …>• "{detail}"</Text>
    ))}
```

Five separate controls are missing from that path:

**(a) No threshold.** `reports.length > 0`. A **single** report paints a red "Community Reports (1)" card onto the provider's profile for the whole society. Compare the MCN listings module, which got dedicated spam controls in `20260821000000_mcn_listing_spam_controls.sql` and `20260821000200_restrict_flagged_listing_reactivation.sql` — providers never got the equivalent.

**(b) No moderation gate.** The banner is not gated on `status`, so it renders `pending` reports the instant they are filed and will keep rendering `dismissed` ones after #5 is fixed. `fetchAllReports` ([lines 528-543](../../app/provider/[id].tsx#L528-L543)) selects `id, reason, details, created_at` with no `status` predicate at all.

**(c) The free text is published verbatim.** `details` goes in unvalidated and comes out inside quote marks. It is read by everyone; it is never seen by a moderator first.

**(d) No content or length validation on `details`.** No `CHECK` on the column (confirmed live), no `maxLength` on the input ([lines 956-964](../../app/provider/[id].tsx#L956-L964)), no profanity filter — and note that even the profanity list that exists (R-R13) applies only to *review* text, never to report details.

**(e) No withdrawal.** `"Provider reports cannot be deleted" FOR DELETE USING (false)` — deliberate, for audit integrity, and correct as a database rule. But it means a mis-tapped report is permanent, and the client offers no path to a lead who could void it. `hasReported` disables the button forever after the first submit ([line 860](../../app/provider/[id].tsx#L860)).

Read together: any resident can, in about four taps, attach a permanent, unmoderated, community-visible accusation with arbitrary text to a named provider with a real phone number, and there is no mechanism in the product to take it down short of deleting the provider entirely. For a gated-community product whose providers are real local tradespeople, this is the highest-consequence finding in this document after #1.

The reporter's identity is correctly withheld from the public banner (only `reason`, `details`, `created_at` are selected) — that part is right, and should stay that way. Note the RLS `SELECT` policy is far wider than the banner needs: `"Approved users can view provider reports"` returns `reported_by` to any approved resident who queries the table directly, so the anonymity is a client-side convention only.

## 7. Stored XSS in the platform admin console, injected through the report form

**[code]** [`admin-dashboard/js/providers.js`](../../admin-dashboard/js/providers.js) builds every panel with `innerHTML` and interpolates resident-supplied strings raw. [Lines 141-153](../../admin-dashboard/js/providers.js#L141-L153):

```js
reportsHtml += `
  …
  <p style="font-weight: 500; margin-bottom: 4px;">Reason: ${r.reason.replace('_', ' ')}</p>
  ${r.details ? `<p class="text-2" …>"${r.details}"</p>` : ''}
  <div …>Reported by: ${r.user_name || 'Resident'} (${r.user_email || 'No email'})</div>
`;
```

`r.details` is free text a resident typed into the Report Provider modal. `r.reason` is likewise unconstrained (#23). Neither is escaped, and the surrounding context is HTML.

The same pattern repeats for provider-controlled fields at [lines 186-196](../../admin-dashboard/js/providers.js#L186-L196) — `data.name`, `data.category`, `data.phone`, `data.flat_block`, `data.description` — and for reviewer names at [line 171](../../admin-dashboard/js/providers.js#L171).

There is a second, distinct injection in the list rows, [line 96](../../admin-dashboard/js/providers.js#L96):

```js
onclick="event.stopPropagation(); ProvidersPage.confirmDelete('${sp.id}', '${sp.name}')"
```

`sp.name` is interpolated into a **single-quoted JS string inside an HTML attribute**. A provider named `O'Brien` — an entirely ordinary name — breaks the handler outright; a deliberately crafted name closes the string and appends arbitrary JavaScript.

Why this is worse than a generic XSS: the report details field is the ideal delivery vehicle, because a resident controls it completely and a platform admin is *guaranteed* to open the page to read it — that is the whole purpose of the screen. The admin's session is the highest-privilege one on the platform (every `platform_*` RPC is gated on `is_platform_admin(auth.uid())`), and the console holds the anon key. `docs/CLAUDE.md` §9 already notes `admin-dashboard/` has no bundler and no framework escaping — every value is hand-interpolated, so nothing catches this for you.

## 8. A hidden or blocked provider is still reachable, shareable, and reviewable

**[code]** The fraud filter is a client-side `.filter()` in exactly three places:

| Path | Line | Filters? |
|---|---|---|
| Help tab list | [`app/(tabs)/index.tsx:199-205`](../../app/(tabs)/index.tsx#L199-L205) | yes |
| Saved tab | [`app/(tabs)/favorites.tsx:40`](../../app/(tabs)/favorites.tsx#L40) | yes |
| Visit provider picker | [`components/ProviderSelector.tsx:74-76`](../../components/ProviderSelector.tsx#L74-L76) | yes |
| **Provider detail screen** | [`app/provider/[id].tsx:114-118`](../../app/provider/[id].tsx#L114-L118) | **no** |
| **RLS `SELECT` policy** | live: `community_id = get_user_community_id() AND is_user_approved(...)` | **no** |

So a `hidden` or `blocked` provider disappears from lists and remains fully functional at `/provider/<id>`: header, phone, **Call**, **WhatsApp**, Share, favourite, review form, everything.

That URL is not obscure — the app generates and distributes it. [`app/provider/[id].tsx:239`](../../app/provider/[id].tsx#L239) and [`components/ProviderCard.tsx`](../../components/ProviderCard.tsx) both build `siteUrl('/provider/<id>')` and put it in a WhatsApp share message. Anyone who received that link before the hide keeps working access afterwards, and every resident's Saved list keeps the row (only the render is filtered, not the `favorites` row).

The filter is also duplicated three times with the same three-way condition (`!status || 'pass' || 'queued_low'`) and no shared helper, which is how the fourth call site came to be missing.

## 9. Nothing in the product can un-hide a provider

**[code]** `fraud_status` is written in exactly one place — [`app/provider/add.tsx:199`](../../app/provider/add.tsx#L199), at insert time, from the verdict. After that:

- There is **no provider edit screen.** [`app/provider/`](../../app/provider/) is `add.tsx` and `[id].tsx`.
- There is **no lead or platform-admin `UPDATE` policy** on `service_providers`. Live, the only `UPDATE` policy is `created_by = auth.uid()` (#2). A president cannot change any field of any provider they did not personally add.
- The admin console has **no control for it** — `loadProviderDetail` renders read-only panels plus a delete button, and `platform_get_provider_details` does not even return the column (#11).

So the state machine is one-way. Once #1 is fixed and the function starts flagging, a false positive is permanent: the provider vanishes from the directory and the only remedy available to any human in the product is **delete**, which destroys the reviews and favourites too.

The one accidental escape hatch is #2 — the resident who created the provider can `PATCH fraud_status: 'pass'` and restore it. That the sole recovery path is an unintended privilege escalation is not a mitigation.

## 10. The Help tab's community-trust number is always zero

**[live]** [`app/(tabs)/index.tsx:182-185`](../../app/(tabs)/index.tsx#L182-L185):

```tsx
supabase.from('provider_hires')
  .select('provider_id')
  .eq('community_id', communityId)
```

**`provider_hires` has no `community_id` column.** From `information_schema.columns`, the complete list is:

```
provider_hires: id, user_id, provider_id, created_at
```

PostgREST answers a filter on a non-existent column with HTTP 400, `42703 column provider_hires.community_id does not exist`. The error is then swallowed, [lines 187-192](../../app/(tabs)/index.tsx#L187-L192):

```tsx
if (providersResult.error) throw providersResult.error;
if (favoritesResult.error) throw favoritesResult.error;
// hiresResult.error is only tested against isMissingRelationError:
if (!isMissingRelationError(hiresResult.error)) {
  (hiresResult.data ?? []).forEach(h => { hireCounts[h.provider_id] = … });
}
```

`isMissingRelationError` matches only `PGRST205` and the literal string `"Could not find the table 'public.provider_hires'"` ([lines 24-26](../../app/(tabs)/index.tsx#L24-L26)). A `42703` is neither, so the guard passes, `hiresResult.data` is `null`, `?? []` makes it empty, and `hireCounts` stays `{}`.

Result: **every provider card on the Help tab reads `0 homes`** ([`components/ProviderCard.tsx:90`](../../components/ProviderCard.tsx#L90)), for all 171 providers, permanently, with no error surfaced. The prior audit's finding 15 noted the general shape of this swallow; the specific cause — a column that does not exist — is new, and it means the trust signal is not merely occasionally wrong but structurally always zero.

The provider *detail* screen counts correctly (it filters on `provider_id` only, [lines 132-134](../../app/provider/[id].tsx#L132-L134)), so the list and the detail screen disagree about the same provider: `0 homes` on the card, `contacted 3 times` on the page.

Note also that the detail screen's count is community-wide by construction (`.eq('provider_id', id)` with no user or community predicate), which is what the RLS `SELECT` policy on `provider_hires` already scopes for it. Fixing the list query means dropping the bad filter, **not** adding a column.

## 11. The admin console cannot see the fraud state, and cannot read a single word of any review

**[live]** `platform_get_provider_details` (`20260620180000_platform_admin_extensions.sql`) is correctly gated (`IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN RAISE`). Its payload is the problem. It returns:

```
id, name, phone, category, description, flat_block, avg_rating, rating_count,
community_id, community_name, created_at, hires_count, reviews[], reports[]
```

and each element of `reviews[]` is:

```sql
jsonb_build_object('rating_id', r.id, 'rating', r.rating, 'created_at', r.created_at,
                   'user_name', p.full_name, 'user_email', p.email, 'flat_number', p.flat_number)
```

Three omissions, each disabling a moderation decision the admin is nominally there to make:

- **No `fraud_status`** on the provider, and none on any rating. The admin cannot tell a hidden provider from a clean one, cannot see which reviews were flagged, and cannot see `fraud_rules_triggered`.
- **No `is_verified`.** The badge a resident can forge (#2) is invisible to the only person who could notice.
- **No `review_text`.** The console shows star counts and reviewer names and **not one word of review content**. An admin who receives a report of an abusive review has no screen anywhere — app or console — that displays it. (`fraud_verdicts` has an admin-only `SELECT` policy but no console page reads it, and it is empty anyway per #1.)

Combined with the absence of any status write (#5) and any `UPDATE` path (#9), the platform admin's complete moderation vocabulary over providers is one word: **delete**. `platform_delete_service_provider` cascades away every rating, favourite, hire, personal note, and report in the process.

## 12. `hire_count` is freely inflatable — and it is the only thing standing between a stranger and a review

**[code]** *Extends prior finding 20, which covered the mislabelling. The new part is what the number now gates.*

[`app/provider/[id].tsx:163-208`](../../app/provider/[id].tsx#L163-L208) — `logHire()` inserts unconditionally, and both contact handlers call it first ([lines 210-234](../../app/provider/[id].tsx#L210-L234)). `provider_hires` has no unique constraint (columns: `id, user_id, provider_id, created_at`; policies: one INSERT, one SELECT; no constraint, no trigger). No dedupe, no cooldown, no rate limit.

Two independent consequences:

**(a) The trust signal.** Tap **Call**, no answer, tap **WhatsApp**, tap **Call** again tomorrow → three rows. Surfaced as `contacted 3 times` in the header pill ([line 641](../../app/provider/[id].tsx#L641)), as **Contacts** in the stat tile ([lines 656-659](../../app/provider/[id].tsx#L656-L659)), and in the share text ([line 248](../../app/provider/[id].tsx#L248)). On native, each tap also queues its own 24-hour "How was your visit?" local notification ([lines 182-200](../../app/provider/[id].tsx#L182-L200)) — three taps, three reminders.

**(b) The gate.** R-R6, the *only* `HARD_BLOCK` protecting reviews, is `COUNT(*) > 0` on this table ([`index.ts:119-123, 206-215`](../../supabase/functions/fraud-check/index.ts#L206-L215)). So "you must have transacted with this provider" reduces, in practice, to "you must have tapped Call once". A review-bombing account taps Call, dismisses the dialer, and is authorized. Deploying F1 without M5 ships a hard gate that costs an attacker one tap while blocking every honest resident who used the phone number from the share message instead of the button.

## 13. Provider creation has no spam rule at all beyond duplicate phone

**[code]** `evaluateProviderRules` ([`index.ts:51-74`](../../supabase/functions/fraud-check/index.ts#L51-L74)) is thirteen lines long and contains exactly one rule: R-P1, duplicate phone. That is it. Even with F1 deployed, provider creation is checked for nothing else:

- **No profanity check on `name` or `description`** — the 28-word blocklist is applied only to review text (`evaluateReviewRules`, [lines 260-273](../../supabase/functions/fraud-check/index.ts#L260-L273)).
- **No URL / phone / email check** on `name` or `description` — R-R9's patterns exist and are applied only to reviews. So the description field, whose own placeholder invites price lists, will happily carry `Best rates! wa.me/91… visit shady-site.example`.
- **No per-user creation velocity.** Nothing limits how many providers one account can add, or how fast. One resident can add 171.
- **No duplicate-name check**, so the same tradesperson under two phone numbers is two rows with two independent ratings.
- **No category validation** — `category` is `TEXT NOT NULL` with no `CHECK` and no FK to `constants/categories.ts`. The picker constrains the UI; the API does not.

Note R-P1 is also **redundant against the client** as written: [`app/provider/add.tsx:172-176`](../../app/provider/add.tsx#L172-L176) already looks up the phone and routes to the existing provider before the fraud check runs, and the `service_provider_phone_guard_trigger` backstops it at the database. So the one provider-side rule that exists duplicates a guard that already works, and the gaps that need covering are uncovered.

One subtle interaction worth knowing before F1 ships: the client pre-check runs under **RLS** while R-P1 runs under the **service role**. Any provider row the caller cannot see but the service role can (a future cross-community or soft-hidden row) makes the pre-check miss and R-P1 hard-block, producing a bare *"Submission blocked"* with no explanation and no route to the existing row.

## 14. No length or content bound on any provider-authored text — and the one column that has a bound reports it as a mystery error

**[live]** Column constraints on the four text fields a resident can write:

| Column | `CHECK` | Client `maxLength` |
|---|---|---|
| `service_providers.name` | none | none |
| `service_providers.description` | none | none |
| `ratings.review_text` | none | none |
| `provider_reports.details` | none | none |
| `provider_personal_notes.note` | **`length(note) <= 1000`** | **none** |

The first four are unbounded in both places: a name or description of arbitrary size is insertable and will render into the header, the card, and the WhatsApp share text. Compare [`app/services/add.tsx`](../../app/services/add.tsx), which caps its inputs at `maxLength={100}` / `{60}` / `{500}` — the pattern exists in the repo, the provider screens never adopted it.

The fifth is the inverse failure. `20260606193000_provider_personal_notes.sql` correctly caps the note at 1000 characters, but neither writer sets `maxLength` — [`app/provider/[id].tsx:674-683`](../../app/provider/[id].tsx#L674-L683) and [`app/provider/add.tsx:451-460`](../../app/provider/add.tsx#L451-L460). A resident who pastes a longer note gets:

> **Error saving personal note**

with no character count, no mention of a limit, and no hint that trimming would help — [line 428](../../app/provider/[id].tsx#L428) discards the database message entirely. On the *add* screen it is worse: the check-violation is thrown after the provider row has already been inserted ([lines 218-234](../../app/provider/add.tsx#L218-L234)), so the `catch` shows a raw Postgres error while the provider **has been created**. Two client round trips, one of which a constraint can veto — the trap in `docs/CLAUDE.md` §9 about writing a parent and its children separately.

## 15. `20260607194000` removed the approval check from provider creation

**[live]** `20260607194000_fix_provider_insert_policy.sql` replaced the INSERT policy, dropping `is_user_approved(auth.uid())` on the reasoning that *"Community membership already gates insert via `get_user_community_id()` equality."* Live:

```
INSERT | Users can insert providers in their community
       | WITH CHECK ((community_id = get_user_community_id()) AND (created_by = auth.uid()))
```

The reasoning does not hold, because `get_user_community_id()` **falls back to the JWT**:

```sql
SELECT p.community_id INTO v_profile_community_id FROM public.profiles p WHERE p.id = auth.uid();
IF v_profile_community_id IS NOT NULL THEN RETURN v_profile_community_id; END IF;
RETURN COALESCE((auth.jwt() -> 'app_metadata' ->> 'community_id')::uuid,
                (auth.jwt() -> 'user_metadata' ->> 'community_id')::uuid);
```

Removal (`community_lead_remove_resident` / `platform_soft_remove_resident`) sets `profiles.community_id = NULL` and `removed_at = now()` — but it cannot revoke an already-issued access token. For a removed resident the profile lookup returns `NULL`, execution reaches the `COALESCE`, and the **stale JWT claim** supplies their former community. The policy then passes, and they can keep inserting providers into the society that removed them for the life of the token.

Every neighbouring policy still has the guard — `ratings` INSERT, `provider_reports` INSERT, `provider_hires` INSERT, and `service_providers` SELECT/UPDATE/DELETE all call `is_user_approved()`, which reads `profiles` live and correctly returns false. Provider INSERT is the only one that lost it.

**Current exploitability is narrow and I want to be precise about it.** Live `auth.users` metadata shape:

```
total users                18
raw_app_meta_data  has community_id     0
raw_user_meta_data has community_id     1
```

For 17 of 18 accounts both fallbacks are `NULL`, so `get_user_community_id()` returns `NULL`, `community_id = NULL` evaluates to `NULL` rather than true, and the insert fails. **One** account carries `user_metadata.community_id` and would pass. So this is a latent hole whose only current defence is that JWT metadata happens to be unpopulated — not a policy. Any future change that starts stamping `app_metadata.community_id` at join time (a normal thing to want) turns it on for everybody at once.

Note `is_user_approved()` itself does not test `removed_at IS NULL`; it relies entirely on removal nulling `community_id`. That coupling holds today in both removal RPCs, and is worth stating in `architecture.md` so a future third removal path does not break it.

---

# P2 — smaller

## 16. Choosing any reason but "Other" silently throws away what the reporter typed

**[code]** *Extends the report flow.* [`app/provider/[id].tsx:491`](../../app/provider/[id].tsx#L491):

```tsx
const detailsValue = selectedReason === 'other' ? reportDetails.trim() : null;
```

The details `TextInput` only renders for `other` ([lines 953-966](../../app/provider/[id].tsx#L953-L966)), but the `reportDetails` state persists across reason changes. A resident who picks **Other**, writes two sentences, then realises **Wrong info** fits better, submits a report with `details: null` and no warning that their explanation was dropped.

The underlying rule is the real problem: `wrong_info` is the reason most in need of an explanation — *what* is wrong? the number? the rate? — and it is structurally prevented from carrying one. `unavailable` and `inappropriate` likewise.

## 17. The Report button is offered on cross-community providers, then fails with a generic toast

**[live]** `service_providers_select_cross_community` (`USING can_user_see_provider(id)`) means a resident can legitimately open a provider owned by a partner community. The report INSERT policy is strictly community-scoped:

```sql
WITH CHECK (reported_by = auth.uid() AND is_user_approved(auth.uid())
            AND EXISTS (SELECT 1 FROM service_providers sp
                        WHERE sp.id = provider_id AND sp.community_id = get_user_community_id()))
```

The button has no such gate ([line 857](../../app/provider/[id].tsx#L857)), so on a federated provider the submit produces an RLS rejection (`42501`) that lands in the generic handler at [line 522](../../app/provider/[id].tsx#L522): **"Failed to submit report"**, with a console log and no explanation.

Inert today — all 171 providers are `visibility = 'community'` and there are no active partnerships — but it becomes user-visible the day federation is switched on, which is exactly the kind of thing [`cross-community.md`](../cross-community.md) exists to keep track of.

## 18. `description` and every category-specific detail are collected and never shown

**[code]** [`app/provider/add.tsx`](../../app/provider/add.tsx) asks for a Description with a placeholder that invites a full price list — *"e.g. Fan repair ₹300, switchboard fix ₹150, full home wiring ₹2500"* ([line 439](../../app/provider/add.tsx#L439)) — and renders a whole **Optional details for {category}** section driven by [`constants/providerDetails.ts`](../../constants/providerDetails.ts) (specialization chips, charges, availability, brands, …) into `service_providers.details` (JSONB).

Neither is ever displayed. Repo-wide, `provider.description` appears in exactly two places and `provider.details` in none:

```
app/provider/[id].tsx:249        provider.description ? `About: "${provider.description}"` : ''   -- share message
components/ProviderCard.tsx:32   provider.description ? `About: "${provider.description}"` : ''   -- share message
```

Both are the **WhatsApp share text**. The provider detail screen has no description block and no details block. The give-away is a cluster of six styles that nothing applies — `detailsMetaSection`, `detailMeta`, `detailMetaLabel`, `detailMetaValue`, `moneyMetaRow`, `detailMetaSuffix` ([lines 1169-1196](../../app/provider/[id].tsx#L1169-L1196)) — the display block was written and then removed.

Product consequence: the pricing a resident carefully typed is visible only to whoever they forward a WhatsApp message to, and `20260427100000_add_provider_details.sql` plus the whole `providerDetails.ts` taxonomy currently generate write-only data.

## 19. Numeric detail fields are stored as unparsed strings

**[code]** [`app/provider/add.tsx:317-325`](../../app/provider/add.tsx#L317-L325) — the `number` case wires `onChangeText={(val) => updateDetail(field.key, val)}` straight through, and `updateDetail` stores the raw value. `cleanDetails()` ([lines 117-125](../../app/provider/add.tsx#L117-L125)) only strips empties. So `details.charges` persists as the **string** `"300"`, and `keyboardType="numeric"` does not stop `"abc"`, `"3 0 0"`, or `"-5"` on web. There is no schema on the JSONB column to catch it.

Latent while #18 stands, and it will bite whichever screen eventually renders these as money or does arithmetic on them.

## 20. The client fraud filter runs after the page limit, silently shrinking the list

**[code]** [`app/(tabs)/index.tsx:150-156`](../../app/(tabs)/index.tsx#L150-L156) applies `.limit(100)` server-side; [lines 199-205](../../app/(tabs)/index.tsx#L199-L205) filter for `fraud_status` client-side, *after*. Hidden rows therefore consume slots in the page: with 40 hidden providers the resident sees 60 and no "load more". The same ordering issue applies to [`app/(tabs)/favorites.tsx:40`](../../app/(tabs)/favorites.tsx#L40).

Invisible today (0 providers are non-`pass`) and it becomes real the moment F1 ships. Once the predicate lives in RLS (M1 §3), the problem disappears rather than needing a client fix.

## 21. Unbounded reads on the provider detail screen

**[code]** `fetchPublicReviews` ([lines 434-472](../../app/provider/[id].tsx#L434-L472)) fetches **every** rating for the provider with no `.limit()`, then fetches **every** matching profile with `.in('id', userIds)` — and the UI only ever shows 3 until the user asks for more ([line 96](../../app/provider/[id].tsx#L96)). `fetchAllReports` ([lines 528-543](../../app/provider/[id].tsx#L528-L543)) is likewise unbounded and is called on every mount for every provider, whether or not any report exists.

Trivial at one rating; the same shape as prior finding 24 and worth fixing while the file is open.

## 22. The docs describe a fraud system that does not run, and a report/delete rule that is not the code

**[code]** Three specific drifts:

- [`docs/features.md:108`](../features.md) — *"Creation runs the `fraud-check` Edge Function and stores the verdict in `service_providers.fraud_status` (and a row in `fraud_verdicts`)"* — and [`:473`](../features.md), which lists the function in the integrations table as operative. Neither says it is undeployed; `fraud_verdicts` has never received a row.
- [`.github/app-summary.md:145`](../../.github/app-summary.md) — *"Community leads and platform admins get delete **instead of** report."* The code renders **both**: the Report button is unconditional and Delete is appended when `canDelete` ([lines 856-880](../../app/provider/[id].tsx#L856-L880)).
- [`.github/app-summary.md:290`](../../.github/app-summary.md) documents the `check_due_services` cron schedule as a live requirement, with no note that the function itself is not deployed.

## 23. `provider_reports.reason` is unconstrained text

**[live]** `reason TEXT NOT NULL` with no `CHECK` (confirmed against `information_schema` and `pg_constraint` — the only constraint on the table is `one_report_per_user_per_provider UNIQUE (provider_id, reported_by)`). The five keys in `REPORT_REASONS` ([lines 474-480](../../app/provider/[id].tsx#L474-L480)) are a client convention, and `getGroupedReports()` falls back to rendering the raw value when it does not recognise it ([line 548](../../app/provider/[id].tsx#L548)):

```tsx
const reasonLabel = REPORT_REASONS.find(r => r.key === rep.reason)?.label || rep.reason;
```

So an arbitrary string posted through the API becomes a heading in the public Community Reports banner — and, unescaped, a heading in the admin console (#7).

---

# PART 2 — FIX PLAN

Ordering matters. **M1–M5 and C1–C5 first; F1 last.** Deploying the fraud function before the moderation surface exists converts finding #1 from "nothing is enforced" into "everything is blocked with no way to unblock it" (#9).

## M1 — Lock down provider column writes (issues 2, 8, 9, 15)

`supabase/migrations/20260902000000_provider_write_and_visibility_guards.sql`

**§1 — Revoke the blanket UPDATE grant, keep only the columns an edit screen would need.**

```sql
REVOKE UPDATE ON public.service_providers FROM authenticated, anon;

GRANT UPDATE (name, phone, category, description, flat_block, details, updated_at)
  ON public.service_providers TO authenticated;
```

`is_verified`, `fraud_status`, `avg_rating`, `rating_count`, `is_trending`, `visibility`, `shared_by_community_id`, `community_id`, `created_by`, `id`, `created_at` become unwritable by any client. `avg_rating` / `rating_count` keep working — `update_provider_rating()` is `SECURITY DEFINER` and unaffected by grants. Also drop `anon`'s `INSERT`/`UPDATE` while you are here; nothing anonymous should ever write this table.

**§2 — Pin the tenant column in the policy, and restore the approval check on insert.**

```sql
DROP POLICY IF EXISTS "Users can update providers they created" ON public.service_providers;
CREATE POLICY "Users can update providers they created"
  ON public.service_providers FOR UPDATE
  USING (created_by = auth.uid() AND is_user_approved(auth.uid())
         AND community_id = public.get_user_community_id())
  WITH CHECK (created_by = auth.uid() AND is_user_approved(auth.uid())
              AND community_id = public.get_user_community_id());

-- Reinstate the guard 20260607194000 removed (issue 15).
DROP POLICY IF EXISTS "Users can insert providers in their community" ON public.service_providers;
CREATE POLICY "Users can insert providers in their community"
  ON public.service_providers FOR INSERT
  WITH CHECK (community_id = public.get_user_community_id()
              AND created_by = auth.uid()
              AND public.is_user_approved(auth.uid()));
```

Re-read the note in `20260607194000` before you do this: that migration removed the check to unbreak onboarding. Verify a **fresh** signup can still add a provider (VERIFICATION step 9) — `is_user_approved()` only requires a non-null `community_id`, which a joined resident has, so it should pass; confirm rather than assume.

**§3 — Move the fraud filter into RLS so it cannot be forgotten at a call site (issues 8, 20).**

```sql
DROP POLICY IF EXISTS "Users can view providers in their community" ON public.service_providers;
CREATE POLICY "Users can view providers in their community"
  ON public.service_providers FOR SELECT
  USING (
    community_id = public.get_user_community_id()
    AND public.is_user_approved(auth.uid())
    AND (
      COALESCE(fraud_status, 'pass') IN ('pass', 'queued_low')
      OR created_by = auth.uid()                       -- author still sees their own
      OR public.is_community_lead(auth.uid())          -- leads can review hidden rows
      OR public.is_platform_admin(auth.uid())
    )
  );
```

**Do not touch `service_providers_select_cross_community`.** It is permissive and unions with this one — that is the additive rule in `docs/CLAUDE.md` §5 and [`decisions/0001`](../decisions/0001-additive-rls-for-cross-community.md). If you want hidden rows excluded from federation too, add the predicate inside `can_user_see_provider()`, not by folding the two policies together.

Note the lead/admin branch here is a deliberate widening so M4's moderation screen can see hidden rows; pair it with `community_id = get_user_community_id()` as written, per the §9 trap about `is_community_lead()` without a tenant predicate.

**§4 — Give leads and platform admins a moderation UPDATE path (issues 2, 9).** Column-level, via a `SECURITY DEFINER` RPC rather than a broad policy, so `is_verified` and `fraud_status` stay unwritable from the client.

**Decision D5: `is_verified` is kept, not dropped.** This RPC becomes the only thing on the platform that can set it, which is what turns the badge from "someone claimed it" into "a lead vouched for this provider". The lead-facing control is [C4 §3](#c4--admin-dashboardjsprovidersjs). Do not drop the column — federation's `list_visible_*` RPC selects it (`20260507000000`), and it is now the anchor for a real verification workflow rather than a forgeable flag.

```sql
CREATE OR REPLACE FUNCTION public.set_provider_moderation_state(
  p_provider_id  UUID,
  p_fraud_status TEXT DEFAULT NULL,
  p_is_verified  BOOLEAN DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_community UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT community_id INTO v_community FROM public.service_providers WHERE id = p_provider_id;
  IF v_community IS NULL THEN RAISE EXCEPTION 'Provider not found'; END IF;

  IF NOT (
    public.is_platform_admin(auth.uid())
    OR (public.is_community_lead(auth.uid()) AND v_community = public.get_user_community_id())
  ) THEN
    RAISE EXCEPTION 'Only community leads and platform admins can moderate providers';
  END IF;

  IF p_fraud_status IS NOT NULL
     AND p_fraud_status NOT IN ('pass','queued_low','hidden','blocked') THEN
    RAISE EXCEPTION 'Invalid fraud_status: %', p_fraud_status;
  END IF;

  UPDATE public.service_providers
  SET fraud_status = COALESCE(p_fraud_status, fraud_status),
      is_verified  = COALESCE(p_is_verified,  is_verified),
      updated_at   = now()
  WHERE id = p_provider_id;
END; $$;

REVOKE ALL ON FUNCTION public.set_provider_moderation_state(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_provider_moderation_state(UUID, TEXT, BOOLEAN) TO authenticated;
NOTIFY pgrst, 'reload schema';
```

Scope is derived from `auth.uid()` and the provider row, never from a caller-supplied community — the §9 rule for `SECURITY DEFINER` RPCs.

## M2 — Scope and moderate ratings (issues 3, 7)

`supabase/migrations/20260902000100_rating_scope_and_fraud_visibility.sql`

**§1 — The provider must be one the caller can actually see.**

```sql
DROP POLICY IF EXISTS "Users can insert their own ratings" ON public.ratings;
CREATE POLICY "Users can insert their own ratings"
  ON public.ratings FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_user_approved(auth.uid())
    AND (
      (provider_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.service_providers sp
         WHERE sp.id = provider_id AND sp.community_id = public.get_user_community_id()))
      OR
      (listing_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.mcn_listings l
         WHERE l.id = listing_id AND l.community_id = public.get_user_community_id()))
    )
  );
```

Same predicate on the `UPDATE` policy's `USING` **and** `WITH CHECK`. This mirrors the existing `SELECT` policy exactly, so it introduces no new asymmetry. The `rating_target_check` constraint (`20260625000000`) already guarantees exactly one of the two ids is non-null, so the branches are exhaustive.

**Federation note:** this deliberately restricts rating to the caller's *own* community rather than to `can_user_see_provider()`. Rating a partner community's provider is a product decision that does not exist yet; note the choice in [`cross-community-changelog.md`](../cross-community-changelog.md) so whoever enables federation revisits it rather than discovering it.

**§2 — Let a resident withdraw their own review, and a lead remove an abusive one (issue 3).**

```sql
DROP POLICY IF EXISTS "Users can delete their own ratings" ON public.ratings;
CREATE POLICY "Users can delete their own ratings"
  ON public.ratings FOR DELETE
  USING (
    (user_id = auth.uid() AND public.is_user_approved(auth.uid()))
    OR public.is_platform_admin(auth.uid())
    OR (public.is_community_lead(auth.uid()) AND EXISTS (
          SELECT 1 FROM public.service_providers sp
          WHERE sp.id = provider_id AND sp.community_id = public.get_user_community_id()))
  );
```

`update_provider_rating()` already handles `TG_OP = 'DELETE'` via `OLD.provider_id`, so the average self-corrects with no trigger change.

**§3 — Stop flagged reviews from counting, and from being visible (issue 4).**

```sql
CREATE OR REPLACE FUNCTION update_provider_rating() RETURNS TRIGGER AS $$
DECLARE target_provider_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN target_provider_id := OLD.provider_id;
  ELSE target_provider_id := NEW.provider_id; END IF;
  IF target_provider_id IS NULL THEN RETURN NULL; END IF;

  UPDATE public.service_providers
  SET rating_count = (SELECT COUNT(*) FROM public.ratings
                      WHERE provider_id = target_provider_id
                        AND COALESCE(fraud_status,'pass') IN ('pass','queued_low')),
      avg_rating   = COALESCE((SELECT ROUND(AVG(rating)::numeric,1) FROM public.ratings
                               WHERE provider_id = target_provider_id
                                 AND COALESCE(fraud_status,'pass') IN ('pass','queued_low')), 0)
  WHERE id = target_provider_id;
  RETURN NULL;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

Note this adds `SECURITY DEFINER` and a pinned `search_path`, which the current definition lacks — required, or the aggregate runs under the caller's RLS and silently under-counts (the trap in `docs/CLAUDE.md` §9 that cost the food-drop caps their enforcement).

Then hide flagged rows from residents while keeping them visible to their author and to moderators:

```sql
DROP POLICY IF EXISTS "Users can view ratings in their community" ON public.ratings;
CREATE POLICY "Users can view ratings in their community"
  ON public.ratings FOR SELECT
  USING (
    public.is_user_approved(auth.uid())
    AND (
      COALESCE(fraud_status,'pass') IN ('pass','queued_low')
      OR user_id = auth.uid()
      OR public.is_community_lead(auth.uid())
      OR public.is_platform_admin(auth.uid())
    )
    AND (
      (provider_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.service_providers sp
         WHERE sp.id = provider_id AND sp.community_id = public.get_user_community_id()))
      OR
      (listing_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.mcn_listings l
         WHERE l.id = listing_id AND l.community_id = public.get_user_community_id()))
    )
  );
```

**Backfill:** none needed — all 1 provider rating is `pass`. Confirm with the pre-flight `SELECT` in VERIFICATION step 4 rather than trusting this line.

Once §3 lands, `rating_count` and `publicReviews.length` can legitimately differ for the review's author (they see their own hidden row, the count excludes it). That is correct; make sure C2 does not "fix" it by deriving one from the other.

## M3 — Report integrity (issues 6, 14, 23)

`supabase/migrations/20260902000200_report_and_text_bounds.sql`

```sql
-- Issue 23: constrain the reason to the five the UI offers.
ALTER TABLE public.provider_reports DROP CONSTRAINT IF EXISTS provider_reports_reason_check;
ALTER TABLE public.provider_reports ADD CONSTRAINT provider_reports_reason_check
  CHECK (reason IN ('wrong_info','spam','inappropriate','unavailable','other'));

-- Issue 23: constrain status to the three the column documents.
ALTER TABLE public.provider_reports DROP CONSTRAINT IF EXISTS provider_reports_status_check;
ALTER TABLE public.provider_reports ADD CONSTRAINT provider_reports_status_check
  CHECK (status IN ('pending','reviewed','dismissed'));

-- Issue 14: bound every resident-authored text field.
ALTER TABLE public.provider_reports  ADD CONSTRAINT provider_reports_details_len
  CHECK (details IS NULL OR length(details) <= 500);
ALTER TABLE public.ratings           ADD CONSTRAINT ratings_review_text_len
  CHECK (review_text IS NULL OR length(review_text) <= 1000);
ALTER TABLE public.service_providers ADD CONSTRAINT service_providers_name_len
  CHECK (length(name) BETWEEN 2 AND 80);
ALTER TABLE public.service_providers ADD CONSTRAINT service_providers_description_len
  CHECK (description IS NULL OR length(description) <= 1000);

NOTIFY pgrst, 'reload schema';
```

**Pre-flight — every one of these `ALTER`s fails if a single existing row violates it.** Run this first and fix or truncate anything it returns:

```sql
SELECT 'reason'      AS col, count(*) FROM provider_reports WHERE reason NOT IN ('wrong_info','spam','inappropriate','unavailable','other')
UNION ALL SELECT 'status',   count(*) FROM provider_reports WHERE status NOT IN ('pending','reviewed','dismissed')
UNION ALL SELECT 'details',  count(*) FROM provider_reports WHERE length(details) > 500
UNION ALL SELECT 'review',   count(*) FROM ratings          WHERE length(review_text) > 1000
UNION ALL SELECT 'name',     count(*) FROM service_providers WHERE length(name) NOT BETWEEN 2 AND 80
UNION ALL SELECT 'descr',    count(*) FROM service_providers WHERE length(description) > 1000;
```

It returned all zeros on 2026-08-08 against 171 providers / 1 rating / 1 report, but re-run it — that was two data-changing days ago by the time you read this.

**Do not add a database-level report threshold.** The "only show the banner at N reports" decision belongs in the client (C2 §3) — a `CHECK` cannot express it, and moving it to RLS would hide reports from the leads who need them.

## M4 — Give the admin console the moderation data (issues 11, 13)

Same migration file as M1 or a fourth file, your call. `platform_get_provider_details` returns `JSONB`, so extending the payload needs no `DROP FUNCTION` (the §9 `RETURNS TABLE` trap does not apply here — verify before you assume it, the sibling `platform_get_all_providers` **is** `RETURNS TABLE` and would need the drop).

Add to the provider object: `fraud_status`, `is_verified`, `visibility`. Add to each `reviews[]` element: `review_text`, `fraud_status`, `fraud_rules_triggered`, and the reviewer's `community_id` (so the #3 class of cross-community rating is visible after the fact). Keep the `is_platform_admin` gate exactly as it is.

For `platform_get_all_providers`, add `fraud_status` and a `report_count` so the list can surface what needs attention — that one **does** need `DROP FUNCTION` first.

## M5 — Dedupe provider contacts (issue 12)

Make `provider_hires` mean "this household contacted this provider", not "this button was tapped".

**Decision D2: Option A.** (Option B — reads-only — was considered and rejected because it leaves R-R6 a one-tap gate. It is recorded at the end of this section for context only; **do not implement it**.)

**Option A — one row per (user, provider, day).** Preserves repeat-contact history without letting one afternoon inflate the count:

```sql
ALTER TABLE public.provider_hires
  ADD COLUMN IF NOT EXISTS contact_date DATE
    GENERATED ALWAYS AS ((created_at AT TIME ZONE 'Asia/Kolkata')::date) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS provider_hires_user_provider_day_uniq
  ON public.provider_hires (user_id, provider_id, contact_date);
```

Then change the count that residents see to **distinct households** — `COUNT(DISTINCT user_id)` — which is what the label has always claimed. That belongs in the query, not the schema (C2 §5, C3 §1).

**Pre-flight:** the unique index fails if duplicates already exist. Live there are 3 hire rows total, but check:
```sql
SELECT user_id, provider_id, (created_at AT TIME ZONE 'Asia/Kolkata')::date d, count(*)
FROM provider_hires GROUP BY 1,2,3 HAVING count(*) > 1;
```

`logHire()` must then tolerate a `23505` unique violation as success rather than surfacing it — see C2 §5.

*Rejected alternative, for the record: Option B left `provider_hires` alone and only changed reads to `COUNT(DISTINCT user_id)`. It fixes the misleading label but not the gate, since one tap still creates the qualifying row. **Not chosen — do not implement.***

## C1 — `lib/fraudCheck.ts`

**Stop silently passing on infrastructure failure (issue 1).** The current fallback is what let an undeployed function go unnoticed across 171 provider creations. Fail-open is the right *product* choice — a resident must not be blocked because an Edge Function is down — but it must be observable:

- Return a distinct verdict shape for the unavailable case (e.g. `action: 'PASS'` plus `unavailable: true`) rather than a verdict indistinguishable from a real pass.
- On the unavailable path, write `fraud_status: 'queued_low'` instead of `'pass'`, so the row is visible (per the existing filter) but flagged for later re-scoring. Do not silently record it as having passed checks that never ran.
- Log it somewhere a human sees. `console.warn` in a PWA is not monitoring.

Also fix the `QUEUE_LOW_PRIORITY` copy at [lines 133-138](../../lib/fraudCheck.ts#L133-L138): *"will be visible after a quick review"* is false — `queued_low` is visible immediately by design. Say so.

## C2 — `app/provider/[id].tsx`

1. **Filter reports by status and add a threshold (issue 6).** `fetchAllReports` fetches `status` and renders only unresolved (`pending`) reports. **Decision D3: the public banner appears at 2 or more unresolved reports**, not `> 0`. Below the threshold — and at every count — `isCommunityLead || isPlatformAdmin` still sees the full list, so a moderator can act on the very first report. Count distinct reports, not distinct reasons: two people reporting `spam` is two, one person reporting `spam` is one and stays private.
2. **Add report resolution for leads (issue 5).** When `canDelete`, render each pending report with **Mark reviewed** / **Dismiss** writing `status`, `reviewed_by = user.id`, `reviewed_at = now()` through the existing UPDATE policy. Check `error` and assert `data?.length === 1` — chain `.select('id')`, per the §9 trap about zero-row updates returning success.
3. **`maxLength` on every text input (issue 14)**, matching the M3 constraints exactly: report details 500, review text 1000, personal note 1000. Show a character counter on the two long ones. Surface the DB message instead of swallowing it at [line 428](../../app/provider/[id].tsx#L428).
4. **Let every reason carry details (issue 16).** Render the details input for all reasons; keep it required only for `other`. Drop the `selectedReason === 'other' ? … : null` discard at [line 491](../../app/provider/[id].tsx#L491), and clear `reportDetails` when the reason changes so nothing is submitted under a reason the reporter did not intend it for.
5. **`logHire` (issue 12).** Treat `23505` as success (the day's contact is already recorded) and do not increment local state or schedule a second feedback notification in that case. Change the header pill and stat tile to read the distinct-household count.
6. **Explain the review precondition (issue 12 / #1).** Before F1 ships, the Rate card must say a review needs a prior contact, and disable Submit with that reason when `hire_count` for *this user* is 0 — currently the screen fetches only the provider-wide count ([lines 132-134](../../app/provider/[id].tsx#L132-L134)), so add a user-scoped one. Blocking after the fact with *"Blocked by R-R6"* is not an acceptable first experience.
7. **Hide the Report button on a provider outside the caller's community (issue 17)** — compare `provider.community_id` with `communityId` from `useAuth()`.
8. **Render `description` and `details` (issue 18). Decision D6 — build it, do not delete the inputs.** Use the six orphaned styles already in the file (`detailsMetaSection`, `detailMeta`, `detailMetaLabel`, `detailMetaValue`, `moneyMetaRow`, `detailMetaSuffix`, [lines 1169-1196](../../app/provider/[id].tsx#L1169-L1196)) — they were written for exactly this block. Drive the labels and ordering off [`constants/providerDetails.ts`](../../constants/providerDetails.ts) rather than hardcoding keys, so a category gaining a field does not need a screen edit, and skip any key absent from the JSONB. Verandah rules apply (`docs/CLAUDE.md` §4): tokens only, sentence case, no `textTransform: 'uppercase'` outside `sectionLabel`, no weights ≥ 600. Currency goes through `components/Rupees.tsx` — and note prior finding 18 in [`done/providers-and-visits-review.md`](done/providers-and-visits-review.md), where `Rupees` rendered `300-500` as `₹3,00,500`; that fix lives at the call site, so pass a parsed number or render the raw string, never a digit-stripped concatenation. Document the *behaviour* in `features.md` and leave the columns to `architecture.md` (`docs/CLAUDE.md` §7).
9. **Bound the reads (issue 21).** `.limit(50)` on reviews with real paging behind **Load more**; skip `fetchAllReports` entirely when the caller is not a lead and the provider has no reports.

## C3 — the three list read paths

1. **`app/(tabs)/index.tsx` — delete `.eq('community_id', communityId)` from the `provider_hires` query (issue 10).** The column does not exist; RLS already scopes the table to the caller's community. Switch the aggregation to distinct `user_id` per provider to match M5. And **widen the error guard**: `isMissingRelationError` should not be the only branch — any hires error must surface, or the next swallowed failure is as invisible as this one was.
2. **Remove the three client-side `fraud_status` filters** once M1 §3 lands (`app/(tabs)/index.tsx`, `app/(tabs)/favorites.tsx`, `components/ProviderSelector.tsx`). Leaving them is harmless but they are the duplication that produced #8 in the first place. If you keep them as belt-and-braces, extract one helper rather than a fourth copy.
3. **`components/ProviderCard.tsx:90`** — `0 homes` / `N hires` should agree with the detail screen's wording. Pick one term for the metric and use it in all four places (card, pill, stat tile, share text).

## C4 — `admin-dashboard/js/providers.js`

1. **Escape every interpolated value (issue 7).** Add one `esc(s)` helper (`String(s ?? '').replace(/[&<>"']/g, …)`) and wrap **every** `${…}` that carries data: `r.details`, `r.reason`, `r.user_name`, `r.user_email`, `data.name`, `data.description`, `data.flat_block`, `data.phone`, `data.category`, `rv.user_name`, `rv.flat_number`, `sp.*`.
2. **Remove the inline `onclick` string interpolation entirely (issue 7).** Replace both handlers at [lines 95-96](../../admin-dashboard/js/providers.js#L95-L96) with `addEventListener` and a `dataset.providerId` — the row already gets a listener at [line 100](../../admin-dashboard/js/providers.js#L100), so the pattern is right there. This removes the `O'Brien` class of bug as well as the injection.
3. **Add the moderation controls (issues 5, 9, 11).** Per-report **Mark reviewed** / **Dismiss**; a **Hide / Unhide** control calling `set_provider_moderation_state`; a **Verified** toggle calling the same; and render the new `fraud_status`, `is_verified`, and `review_text` fields M4 adds. This is what turns "delete is the only lever" into an actual moderation surface.
4. **Rebuild.** `node build-admin.js`, then hard-refresh. Editing `admin-dashboard/js/*` alone shows nothing (`docs/CLAUDE.md` §9), and the build exits 1 if a mapped env var is missing.

## C5 — `app/provider/add.tsx`

1. **`maxLength` on name (80) and description (1000)** to match M3, plus the personal note (1000) — and validate the note **before** inserting the provider, so a too-long note cannot leave a created provider plus a raw Postgres error (issue 14). Better still, move both writes into one `SECURITY DEFINER` RPC, per the §9 trap about a parent row committed before its child is rejected.
2. **Parse `number` detail fields (issue 19)** — store a `number`, reject non-numeric input at the field, and clamp negatives.
3. **Keep the duplicate-phone pre-check** exactly as it is. It works, it is the better UX than a block, and after F1 it is what keeps R-P1 from ever being the thing a resident sees.

## F1 — Deploy the fraud-check function (issue 1)

**Not delegated (decision D7). The product owner runs the deploy.** The agent's part is §2 and §3 below — source edits to [`supabase/functions/fraud-check/index.ts`](../../supabase/functions/fraud-check/index.ts), left undeployed.

1. **[Product owner]** Deploy only after M1–M5 and C1–C5 are merged and the SQL has been applied. `npm run fn:deploy:preprod` requires the preprod project to exist; until it does, this is a direct `fn:deploy:prod` against live and should be done at a quiet hour with the rollback understood — redeploying the previous function version, or deleting the function, restores today's always-PASS behaviour.
2. **[Agent] Close the provider-side gaps first (issue 13).** `evaluateProviderRules` currently contains one rule. Lift the profanity blocklist and the URL/phone/email patterns out of `evaluateReviewRules` ([lines 247-273](../../supabase/functions/fraud-check/index.ts#L247-L273)) into a shared helper and apply them to provider `name` and `description`, and add a per-user creation-velocity `FLAG`. Leave R-P1 alone — redundant against the client pre-check and the phone trigger, but harmless.
3. **[Agent] Downgrade R-R6 to `FLAG` (decision D4).** Change its `severity` from `'HARD_BLOCK'` to `'FLAG'` in [`index.ts:206-215`](../../supabase/functions/fraud-check/index.ts#L206-L215). This is load-bearing for D2: with M5 Option A a hire row means a real distinct-day contact, so R-R6 remains a genuine signal — it just routes to moderation instead of refusing at the door. **This only works if C2 §6 ships in the same change set**; the resident must be told a contact is expected *before* they type, not flagged silently afterwards. Note the knock-on: `FLAG` alone yields `QUEUE_LOW_PRIORITY` (visible), but combined with two other flags it reaches `HIDE_PENDING_REVIEW` — which is now genuinely hidden after M2 §3, so the moderation queue in C4 §3 must exist before this is meaningful.
4. **[Product owner] Write down what `hidden` means** now that #9 is fixed: who sees a hidden provider (author + leads + admins, per M1 §3), who can restore it, and how the resident is told. `features.md`.
5. **[Product owner]** `supabase functions deploy` with no function name deploys **everything in `supabase/functions/`**, which includes `check_due_services`. That function is also undeployed and belongs to the reminders feature, not this one — deploy `fraud-check` by name, or validate the reminder sweep's preconditions first.

---

# VERIFICATION

`npx tsc --noEmit` catches none of this. Every step below is manual.

**Who runs what.** Under decision D1 the agent never applies migrations, so most of this list cannot run until the product owner has pushed. Each step is tagged:

- **[agent]** — runnable now, read-only or client-side. Do these before handing work back.
- **[owner]** — needs the migrations applied first, or a session/device the agent does not have (president, platform admin, fresh signup, a native build).

An agent that reports "verified" against an unapplied migration has verified nothing. If a step is `[owner]`, say so in your summary and leave it unchecked — do not approximate it.

**Database — read-only queries, run after the migrations are applied.**

0. **[agent] Pre-flight counts, before anything is applied.** Run the M3 pre-flight `SELECT` and the M5 duplicate-hires `SELECT` read-only and paste both results. All-zero is the expected answer and the precondition for the `ALTER`s and the unique index succeeding. A non-zero row is a stop-and-report, not a data cleanup.

1. **[owner] Grants narrowed (M1 §1).** `information_schema.column_privileges` for `service_providers` / `authenticated` / `UPDATE` returns **only** `name, phone, category, description, flat_block, details, updated_at`. `anon` returns no `UPDATE` and no `INSERT` rows at all.
2. **[owner] Column writes rejected.** As a resident who created a provider, `PATCH …?id=eq.<theirs>` with `{"is_verified":true}` → **403 / permission denied for column**. Repeat for `fraud_status`, `avg_rating`, `visibility`, `community_id`. All five must fail. Then `PATCH {"description":"…"}` → **200**, or you have over-revoked.
3. **[owner] Cross-community rating blocked (M2 §1).** As resident of community A, `POST /rest/v1/ratings` with a provider id from community B → **403**. Same call with an own-community provider → **201**.
4. **[owner] Flagged reviews excluded (M2 §3).** Pre-flight `SELECT count(*) FROM ratings WHERE COALESCE(fraud_status,'pass') NOT IN ('pass','queued_low')` (expected 0 on 2026-08-08 — re-run it). Then manually set one rating to `'hidden'` — on prod this is a live edit, so note the rating id and set it back to `'pass'` when done — and confirm `service_providers.rating_count` drops by one, confirm the row disappears from another resident's Community Reviews, and confirm it is still visible to its own author and to a president.
5. **[owner] Review deletable (M2 §2).** Resident deletes own review → gone, `avg_rating` recomputes. President deletes another resident's review on an own-community provider → succeeds. President attempts one on a **foreign**-community provider → matches zero rows; confirm the client reports failure rather than success (chain `.select('id')`).
6. **[owner] Hidden provider unreachable (M1 §3).** Set one provider `fraud_status='hidden'` — again a live edit; pick a low-traffic provider and restore it afterwards via `set_provider_moderation_state`, which doubles as step 7. As an ordinary resident: absent from the Help tab, absent from Saved, absent from the visit picker, **and `/provider/<id>` shows the not-available state** — that last one is the case that has never worked. As its author, and as a president: still visible.
7. **[owner] Un-hide works (M1 §4).** President calls `set_provider_moderation_state(<id>, 'pass', null)` → provider returns to the directory. An ordinary resident calling it → **exception**. A president calling it for a **foreign**-community provider → **exception**.
8. **[owner] Report lifecycle (C2 §2, C4 §3).** File a report → `status='pending'`, lead gets the notification, notification routes to the provider. Lead taps **Dismiss** → `status='dismissed'`, `reviewed_by` and `reviewed_at` populated, and **the public banner no longer shows it**. An ordinary resident attempting the same update → zero rows.
9. **[owner] Fresh signup can still add a provider (M1 §2).** Create a brand-new account, join a community, add a provider immediately. This is the exact regression `20260607194000` was written to fix — if it fails, `is_user_approved()` is stricter than assumed and you need a different guard, not a reverted one.
10. **[owner] Text bounds (M3).** 81-character name → rejected client-side with a clear message, and rejected by the DB if forced. 1001-character personal note → **blocked before the provider row is inserted**, no orphan created. 501-character report details → rejected.
11. **[owner, native build] Contact dedupe (M5).** Tap **Call** three times and **WhatsApp** twice on the same provider in one day → `provider_hires` gains **one** row, the pill reads **contacted 1 time**, and exactly **one** feedback notification is scheduled on native.

**Client / platform.**

12. **[owner] Contact count on the Help tab (C3 §1).** Cards show the real number, matching the detail screen for the same provider. Break the query on purpose (rename a column in the select) and confirm an error now surfaces instead of rendering zeros.
13. **[agent, partly] Admin console XSS (C4 §1-2).** The escaping is statically checkable, and the agent must confirm no data-carrying `${…}` remains unescaped in `admin-dashboard/js/providers.js` and that no inline `onclick` interpolates a value. The live half is [owner]: file a report with details `<img src=x onerror=alert(1)>`; open the provider in the console. The text must render **as text**. Create a provider named `O'Brien "The Sparky" <b>` and confirm the list row, the Inspect panel, and **the Delete button** all work.
14. **[owner] Admin moderation data (M4).** Review text, `fraud_status`, `is_verified`, and reviewer community all render. Hide/Unhide and the Verified toggle both round-trip.
15. **[owner] F1 (last).** With the function deployed: a review from a resident with no prior contact is **flagged, not refused** (decision D4) (and the Rate card said so **before** they typed); a copy-pasted review trips R-R4; an ALL-CAPS review trips R-R8; a provider named with a blocklist word trips the new provider-side rule; and **`fraud_verdicts` gains one row per submission** — that count going from 0 to non-zero is the single check that proves finding #1 is closed.
16. **[owner] Fail-open is observable (C1).** Point the client at a non-existent function name. Submission still succeeds, the row lands as `queued_low`, and the failure is logged somewhere a human will see it — not just `console.warn`.

---

# DOCUMENTATION UPDATES

Same change set, one owning file each (`docs/CLAUDE.md` §7).

| File | Change |
|---|---|
| [`features.md`](../features.md) | Rewrite the fraud sentences in §Providers (currently line 108 and the integrations row at 473): state what the fraud check actually gates, what `hidden` means for a resident vs. author vs. lead, and the new review precondition copy. Add the report lifecycle — **the public banner needs 2 unresolved reports (D3)**, moderators see the first, who can dismiss, and that a report cannot be withdrawn. Add the new text limits, **that a lead can now mark a provider Verified (D5)**, and **that `description` and the category details are now shown on the provider screen (D6)** — as *behaviour*, not column names. |
| [`architecture.md`](../architecture.md) | The revised `service_providers` / `ratings` / `provider_reports` policies and grants; the new `set_provider_moderation_state` RPC; the extended `platform_get_provider_details` / `platform_get_all_providers` payloads; `update_provider_rating()` gaining `SECURITY DEFINER` + a `fraud_status` predicate; the `provider_hires` dedupe index and generated column; the new `CHECK` constraints. **Also record that `is_user_approved()` does not test `removed_at` and depends on removal nulling `community_id`** (#15) — that coupling is currently undocumented and load-bearing. |
| [`CLAUDE.md`](../CLAUDE.md) §9 | Four new traps: (a) *"An Edge Function in `supabase/functions/` is not deployed until `fn:deploy` runs — `list_edge_functions` returned `[]` on 2026-08-08 while two functions sat in the repo. A client that treats invoke failure as a pass will hide this indefinitely."* (b) *"A table-level `GRANT UPDATE` plus an ownership-only RLS policy lets the owner write every column, including trust flags and trigger-owned aggregates. Grant per column."* (c) *"`get_user_community_id()` falls back to JWT metadata when `profiles.community_id` is NULL, so it is not a substitute for `is_user_approved()` — a removed resident with a live token still resolves to their old community."* (d) *"`admin-dashboard/` has no framework escaping. Every `innerHTML` interpolation of resident-supplied text is stored XSS against the highest-privilege session on the platform."* |
| [`platform-admin.md`](../platform-admin.md) | The new provider moderation controls, the extended payloads, and the escaping requirement for any new console panel. |
| [`cross-community-changelog.md`](../cross-community-changelog.md) | **Mandatory.** Two entries: `visibility` becomes lead/admin-writable only (M1 §1), and provider ratings are now pinned to the caller's own community (M2 §1) — with the note that rating a partner community's provider is deliberately unresolved. |
| [`.github/app-summary.md`](../../.github/app-summary.md) | Fix line 145 (*"delete **instead of** report"* — the code renders both) and the fraud-check description. Note at line 290 that neither Edge Function is deployed, until F1 lands. |
| [`disabled-features.md`](../disabled-features.md) | Until F1 ships, the fraud/spam pipeline is **effectively disabled in production**. It belongs here, with the deploy command as the re-enablement note. |

---

# PART 3 — HANDOVER

Decision D7: **Tranche 1 and Tranche 2 are delegated. F1 is not.** Run the tranches as two separate change sets with a review between them — not one prompt. Tranche 1 touches no SQL and can start immediately; Tranche 2 needs D1's write-but-don't-apply discipline.

## Tranche 1 — client only, zero database risk

**Findings closed:** 7 (admin XSS), 10 (always-zero contact count), 14 client half, 16, 19, 21, 22.
**Sections:** C4 §1, §2, §4 · C3 §1, §3 · C2 §3, §4, §9 · C5 §2 · the doc updates for #22.

Nothing here depends on a migration, so `npx tsc --noEmit` **must pass clean** at the end — it does on `main` today. C4 §1/§2 alone closes the stored XSS, which is the reason this tranche goes first.

**Prompt:**

> Read `docs/fixes/provider-rules-and-moderation-review.md` in full, then `CLAUDE.md` and `docs/CLAUDE.md`.
>
> Implement **Tranche 1 only**: C4 §1, §2, §4; C3 §1, §3; C2 §3, §4, §9; C5 §2; and the `.github/app-summary.md` corrections in finding #22.
>
> Hard constraints:
> - **Touch no file under `supabase/`.** Write no migration. Run no `db:push`, no `supabase db query`, no MCP `apply_migration`, no `functions deploy`. Read-only SQL via MCP `execute_sql` is allowed for confirming a finding.
> - Do not hand-edit `lib/database.types.ts`.
> - `npx tsc --noEmit` must pass clean when you finish. It passes on `main` now — do not regress it.
> - After editing `admin-dashboard/js/*`, run `node build-admin.js`.
> - Verandah rules (`docs/CLAUDE.md` §4) apply to every UI change.
>
> Report back with: the diff summary, the `tsc` result, and verification step 13's static half (confirm no data-carrying `${…}` remains unescaped in `admin-dashboard/js/providers.js` and no inline `onclick` interpolates a value).

## Tranche 2 — migrations authored, not applied

**Findings closed:** 1 (source only), 2, 3, 4, 5, 6, 8, 9, 11, 12, 13 (source only), 14, 15, 17, 18, 20, 23.
**Sections:** M1–M5 · C1 · C2 §1, §2, §5, §6, §7, §8 · C3 §2 · C4 §3 · C5 §1, §3 · F1 §2, §3 (source edits only) · all remaining doc updates.

**Prompt:**

> Read `docs/fixes/provider-rules-and-moderation-review.md` in full — especially the **Decisions taken** table and rules 3, 5, 7 and 8 of READ THIS FIRST — then `CLAUDE.md` and `docs/CLAUDE.md`.
>
> Implement **Tranche 2**: M1–M5, C1, C2 §1/§2/§5/§6/§7/§8, C3 §2, C4 §3, C5 §1/§3, F1 §2/§3, and the DOCUMENTATION UPDATES table.
>
> The eight decisions in the table are **binding**. In particular: the report banner threshold is **2** (D3), R-R6 becomes **`FLAG`** (D4), `is_verified` is **kept and locked down**, not dropped (D5), and `description`/`details` are **rendered**, not deleted (D6). M5 is **Option A**; Option B is explicitly rejected.
>
> Hard constraints:
> - **Write the migration files and leave them unapplied.** No `db:push`, no `db:push:prod`, no `supabase db query`, no `supabase migration up`, no MCP `apply_migration`. The `:preprod` scripts are `PREPROD_REF_TODO` placeholders and will fail — when they do, **stop; do not substitute the prod script.** Prod is live: 171 providers, 18 real users.
> - Run every pre-flight `SELECT` in the document **read-only** and paste the actual counts. A non-zero violation count is a stop-and-report — do not modify live data to make an `ALTER` succeed.
> - Do not hand-edit `lib/database.types.ts`. Types cannot be regenerated until I apply the migrations, so any client change referencing a new column will not type-check yet — **list those files explicitly** instead of working around it.
> - Do not deploy or run the fraud-check Edge Function. Edit its source per F1 §2/§3 and leave it undeployed.
> - Federation objects listed in rule 8 must survive intact, and `cross-community-changelog.md` gets an entry in this change set.
> - Check `error` on every Supabase call, and chain `.select('id')` on writes whose success you assert (`docs/CLAUDE.md` §9).
>
> Report back with: the diff summary; the pre-flight counts; which files do not type-check pending my `types:prod` run and why; and which VERIFICATION steps you ran versus which are `[owner]`.

## After Tranche 2 comes back — the product owner's sequence

1. Review the migration SQL by hand. It has never been executed anywhere.
2. `npm run db:push:prod` → `npm run types:prod` → **re-append the enriched-types block** (`ProviderWithInteraction` / `VisitWithJoinerData` / `VisitJoinerWithProfile`) → `npx tsc --noEmit`.
3. Work VERIFICATION steps 1–14. Steps 4 and 6 mutate live rows — note the ids and restore them.
4. Only then F1 §1: deploy `fraud-check` **by name** (a bare `functions deploy` also ships the undeployed `check_due_services`), and confirm step 15 — `fraud_verdicts` going from 0 to non-zero is the single check that proves finding #1 is closed.

## What no agent can verify

Steps 9 (fresh signup), 11 (native notification scheduling), 6–8 and 14 (president and platform-admin sessions), 12–13 live halves (hard-refreshed admin console). Budget for doing these yourself. **An agent reporting "verified" against an unapplied migration has verified nothing** — treat any such claim as a red flag rather than a result.

---

# APPENDIX — what is already right

Worth stating, so a later pass does not "fix" it:

- **Phone normalization is correct on both sides and they agree.** [`lib/phone.ts:15-18`](../../lib/phone.ts#L15-L18) and `public.normalize_indian_mobile()` (`20260429113000`) implement the same rule — last 10 digits, `^[6-9]\d{9}$` — and the `service_provider_phone_guard_trigger` enforces it as a **database** invariant on insert and on any phone/community change, not just in the UI.
- **Duplicate phone routes to the existing provider instead of erroring** ([`app/provider/add.tsx:172-176`](../../app/provider/add.tsx#L172-L176)), and the trigger's message is caught and re-resolved if the pre-check races ([lines 205-216](../../app/provider/add.tsx#L205-L216)). This is the right UX and it should survive F1.
- **One report per user per provider** is a real `UNIQUE (provider_id, reported_by)` constraint, and the client handles the `23505` correctly rather than showing a raw error ([lines 503-510](../../app/provider/[id].tsx#L503-L510)).
- **Reports cannot be deleted** (`FOR DELETE USING (false)`) — the right call for an audit trail. #6's fix is resolution and thresholds, **not** deletion.
- **Reporter identity is withheld** from the public banner by selecting only `reason, details, created_at`.
- **The report notification trigger was correctly repointed** to `president` / `vice_president` in `20260822000000` after the enum change, and excludes the reporter themselves. `provider_reported` now routes correctly in [`app/notifications.tsx:78-79`](../../app/notifications.tsx#L78-L79) — a prior-audit finding that has landed.
- **All three `platform_*` provider RPCs are properly gated** on `is_platform_admin(auth.uid())` with `SET search_path = public` and derive nothing from caller-supplied scope. M4 extends their payloads; it must not touch their gates.
- **`provider_personal_notes` is exemplary** — user-scoped RLS on all four verbs, a length `CHECK`, an `updated_at` trigger, and a real unique key. It is the model the other provider tables should follow.
- **The delete path on the provider screen is now correct** — platform-split confirm, `.select('id')` with a `data.length !== 1` assertion, `goBackSmart` — all prior-audit findings, all landed.
- **`update_provider_rating()` recomputes from scratch** rather than doing incremental arithmetic (`20260417300000`), so it cannot drift. M2 §3 keeps that property.
