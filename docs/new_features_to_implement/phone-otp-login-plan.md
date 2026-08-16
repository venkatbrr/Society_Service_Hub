# Implementation Plan — Phone OTP Login (MSG91), alongside Google

> Status: plan, not yet implemented. No code has been written for this feature — this
> document only. Corrected against the live code on 2026-08-16 (`app/login.tsx`,
> `lib/auth.ts`, `app/_layout.tsx` auth gate, `handle_new_user()` trigger).

## Goal

Add phone-number OTP as a second sign-in method on the login screen, sent/verified via
MSG91's OTP Widget (already configured and tested in the MSG91 dashboard — widget name
`SecureOTPWidgetYXQ4`, channel SMS, live "Preview Demo" test succeeded). OTP becomes the
**primary** action when a user taps "Sign in"; "Continue with Google" stays as a secondary
option beneath it, unchanged. After signing up with OTP, a user can **optionally** link a
Google account to the same profile from a settings/profile screen — not required, not
prompted at signup.

Two methods stay **independent** by default: a user who signs in with phone gets one
account, a user who signs in with Google gets a separate account, unless they explicitly
choose to link. No automatic merging by matching email/phone.

## Why keep both instead of replacing Google

The app is live in prod but not yet shared publicly, so there are effectively no real users
to strand today — but the decision is not contingent on that. Every existing (and near-term
future) account is authenticated via Google, tied to a Google identity in `auth.users`.
Forcing OTP-only would require a migration/account-merge path for zero benefit; running both
avoids that class of problem entirely and gives residents who don't want to use a Gmail
account a first-class alternative.

## Ground truth this plan depends on

| Fact | Where |
|---|---|
| Google is currently the only visible sign-in method; email/password UI exists in full but is hidden behind `EMAIL_AUTH_UI_ENABLED = false` | [constants/authFlags.ts](../../constants/authFlags.ts), [app/login.tsx](../../app/login.tsx) |
| Native Google sign-in uses `@react-native-google-signin/google-signin` for a native ID token, then `supabase.auth.signInWithIdToken({ provider: 'google', token })` — **not** an OAuth browser redirect. Web uses `supabase.auth.signInWithOAuth({ provider: 'google' })` instead, which does redirect | [app/login.tsx:176-197](../../app/login.tsx#L176-L197), [app/login.tsx:152-174](../../app/login.tsx#L152-L174) |
| `handle_new_user()` inserts a `profiles` row automatically on any `auth.users` INSERT, keyed by `new.id`, reading only `full_name`/`avatar_url` from user metadata — nothing phone-specific | [00000_init.sql:190-205](../../supabase/migrations/00000_init.sql#L190-L205) |
| `public.normalize_indian_mobile(p_value)` already exists and is used to canonicalize phone numbers elsewhere (`service_providers`, `community_event_contacts`) — reusable for the OTP phone value | [20260429113000_enforce_unique_provider_phone_per_community.sql](../../supabase/migrations/20260429113000_enforce_unique_provider_phone_per_community.sql) |
| The root auth gate in `app/_layout.tsx` reacts purely to `useAuth()`'s `session`/`profile`/`communityId` state — it does not care *how* the session was established. Any sign-in method that ends in a valid Supabase session gets the same downstream onboarding (community-select → flat pick → `POST_AUTH_LANDING_ROUTE`) for free | [app/_layout.tsx:100-200](../../app/_layout.tsx#L100-L200) |
| MSG91 dashboard side is already configured and verified end-to-end: Widget ID, a Token (least-privilege rule), and an Authkey (User-scoped rule) all generated; "Preview Demo" returned a successful live OTP send+verify | MSG91 dashboard (`SecureOTPWidgetYXQ4`), not in this repo |
| No DLT (India telecom) registration has been done yet — current testing rides on MSG91's shared/default pre-approved template, which is fine for testing but not guaranteed for sustained production branded-sender-ID volume | MSG91 dashboard, Sender ID / Template section |
| Supabase supports first-class **identity linking**: `supabase.auth.linkIdentity({ provider: 'google' })` attaches a second provider identity to the *currently signed-in* user, gated behind a dashboard toggle ("Enable manual linking") that is off by default | [Supabase docs — Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking) |
| There is no unsuffixed `db:push` / `types:*` / `fn:deploy:*` — every Supabase command is environment-suffixed, and this repo only has a working `prod` target (`preprod` is a documented placeholder, see [two-environment-setup-plan.md](two-environment-setup-plan.md)) | [docs/CLAUDE.md §1, §6](../CLAUDE.md) |

## Open question / risk to resolve before building Phase 4

Supabase's `linkIdentity()` for an OAuth provider works via the **redirect** flow (same
mechanism as `signInWithOAuth` on web) — it is not documented as accepting a native ID token
the way `signInWithIdToken` does. This app's *existing* native Google sign-in deliberately
avoids the OAuth redirect entirely (`GoogleSignin` native module → ID token →
`signInWithIdToken`), so it is not yet confirmed whether `linkIdentity('google')` works
cleanly on Android/iOS without introducing a browser-redirect-and-deep-link-back flow that
doesn't otherwise exist in this app. **Verify this against Supabase's current SDK behavior
before implementing Phase 4** — if native `linkIdentity` turns out to be impractical, the
fallback is: (a) only offer "Link Google" on web for now, or (b) build a lighter-weight
manual link (store the Google account's `sub`/email on the profile via a custom RPC after a
native Google sign-in, without using Supabase's identity table) — a real but smaller
compromise, decide only if (a) proves necessary.

## Architecture

```
Client (login screen)
  │
  │ 1. Enter phone number → MSG91 Web/Mobile SDK (Widget ID + Token) sends OTP directly to MSG91
  │ 2. User enters OTP → MSG91 verifies it directly, returns a signed access-token (JWT)
  ▼
New Supabase Edge Function: verify-phone-otp
  │
  │ 3. Receives { phone, access_token } from client
  │ 4. Calls MSG91 POST /api/v5/widget/verifyAccessToken server-side,
  │    using the Authkey — kept as an Edge Function secret, never shipped to the client
  │ 5. On success: normalize phone via normalize_indian_mobile(),
  │    find-or-create the auth.users row by phone (Supabase Admin API,
  │    service-role key — also Edge Function-only, never client-side)
  │ 6. Mint a session for that user, return { access_token, refresh_token } to client
  ▼
Client
  │ 7. supabase.auth.setSession({ access_token, refresh_token })
  ▼
Existing app/_layout.tsx auth gate takes over — same as Google today
```

The `handle_new_user()` trigger fires automatically the moment the Edge Function creates a
new `auth.users` row, so a new profile row is created with no extra code — same as it works
for Google signups today.

## Implementation phases

### Phase 1 — Supabase Edge Function `verify-phone-otp`

New file: `supabase/functions/verify-phone-otp/index.ts`.

- Input: `{ phone: string, access_token: string }` from the client.
- Server-side call to MSG91: `POST https://control.msg91.com/api/v5/widget/verifyAccessToken`
  with `{ authkey, access-token }` — the Authkey read from an Edge Function secret
  (`MSG91_AUTHKEY`), set via `supabase secrets set`, never committed to this repo and never
  sent to the client.
- On MSG91 success: normalize the phone with `normalize_indian_mobile()`, then use the
  Supabase Admin client (service-role key, also an Edge Function secret) to look up an
  `auth.users` row by `phone`. If none exists, create one (`admin.createUser({ phone, phone_confirm: true })`)
  — `handle_new_user()` fires automatically and creates the matching `profiles` row.
- Mint a session for that user and return it to the client. (Exact mechanism —
  `admin.generateLink` + exchange vs. a direct session mint — needs to be pinned down against
  the Supabase Admin API available in the pinned `supabase-js` version at implementation
  time; both are viable, this doc intentionally doesn't lock it in yet.)
- Deploy with `npm run fn:deploy:prod` per [docs/CLAUDE.md §1](../CLAUDE.md).

### Phase 2 — Client: phone entry + MSG91 SDK

- `app/login.tsx`: add a "Continue with phone" primary action above/replacing the current
  first action, routing to a new screen (e.g. `app/login-phone.tsx`).
- New screen embeds the MSG91 SDK (`@msg91comm/sendotp-react-native` for native; the Web SDK
  script for web, matching the two integration paths MSG91's dashboard already showed) using
  the Widget ID + a Token — **both read from `EXPO_PUBLIC_*` env vars**, matching the existing
  `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` pattern in `lib/auth.ts`. The Widget ID is not secret;
  the Token is more sensitive than the Widget ID but is inherently client-exposed by design
  (it's what authorizes a browser/app to open the widget) — the real security boundary is the
  Authkey, which is Edge-Function-only per Phase 1.
- On MSG91 success callback, call the Phase 1 Edge Function with the resulting access-token.

### Phase 3 — Client: complete sign-in

- On the Edge Function's response, call `supabase.auth.setSession({ access_token, refresh_token })`.
- No further routing logic needed — `app/_layout.tsx`'s existing gate picks up the new
  session exactly like it does for Google (community-select, flat pick, etc.), per the ground
  truth row above.

### Phase 4 — Optional: link Google to an OTP-created account

- New entry point in the Profile tab (not at signup, not prompted): "Link Google account".
- Requires **enabling "Manual linking" in the Supabase Auth dashboard settings** first — off
  by default.
- Calls `supabase.auth.linkIdentity({ provider: 'google' })` while the user is already signed
  in via phone.
- **Blocked on the open question above** — resolve the native-vs-web redirect behavior before
  writing this phase's code.

### Phase 5 — MSG91 production readiness (dashboard only, no code)

- Raise the Monthly Spending Limit from the low test value back up before real traffic.
- Start India DLT registration (Sender ID + template) if/when a branded sender ID matters —
  not a blocker for launch on the shared/default template, but worth starting early since it
  typically takes 1–2 business days.

### Phase 6 — Docs (same change set, per [docs/CLAUDE.md §7](../CLAUDE.md))

- `docs/features.md` — new phone OTP login screen behavior, optional Google linking.
- `docs/architecture.md` — new Edge Function, any new env vars/secrets, `linkIdentity` usage
  once Phase 4's open question is resolved.

## Explicitly out of scope for this plan

- Automatic account merging by matching phone/email between two independently-created
  accounts. If a resident ends up with two accounts (one via phone, one via Google), that's
  accepted for now — revisit only if it becomes a real problem once the app is public.
- Forcing OTP verification on existing Google accounts, or vice versa.
- WhatsApp/Voice OTP channels — SMS only, per the MSG91 widget config already done.
