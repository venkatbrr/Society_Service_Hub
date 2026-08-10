# Implementation Plan — Removed Resident Re-Admission Request Flow

> Status: plan, not yet implemented. Corrected against the live code on 2026-08-10
> (`join_community_by_code`, `enforce_profile_membership_guard`, the removal RPCs,
> `app/_layout.tsx` routing gate, and the admin console).

## Problem

When a community lead or platform admin removes a resident, `community_lead_remove_resident` /
`platform_soft_remove_resident` clear the resident's `community_id`, `block_id`, `flat_id`,
`flat_number`, reset `app_role` to `resident`, and stamp `removed_at` / `removed_by`.

The resident's next app launch sends them to `/community-select` (the gate in
[app/_layout.tsx:144-146](../../app/_layout.tsx#L144-L146)). If they enter the code of the
community they were removed from, `join_community_by_code` raises:

> `Your access to this community was removed. Ask a community lead to re-admit you.`

That is a dead end — there is no in-app way to ask, and no lead-facing or admin-facing surface
that would show the request if they did.

This plan adds a re-admission appeal: the resident submits a request from the join screen,
community leads and platform admins review it, and approval restores membership and walks the
resident back through flat selection.

## Ground truth this plan depends on

Verified in the repo, not assumed:

| Fact | Where |
|---|---|
| Removal clears `block_id` / `flat_id` / `flat_number`; approval must re-collect them | [20260904000400](../../supabase/migrations/20260904000400_resident_removal_and_hard_delete.sql#L100-L108) |
| `enforce_profile_membership_guard` blocks any change to `community_id` / `removed_at` / `removed_by` unless `allow_membership_change()` ran first in the same transaction — SECURITY DEFINER does **not** exempt it | [20260903000000](../../supabase/migrations/20260903000000_profile_membership_guard.sql#L23-L62) |
| The current re-join block is `profile_audit_log` match **AND** `profiles.removed_at IS NOT NULL` | [20260903000000:97-108](../../supabase/migrations/20260903000000_profile_membership_guard.sql#L97-L108) |
| `profile_audit_log` rows are written automatically by `profile_audit_log_trigger` for `community_id` changes, using the actor/reason set by `set_audit_context(auth.uid(), ...)` | [20260418230000:165-200](../../supabase/migrations/20260418230000_platform_admin_and_promotions.sql#L165-L200) |
| The routing gate sends anyone with a `communityId` straight to `/(tabs)`; flat selection is reached **only** because `community-select.tsx` navigates there explicitly after a join | [app/_layout.tsx:146-165](../../app/_layout.tsx#L146-L165), [community-select.tsx:66-70](../../app/community-select.tsx#L66-L70) |
| `notifications.type` is free-text `TEXT` with no CHECK — new types need no migration | [20260417000000](../../supabase/migrations/20260417000000_add_notifications.sql#L2-L11) |
| `removed_from_community` notification type already exists in the client switch | [app/notifications.tsx:57](../../app/notifications.tsx#L57) |
| Admin console platform actions call `supabase.rpc('set_audit_actor', { p_actor_id: user.id })` before the action RPC | [approvals.js:226](../../admin-dashboard/js/approvals.js#L226) |
| Deploy scripts are `db:push:prod` / `types:prod` — plain `db:push` no longer exists | [package.json:12-20](../../package.json#L12-L20) |

## Decisions taken

1. **The removal predicate becomes one shared function.** `was_removed_from_community()` is
   defined once and called by both `join_community_by_code` and the request RPC, so the join
   guard and the appeal screen can never disagree about who is blacklisted.
2. **The predicate stops depending on the global `removed_at` flag.** `removed_at` is
   profile-level, not per-community: a resident removed from A who joins B by code has
   `removed_at` reset to `NULL` and is silently un-blacklisted from A forever. The new predicate
   reads `profile_audit_log` alone, which is already per-community and already self-clears on
   re-admission (the approval writes a new `community_id` row). This is a bug fix that rides
   along with the feature.
3. **The table is written only through SECURITY DEFINER RPCs.** No INSERT/UPDATE/DELETE policy is
   granted to `authenticated`, so a direct PostgREST write cannot skip the "were you actually
   removed from here?" check.
4. **Both leads and platform admins can decide**, via one shared internal implementation with two
   thin authorization wrappers, so the two paths cannot drift.
5. **The admin console surface goes in `approvals.js`**, next to community requests — it is the
   same platform-wide pending queue with the same approve/reject shape — not in the per-community
   detail view.

---

## 1. Database — `supabase/migrations/20260904000500_community_readmission_requests.sql`

### 1.1 Shared removal predicate

```sql
CREATE OR REPLACE FUNCTION public.was_removed_from_community(
  p_user_id      UUID,
  p_community_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Removed from this community, with no later re-admission to it.
  SELECT EXISTS (
    SELECT 1
    FROM public.profile_audit_log removal
    WHERE removal.profile_id = p_user_id
      AND removal.field      = 'community_id'
      AND removal.old_value  = p_community_id::text
      AND removal.new_value  IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.profile_audit_log rejoin
        WHERE rejoin.profile_id  = p_user_id
          AND rejoin.field       = 'community_id'
          AND rejoin.new_value   = p_community_id::text
          AND rejoin.created_at  > removal.created_at
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.was_removed_from_community(UUID, UUID) TO authenticated;
```

Then `CREATE OR REPLACE` `join_community_by_code` with its inlined block replaced by
`IF public.was_removed_from_community(auth.uid(), target_community.id) THEN ... END IF;`.
Everything else in that function stays byte-identical.

### 1.2 Table

```sql
CREATE TABLE IF NOT EXISTS public.community_readmission_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id     UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES public.profiles(id)    ON DELETE CASCADE,
  note             TEXT CHECK (note IS NULL OR char_length(note) <= 500),
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 500),
  reviewed_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS community_readmission_one_pending_idx
  ON public.community_readmission_requests (community_id, user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS community_readmission_community_status_idx
  ON public.community_readmission_requests (community_id, status, created_at DESC);

ALTER TABLE public.community_readmission_requests ENABLE ROW LEVEL SECURITY;
```

`'cancelled'` is retained **because** §1.4 adds `cancel_my_readmission_request()`. If that RPC is
cut, drop the value from the CHECK too — no orphan states.

### 1.3 RLS — read-only, writes go through RPCs

```sql
-- Requester sees their own.
CREATE POLICY "readmission_select_own"
  ON public.community_readmission_requests FOR SELECT
  USING (user_id = auth.uid());

-- Active leads of the target community, and platform admins, see all of that community's.
CREATE POLICY "readmission_select_reviewers"
  ON public.community_readmission_requests FOR SELECT
  USING (
    public.is_platform_admin(auth.uid())
    OR (
      public.is_community_lead(auth.uid())
      AND community_id = (SELECT p.community_id FROM public.profiles p WHERE p.id = auth.uid())
    )
  );
```

No INSERT, UPDATE, or DELETE policy is created. All writes happen inside SECURITY DEFINER
functions owned by `postgres`, which bypass RLS.

### 1.4 RPCs

**`request_community_readmission(p_community_code TEXT, p_note TEXT DEFAULT NULL) RETURNS JSONB`**

1. Require `auth.uid()`.
2. Reject if the caller's `profiles.community_id IS NOT NULL` (`'You are already a member of a community'`).
3. Resolve the community by `upper(btrim(code))`; raise `'Invalid community code'` if absent.
4. Raise unless `public.was_removed_from_community(auth.uid(), community.id)` — this RPC is only
   for removed residents; everyone else should be joining normally.
5. **Cooldown:** raise if a `rejected` request for this (community, user) has
   `reviewed_at > now() - interval '7 days'`, with a message naming the date they may reapply.
   Prevents unbounded resubmission, which the pending-only unique index does not.
6. Insert the pending row (the unique index turns a double-submit into a clean
   `unique_violation`, caught and re-raised as `'You already have a request awaiting review'`).
7. Notify every `president` / `vice_president` of that community with `removed_at IS NULL`,
   **and** every platform admin (`app_role = 'admin' AND community_id IS NULL`), type
   `readmission_requested`, `data = jsonb_build_object('request_id', …, 'community_id', …)`.
   Mirrors the fan-out in `20260427213000_restore_platform_admin_notifications.sql`.
8. Return `{ request_id, community_id, community_name, status }`.

**`get_my_pending_readmission_request() RETURNS JSONB`**

Returns the caller's most recent non-`cancelled` request — `{ request_id, community_id,
community_name, status, note, rejection_reason, created_at, reviewed_at }` — or `NULL`. The join
screen uses this both to show the pending card and to detect an approval that happened while the
resident sat on the screen.

**`cancel_my_readmission_request(p_request_id UUID) RETURNS VOID`**

Sets `status = 'cancelled'` when the row belongs to the caller and is still `pending`.

**`list_community_readmission_requests(p_community_id UUID DEFAULT NULL) RETURNS TABLE(...)`**

Requester name, email, phone, note, status, timestamps, reviewer name. Authorization:
platform admin → any community (or all communities when `p_community_id IS NULL`);
community lead → their own community only, and `p_community_id` is ignored/forced to theirs.
Pending first, then most recent.

**`review_readmission_request(p_request_id UUID, p_decision TEXT, p_reason TEXT)` — internal**

One implementation, called by both wrappers below. `p_decision IN ('approved','rejected')`.

- Lock the request row (`FOR UPDATE`) and raise unless `status = 'pending'`.
- Re-read the target profile. **If `community_id IS NOT NULL`, the resident joined somewhere else
  while pending** — mark the request `cancelled` and raise a clear message rather than
  overwriting their current membership.
- On **reject**: set `status`, `rejection_reason`, `reviewed_by`, `reviewed_at`; notify the
  requester with type `readmission_rejected` carrying the reason.
- On **approve**, in this order:
  ```sql
  PERFORM public.set_audit_context(auth.uid(), 'readmission approved');
  PERFORM public.allow_membership_change();   -- REQUIRED: the guard trigger fires
                                              -- even inside SECURITY DEFINER
  UPDATE public.profiles
  SET community_id = req.community_id,
      removed_at   = NULL,
      removed_by   = NULL,
      app_role     = 'resident'::public.app_role_type,
      block_id     = NULL,   -- cleared at removal; re-collected in the app
      flat_id      = NULL,
      flat_number  = NULL
  WHERE id = req.user_id;
  ```
  Then set the request to `approved` and notify the requester with type `readmission_approved`
  and `data = { community_id, blocks_enabled }`.

  Omitting `allow_membership_change()` is the single most likely way this feature ships broken:
  the UPDATE raises *"Community membership cannot be changed directly"* and the approval silently
  fails for leads (platform admins would not notice, since the guard exempts them).

**`community_lead_review_readmission(p_request_id UUID, p_decision TEXT, p_reason TEXT DEFAULT NULL)`**

Raises unless `public.is_community_lead(auth.uid())` **and** the caller's `community_id` equals
the request's. Delegates to the internal function.

**`platform_review_readmission(p_request_id UUID, p_decision TEXT, p_reason TEXT DEFAULT NULL)`**

Raises unless `public.is_platform_admin(auth.uid())`. Delegates to the internal function.

End the migration with `NOTIFY pgrst, 'reload schema';`.

---

## 2. Post-approval routing — the hand-off the original plan assumed

There is no existing mechanism that walks a re-admitted resident to flat selection. The gate at
[app/_layout.tsx:146-165](../../app/_layout.tsx#L146-L165) sends anyone holding a `communityId`
to `/(tabs)`, and `/community-join-block` is reached only by an explicit
`replaceTracked` from `community-select.tsx`. Since approval deliberately leaves `flat_id NULL`,
an approved resident would otherwise land in the tabs with no flat and never be asked.

**Fix, in `app/_layout.tsx`:** add `blocksEnabled` and `flatId` to the `useAuth()` destructure at
[line 28](../../app/_layout.tsx#L28) — both are already on the context
([AuthContext.tsx:35,38](../../context/AuthContext.tsx#L35-L38)), the layout just doesn't pull
them — then add one branch to the signed-in chain, before the "has community → tabs" branch:

```ts
} else if (
  communityId && blocksEnabled && !flatId &&
  currentRoute !== 'community-join-block'
) {
  redirectTo = '/community-join-block';
}
```

This also closes the pre-existing hole where a platform admin clears someone's flat and the app
never re-prompts.

Guard against a loop: `community-join-block` must remain reachable while `flat_id` is null, hence
the `currentRoute` check.

---

## 3. Mobile client

### 3.1 `components/ReadmissionRequestModal.tsx` (new)

Props: `visible`, `communityCode`, `communityName`, `onClose`, `onSubmitted`.

- Explains that access to *{communityName}* was removed and a lead must re-admit them.
- Optional appeal note, `maxLength={500}`, with a live counter.
- Submit calls `request_community_readmission`; surfaces the RPC's error text via `Toast`
  (the cooldown and duplicate messages are written to be user-readable).
- No `Alert.alert` anywhere — it is a no-op on web and this screen is reachable on the PWA.

### 3.2 `app/community-select.tsx` (modify)

- On mount and on focus, call `get_my_pending_readmission_request()`:
  - `pending` → render a status card (community name, submitted date, note, **Withdraw request**
    calling `cancel_my_readmission_request`) instead of the code input.
  - `rejected` → render the reason and the date they may reapply.
  - `approved` → call `refreshSession()`; the gate in §2 then routes to flat selection or tabs.
- In `handleJoinByCode`'s `catch`, detect the removal error and open
  `ReadmissionRequestModal` with the entered code instead of showing the raw toast. Match on a
  stable marker, not prose — have the RPC raise with `ERRCODE = 'P0001'` and a
  `readmission_required` token in `MESSAGE`/`DETAIL`, and test for that token.
- Re-check on focus so an approval granted while the screen is open is picked up without a
  cold restart.

### 3.3 `app/residents.tsx` (modify)

The file is already 516 lines and this adds a tabbed section, badge, request cards, and a
reject-reason prompt. Extract the review UI into `components/ReadmissionReviewList.tsx` and have
`residents.tsx` render it — do not inline it.

- Visible only when `isCommunityLead`. A segmented control at the top: **Residents** /
  **Re-admission** with a pending-count badge.
- Deep link support: `useLocalSearchParams` `tab=readmissions` opens that segment directly, for
  the notification handler in §3.4.
- Each card: name, email, phone (already lead-gated by `canViewPhone`), submitted date, note,
  and **Approve** / **Reject** actions calling `community_lead_review_readmission`.
- **Reject** collects a reason. `Alert.prompt` is iOS-only and `Alert.alert` is a no-op on web —
  use an in-app modal with a `TextInput` on all platforms rather than a `Platform.OS` split.
- Refresh the list and the badge after each decision.

### 3.4 `app/notifications.tsx` (modify)

Add to the icon switch (currently [lines 40-72](../../app/notifications.tsx#L40-L72)) and the tap
handlers, mirroring the existing `funds_access_requested` / `_approved` / `_rejected` trio:

| Type | Recipient | Tap target |
|---|---|---|
| `readmission_requested` | leads, platform admins | `/residents?tab=readmissions` |
| `readmission_approved` | requester | `/(tabs)` — the gate in §2 handles flat selection |
| `readmission_rejected` | requester | `/community-select` |

No migration is needed for these — `notifications.type` has no CHECK constraint.

---

## 4. Platform admin console — `admin-dashboard/js/approvals.js` (modify)

Re-admissions are a platform-wide pending queue with the same shape as community requests, so
they belong on the existing `#approvals-page`, not in the per-community detail view.

- Add a second section to `admin-dashboard/index.html` under `#approvals-page`:
  `#readmissions-loading` + `#readmissions-list`, headed "Re-admission Appeals", below the
  existing `#approvals-list`.
- `loadReadmissionRequests()` calls `list_community_readmission_requests` with no argument
  (platform admin → all communities). Render community name, requester, note, submitted date.
- Approve / Reject call `platform_review_readmission`, each preceded by
  `await supabase.rpc('set_audit_actor', { p_actor_id: user.id })` — the pattern every other
  platform action in this file already follows ([approvals.js:226](../../admin-dashboard/js/approvals.js#L226)).
- Reject reuses the existing `#rejection-modal` rather than adding a second one.
- Show the pending count on the `#approvals` nav item alongside the community-request count.

---

## 5. Documentation (part of the change set, not a follow-up)

Per [CLAUDE.md](../../CLAUDE.md), route each fact to exactly one owning file:

| File | What to add |
|---|---|
| `docs/architecture.md` | `community_readmission_requests` table + RLS; the six new RPCs; `was_removed_from_community`; the changed `join_community_by_code`; the new `_layout.tsx` flat-selection branch |
| `docs/features.md` | Resident appeal flow on the join screen; the lead review tab on Residents. **No schema columns** — architecture.md owns those |
| `docs/platform-admin.md` | The Re-admission Appeals section on the Approvals page |
| `docs/CLAUDE.md` §9 | Trap: any RPC touching `profiles.community_id` / `removed_at` / `removed_by` must call `allow_membership_change()` first, SECURITY DEFINER notwithstanding |
| `.github/app-summary.md` | One line — a new cross-cutting flow with its own table and admin surface |

Not applicable: `docs/verandah.md` (no new tokens), `docs/cross-community-changelog.md` (no
federation objects), `docs/disabled-features.md`.

---

## 6. Verification

### Static

1. `npm run db:push:prod` — apply the migration. (Plain `db:push` no longer exists; the repo
   split into prod/preprod scripts.)
2. `npm run types:prod` — regenerate `lib/database.types.ts`.
3. `npx tsc --noEmit` — the only validation gate in this repo; must be zero errors.
4. `node build-admin.js` — build admin assets.

### End-to-end

1. **Removal.** Remove a test resident from a community via the lead UI. Confirm
   `community_id`, `block_id`, `flat_id`, `flat_number` are cleared and `removed_at` is set.
2. **Blocked re-join.** Sign in as that resident, enter the same code on `/community-select`.
   The appeal modal opens (not a raw error toast).
3. **Submit.** Send an appeal note. Verify the pending row exists, the status card replaces the
   code input, and notifications landed for both leads **and** platform admins.
4. **Duplicate + cooldown.** Re-submitting while pending gives the friendly duplicate message.
   After a rejection, re-submitting inside 7 days is refused with the reapply date.
5. **Guard regression — the critical one.** Approve as a **community lead** (not a platform
   admin; admins bypass the membership guard and would mask a missing
   `allow_membership_change()`). The UPDATE must succeed.
6. **Restoration.** As the resident, refresh. Verify the routing gate lands them on flat
   selection (blocks-enabled community) or the tabs, and that they can pick a flat and use
   community features.
7. **Per-community blacklist.** Removed from A → join B by code succeeds → sign out, get removed
   from B → confirm A still blocks re-join. This is the `removed_at` hole that decision 2 closes;
   it regresses silently if the predicate is ever re-inlined.
8. **Race.** Submit a request, join a different community by code, then have a lead try to
   approve. The approval must refuse and cancel, not overwrite the new membership.

## Open question for the reviewer

Should a **rejected** resident be permanently barred after N rejections, or is the 7-day cooldown
alone sufficient? The cooldown is what is specified above; a hard cap needs a product call.
