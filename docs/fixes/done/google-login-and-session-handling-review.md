# Google login & session handling — Edge-Case Review & Implementation Brief

**Date:** 2026-08-08
**Status:** Ready for implementation. Every open question is resolved in [Part 2](#part-2--resolved-design-decisions) — do not re-litigate them, implement as specified.

**Scope (files that make up this feature):**

| Layer | Files |
|---|---|
| Screens | [app/login.tsx](../../app/login.tsx), [app/index.tsx](../../app/index.tsx), [app/forgot-password.tsx](../../app/forgot-password.tsx), [app/community-select.tsx](../../app/community-select.tsx), [app/community-request-submitted.tsx](../../app/community-request-submitted.tsx), [app/admin-redirect.tsx](../../app/admin-redirect.tsx), [app/(tabs)/profile.tsx](../../app/(tabs)/profile.tsx) (sign-out), [app/profile/edit.tsx](../../app/profile/edit.tsx) (email change) |
| Routing gate | [app/\_layout.tsx](../../app/_layout.tsx) |
| State | [context/AuthContext.tsx](../../context/AuthContext.tsx), [context/NotificationContext.tsx](../../context/NotificationContext.tsx) |
| Helpers | [lib/supabase.ts](../../lib/supabase.ts), [lib/auth.ts](../../lib/auth.ts), [lib/siteUrl.ts](../../lib/siteUrl.ts), [constants/authFlags.ts](../../constants/authFlags.ts) |
| Config | [app.json](../../app.json), [eas.json](../../eas.json), [vercel.json](../../vercel.json), [build-admin.js](../../build-admin.js), [.env.example](../../.env.example), [public/landing.html](../../public/landing.html) |
| Admin console | [admin-dashboard/js/auth.js](../../admin-dashboard/js/auth.js) |
| Database | `public.profiles` (policies + 3 triggers), `public.communities` (policies), `handle_new_user()`, `is_platform_admin()`, `is_community_lead()`, `get_user_community_id()`, `join_community_by_code()`, `set_my_block()`, `get_funds_access_status()`, `community_lead_remove_resident()`, `platform_soft_remove_resident()`, `enforce_profile_role_change_permissions()`, `validate_profile_block_assignment()`, `set_audit_context()` |

**Method.** Traced every path a resident can walk through sign-in, session hydration, foreground resume, token refresh, community join, removal, and sign-out, on web and native; read the final state of the auth-path RLS policies, triggers, functions and grants **from the live prod database** (`pg_policies`, `pg_proc`, `pg_trigger`, `information_schema.role_table_grants`) rather than from migration files; read the `@supabase/auth-js` 2.103.2 source to settle two behaviours that code inspection alone could not; and probed the prod PostgREST endpoint **read-only, unauthenticated, with the public anon key** to confirm two leaks.

**No test accounts exist.** Sign-in is Google-only (`EMAIL_AUTH_UI_ENABLED = false`). Prod holds three auth users: two platform admins (`thewooru@gmail.com`, `societyservicehub@gmail.com`) and one `resident` (`venkatbrr@gmail.com`); there is **no** `president` or `vice_president` account. Nothing in this report was walked while signed in. Findings marked **`[live]`** were confirmed by unauthenticated HTTP against prod; everything else is proven from code, policy text, function bodies, or library source, and each such finding names what would settle it.

**Baseline:** `npx tsc --noEmit` exits 0 before any change. It must exit 0 after.

**Line numbers were re-anchored on 2026-08-09.** A branding/icon pass landed in the working tree during this audit, touching `app.json`, `app/login.tsx`, `public/landing.html` and the icon assets. None of it changes any finding's logic — `app.json`'s `iosUrlScheme` placeholder and `login.tsx`'s Google handler are byte-identical — but `app/login.tsx` citations shifted by +1 to +5 lines and are corrected here. If that pass is still uncommitted when you start, re-check `app/login.tsx` anchors before editing.

**Result: 20 issues — 4 blocking, 9 high, 7 minor.**

---

## READ THIS FIRST — rules for the implementing agent

1. **Read [`CLAUDE.md`](../../CLAUDE.md) and [`docs/CLAUDE.md`](../CLAUDE.md) before editing anything.** In particular: the role enum is exactly `admin · resident · president · vice_president`; `public.is_admin()` is **not** a platform-admin check (it is an alias for `is_community_lead()`) — the override is `public.is_platform_admin(auth.uid())`; `lib/database.types.ts` is **generated** and must never be hand-edited; `.maybeSingle()`, never `.single()`.

2. **`npx tsc --noEmit` is the only automated gate, and it catches none of these 20 bugs.** Every one of them type-checks today. You must walk [§ VERIFICATION](#verification) at the end. Do not report an issue fixed on the strength of `tsc` alone.

3. **Commits go straight to `main`, and `main` is Vercel's production branch.** There is no PR gate and nothing runs `tsc` before deploy. Whatever you land is live on `wooru.in` within minutes, in front of the pilot community.

4. **After touching `supabase/migrations/`, the deploy loop is environment-suffixed. There is deliberately no bare `npm run db:push`:**

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

   Migrations are **not** applied by CI. Merging deploys code, not schema; the prod step is manual and skipping it breaks prod.

5. **The SQL in this document is a specification, not tested code.** It was written by reading the live schema, not by executing it. Where a task says *"run this verification query first"*, actually run it.

6. **Two tasks touch live resident data — dry-run first.** Task **M1** installs a guard trigger that will start rejecting `profiles` writes that currently succeed; run its pre-flight `SELECT` and confirm the only membership-changing callers are the four RPCs named. Task **M3** removes public read access to `communities`; run its pre-flight `SELECT` and confirm no screen outside the three listed reads that table.

7. **Scope boundary — shared files you may touch only narrowly:**
   - [app/mcn/drops/index.tsx](../../app/mcn/drops/index.tsx) and [app/mcn/drops/\[id\].tsx](../../app/mcn/drops/[id].tsx) — change **only** the host-profile fetch (Task C6). Everything else on those screens belongs to the food-drops feature and was audited separately.
   - [app/(tabs)/index.tsx](../../app/(tabs)/index.tsx) and [app/(tabs)/community.tsx](../../app/(tabs)/community.tsx) — change **only** the `communities` select if Task M3's verification shows they break. Do not refactor them.
   - [context/NotificationContext.tsx](../../context/NotificationContext.tsx) — Task C4 adds one function export and nothing else.
   - Do **not** "fix" `Share.share` or raw `whatsapp://` while you are in these files. See [Part 2, D9](#part-2--resolved-design-decisions).

8. **This change set adds no federation object and removes none.** No `partner`, `partnership`, `list_visible_*`, `can_user_see_*`, or `get_user_partner_community_ids` symbol is created, altered, or dropped. A regression-sweep row proves it. No `cross-community-changelog.md` entry is required.

9. **Docs are part of the change set.** See [§ DOCUMENTATION UPDATES](#documentation-updates).

---

## Severity summary

| # | Issue | Severity | Area | Fixed by |
|---|---|---|---|---|
| 1 | Every society's join code is readable by anyone on the internet **`[live]`** | **P0** | DB (RLS) | [M3](#task-m3--scope-communities-reads-1-5) |
| 2 | Resident email, phone, flat and push token leak to signed-out callers **`[live]`** | **P0** | DB (RLS) | [M2](#task-m2--public-host-profile-rpc-2), [C6](#task-c6--drop-screens-host-fetch-2) |
| 3 | Opening the app with no signal silently signs the resident out | **P0** | Client | [C1](#task-c1-contextauthcontexttsx--session-lifecycle-3-13-18-20) |
| 4 | A resident can move themselves into any other society by ID | **P0** | DB (RLS) | [M1](#task-m1--profile-membership-guard-4-5-15) |
| 5 | Removing a resident does not stick — they rejoin in seconds | P1 | DB | [M1](#task-m1--profile-membership-guard-4-5-15), [M3](#task-m3--scope-communities-reads-1-5) |
| 6 | Google sign-in failures are completely silent on the PWA | P1 | Client (web) | [C2](#task-c2-applogintsx--google-sign-in-6-7-17) |
| 7 | Tapping a shared link then signing in dumps you on the home tab | P1 | Client (web) | [C2](#task-c2-applogintsx--google-sign-in-6-7-17), [C3](#task-c3-app_layouttsx--saved-deep-link-target-7) |
| 8 | iOS Google Sign-In cannot work in any build | P1 | Config | [C8](#task-c8--build-configuration-8-9) |
| 9 | Native builds ship with no Supabase or Google credentials | P1 | Config | [C8](#task-c8--build-configuration-8-9) |
| 10 | `get_funds_access_status` takes a caller-controlled community ID | P1 | DB (RPC) | [M4](#task-m4--scope-get_funds_access_status-10), [C1](#task-c1-contextauthcontexttsx--session-lifecycle-3-13-18-20) |
| 11 | Signing out never revokes the session server-side | P1 | Client | [C1](#task-c1-contextauthcontexttsx--session-lifecycle-3-13-18-20) |
| 12 | The next person to use the phone gets the last person's notifications | P1 | Client | [C1](#task-c1-contextauthcontexttsx--session-lifecycle-3-13-18-20), [C4](#task-c4-contextnotificationcontexttsx--token-clearing-12) |
| 13 | A revoked session leaves a signed-in-looking app where nothing loads | P1 | Client | [C1](#task-c1-contextauthcontexttsx--session-lifecycle-3-13-18-20) |
| 14 | The session-retry helper is dead code, and its JWT branch can never match | P2 | Client | [C5](#task-c5-libsupabasets--dead-session-helpers-14) |
| 15 | `handle_new_user()` runs as superuser with a mutable `search_path` | P2 | DB | [M1](#task-m1--profile-membership-guard-4-5-15) |
| 16 | Web OAuth uses the implicit flow; tokens land in browser history | P2 | Client (web) | [C7](#task-c7-libsupabasets--pkce-16) |
| 17 | Two dormant email-auth defects behind `EMAIL_AUTH_UI_ENABLED` | P2 | Client | [C2](#task-c2-applogintsx--google-sign-in-6-7-17), [C9](#task-c9-libauthts--dormant-reset-link-17) |
| 18 | Every foreground and every Settings-tab focus costs a token round trip | P2 | Client | [C1](#task-c1-contextauthcontexttsx--session-lifecycle-3-13-18-20) |
| 19 | Sign-out races itself on web | P2 | Client | [C10](#task-c10--sign-out-call-sites-19) |
| 20 | The 3.5 s loading escape hatch can bounce a returning resident to `/login` | P2 | Client | [C1](#task-c1-contextauthcontexttsx--session-lifecycle-3-13-18-20) |

---

# PART 1 — FINDINGS

# P0 — blocks real use

## 1. Every society's join code is readable by anyone on the internet **`[live]`**

The `communities` SELECT policy is unconditional, and it applies to the `public` role — which includes `anon`:

```
policyname:  "Anyone can view communities"
cmd:         SELECT
roles:       {public}
qual:        true
```

`information_schema.role_table_grants` confirms `anon` holds table `SELECT` on `public.communities`, and the table's columns include `code`.

**Verified live.** An unauthenticated `GET` against prod, carrying only the anon key that ships inside the deployed JavaScript bundle:

```bash
curl "https://mbzvcaoulawdugfearmj.supabase.co/rest/v1/communities?select=id,name,code,city,pincode" \
  -H "apikey: <public anon key>" -H "Authorization: Bearer <public anon key>"
```
```json
[{"id":"64cd9fa6-…","name":"IRA Aspiration","code":"B4UVX8","city":"Hyderabad","pincode":"502300"}]
```

The 6-character code is the **only** thing standing between a stranger and full resident membership. [`join_community_by_code()`](../architecture.md) validates nothing except that the code exists and that the caller has no community yet:

```sql
SELECT * INTO target_community FROM public.communities WHERE upper(code) = upper(btrim(p_code));
IF target_community.id IS NULL THEN RAISE EXCEPTION 'Invalid community code'; END IF;
UPDATE public.profiles SET community_id = target_community.id, removed_at = NULL, removed_by = NULL
WHERE id = auth.uid();
```

**Resident impact.** Anyone with a Google account — a delivery rider, a competitor, someone who read a blog post about the app — can list every society on the platform with one HTTP request, sign in with Google, paste a code, and be inside. Once inside they see the resident directory with names, flats and phone numbers, the SOS blood-donor register, the provider list, carpools, food drops, and fund ledgers. There is no approval step for code-based joins. As the platform adds societies, one request returns every code at once.

The code is not a secret today because the app itself treats it as one — [app/(tabs)/community.tsx:104](../../app/(tabs)/community.tsx#L104) reads it so a lead can share it, and [app/community-request-submitted.tsx:56](../../app/community-request-submitted.tsx#L56) shows it to a founder after approval. Those are member-scoped screens. The policy is what makes it public.

**How the rest of the codebase gets this right:** every other community-scoped table pins on `get_user_community_id()`. `communities` is the one that was left at `true`, presumably so the pre-join screens could read it.

## 2. Resident email, phone number, flat and push token leak to signed-out callers **`[live]`**

[`supabase/migrations/20260830000100_fix_profiles_select_leak.sql`](../../supabase/migrations/20260830000100_fix_profiles_select_leak.sql) was written to close a `profiles` read leak. Its own comment states the goal:

```sql
-- Retain public/community host visibility for food drops, business listings, and carpools
-- so shared cards and rosters show creator full_name and flat_number without leaking
-- private phone numbers and emails of every resident in the community.
```

But RLS is **row**-level, not column-level. The policy it created grants the *whole row*, and it targets the `public` role with no `auth.uid()` predicate anywhere in it:

```sql
CREATE POLICY profiles_select_public_hosts
  ON public.profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.mcn_preorder_drops d WHERE d.created_by = profiles.id)
    OR EXISTS (SELECT 1 FROM public.mcn_listings l   WHERE l.owner_id   = profiles.id)
    OR EXISTS (SELECT 1 FROM public.mcn_carpools c   WHERE c.created_by = profiles.id)
  );
```

**Verified live.** Same unauthenticated request, no session at all:

```bash
curl "https://mbzvcaoulawdugfearmj.supabase.co/rest/v1/profiles?select=*" \
  -H "apikey: <public anon key>" -H "Authorization: Bearer <public anon key>"
```
```json
[{"id":"24b4610d-…","full_name":"Venkata Ramana Reddy","avatar_url":null,
  "community_id":"64cd9fa6-…","created_at":"2026-08-08T16:13:44Z","app_role":"resident",
  "flat_number":null,"expo_push_token":null,"phone_number":null,"removed_at":null,
  "removed_by":null,"email":"venkatbrr@gmail.com","block_id":null}]
```

Every column came back, including `email`. On a populated society this returns the full name, email address, phone number, flat number, Expo push token, and community of **every resident who has ever posted a food drop, a business listing, or a carpool** — which is exactly the set of residents the app most encourages to post.

**Resident impact.** A resident lists a tiffin service on the community noticeboard and their personal mobile number and email become scrapeable by anyone who knows the endpoint. The push token is worse than it looks: it is the address a notification is delivered to, so it leaks alongside the identity.

The policy exists to serve the two genuinely public routes — [app/\_layout.tsx:72-74](../../app/_layout.tsx#L72-L74) lets `/mcn/drops` and `/mcn/drops/*` render signed out, and [app/mcn/drops/\[id\].tsx:107-109](../../app/mcn/drops/[id].tsx#L107-L109) reads `full_name, flat_number, phone_number` for the host. The fix is to serve those two screens a narrow `SECURITY DEFINER` RPC and take the blanket policy off `anon`. Details in [M2](#task-m2--public-host-profile-rpc-2) and [C6](#task-c6--drop-screens-host-fetch-2).

## 3. Opening the app with no signal silently signs the resident out

[context/AuthContext.tsx:276-283](../../context/AuthContext.tsx#L276-L283):

```tsx
if (session?.user?.id) {
  const { error: userError } = await supabase.auth.getUser();
  if (userError) {
    console.warn('User no longer exists on server — signing out:', userError.message);
    await clearLocalSession();
    return;
  }
```

The comment above it says this exists so "deleted / banned users are signed out immediately on app launch". The problem is that `userError` is not only returned for a deleted user.

**Verified from library source** (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js`, `_getUser`, v2.103.2): a failed network fetch raises `AuthRetryableFetchError`, `isAuthError(error)` is true for it, and the catch block therefore **returns** it rather than throwing:

```js
catch (error) {
    if (isAuthError(error)) {
        if (isAuthSessionMissingError(error)) { … }
        return this._returnResult({ data: { user: null }, error });
    }
    throw error;
}
```

`_getUser` does not retry. So a timeout, a captive portal, a dropped Wi-Fi handoff, or Supabase returning 5xx all produce a non-null `userError`, and `clearLocalSession()` wipes the stored session.

It is not only a launch-time path. [context/AuthContext.tsx:306-314](../../context/AuthContext.tsx#L306-L314) re-runs the same function on **every** foreground transition on native:

```tsx
if (Platform.OS !== 'web') {
  appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
    if (nextAppState === 'active') {
      fetchSession();
    }
  });
}
```

**Resident impact.** A resident walks into the basement, glances at the app, comes back up — and is on the login screen. To get back in they need Google sign-in, which needs the network they just lost. In a lift lobby or a patchy-signal stairwell the app logs you out precisely when you cannot log back in. The failure is silent: there is no toast, no "you're offline" state, just the login screen. `LogBox.ignoreLogs(['AuthApiError'])` in [app/\_layout.tsx:20-23](../../app/_layout.tsx#L20-L23) hides the one clue a developer would have had.

**Not exercised live** — reproducing it needs a signed-in device in airplane mode, and there is no test account. The library source above settles the mechanism; a `resident` account plus airplane-mode toggle would settle the end-to-end behaviour.

## 4. A resident can move themselves into any other society by ID

The `profiles` UPDATE policy pins only the row's owner. It does not pin the tenant column, and it cannot — `WITH CHECK` has no access to the old row:

```
policyname:  "Users can update own profile"
cmd:         UPDATE
qual:        (id = auth.uid())
with_check:  (id = auth.uid())
```

`information_schema.role_table_grants` shows `authenticated` holds table-wide `UPDATE` on `public.profiles` — there are no column privileges narrowing it. So every column is writable by its owner unless a trigger says otherwise. There are exactly three triggers on the table, and none of them guards `community_id`:

| Trigger | Timing | What it actually guards |
|---|---|---|
| `enforce_profile_role_change_permissions_on_profiles` | BEFORE UPDATE | `app_role` only — raises unless `is_platform_admin(auth.uid())` |
| `profile_audit_log_on_profiles` | AFTER UPDATE | Nothing. It writes an audit row and returns. |
| `profile_block_guard` | BEFORE INSERT OR UPDATE OF `community_id`, `block_id` | Returns immediately when `NEW.block_id IS NULL` |

`validate_profile_block_assignment()` begins:

```sql
IF NEW.block_id IS NULL THEN
  RETURN NEW;
END IF;
```

So a single request that sets `block_id` to `NULL` and `community_id` to another society's UUID passes all three. The UUID is not a secret: `communities` is world-readable (issue #1). `get_user_community_id()` reads `profiles.community_id` directly, so the moment the row changes, every community-scoped RLS policy on the platform starts matching the new society's rows.

```
PATCH /rest/v1/profiles?id=eq.<self>
{"community_id": "<other society uuid>", "block_id": null}
```

This bypasses `join_community_by_code()` entirely, including its `IF caller_profile.community_id IS NOT NULL THEN RAISE EXCEPTION 'Already a member of a community'` guard — the guard only protects the RPC, not the table.

**Resident impact.** A resident of society A reads society B's directory, funds ledger, SOS register and provider list by editing one field, and can hop back afterwards. The audit trigger records the hop, but nothing blocks it and nobody is notified. It is the single most complete tenancy bypass in the app.

**Not exercised live.** Proving it end to end requires an authenticated `UPDATE` against prod, which ground rule 3 forbids. The proof above is the complete policy text plus all three trigger bodies, read from `pg_policies` and `pg_trigger`/`pg_proc` on prod. A `resident` account in a two-community environment would settle it.

**How the rest of the codebase gets this right:** [`docs/CLAUDE.md` §9](../CLAUDE.md) already names this exact trap — *"An RLS `UPDATE` policy with `USING` but no `WITH CHECK` … Always write both, and always pin the tenant column."* Here both clauses exist but neither pins the tenant, which is the same hole with the paperwork filled in. Membership changes elsewhere all go through `SECURITY DEFINER` RPCs (`join_community_by_code`, `set_my_block`, `community_lead_remove_resident`, `platform_soft_remove_resident`); the direct table write is the unguarded back door.

---

# P1 — high

## 5. Removing a resident does not stick — they rejoin in seconds

`community_lead_remove_resident()` and `platform_soft_remove_resident()` both do the same thing:

```sql
UPDATE public.profiles
SET community_id = NULL,
    app_role     = 'resident'::public.app_role_type,
    removed_at   = now(),
    removed_by   = auth.uid()
WHERE id = target_profile.id;
```

Nothing revokes the removed user's Supabase session. That part is defensible — RLS re-reads `profiles.community_id` on every query, so their data access dies immediately and [app/\_layout.tsx:114-116](../../app/_layout.tsx#L114-L116) routes them to `/community-select` on the next profile load.

The problem is what `/community-select` offers them. `join_community_by_code()` requires `community_id IS NULL` — which removal just made true — and then explicitly clears the removal marks:

```sql
UPDATE public.profiles
SET community_id = target_community.id,
    removed_at   = NULL,
    removed_by   = NULL
WHERE id = auth.uid();
```

The code they need is the one they already used to join, still displayed on the community tab, and in any case publicly readable (issue #1). Nothing anywhere reads `removed_at` for the current user — the only client reference to that column is [app/community/blocks.tsx:38](../../app/community/blocks.tsx#L38), filtering a roster.

**Resident impact.** A president removes someone for harassment in the noticeboard. The removed resident taps "Join with code", pastes the same six characters, and is back — with `removed_at` wiped, so the removal leaves no trace on the profile row and the president has no signal it was undone. Removal is, in practice, a suggestion.

**Not exercised live** — there is no `president` account and no second resident. Proven from the two RPC bodies and `join_community_by_code()`, all read from prod.

## 6. Google sign-in failures are completely silent on the PWA

[app/login.tsx:27-33](../../app/login.tsx#L27-L33) leaves `statusCodes` as an empty object on web:

```tsx
let GoogleSignin: any = null;
let statusCodes: any = {};
if (Platform.OS !== 'web') {
  const gsi = require('@react-native-google-signin/google-signin');
  GoogleSignin = gsi.GoogleSignin;
  statusCodes = gsi.statusCodes;
}
```

The catch block then gates *all* error reporting on a comparison that is `undefined !== undefined` on web:

```tsx
} catch (error: any) {
  if (error.code !== statusCodes.SIGN_IN_CANCELLED) {
    console.warn('Google Sign-In Error:', error);
    Toast.show({ type: 'error', text1: 'Google Auth Error', … });
  }
}
```

On web, `statusCodes.SIGN_IN_CANCELLED` is `undefined`. `supabase.auth.signInWithOAuth` rejects with an `AuthError` that carries no `code` property, so `error.code` is also `undefined`. `undefined !== undefined` is `false`, the whole block is skipped, and the user gets nothing — not even the `console.warn`.

**Resident impact.** If the OAuth provider is misconfigured, the redirect URL is not on Supabase's allow-list, or the network drops mid-request, the resident taps "Continue with Google", the spinner stops, and the screen sits there unchanged. There is no error, no retry prompt, and nothing in the console to report. The only error path that works on web is the one in [app/login.tsx:44-57](../../app/login.tsx#L44-L57), which reads `error_description` back off the query string after a *completed* failed redirect — it cannot help when the redirect never starts.

## 7. Tapping a shared link then signing in dumps you on the home tab

[app/\_layout.tsx:84-91](../../app/_layout.tsx#L84-L91) saves where the user was heading before bouncing them to `/login`:

```tsx
if (!session) {
  if (!inAuthGroup && !isPublicFoodDropRoute && !isWebRootPath) {
    if (pathname && pathname !== '/' && pathname !== '/login') {
      savedTargetRouteRef.current = pathname;
    }
    redirectTo = '/login';
  }
}
```

`savedTargetRouteRef` is a `useRef` — in-memory only. On web, [app/login.tsx:156-171](../../app/login.tsx#L156-L171) signs in by navigating the entire browser away:

```tsx
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: redirectUrl, queryParams: { prompt: 'select_account' } },
});
if (error) throw error;
// The browser will redirect — no further code runs here.
```

The document unloads at `accounts.google.com` and a fresh one loads at `/login#access_token=…`. Every ref is gone. The layout then falls to its default at [app/\_layout.tsx:117-123](../../app/_layout.tsx#L117-L123) and sends them to `/(tabs)`.

**Resident impact.** A neighbour shares a carpool or a food drop in the society WhatsApp group. The recipient taps it on their phone browser, is asked to sign in, signs in — and lands on the home tab with no idea what they were meant to be looking at. They have to go back to WhatsApp and tap the link again. On native the ref survives, so this is a web-only defect, and web is where shared links are opened.

[`docs/features.md`](../features.md) line 39 already documents the intended behaviour — *"Post-auth routing belongs to the root layout, which restores any saved deep-link target"* — so this is a promise the code does not keep on the platform that needs it.

## 8. iOS Google Sign-In cannot work in any build

[app.json:38-41](../../app.json#L38-L41):

```json
[
  "@react-native-google-signin/google-signin",
  {
    "iosUrlScheme": "com.googleusercontent.apps.DUMMY-IOS-CLIENT-ID"
  }
]
```

`iosUrlScheme` is the reversed OAuth client ID that the config plugin writes into `CFBundleURLTypes`. iOS uses it to route the callback from the Google app or the ASWebAuthenticationSession back into Wooru. With a literal `DUMMY` value, the callback has nowhere to land and `GoogleSignin.signIn()` cannot complete.

This is not a missing env var — it is `app.json`, a static JSON file. There is no `app.config.js` in the repo (`ls app.config.*` returns nothing), so no environment variable can reach this value. It is hard-coded wrong for every build profile.

It pairs with a second dummy in [lib/auth.ts:14-17](../../lib/auth.ts#L14-L17):

```tsx
GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || 'dummy-web-client-id',
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || 'dummy-ios-client-id',
});
```

**Resident impact.** iOS is a listed target platform. Today an iOS build has no working sign-in at all, and the failure surfaces as a generic Google error rather than "this app is misconfigured". The fallback strings are what make it opaque: a missing client ID should stop the build, not silently produce an unusable one.

**Not verified on a device** — there is no iOS build in this environment. Proven from `app.json` and the plugin's documented contract. An `expo prebuild -p ios` and an inspection of `ios/*/Info.plist` would settle it.

## 9. Native builds ship with no Supabase or Google credentials

[eas.json](../../eas.json) declares three build profiles and **no `env` block on any of them** (`grep -n "env" eas.json` returns nothing). `.env` is gitignored and untracked — [`docs/CLAUDE.md` §9](../CLAUDE.md) says so explicitly. EAS uploads the git working tree, so a gitignored `.env` does not reach the build.

Both consumers fall back silently rather than failing. [lib/supabase.ts:21-22](../../lib/supabase.ts#L21-L22):

```tsx
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://xyzcompany.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'public-anon-key';
```

plus the `dummy-*-client-id` fallbacks in `lib/auth.ts` from issue #8.

**Resident impact.** An EAS build that picks up no environment points at a Supabase project that is not Wooru and a Google client that does not exist. Nothing warns; the app installs, opens, shows the login screen, and every action fails obscurely.

**This one needs confirmation before you act.** EAS also supports environment variables configured in the EAS dashboard, which are not visible from the repository. **Ask the project owner whether `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and `EXPO_PUBLIC_SITE_URL` are set as EAS environment variables** before assuming the builds are broken. Either way the silent dummy fallbacks are wrong and Task C8 removes them — that part is unconditional.

**How the rest of the codebase gets this right:** [build-admin.js:53-64](../../build-admin.js#L53-L64) refuses to build the admin console when a mapped env var is missing:

```js
if (missing.length > 0) {
  console.error(`Missing ${missing.join(', ')}.\n` +
    'The admin console cannot be built without them — refusing to ship a\n' +
    'dashboard with unsubstituted placeholders.');
  process.exit(1);
}
```

That is the standard the app bundle should meet.

## 10. `get_funds_access_status` takes a caller-controlled community ID

Called on every session hydration, [context/AuthContext.tsx:227](../../context/AuthContext.tsx#L227):

```tsx
supabase.rpc('get_funds_access_status', { p_community_id: resolvedCommunityId }),
```

The function is `SECURITY DEFINER` and never checks who is asking:

```sql
CREATE OR REPLACE FUNCTION public.get_funds_access_status(p_community_id uuid)
 RETURNS TABLE(status text, request_id uuid, rejection_reason text, decided_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT far.status, far.id, far.rejection_reason, far.decided_at
  FROM public.funds_access_requests far
  WHERE far.community_id = p_community_id
  ORDER BY far.created_at DESC
  LIMIT 1;
$function$
```

`EXECUTE` is granted to `authenticated`. Any signed-in user can pass any community's UUID — which, per issue #1, they can enumerate — and read that society's latest funds-access request status and its free-text `rejection_reason`.

**Resident impact.** Low-value data, but it is a private administrative note: a rejection reason written by a platform admin about another society, readable by anyone. More to the point, [`docs/CLAUDE.md` §9](../CLAUDE.md) names this exact anti-pattern — *"A `SECURITY DEFINER` RPC taking `community_id` or `user_id` parameter … Derive scope from `auth.uid()`"* — and this function is called from the auth context itself, which makes it the highest-traffic instance of it.

**Not exercised live** — calling it with another community's UUID requires an authenticated session. Proven from `pg_proc` and `pg_proc.proacl` on prod.

## 11. Signing out never revokes the session server-side

[context/AuthContext.tsx:380-395](../../context/AuthContext.tsx#L380-L395):

```tsx
const signOut = async () => {
  resetAuthState();
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch { /* Ignore local storage clear issues */ }

  supabase.auth.signOut().catch((err) => {
    console.warn('Background signout notification error:', err);
  });
  …
```

The intent is clear — clear locally for instant UI, then tell the server in the background. The order defeats it.

**Verified from library source** (`GoTrueClient._signOut`, v2.103.2):

```js
const accessToken = data.session?.access_token;
if (accessToken) {
    const { error } = await this.admin.signOut(accessToken, scope);
    …
}
if (scope !== 'others') {
    await this._removeSession();
    …
}
```

The API call happens **only when an access token is still present**. The first call (`scope: 'local'`) runs `_removeSession()`, so by the time the second (global) call runs there is no token, the `if (accessToken)` block is skipped, and it resolves with `error: null` having contacted nothing. The `.catch()` never fires, so the failure is invisible.

**Resident impact.** The refresh token issued to that device stays valid on Supabase's side until it expires on its own. Anyone who can read the browser's local storage or an unencrypted Android backup after the "sign out" still holds a usable token. For a shared family tablet or a phone handed in for repair, "I signed out" is not true.

## 12. The next person to use the phone gets the last person's notifications

[context/NotificationContext.tsx:96-99](../../context/NotificationContext.tsx#L96-L99) writes the device's Expo push token onto the signed-in profile:

```tsx
const { error } = await supabase
  .from('profiles')
  .update({ expo_push_token: token })
  .eq('id', user.id);
```

Nothing ever clears it. `signOut` in `AuthContext` resets local state and drops the session; `expo_push_token` stays on the old profile row. The next person to sign in on the same handset registers the **same** device token onto *their* profile, so two profiles now point at one device.

**Resident impact.** A household shares one phone, or a resident hands a device to a family member who signs in with their own Google account. Notifications addressed to the first resident — an SOS blood request naming them, a fund reminder, a carpool message — keep arriving on that handset, now in front of someone else. It is a small, quiet privacy leak that will never be reported as a bug because it looks like the app is just being noisy.

## 13. A revoked session leaves a signed-in-looking app where nothing loads

[context/AuthContext.tsx:349-362](../../context/AuthContext.tsx#L349-L362):

```tsx
const refreshSession = async () => {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    console.warn('Token refresh failed — falling back to current session:', error.message);
  }

  const refreshedSession = data.session ?? session;

  if (refreshedSession?.user?.id) {
    setSession(refreshedSession);
    setUser(refreshedSession.user);
    await loadProfile(refreshedSession.user.id, refreshedSession);
    return;
  }
```

When the refresh token is genuinely revoked — a real "signed out everywhere", a Supabase-side session purge, refresh-token reuse detection — `data.session` is `null` and the code falls back to the **stale in-memory session**, which is truthy. It then calls `loadProfile`, whose error branch deliberately does nothing so a network blip does not eject the user ([context/AuthContext.tsx:123-128](../../context/AuthContext.tsx#L123-L128)):

```tsx
if (error) {
  console.error('Error loading profile:', error);
  // On network errors / server issues, retain existing profile if already loaded
  // to prevent kicking user to /community-select.
  return;
}
```

So the app keeps `session`, keeps `profile`, keeps rendering tabs, and every query returns a 401.

**Resident impact.** The resident sees their name, their community, their tab bar — and an app where every list is empty, every save fails, and pull-to-refresh changes nothing. There is no state that says "your session ended, sign in again". Compare with the deliberate, correct handling one function up in `fetchSession`, which signs out on a `getSession` error ([context/AuthContext.tsx:265-271](../../context/AuthContext.tsx#L265-L271)). `refreshSession` needs the same decisiveness — distinguishing a *revoked* token (sign out) from a *network* failure (keep the session and say so).

This is reachable from ordinary use: [app/(tabs)/profile.tsx:145-163](../../app/(tabs)/profile.tsx#L145-L163) calls `refreshSession()` on every focus of the Settings tab.

---

# P2 — smaller

## 14. The session-retry helper is dead code, and its JWT branch can never match

[lib/supabase.ts:38-68](../../lib/supabase.ts#L38-L68) defines `isAuthOrSessionError` and `executeWithSessionCheck`. `grep -rn "executeWithSessionCheck\|isAuthOrSessionError" app/ components/ lib/ context/` (excluding the definition file) returns **nothing**. Neither is imported anywhere. Nothing in the app retries after a token refresh.

The dead code also contains a bug, at [lib/supabase.ts:40-48](../../lib/supabase.ts#L40-L48):

```tsx
const message = String(error.message || error.details || '').toLowerCase();
…
message.includes('jwt expired') ||
message.includes('invalid JWT') ||     // ← can never match: message is lowercased
message.includes('invalid_claim') ||
```

`message` has already been lowercased, so `includes('invalid JWT')` is unreachable. Supabase's actual string for that case is `invalid JWT`, so the one branch that would have caught it is the broken one.

Leaving it is worse than deleting it: the next person to hit a 401 will find a plausible-looking helper, wire it up, and inherit a hole.

## 15. `handle_new_user()` runs as superuser with a mutable `search_path`

This is the trigger that creates the `profiles` row for every account, on `AFTER INSERT ON auth.users`:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER          -- ← no SET search_path
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, app_role, email)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url',
    CASE WHEN lower(COALESCE(new.email, '')) = 'thewooru@gmail.com'
      THEN 'admin'::public.app_role_type ELSE 'resident'::public.app_role_type END,
    new.email);
  RETURN new;
END;
$function$
```

Supabase's security advisor flags it: *"Function `public.handle_new_user` has a role mutable search_path"*. [`docs/CLAUDE.md` §9](../CLAUDE.md) requires `SECURITY DEFINER` functions to pin it.

Fifteen other functions carry the same warning (`touch_*`, `enforce_max_*`, `normalize_indian_mobile`, …). Those are out of scope — see [Part 2, D8](#part-2--resolved-design-decisions). `handle_new_user` is in scope because it is the auth path, it runs at the highest privilege in the system, and it is the only one of the sixteen that fires on account creation. One line fixes it.

## 16. Web OAuth uses the implicit flow; tokens land in browser history

[lib/supabase.ts:24-33](../../lib/supabase.ts#L24-L33) sets `detectSessionInUrl` but never sets `flowType`. auth-js 2.103.2 defaults to `flowType: 'implicit'` (`GoTrueClient.js:24`). So the web sign-in returns the access **and refresh** token in the URL fragment: `https://wooru.in/login#access_token=…&refresh_token=…`.

Someone already expected otherwise — [public/landing.html:34-39](../../public/landing.html#L34-L39) forwards *both* shapes:

```js
if (window.location.hash.includes('access_token=') || window.location.search.includes('code=')) {
  window.location.replace('/login' + window.location.search + window.location.hash);
}
```

The `code=` branch is PKCE, which the client never requests.

Fragments are not sent to servers, and auth-js clears the hash after parsing, so this is not a live leak. It is still the weaker of two available options: the fragment passes through the browser's session history and any extension with page access, and PKCE binds the exchange to the originating client. Switching is a two-line client change with no server-side configuration required.

## 17. Two dormant email-auth defects behind `EMAIL_AUTH_UI_ENABLED`

Both are unreachable today and both bite the moment [`constants/authFlags.ts`](../../constants/authFlags.ts) flips to `true`. [`docs/disabled-features.md`](../disabled-features.md) §1b promises *"Flip to `true` to restore; nothing else needs changing"* — that promise is currently false.

**(a)** [app/login.tsx:359](../../app/login.tsx#L359) — the Terms & Conditions link in the sign-up form:

```tsx
Alert.alert('Terms & Conditions', 'Terms & Conditions placeholder. Link will be provided later.');
```

`Alert.alert` is a no-op on web ([`docs/CLAUDE.md` §9](../CLAUDE.md)). On the PWA, tapping the only link in the consent line does nothing. The same screen already has the correct pattern 70 lines below, at [app/login.tsx:433-439](../../app/login.tsx#L433-L439), which opens `siteUrl('/terms')` — a real page, served by [vercel.json](../../vercel.json). The `Alert` should be that.

**(b)** [lib/auth.ts:52-57](../../lib/auth.ts#L52-L57) — the password reset link:

```tsx
export const resetPassword = async (email: string) => {
  const { data, error } = await supabase.resetPasswordForEmail(email, {
    redirectTo: 'wooru://reset-password',
  });
```

`grep -rn "reset-password" app/` returns **only this line**. There is no `app/reset-password.tsx`, so the deep link resolves to nothing on native; and on web a `wooru://` scheme in an email is not clickable at all. [`docs/features.md`](../features.md) line 44 documents this URL as if the route existed.

## 18. Every foreground and every Settings-tab focus costs a token round trip

Two hot paths do more network work than they need to.

**Foreground.** [context/AuthContext.tsx:308-314](../../context/AuthContext.tsx#L308-L314) runs the full `fetchSession()` — `getSession()` + `getUser()` + `loadProfile()` + two background queries — on every `AppState` `'active'` event. On Android that fires when a permission dialog closes, when the app-switcher is dismissed, and on every return from a share sheet or the camera. Supabase's documented React Native pattern is `startAutoRefresh()` / `stopAutoRefresh()`, which the app does not use.

**Settings tab.** [app/(tabs)/profile.tsx:145-163](../../app/(tabs)/profile.tsx#L145-L163) calls `refreshSession()` inside `useFocusEffect`, and `refreshSession` calls `supabase.auth.refreshSession()` — an actual **refresh-token rotation**, not a cached read. Tapping between tabs rotates the token every time. Supabase's reuse-detection window makes rapid rotation a small but real risk of self-inflicted revocation, which lands the user in issue #13.

Neither is a correctness bug on a good connection. Both make issues #3 and #13 fire far more often than they otherwise would, which is why they belong in the same change set.

## 19. Sign-out races itself on web

[app/(tabs)/profile.tsx:124-127](../../app/(tabs)/profile.tsx#L124-L127):

```tsx
const handleSignOut = () => {
  signOut();
  router.replace('/login');
};
```

`signOut()` is `async` and is not awaited. Meanwhile the context's own `signOut` ends with [context/AuthContext.tsx:392-394](../../context/AuthContext.tsx#L392-L394):

```tsx
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.location.href = '/login';
}
```

So on web two navigations are issued for one tap: an expo-router `replace` and a full document load. [app/admin-redirect.tsx:27-41](../../app/admin-redirect.tsx#L27-L41) and [app/community-request-submitted.tsx:226](../../app/community-request-submitted.tsx#L226) do the same thing with an `await`, which is closer but still doubles up.

**Resident impact.** A flicker, and occasionally a browser-history entry that lets Back return to a half-rendered signed-out Settings screen. Cosmetic, but it is three copies of the same wrong shape and one of them (`profile.tsx`) does not await a promise that clears the session.

## 20. The 3.5 s loading escape hatch can bounce a returning resident to `/login`

[context/AuthContext.tsx:301-304](../../context/AuthContext.tsx#L301-L304):

```tsx
// Safety fallback: Ensure isLoading never remains stuck indefinitely on slow/offline starts
const safetyTimer = setTimeout(() => {
  setIsLoading(false);
}, 3500);
```

The timer is unconditional — it fires whether or not hydration finished. If `getSession()` + `getUser()` + the profile read take longer than 3.5 s (a cold start on a weak connection is comfortably that), `isLoading` flips to `false` while `session` is still `null`. [app/\_layout.tsx:67-91](../../app/_layout.tsx#L67-L91) then runs its redirect logic against an incomplete state and sends the user to `/login`. When hydration lands a moment later the layout corrects itself.

A related variant: hydration can complete with `session` set but `communityId` still `null`, which routes to `/community-select` — offering a signed-in member of a society the "join a community" screen.

**Resident impact.** On a slow morning the app flashes the login screen, or briefly asks a resident of two years to enter a join code, before settling. It looks broken and it teaches people to force-quit. The fix is not to remove the timer — it is a real guard against a stuck spinner — but to make it resolve into a state the router can distinguish from "definitely signed out".

---

# PART 2 — RESOLVED DESIGN DECISIONS

| # | Question | Decision | Rationale |
|---|---|---|---|
| **D1** | Issue #1 — hide the `code` column, or scope the whole `communities` row? | **Scope the row.** Drop the `qual: true` policy; replace it with membership + platform-admin scoping, and add two `SECURITY DEFINER` RPCs for the pre-join reads. | Column-level `REVOKE` is the smaller change but it leaves every society's name, address, pincode and unit count world-readable, and it silently 403s any `select('*')` that a future screen writes. Row scoping is the pattern every other table in this app already uses. |
| **D2** | Should `join_community_by_code` gain a rate limit? | **No, not in this change set.** Scoping the code (D1) restores it to a shared secret; brute-forcing 6 alphanumeric characters is a separate, much larger piece of work (needs a throttle table and a cleanup job, and `pg_cron` is not installed). | Keeping the plan landable. Record it in `docs/architecture.md` as a known residual risk instead. |
| **D3** | Issue #5 — should removal block re-joining forever? | **No — block it until a lead re-admits.** `join_community_by_code()` must refuse when the caller has a `removed_at` for that same community, with the message *"Your access to this community was removed. Ask a community lead to re-admit you."* Leads re-admit via a new `community_lead_readmit_resident(p_profile_id)` RPC. | A permanent ban is wrong (people move back, mistakes happen) and a free re-join is meaningless. Requiring a lead's action makes removal mean something without adding a new screen — the lead surface already lists residents. **The re-admit RPC needs a UI entry point; if that is out of budget, ship the block anyway and file the UI. A removal that holds with an awkward recovery beats one that does not hold.** |
| **D4** | Issue #4 — guard with a trigger, or restructure the policy? | **Trigger.** `WITH CHECK` cannot see `OLD`, so no policy can express "this column may not change". | Postgres offers exactly one mechanism for column immutability under RLS. |
| **D5** | How does the guard trigger let the four legitimate RPCs through? | **A transaction-local GUC.** A helper `public.allow_membership_change()` calls `set_config('app.membership_change_ok', '1', true)`; the guard returns early when it reads `'1'`. The four RPCs call the helper before their `UPDATE`. `EXECUTE` is granted to **no one** — `REVOKE ALL … FROM PUBLIC, anon, authenticated`. | Each PostgREST request is its own transaction, so a client cannot set the flag in one request and use it in another. This mirrors the existing `set_audit_context()` / `current_setting('app.audit_reason', true)` pattern already in `profile_audit_log_trigger()`, so it is a shape this codebase already reads fluently. |
| **D6** | Issue #2 — should the host's phone still show on the signed-out food-drop page? | **No.** The public page shows `full_name`, `avatar_url` and `flat_number`. Phone appears only to a signed-in caller. | A phone number on a page indexable by anyone with the endpoint is the leak, not a feature. Signed-in residents — the people who can actually order — keep it. |
| **D7** | Issue #10 — guard the parameter, or remove it? | **Remove it.** `DROP FUNCTION` and recreate as `get_funds_access_status()` with no arguments, deriving scope from `get_user_community_id()`. | A guarded parameter is still an RLS bypass with caller-controlled input. There is exactly one call site ([context/AuthContext.tsx:227](../../context/AuthContext.tsx#L227)), so removal is cheap. Note: the function `RETURNS TABLE`, so it **must** be dropped before recreation — `CREATE OR REPLACE` fails with a return-type mismatch ([`docs/CLAUDE.md` §9](../CLAUDE.md)). |
| **D8** | The other 15 `search_path`-mutable functions | **Out of scope — checked and deliberately deferred.** `get_advisors(security)` reports 16 `function_search_path_mutable` warnings: `touch_blood_donors_updated_at`, `touch_emergency_contacts_updated_at`, `touch_provider_personal_notes_updated_at`, `touch_mcn_posts_updated_at`, `touch_mcn_preorder_updated_at`, `touch_mcn_carpools_updated_at`, `enforce_flagged_listing_reactivation`, `normalize_indian_mobile`, `get_community_insights`, `handle_visit_rescheduled_notification`, `update_school_aspect_averages`, `enforce_one_listing_per_owner_category`, `enforce_max_active_listings_per_owner`, `enforce_listing_creation_rate_limit`, `enforce_max_open_drops_per_host`, and `handle_new_user`. Only the last is in this feature. The other 15 deserve one sweep migration of their own. | Fixing one of sixteen in an unrelated change set makes the codebase less consistent, not more. Recorded here so the next auditor does not re-derive the list. |
| **D9** | `Share.share` without a `navigator.share` guard; raw `whatsapp://` URLs | **Out of scope — shared defect, recorded not fixed.** `grep -rn "Share.share" app/ components/` → **11 sites** across drops, parents, provider, visits, community, home, and four card components. `grep -rn "whatsapp://" app/ components/` → **3 sites** ([app/community-request-submitted.tsx:87](../../app/community-request-submitted.tsx#L87), [app/provider/\[id\].tsx:252](../../app/provider/[id].tsx#L252), [components/McnPostCard.tsx:42](../../components/McnPostCard.tsx#L42)), against 3 files already using `buildWhatsAppUrl`. One of the WhatsApp sites is on an auth-flow screen, but fixing one of three makes the app *less* uniform. | Both deserve a single sweep change set. Do not touch them here even though you will be editing an adjacent file. |
| **D10** | The hard-coded `thewooru@gmail.com` in `is_platform_admin()`, `handle_new_user()`, [context/AuthContext.tsx:15](../../context/AuthContext.tsx#L15) and [admin-dashboard/js/auth.js:85](../../admin-dashboard/js/auth.js#L85) | **Keep. Not a finding.** [`docs/disabled-features.md`](../disabled-features.md) §1b documents it as an intentional break-glass branch, and prod confirms both admin profiles carry `app_role = 'admin'` with `community_id IS NULL`, so the branch is redundant rather than load-bearing. | It is deliberate, documented, and currently inert. Removing it is a decision for the owner, not an audit finding. |
| **D11** | The admin console still offers email + password sign-in while the app is Google-only, and `auth_leaked_password_protection` is off | **Out of scope, but flag it to the owner.** `thewooru@gmail.com` has `providers: ["email","google"]` and a password set (verified against `auth.users` on prod). The console's password form at [admin-dashboard/js/auth.js:41-45](../../admin-dashboard/js/auth.js#L41-L45) is publicly reachable at `/admin/index.html`. | The console is a documented feature with its own owner doc ([`platform-admin.md`](../platform-admin.md)); changing its auth surface is a product decision. But the highest-privilege account on the platform is reachable by password, with leaked-password protection disabled and no MFA — say so in the handover. |
| **D12** | Issue #16 — switch to PKCE now? | **Yes, in the same change set**, as a two-line client change: add `flowType: 'pkce'` to the `auth` options in [lib/supabase.ts](../../lib/supabase.ts). No Supabase dashboard change is needed. | The storage adapter already persists the code verifier on both platforms, `detectSessionInUrl` handles `?code=` unchanged, and [public/landing.html:36](../../public/landing.html#L36) already forwards `code=`. Low risk, and it must be verified on the PWA before the change reaches prod — see the checklist. |
| **D13** | **Migration filenames.** `ls supabase/migrations/ \| sort \| tail -3` → `20260902000200_report_and_text_bounds.sql`, `20260902000300_platform_admin_provider_moderation.sql`, `20260902000400_dedupe_provider_contacts.sql`. | Use, in this order: `20260903000000_profile_membership_guard.sql` (M1), `20260903000100_public_host_profile_rpc.sql` (M2), `20260903000200_scope_community_reads.sql` (M3), `20260903000300_funds_access_status_scope.sql` (M4). | All four sort strictly after `20260902000400`. Re-run the `ls` before you create them — a concurrent session may have taken a slot ([`docs/CLAUDE.md` §5](../CLAUDE.md)). |

---

# PART 3 — IMPLEMENTATION PLAN

## Sequencing

| Set | Contains | Ends with |
|---|---|---|
| **A — security** (do first, ship alone) | M1, M2, M3, M4, C6 — issues 1, 2, 4, 5, 10, 15 | Clean `tsc`; the **Database** and **Regression sweep** checklist rows. **Do not bundle this with B or C** — if something regresses you need to know which half. |
| **B — session lifecycle** | C1, C4, C5, C10 — issues 3, 11, 12, 13, 14, 18, 19, 20 | Clean `tsc`; the **Native** and offline rows of the checklist. |
| **C — sign-in surface & config** | C2, C3, C7, C8, C9 — issues 6, 7, 8, 9, 16, 17 | Clean `tsc`; the **Web (PWA)** rows. C8 blocks on the D-question in issue #9 — get the answer before starting. |

---

## Database tasks

### Task M1 — profile membership guard *(4, 5, 15)*

`supabase/migrations/20260903000000_profile_membership_guard.sql`

**Pre-flight — run these first and read the output.** The guard will start rejecting writes that succeed today. Confirm nothing but the four RPCs changes membership:

```sql
-- 1. Confirm the triggers on profiles are exactly the three this brief describes.
SELECT t.tgname, pg_get_triggerdef(t.oid)
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal AND c.relname = 'profiles';

-- 2. Confirm no function other than the four named ones writes profiles.community_id.
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
WHERE pg_get_functiondef(p.oid) ILIKE '%profiles%'
  AND pg_get_functiondef(p.oid) ILIKE '%community_id%'
  AND pg_get_functiondef(p.oid) ILIKE '%UPDATE%';
-- Expected: join_community_by_code, set_my_block (block_id only),
--           community_lead_remove_resident, platform_soft_remove_resident.
-- ANY OTHER NAME → add allow_membership_change() to it too, or the guard breaks it.

-- 3. Snapshot current membership so a rollback can be verified.
SELECT id, email, community_id, block_id, removed_at, app_role FROM public.profiles;
```

```sql
-- ============================================================================
-- 1. Bypass token for legitimate membership-changing RPCs (Part 2, D5).
--    Transaction-local, so it cannot be set from one PostgREST request and
--    used in another. Granted to nobody.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.allow_membership_change()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.membership_change_ok', '1', true);
END;
$$;

REVOKE ALL ON FUNCTION public.allow_membership_change() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. The guard itself. Pins the columns a resident must never self-edit.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_profile_membership_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Direct SQL / service role (no JWT) is unrestricted.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- A membership RPC ran allow_membership_change() earlier in this transaction.
  IF COALESCE(nullif(current_setting('app.membership_change_ok', true), ''), '0') = '1' THEN
    RETURN NEW;
  END IF;

  -- Platform admin override.
  IF public.is_platform_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.block_id   IS DISTINCT FROM OLD.block_id
     OR NEW.removed_at IS DISTINCT FROM OLD.removed_at
     OR NEW.removed_by IS DISTINCT FROM OLD.removed_by
  THEN
    RAISE EXCEPTION
      'Community membership cannot be changed directly. Use join_community_by_code() or set_my_block().';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_membership_guard_on_profiles ON public.profiles;
CREATE TRIGGER enforce_profile_membership_guard_on_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_membership_guard();

-- ============================================================================
-- 3. Teach the four legitimate RPCs to raise the flag.
--    Each is reproduced in full because CREATE OR REPLACE replaces the body.
--    COPY THE CURRENT BODY FROM pg_get_functiondef() — do not retype from this
--    brief — then insert the one PERFORM line before each UPDATE.
-- ============================================================================
--   join_community_by_code(p_code text)         → PERFORM public.allow_membership_change();
--   set_my_block(p_block_id uuid)               → PERFORM public.allow_membership_change();
--   community_lead_remove_resident(uuid, text)  → PERFORM public.allow_membership_change();
--   platform_soft_remove_resident(uuid, text)   → PERFORM public.allow_membership_change();
--
-- In join_community_by_code(), ALSO add the re-admit block (Part 2, D3),
-- immediately after the "Already a member of a community" check:
--
--   IF EXISTS (
--     SELECT 1 FROM public.profile_audit_log l
--     WHERE l.profile_id = auth.uid()
--       AND l.field = 'community_id'
--       AND l.old_value = target_community.id::text
--       AND l.new_value IS NULL
--   ) AND caller_profile.removed_at IS NOT NULL THEN
--     RAISE EXCEPTION
--       'Your access to this community was removed. Ask a community lead to re-admit you.';
--   END IF;
--
-- NOTE: removal nulls community_id, so the removed-from community is not on the
-- profile row any more — profile_audit_log is where it survives. Confirm the
-- audit rows exist and that old_value/new_value carry the shape above before
-- relying on this predicate:
--   SELECT * FROM public.profile_audit_log WHERE field = 'community_id' LIMIT 20;
-- If they do not, add a nullable profiles.removed_community_id column in this
-- migration, set it in both removal RPCs, and key the check off that instead.

-- ============================================================================
-- 4. Re-admit path for leads (Part 2, D3).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.community_lead_readmit_resident(p_target_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_profile public.profiles%ROWTYPE;
  target_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_community_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Only community leads can re-admit residents';
  END IF;

  SELECT * INTO caller_profile FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO target_profile FROM public.profiles WHERE id = p_target_profile_id;

  IF target_profile.id IS NULL THEN
    RAISE EXCEPTION 'Resident not found';
  END IF;

  IF target_profile.community_id IS NOT NULL THEN
    RAISE EXCEPTION 'Resident already belongs to a community';
  END IF;

  IF caller_profile.community_id IS NULL THEN
    RAISE EXCEPTION 'You are not assigned to a community';
  END IF;

  PERFORM public.set_audit_context(auth.uid(), 'community lead re-admitted resident');
  PERFORM public.allow_membership_change();

  UPDATE public.profiles
  SET community_id = caller_profile.community_id,
      removed_at   = NULL,
      removed_by   = NULL
  WHERE id = target_profile.id;
END;
$$;

REVOKE ALL ON FUNCTION public.community_lead_readmit_resident(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_lead_readmit_resident(uuid) TO authenticated;

-- ============================================================================
-- 5. Issue #15 — pin handle_new_user()'s search_path.
--    Reproduce the CURRENT body from pg_get_functiondef() and add the SET line.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public          -- ← the whole change
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, app_role, email)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    CASE
      WHEN lower(COALESCE(new.email, '')) = 'thewooru@gmail.com'
        THEN 'admin'::public.app_role_type
      ELSE 'resident'::public.app_role_type
    END,
    new.email
  );
  RETURN new;
END;
$$;

NOTIFY pgrst, 'reload schema';
```

**Postgres traps in this task.** `SET search_path = public` on a trigger function means `auth.uid()` must be schema-qualified if it is not on the path — it is not, so keep the `auth.` prefix everywhere (the existing guards already do). `current_setting(name, true)` returns `NULL`, not `''`, when the GUC was never set in this transaction, hence the `COALESCE(nullif(...), '0')`.

**Dead code this task creates:** none. Nothing is dropped.

### Task M2 — public host profile RPC *(2)*

`supabase/migrations/20260903000100_public_host_profile_rpc.sql`

```sql
-- Narrow replacement for the anon-readable profiles_select_public_hosts policy.
-- Returns only what a public share card renders. Phone is deliberately absent
-- (Part 2, D6).
CREATE OR REPLACE FUNCTION public.get_public_host_profiles(p_user_ids uuid[])
RETURNS TABLE (
  id          uuid,
  full_name   text,
  avatar_url  text,
  flat_number text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pr.id, pr.full_name, pr.avatar_url, pr.flat_number
  FROM public.profiles pr
  WHERE pr.id = ANY(p_user_ids)
    AND (
      EXISTS (SELECT 1 FROM public.mcn_preorder_drops d WHERE d.created_by = pr.id)
      OR EXISTS (SELECT 1 FROM public.mcn_listings   l WHERE l.owner_id    = pr.id)
      OR EXISTS (SELECT 1 FROM public.mcn_carpools   c WHERE c.created_by  = pr.id)
    );
$$;

REVOKE ALL ON FUNCTION public.get_public_host_profiles(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_host_profiles(uuid[]) TO anon, authenticated;

-- Take the blanket policy off anon. Signed-in residents keep the existing
-- behaviour, including phone, via the community-scoped policy that already exists.
DROP POLICY IF EXISTS profiles_select_public_hosts ON public.profiles;
CREATE POLICY profiles_select_public_hosts
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.mcn_preorder_drops d WHERE d.created_by = profiles.id)
    OR EXISTS (SELECT 1 FROM public.mcn_listings   l WHERE l.owner_id    = profiles.id)
    OR EXISTS (SELECT 1 FROM public.mcn_carpools   c WHERE c.created_by  = profiles.id)
  );

NOTIFY pgrst, 'reload schema';
```

**Trap:** the `RETURNS TABLE` OUT parameters are named `id`, `full_name`, … which shadow the table's own columns. The body therefore aliases the table as `pr` and qualifies every reference — a bare `id` raises *"column reference is ambiguous"* at **call** time, not creation time ([`docs/CLAUDE.md` §9](../CLAUDE.md)).

**Paired client work — this task is only half-landed without it:** Task **C6** must be in the same commit, or the signed-out food-drop page loses its host name.

### Task M3 — scope `communities` reads *(1, 5)*

`supabase/migrations/20260903000200_scope_community_reads.sql`

**Pre-flight — run first.** Confirm the only reads are the ones this task accounts for:

```sql
-- Every screen that reads communities, from the repo (run in the shell, not SQL):
--   grep -rn "from('communities')" app/ components/ context/ admin-dashboard/js/
-- Expected, and each is handled:
--   app/(tabs)/community.tsx:103          member-scoped        → OK after change
--   app/(tabs)/index.tsx:109              member-scoped        → OK after change
--   app/community-select.tsx:50           runs AFTER join      → OK after change
--   context/AuthContext.tsx:223           member-scoped        → OK after change
--   app/community-request-submitted.tsx:55,102   PRE-JOIN      → needs the RPC below
--   admin-dashboard/js/*.js               platform admin       → existing admin policy
-- ANY OTHER HIT → stop and re-plan; it will start returning [] with no error.
```

```sql
-- Replace the world-readable policy. The platform-admin policy already exists
-- separately ("Platform admins can view all communities") and is left alone.
DROP POLICY IF EXISTS "Anyone can view communities" ON public.communities;

CREATE POLICY communities_select_own
  ON public.communities FOR SELECT
  TO authenticated
  USING (id = public.get_user_community_id());

-- Pre-join read for the approved-request screen: the founder must see the code
-- for the community their own approved request produced, before they join it.
CREATE OR REPLACE FUNCTION public.get_my_requested_community()
RETURNS TABLE (
  id            uuid,
  name          text,
  code          text,
  blocks_enabled boolean,
  block_label   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.code, c.blocks_enabled, c.block_label
  FROM public.community_requests r
  JOIN public.communities c ON c.id = r.resulting_community_id
  WHERE r.requested_by = auth.uid()
    AND r.status = 'approved'
    AND r.resulting_community_id IS NOT NULL
  ORDER BY r.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_requested_community() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_requested_community() TO authenticated;

NOTIFY pgrst, 'reload schema';
```

**Trap:** same OUT-parameter shadowing as M2 — the table is aliased `c` / `r` and every column is qualified.

**Paired client work in the same commit:** [app/community-request-submitted.tsx:53-62](../../app/community-request-submitted.tsx#L53-L62) and [:100-107](../../app/community-request-submitted.tsx#L100-L107) must switch from `.from('communities')` to `supabase.rpc('get_my_requested_community')`. Both reads collapse into one call.

**Dead code this task removes:** the `"Anyone can view communities"` policy. Nothing else references it.

### Task M4 — scope `get_funds_access_status` *(10)*

`supabase/migrations/20260903000300_funds_access_status_scope.sql`

```sql
-- The function RETURNS TABLE, so the signature change requires a DROP first —
-- CREATE OR REPLACE fails with a return-type mismatch (docs/CLAUDE.md §9).
DROP FUNCTION IF EXISTS public.get_funds_access_status(uuid);

CREATE OR REPLACE FUNCTION public.get_funds_access_status()
RETURNS TABLE (
  status           text,
  request_id       uuid,
  rejection_reason text,
  decided_at       timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT far.status, far.id, far.rejection_reason, far.decided_at
  FROM public.funds_access_requests far
  WHERE far.community_id = public.get_user_community_id()
  ORDER BY far.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_funds_access_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_funds_access_status() TO authenticated;

NOTIFY pgrst, 'reload schema';
```

**Dead code this task creates — you must remove it in the same commit:** the argument at [context/AuthContext.tsx:227](../../context/AuthContext.tsx#L227) becomes invalid. Change

```tsx
supabase.rpc('get_funds_access_status', { p_community_id: resolvedCommunityId }),
```

to

```tsx
supabase.rpc('get_funds_access_status'),
```

The old overload is dropped, not left alongside, so there is no `PGRST203` resolution risk — but if the `DROP` is skipped, both signatures exist and every call starts failing. Confirm afterwards:

```sql
SELECT proname, pg_get_function_identity_arguments(oid)
FROM pg_proc WHERE proname = 'get_funds_access_status';
-- Expect exactly one row, with empty arguments.
```

---

## Client tasks

### Task C1 — `context/AuthContext.tsx` — session lifecycle *(3, 13, 18, 20)*

Also carries the one-line edits for **11**, **12** and **10**.

**(a) Issue #3 — stop treating a network failure as a deleted account.** At [context/AuthContext.tsx:276-283](../../context/AuthContext.tsx#L276-L283), distinguish the two cases. auth-js exports the discriminator:

```tsx
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
// ...
if (session?.user?.id) {
  const { error: userError } = await supabase.auth.getUser();
  if (userError) {
    if (isAuthRetryableFetchError(userError)) {
      // Offline or server unreachable — the cached session is still the best
      // truth we have. Keep it and let RLS reject anything that matters.
      console.warn('Could not reach auth server; keeping cached session:', userError.message);
    } else {
      console.warn('User no longer exists on server — signing out:', userError.message);
      await clearLocalSession();
      return;
    }
  }
  await loadProfile(session.user.id, session);
}
```

Verify `isAuthRetryableFetchError` is re-exported from `@supabase/supabase-js` at the installed version (2.103.2) before relying on it; if it is not, import from `@supabase/auth-js`, or fall back to `userError.name === 'AuthRetryableFetchError'`. Do **not** match on the message string.

**(b) Issue #18 — stop doing the full hydration on every foreground.** Replace the `AppState` handler at [context/AuthContext.tsx:306-314](../../context/AuthContext.tsx#L306-L314) with Supabase's documented native pattern, and keep a cheap profile refresh:

```tsx
if (Platform.OS !== 'web') {
  appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
    if (nextAppState === 'active') {
      supabase.auth.startAutoRefresh();
      // Cheap: re-read the profile row only. Does NOT re-validate the user
      // against the network, which is what used to sign people out offline.
      const uid = sessionRef.current?.user?.id;
      if (uid) void loadProfile(uid, sessionRef.current);
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
```

This needs a `sessionRef` kept in sync with `setSession` — the existing handler closes over stale state today and gets away with it only because it re-reads from storage.

**(c) Issue #13 — a revoked refresh token must sign the user out.** At [context/AuthContext.tsx:349-362](../../context/AuthContext.tsx#L349-L362):

```tsx
const refreshSession = async () => {
  const { data, error } = await supabase.auth.refreshSession();

  if (error && !isAuthRetryableFetchError(error)) {
    // The refresh token was rejected, not merely unreachable. Anything else we
    // do from here renders a signed-in shell over a dead session.
    console.warn('Refresh token rejected — signing out:', error.message);
    await clearLocalSession();
    Toast.show({
      type: 'error',
      text1: 'Session expired',
      text2: 'Please sign in again.',
      visibilityTime: 6000,
    });
    return;
  }
  if (error) {
    console.warn('Token refresh unreachable — keeping current session:', error.message);
  }
  // ...existing fallback path unchanged from here
```

**(d) Issue #20 — make the safety timer resolve into an honest state.** At [context/AuthContext.tsx:301-304](../../context/AuthContext.tsx#L301-L304), only fire it when hydration genuinely has not started producing a session, and lengthen it — 3.5 s is under a realistic cold start on a 3G connection:

```tsx
const safetyTimer = setTimeout(() => {
  // Only give up if nothing has arrived at all. If a session landed but the
  // profile is still loading, let it finish rather than routing on half state.
  if (!sessionRef.current) setIsLoading(false);
}, 8000);
```

Pair it with a guard in [app/\_layout.tsx:84](../../app/_layout.tsx#L84) — see **C3(b)**.

**(e) Issue #11 — revoke server-side before clearing locally.** At [context/AuthContext.tsx:380-395](../../context/AuthContext.tsx#L380-L395), invert the order:

```tsx
const signOut = async () => {
  await clearPushTokenForCurrentUser();     // (f), below — must run while the session is live

  try {
    // Global first: this is the only call that reaches the server, and it needs
    // a live access token to do it. `local` clears storage, after which the
    // global call silently no-ops (auth-js GoTrueClient._signOut).
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('Server sign-out failed; clearing locally anyway:', err);
  }

  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch { /* storage clear best effort */ }

  resetAuthState();

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.href = '/login';
  }
};
```

Note `resetAuthState()` moves to **after** the network calls: it currently runs first, which is what made the old ordering look harmless.

**(f) Issue #12 — clear the push token on the way out.** Add above `signOut`:

```tsx
const clearPushTokenForCurrentUser = async () => {
  const uid = session?.user?.id;
  if (!uid || Platform.OS === 'web') return;
  const { error } = await supabase
    .from('profiles')
    .update({ expo_push_token: null })
    .eq('id', uid);
  if (error) console.warn('Could not clear push token on sign-out:', error.message);
};
```

It must run before the session is torn down, or RLS rejects the write.

**(g) Issue #10 — drop the RPC argument.** [context/AuthContext.tsx:227](../../context/AuthContext.tsx#L227), as specified in Task M4.

### Task C2 — `app/login.tsx` — Google sign-in *(6, 7, 17)*

**(a) Issue #6 — make web errors visible.** Replace the cancellation check at [app/login.tsx:196-204](../../app/login.tsx#L196-L204):

```tsx
} catch (error: any) {
  const isNativeCancel =
    Platform.OS !== 'web' && error?.code === statusCodes.SIGN_IN_CANCELLED;

  if (!isNativeCancel) {
    console.warn('Google Sign-In Error:', error);
    Toast.show({
      type: 'error',
      text1: 'Could not sign in with Google',
      text2: error?.message || 'Please check your connection and try again.',
      visibilityTime: 6000,
    });
  }
}
```

On web `isNativeCancel` is now always `false`, so every failure surfaces. On native the behaviour is unchanged.

**(b) Issue #7 — persist the deep-link target across the redirect.** Immediately before `signInWithOAuth`, stash the saved route somewhere the page load survives:

```tsx
if (Platform.OS === 'web') {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const redirectUrl = origin ? `${origin}/login` : undefined;

  // savedTargetRouteRef in app/_layout.tsx is in-memory and does not survive the
  // full page navigation that OAuth performs. Hand it to sessionStorage.
  try {
    const pending = window.sessionStorage.getItem('wooru.pendingRoute');
    if (pending) window.sessionStorage.setItem('wooru.pendingRoute', pending);
  } catch { /* private mode — deep-link restore is best effort */ }

  const { error } = await supabase.auth.signInWithOAuth({ /* unchanged */ });
```

The write happens in **C3(a)**; this side only needs to not clobber it. Wrap every `sessionStorage` access in `try/catch` — Safari private mode throws.

**(c) Issue #17(a) — the dormant Terms alert.** Replace [app/login.tsx:359](../../app/login.tsx#L359):

```tsx
onPress={(e) => {
  e.stopPropagation();
  Linking.openURL(siteUrl('/terms'));
}}
```

`Linking` and `siteUrl` are already imported on this screen. Remove `Alert` from the `react-native` import list if it becomes unused.

### Task C3 — `app/_layout.tsx` — saved deep-link target *(7)*

**(a)** At [app/\_layout.tsx:84-91](../../app/_layout.tsx#L84-L91), mirror the ref into `sessionStorage` on web:

```tsx
if (pathname && pathname !== '/' && pathname !== '/login') {
  savedTargetRouteRef.current = pathname;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try { window.sessionStorage.setItem('wooru.pendingRoute', pathname); } catch {}
  }
}
```

And at both consumption points ([:104](../../app/_layout.tsx#L104) and [:122](../../app/_layout.tsx#L122)), read through a helper that falls back to storage and clears it:

```tsx
const takeSavedRoute = () => {
  let target = savedTargetRouteRef.current;
  if (!target && Platform.OS === 'web' && typeof window !== 'undefined') {
    try { target = window.sessionStorage.getItem('wooru.pendingRoute'); } catch {}
  }
  savedTargetRouteRef.current = null;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try { window.sessionStorage.removeItem('wooru.pendingRoute'); } catch {}
  }
  return target;
};
```

Both call sites become `redirectTo = takeSavedRoute() || '/(tabs)';`.

**(b) Issue #20's other half.** The redirect effect must not act on a half-hydrated state. At [app/\_layout.tsx:67-68](../../app/_layout.tsx#L67-L68):

```tsx
useEffect(() => {
  if (isLoading) return;
  // A session without a resolved profile is mid-hydration, not "signed in with
  // no community". Routing here shows a two-year member the join-code screen.
  if (session && !profile && !isPlatformAdmin) return;
```

This needs `profile` added to the `useAuth()` destructure at [app/\_layout.tsx:28](../../app/_layout.tsx#L28) and to the dependency array at [:145-153](../../app/_layout.tsx#L145-L153).

### Task C4 — `context/NotificationContext.tsx` — token clearing *(12)*

No behavioural change here beyond making the token clearable. `AuthContext` performs the clear (Task C1(f)) because it owns the session teardown ordering; this file only needs to stop *re-registering* immediately afterwards. Confirm that the `useEffect` at [context/NotificationContext.tsx:177-183](../../context/NotificationContext.tsx#L177-L183) tears down cleanly when `user` becomes `null` — it does today — and add nothing else. **Do not refactor this file.**

### Task C5 — `lib/supabase.ts` — dead session helpers *(14)*

Delete [lib/supabase.ts:35-68](../../lib/supabase.ts#L35-L68) — both `isAuthOrSessionError` and `executeWithSessionCheck`. Nothing imports them; `npx tsc --noEmit` proves the removal is safe.

Do **not** try to "fix" the `invalid JWT` casing and keep the helpers. Task C1 puts real handling in the one place that matters, and a second, unused retry path would only invite divergence.

### Task C6 — drops screens' host fetch *(2)*

Both edits are narrow. Change nothing else on these screens.

**[app/mcn/drops/\[id\].tsx:105-127](../../app/mcn/drops/[id].tsx#L105-L127)** — replace the direct `profiles` read with the RPC, and gate the phone on being signed in:

```tsx
if (dropData.created_by) {
  const { data: hosts } = await supabase.rpc('get_public_host_profiles', {
    p_user_ids: [dropData.created_by],
  });
  let hostProfile: any = hosts?.[0] ?? null;

  // Phone is only for signed-in residents — the public share page must not
  // expose a host's mobile number (docs/fixes: Google login review, D6).
  if (hostProfile && user?.id) {
    const { data: contact } = await supabase
      .from('profiles')
      .select('phone_number')
      .eq('id', dropData.created_by)
      .maybeSingle();
    hostProfile = { ...hostProfile, phone_number: contact?.phone_number ?? null };
  }
  // ...assign into `profiles` as before
}
```

Every consumer of `drop.profiles.phone_number` must already handle `null` — check [app/mcn/drops/\[id\].tsx:476-482](../../app/mcn/drops/[id].tsx#L476-L482) and the contact button below it, and make the button render only when a phone is present.

**[app/mcn/drops/index.tsx:140-145](../../app/mcn/drops/index.tsx#L140-L145)** — the list only reads `id, full_name, flat_number`, all of which the RPC returns:

```tsx
const { data: hostRows } = await supabase.rpc('get_public_host_profiles', {
  p_user_ids: hostIds,
});
```

`hostIds` is the same array of `created_by` values the current code passes to `.in('id', …)`.

### Task C7 — `lib/supabase.ts` — PKCE *(16)*

Add one line to the `auth` options at [lib/supabase.ts:24-33](../../lib/supabase.ts#L24-L33):

```tsx
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(storageAdapter ? { storage: storageAdapter } : {}),
    autoRefreshToken: true,
    persistSession: true,
    flowType: 'pkce',
    detectSessionInUrl: Platform.OS === 'web',
  },
});
```

**This must be verified on the PWA before it reaches prod** — see the checklist. PKCE stores a code verifier under `<storageKey>-code-verifier`; if a browser blocks storage the sign-in fails differently than it does today. If PKCE misbehaves on any target browser, revert this single line rather than unwinding Task C7's neighbours.

### Task C8 — build configuration *(8, 9)*

**Blocked on the D-question in issue #9.** Get the answer about EAS dashboard env vars first.

**(a) Issue #8 — the iOS URL scheme.** `app.json` is static, so make it dynamic. Rename `app.json` → `app.config.js`, export the same object, and read the scheme from the environment:

```js
// app.config.js
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
if (!iosClientId) {
  throw new Error(
    'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is required — the Google Sign-In plugin ' +
    'needs the reversed client ID as an iOS URL scheme, and a placeholder ' +
    'produces a build where iOS sign-in silently cannot complete.'
  );
}
const iosUrlScheme = `com.googleusercontent.apps.${iosClientId.replace(/\.apps\.googleusercontent\.com$/, '')}`;
// ...rest of the config unchanged, with `iosUrlScheme` substituted at app.json:40
```

Throwing is deliberate: this is the same posture [build-admin.js:57-64](../../build-admin.js#L57-L64) already takes.

**(b) Issue #9 — remove the silent fallbacks.** In [lib/supabase.ts:21-22](../../lib/supabase.ts#L21-L22) and [lib/auth.ts:14-17](../../lib/auth.ts#L14-L17), throw on a missing value instead of substituting a dummy. A build that cannot reach its backend must fail at startup with a legible message, not present a login screen that can never succeed.

**(c)** Add an `env` block to each `eas.json` profile *only if* the owner confirms EAS dashboard variables are **not** in use. If they are in use, leave `eas.json` alone and instead add a line to [`docs/CLAUDE.md`](../CLAUDE.md) §1 recording where native build config actually lives — the current docs say "`eas.json` build profiles", which is not true today.

### Task C9 — `lib/auth.ts` — dormant reset link *(17b)*

Two options, and the decision is **the second**: do not build a route for a flow the product has turned off. Replace the `redirectTo` at [lib/auth.ts:54](../../lib/auth.ts#L54) with `siteUrl('/login')` and add a comment stating that a real `/reset-password` route must exist before `EMAIL_AUTH_UI_ENABLED` is flipped back on. Then add that prerequisite to [`docs/disabled-features.md`](../disabled-features.md) §1b, whose "nothing else needs changing" claim is what makes this a trap.

### Task C10 — sign-out call sites *(19)*

Three files, same shape. `signOut()` already navigates on web (Task C1(e)); the caller must await it and only navigate on native.

- [app/(tabs)/profile.tsx:124-127](../../app/(tabs)/profile.tsx#L124-L127)
- [app/admin-redirect.tsx:27-41](../../app/admin-redirect.tsx#L27-L41)
- [app/community-request-submitted.tsx:226](../../app/community-request-submitted.tsx#L226) and [:270](../../app/community-request-submitted.tsx#L270)

```tsx
const handleSignOut = async () => {
  await signOut();
  if (Platform.OS !== 'web') router.replace('/login');
};
```

---

# VERIFICATION

**`npx tsc --noEmit` catches none of the 20 findings.** Every one of them type-checks today and will type-check after a wrong fix. A green `tsc` is a precondition, not evidence. Walk this checklist.

**About accounts.** There are no test accounts. Sign-in is Google-only (`EMAIL_AUTH_UI_ENABLED = false`), and prod holds exactly three users: two platform admins (`thewooru@gmail.com`, `societyservicehub@gmail.com`, both `community_id IS NULL`) and one `resident` (`venkatbrr@gmail.com`). **There is no `president` or `vice_president` account and no second community.** Rows below are split accordingly. Do not create, promote, or delete accounts to unblock a row — mark it blocked and hand it back.

## Database — runnable now, no account needed

| # | Check | Expected result | Role |
|---|---|---|---|
| 1 | `curl "$URL/rest/v1/communities?select=code" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"` | `[]` — **already observed as leaking before the fix**: returned `{"code":"B4UVX8"}` for *IRA Aspiration* | unauthenticated |
| 2 | `curl "$URL/rest/v1/profiles?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"` | `[]` — **already observed as leaking before the fix**: returned `venkatbrr@gmail.com` with full name and community | unauthenticated |
| 2 | `curl "$URL/rest/v1/rpc/get_public_host_profiles" -X POST -d '{"p_user_ids":["<a host uuid>"]}' -H "apikey: $ANON" …` | Returns `id, full_name, avatar_url, flat_number` and **no** `email`, `phone_number`, or `expo_push_token` | unauthenticated |
| 4 | `SELECT tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='profiles' AND NOT t.tgisinternal;` | Four rows, including `enforce_profile_membership_guard_on_profiles` | direct SQL |
| 4 | `SELECT proacl FROM pg_proc WHERE proname='allow_membership_change';` | No `anon=X` or `authenticated=X` entry | direct SQL |
| 10 | `SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname='get_funds_access_status';` | Exactly one row, empty argument list (proves the old overload is gone — two rows means `PGRST203` on every call) | direct SQL |
| 15 | `SELECT prosecdef, proconfig FROM pg_proc WHERE proname='handle_new_user';` | `prosecdef = true`, `proconfig` contains `search_path=public` | direct SQL |
| 15 | `get_advisors(security)` | `function_search_path_mutable` count drops from 16 to 15, and `handle_new_user` is no longer among them | direct |
| 1 | `SELECT policyname, roles, qual FROM pg_policies WHERE tablename='communities' AND cmd='SELECT';` | Two rows: `communities_select_own` (`{authenticated}`) and the pre-existing platform-admin policy. **No row with `qual = true`.** | direct SQL |
| 2 | `SELECT policyname, roles FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_select_public_hosts';` | `roles = {authenticated}` | direct SQL |

## Database — blocked pending a real account

| # | Check | Expected result | Blocked on |
|---|---|---|---|
| 4 | `PATCH /rest/v1/profiles?id=eq.<self>` with `{"community_id":"<other society>","block_id":null}` | HTTP 4xx, message *"Community membership cannot be changed directly…"* | a `resident` account **and a second community** |
| 4 | Same PATCH with `{"app_role":"admin"}` | Rejected by the existing `enforce_profile_role_change_permissions` trigger (regression — this already works) | a `resident` account |
| 4 | Normal join by code still succeeds after the guard lands | `join_community_by_code` returns `{community_id, community_name}`; the guard does not fire | a signed-out account with `community_id IS NULL` |
| 4 | `set_my_block` still succeeds after the guard lands | Block updates; guard does not fire | a `resident` in a `blocks_enabled` community |
| 5 | Lead removes a resident → resident tries the same code | *"Your access to this community was removed. Ask a community lead to re-admit you."* | a `president`/`vice_president` account |
| 5 | Lead calls `community_lead_readmit_resident` → resident joins by code | Join succeeds; `removed_at` is `NULL` | a `president`/`vice_president` account |
| 10 | `rpc('get_funds_access_status')` from a resident | Returns only their own community's row; the RPC accepts no argument to point elsewhere | a `resident` account |

## Web (PWA) — `npm run web`

| # | Check | Expected result | Role |
|---|---|---|---|
| 6 | Break the OAuth config locally (e.g. an unregistered `redirectTo`) and tap "Continue with Google" | A visible error toast — *"Could not sign in with Google"* — not a silent no-op | signed out |
| 7 | Open `/mcn/carpools` (or any gated route) in a fresh tab while signed out, then complete Google sign-in | Lands on `/mcn/carpools`, **not** the home tab | needs a working Google account; runnable with the resident's own |
| 16 | Complete a web sign-in after Task C7 | URL carries `?code=…` (PKCE), not `#access_token=…`; sign-in completes; a hard reload keeps the session | signed out |
| 16 | Repeat in Safari and in a Chrome incognito window | Sign-in completes in both, or the `try/catch` produces a legible error — never a blank screen | signed out |
| 2 | Open `/mcn/drops/<id>` in a private window, fully signed out | Host name, avatar and flat render; **no phone number anywhere**; no console error | signed out |
| 2 | Open the same URL signed in | Phone number and contact button reappear | a `resident` account |
| 17a | Flip `EMAIL_AUTH_UI_ENABLED` to `true` locally, go to sign-up, tap "Terms & Conditions" | `/terms` opens. Revert the flag afterwards. | signed out |
| 19 | Sign out from Settings | One navigation to `/login`; browser Back does not return to a half-rendered Settings screen | a `resident` account |
| 20 | Throttle the network to "Slow 3G" in devtools and hard-reload while signed in | The spinner holds; the login screen and `/community-select` are **never** flashed | a `resident` account |
| 1 | Community tab still shows the join code | Renders; `communities_select_own` matches for a member | a `resident` account |
| 5 | After an approved community request, the code screen still shows the code | `get_my_requested_community()` returns it before the founder has joined | **blocked** — needs a pending approved request |

## Native — `npm run android` (dev build required for Google Sign-In)

| # | Check | Expected result | Role |
|---|---|---|---|
| 3 | Sign in, background the app, enable airplane mode, foreground it | **Stays signed in.** No login screen, no toast. This is the headline fix. | a `resident` account |
| 3 | With airplane mode still on, pull to refresh a list | An error state or empty list — but the session survives | a `resident` account |
| 3 | Disable airplane mode, foreground again | Data loads; no re-authentication | a `resident` account |
| 18 | Background/foreground five times in a row with the network on | No visible spinner storm; check the Supabase auth logs show at most one token refresh, not five | a `resident` account |
| 13 | Revoke the session server-side (Supabase dashboard → Auth → sign out user), then focus the Settings tab | Signed out with a *"Session expired — please sign in again"* toast; **not** a signed-in shell where every list is empty | a `resident` account, plus dashboard access |
| 12 | Sign in as A, sign out, sign in as B on the same device, send a notification to A | A's notification does **not** arrive on that device. Confirm `SELECT expo_push_token FROM profiles WHERE email='<A>'` is `NULL`. | **blocked** — needs two accounts |
| 11 | Sign out, then inspect the Supabase auth session list for that user | The session is gone server-side, not merely absent from AsyncStorage | a `resident` account, plus dashboard access |
| 8 | `expo prebuild -p ios`, then inspect `ios/*/Info.plist` | `CFBundleURLSchemes` contains the real reversed client ID; **no** occurrence of `DUMMY` | **blocked** — needs a macOS/iOS toolchain |
| 9 | Build with no environment set | The build or app startup **fails loudly** with the missing-variable message — it does not start and show a login screen | any |

## Regression sweep

| Check | Expected result |
|---|---|
| `npx tsc --noEmit` | Exit 0 |
| `git diff` for `partner`, `partnership`, `list_visible_`, `can_user_see_`, `get_user_partner_community_ids` | **Zero hits.** This change set adds no federation object and removes none; no `cross-community-changelog.md` entry is required. |
| `grep -rn "executeWithSessionCheck\|isAuthOrSessionError"` across the repo | Zero hits (Task C5 removed both, and nothing imported them) |
| `grep -rn "from('communities')"` across `app/ components/ context/` | Only the four member-scoped reads; `app/community-request-submitted.tsx` now calls the RPC |
| `grep -rn "DUMMY"` across `app.config.js`, `lib/` | Zero hits |
| Platform admin signs in on web | Still redirected to `/admin/index.html`; the console loads communities, residents and requests (its reads go through `is_platform_admin` policies and `platform_*` RPCs, untouched here) |
| A signed-in resident's home, community, Help, MCN and Saved tabs | All load. M3 narrows `communities`, so a stray read anywhere returns `[]` **with no error** ([`docs/CLAUDE.md` §9](../CLAUDE.md)) — walk every tab, do not assume. |
| Food drops list and detail, signed in | Host names and flats render exactly as before |
| `npm run build` | Succeeds; `build-admin.js` substitutes all three placeholders |

---

# DOCUMENTATION UPDATES

Route each fact to exactly one owning file.

**[`docs/architecture.md`](../architecture.md)** — schema, RLS, RPCs, triggers:
- `communities` SELECT is now member-scoped (`communities_select_own`); the `"Anyone can view communities"` policy is gone.
- `profiles_select_public_hosts` is `TO authenticated`; public host data is served by `get_public_host_profiles(uuid[])`.
- New RPCs: `get_public_host_profiles`, `get_my_requested_community`, `community_lead_readmit_resident`, `allow_membership_change` (internal, granted to nobody).
- New trigger `enforce_profile_membership_guard_on_profiles` and the `app.membership_change_ok` transaction-local GUC convention.
- `get_funds_access_status()` **no longer takes `p_community_id`** — signature change, note it in the RPC index.
- Under residual risks: `join_community_by_code` is still unthrottled (Part 2, D2).

**[`docs/features.md`](../features.md)** — user-visible behaviour only, no schema columns:
- §1 Login: deep-link targets now survive Google sign-in on the PWA; Google failures show an error toast.
- §1: password reset (dormant) returns to `/login`, not a `wooru://reset-password` route — line 44 is currently wrong.
- Community/removal: a removed resident cannot re-join with the code; a lead must re-admit them.
- Food drops: a signed-out visitor no longer sees the host's phone number.
- Settings: signing out revokes the session server-side and clears the device's push token.

**[`docs/CLAUDE.md`](../CLAUDE.md)** — commands, conventions, §9 traps. Add:
- *"A `SECURITY DEFINER` RPC's guard does not protect the underlying table. `join_community_by_code()` refuses a second join, but the `profiles` UPDATE policy let a resident set `community_id` directly. Column immutability under RLS needs a `BEFORE UPDATE` trigger — `WITH CHECK` cannot see `OLD`."*
- *"`supabase.auth.getUser()` returns an error for a network failure, not just a deleted user (`AuthRetryableFetchError`, and it does not retry). Treating any error as 'signed out' logs people out whenever they are offline."*
- *"`signOut({ scope: 'local' })` before a global `signOut()` makes the global call a no-op — auth-js skips the API call when no access token remains. Revoke first, clear second."*
- *"`app.config.js` (not `app.json`) is required for any native config that depends on an environment variable — config plugin options are otherwise frozen at their literal value."*
- Correct §1 if native build config lives in EAS dashboard variables rather than `eas.json`.

**[`docs/disabled-features.md`](../disabled-features.md)** — §1b: the claim *"Flip to `true` to restore; nothing else needs changing"* is false. Before re-enabling, a real `/reset-password` route must exist. Also record D11: the admin console retains a password form, and leaked-password protection is off.

**[`docs/platform-admin.md`](../platform-admin.md)** — only if Task C8 changes how the console is configured. Otherwise no change.

**Not required:** `.github/app-summary.md` (no new module, tab, or role), `docs/verandah.md` (no token or shared-component change), `docs/cross-community-changelog.md` (no federation object touched — proven by the regression-sweep row).
