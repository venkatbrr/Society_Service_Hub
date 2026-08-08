# Disabled, Removed & Deferred Features

Behavior that is intentionally off, cut, or postponed. If a feature seems missing, check here before assuming it is a bug.

---

## Disabled

### 1. Email verification — ✅ RE-ENABLED 2026-08-08

- **Status**: **Enabled.** Supabase Auth → "Confirm email" is **ON**. New email/password users must click a confirmation link before their first sign-in.
- **Google sign-in is unaffected** — OAuth emails arrive pre-verified, so no confirmation is sent and no email is required.
- **Existing users unaffected** — all 18 accounts predating the change were already confirmed.

**Client handling.** `app/login.tsx` already branched on `data.session` being absent, so enabling the setting did not break signup. Both user-facing messages were wrong for this flow, however, and were corrected in the same change:

| Where | Was | Now |
|---|---|---|
| `app/login.tsx` post-signup toast | "Sign up successful! You can now try to sign in with your email." | "Check your email — we sent a confirmation link to `<address>`. Click it, then sign in." |
| `lib/auth.ts` `'Email not confirmed'` | "Account setup incomplete. If you just signed up, please try signing in again." | "Please confirm your email first. Check your inbox for the confirmation link we sent you." |

The old strings were written for the period when confirmation was off, where an unconfirmed session was an anomaly that retrying might clear. With confirmation on it is the normal path, and "try signing in again" is a dead end that loops forever.

⚠️ **Operational dependency — custom SMTP.** Auth emails currently send through Supabase's built-in service, which is rate-limited to a few per hour and is documented as development-only. With confirmation on, an unsent email means a user who cannot sign in and gets no explanation. **Configure SMTP (Project Settings → Authentication → SMTP Settings) before real signup volume.** Password-reset emails already depend on this same path.

- **To disable again**: turn "Confirm email" OFF in Supabase. The client messaging above stays correct either way, since it only appears when a session is genuinely absent.

> Note: email *changes* from `app/profile/edit.tsx` have always required verification — Supabase sends a confirmation link to the new address before it takes effect.

### 1b. Email/password sign-in — UI hidden 2026-08-08

- **Status**: **Hidden in the UI, fully working underneath.** Google is the only onboarding path residents see.
- **Flag**: [`constants/authFlags.ts`](../constants/authFlags.ts) → `EMAIL_AUTH_UI_ENABLED = false`. Flip to `true` to restore.
- **Prerequisites before re-enabling**: A real `/reset-password` route must be created in `app/reset-password.tsx` (the dormant `resetPassword()` in `lib/auth.ts` points to `/login` for now).
- **Not removed**: `signUpWithEmail`, `signInWithEmail`, `resetPassword` and `getAuthErrorMessage` in `lib/auth.ts` are untouched, and the **Email provider stays enabled in Supabase**. Existing password accounts still work; the API still accepts them.
- **Admin console note (D11)**: The admin console retains a password form at `/admin/index.html` for platform admins (`thewooru@gmail.com`), and Supabase's `auth_leaked_password_protection` is off.

**Why.** Google accounts arrive pre-verified, so no confirmation email is sent. That removes the dependency on Supabase's rate-limited built-in SMTP (§1), along with password resets, password-strength decisions, and forgotten-password support — a large maintenance surface for a side project.

**What changed:**

| File | Change |
|---|---|
| `app/login.tsx` | Tab toggle, all form fields, submit button, divider and forgot-password link render only when the flag is on. Subtitle becomes "Sign in with Google to continue." |
| `app/login.tsx` | The sign-up form's Terms checkbox is now unreachable, so a "By continuing you agree to our Terms and Privacy Policy" line sits under the Google button — otherwise there is no consent moment at all. |
| `app/forgot-password.tsx` | Still routable by deep link, so it redirects to `/login` when the flag is off. |

⚠️ **Before flipping the flag back on**, note that one account —`thewooru@gmail.com`, a platform admin — had an email-only identity at the time of this change. It is protected regardless: `is_platform_admin()` carries a break-glass branch on that exact address, and `handle_new_user()` auto-promotes it, so signing in with Google under the same address still resolves to platform admin.

### 2. Password strength constraints

- **Status**: Simplified
- **Details**: Signup enforces no custom complexity rules beyond the basic form checks and Supabase Auth's own minimum.
- **Reason**: Reduced friction during early adoption.
- **To re-enable**: add explicit validation to the sign-up form in `app/login.tsx`.

---

## Removed

### 3. Resident marketplace

- **Status**: Removed from the product — not hidden, not feature-flagged
- **Details**: Screens under `app/business/*` are deleted. `resident_businesses`, `business_offerings`, and `business_inquiries` were dropped in `supabase/migrations/20260422010000_simplify_roles_and_remove_marketplace.sql`. As a consequence, `favorites` and `ratings` became single-target (providers only).
- **Reason**: Scope narrowed to provider discovery, service visits, funds, onboarding, and personal reminders.
- **Replaced by**: MCN business listings — see [`features.md`](features.md) §4.2.
- **To bring back**: this would need fresh schema, routes, components, and docs. There is nothing to un-hide.

### 4. `community_admin` promotion workflow

- **Status**: Removed
- **Details**: The old `community_admin_requests` flow and its approval RPCs are gone. Community leadership is now granted through funds-access approval, which promotes a designated resident to `president`.
- **Residue**: none. All rows were migrated to `president` in `20260616000001_migrate_roles_and_functions.sql`, and the `community_admin`/`community_lead` values were physically removed from the `app_role_type` enum on 2026-08-22 by `20260822000200_drop_legacy_app_role_enum_values.sql` (type swap, since Postgres has no `ALTER TYPE … DROP VALUE`). The enum is now exactly `admin · resident · president · vice_president`.

### 5. Community pulse line on the Community tab

- **Status**: Removed from the UI
- **Details**: The "going around the building" activity line was deliberately taken out of `app/(tabs)/community.tsx`. The `get_community_pulse(...)` RPC still exists in the database.
- **Reason**: Section order was tightened to funds → residents → SOS → community info.

### 6. Drop-level order cap

- **Status**: Replaced by per-item limits
- **Details**: Pre-order food drops no longer expose an overall order cap. Capacity is set per item via `mcn_preorder_items.max_quantity` and enforced by a database trigger. The `mcn_preorder_drops.max_orders` column still exists but is not driven by the UI.

### 7. Automatic visit completion sweep

- **Status**: Removed / Dropped
- **Details**: `auto_complete_past_visits()` was a `SECURITY DEFINER` function intended to sweep past-dated visits to `completed`. It was dropped in migration `20260831000100_secure_visit_rpcs.sql`.
- **Reason**: `pg_cron` is not installed on this project, so automatic sweeps never ran. Visit completion is a manual host action (`Mark as completed` button on visit detail), while display status is derived client-side.
- **To re-enable**: install `pg_cron` extension, create an authenticated RPC with `SET search_path`, and schedule a cron job.

---

## Deferred

### 7. Cross-community federation UI

- **Status**: Deferred — the backend foundation is live
- **Details**: `community_partnerships`, `community_groups`, `community_group_members`, `provider_shares`, `service_visit_communities`, `community_announcements`, `announcement_audiences`, their helper predicates, and their RPCs all exist in the database. **No screen calls any of them.** The `partnership_request` and `partnership_accepted` notification types are reserved but never emitted.
- **Reason**: Phased delivery — the backend shipped first so future UI tasks stay small and safe.
- **To enable**: follow [`cross-community.md`](cross-community.md) and append an entry to [`cross-community-changelog.md`](cross-community-changelog.md) in the same change set.

### 8. PWA web push notifications

- **Status**: Designed, not built
- **Details**: Notifications are Supabase Realtime plus local `expo-notifications`. There is no web push subscription table, no push handler in the service worker, and no dispatch Edge Function. `profiles.expo_push_token` is stored but no server-side fan-out consumes it.
- **Design doc**: [`archive/pwa-web-push-notifications-plan.md`](archive/pwa-web-push-notifications-plan.md)

### 9. Supabase Storage uploads

- **Status**: Unused
- **Details**: The public `community-uploads` bucket still exists, but **no screen writes to it**. All image uploads go to Cloudinary via `lib/cloudinary.ts`. Profile avatars are deterministic initials — there is no avatar upload at all.

---

## Never existed (common wrong assumptions)

- **Resident approval queue** — joining by code is immediate. There is no pending-member state.
- **Automated tests** — no test framework is configured. `npx tsc --noEmit` is the only gate.
- **Dark mode** — Verandah is light-mode only by design.
- **Platform admins inside a community** — they are barred from the mobile app surface entirely.
