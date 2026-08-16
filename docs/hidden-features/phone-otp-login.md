# Hidden: Phone OTP login

**Hidden on 2026-08-16**, the same session it was built in — this never reached production
visible to a real user. **Fully implemented and deployed** (client screen, Edge Function,
Supabase session-bridging helpers), but the MSG91 widget integration has an unresolved
client-side bug that stops it from actually sending an OTP. Only the entry point on the
login screen is hidden; nothing was rolled back.

| | Detail |
|---|---|
| **Flag** | `PHONE_OTP_LOGIN_ENABLED` |
| **Flag file** | [`constants/authFlags.ts`](../../constants/authFlags.ts) — not `constants/featureFlags.ts`, auth flags live separately alongside `EMAIL_AUTH_UI_ENABLED` |
| **Hidden route** | `/login-phone` (`app/login-phone.tsx`) — stays on disk, reachable by direct URL, for QA while debugging continues |
| **Edge Function** | `verify-phone-otp` (`supabase/functions/verify-phone-otp/index.ts`) — deployed, untouched, still live |
| **Design plan** | [`../new_features_to_implement/phone-otp-login-plan.md`](../new_features_to_implement/phone-otp-login-plan.md) — the original architecture writeup, written before implementation started |

---

## Why

MSG91's OTP widget (`otp-provider.js`, loaded client-side) throws `Uncaught Error: Token is
missing!` — a client-side error from MSG91's own bundled script, before any network request
is made. This was confirmed two ways:

1. The error is synchronous/deferred JS, not a parsed API error response.
2. **MSG91's own dashboard Logs page for this widget shows zero attempts** across the entire
   session of testing, except one stale entry from the original "Preview Demo" test run days
   earlier with an unrelated phone number. Every "Get OTP" click from the app during
   debugging never reached MSG91's servers at all.

Two **real, distinct bugs** were found and fixed along the way, and neither one resolved it:

1. **Token/widgetId mismatch.** `.env`'s `EXPO_PUBLIC_MSG91_TOKEN_AUTH` held a stale value
   that didn't match the live Token in the MSG91 dashboard (from an earlier, since-replaced
   token). Fixed by copying the current dashboard value into `.env`.
2. **Duplicate widget initialization.** The original implementation called
   `window.initSendOTP(configuration)` **twice per attempt** — once in the mount `useEffect`,
   again on every "Get OTP" click — with a `configuration` object carrying seven different
   guessed alias keys for the token (`tokenAuth`, `token`, `authToken`, `authKey`, `authkey`,
   `auth_key`, `'token-auth'`) instead of the one MSG91 actually documents (`tokenAuth`).
   Fixed: the widget is now initialized exactly once on mount, with only the documented
   config shape, gated behind a `widgetReady` state that only flips true once
   `window.sendOtp` is actually exposed.

**After both fixes, the exact same "Token is missing!" error still occurred**, and MSG91's
Logs still showed zero new attempts. Root cause not found in this session.

### Dashboard-side checks already ruled out

Before concluding this is a client-side bug, the following were checked directly in the
MSG91 dashboard and are **not** the cause:

- **Throttle limit** (3 hits per 300s, 24h block on excess) — the Token's IPs tab showed no
  `Blocked At` timestamp, so it was never tripped.
- **IP whitelist** — the Token has exactly one `Whitelisted`-status IPv6 entry. There is no
  visible "deny all except whitelisted" toggle in the dashboard UI, and "Whitelisted" reads
  as a permit status, not a restriction — this was judged unlikely to be an active blocker,
  though it was not exhaustively proven either way (no delete option existed to remove it and
  test the delta; only status-change options: Normal / Whitelisted / Temporary Block /
  Permanent Block).
- **widgetId / tokenAuth mismatch** — confirmed identical between `.env` and the dashboard's
  own "Client Side Integration" code snippet after fix #1 above.
- **Domain/origin whitelist** — no such setting exists anywhere in MSG91's widget
  configuration flow (Widget Settings, Channels, Client/Server Integration, Country
  Restriction, Demo Credentials, Webhook). `localhost` vs a real domain is not a factor.

### What to check next, before re-attempting

- Whether `.env` was ever hard-reloaded correctly — `EXPO_PUBLIC_*` vars are inlined by
  Metro at dev-server **start** time, not live; a `.env` edit needs the Expo process fully
  killed and restarted with `npx expo start -c --web` (cache cleared), not just a browser
  refresh, and not just re-running `expo start` without `-c` in a fresh terminal if the old
  process is still alive elsewhere.
- Try the **"Mobile SDK for custom UI"** integration path (`@msg91comm/sendotp-react-native`)
  instead of the Web SDK script-tag path, to isolate whether this is specific to
  `otp-provider.js`'s web bundle.
- Contact MSG91 support directly with the exact `widgetId`/token pair and ask them to check
  server-side why zero requests are being recorded — since the dashboard-side config was
  independently verified correct, this is the fastest remaining path to a real answer rather
  than continuing to guess client-side.

---

## What changed to hide it

| File | Change |
|---|---|
| `constants/authFlags.ts` | New `PHONE_OTP_LOGIN_ENABLED = false` export, with the debugging history above condensed into its doc comment. |
| `app/login.tsx` | The "Continue with phone" button is now wrapped in `{PHONE_OTP_LOGIN_ENABLED && (...)}`. The Google button gets a second style variant (`googleButtonPrimary` / `googleButtonTextPrimary`, reusing `Verandah.shadowCard`) that restores its original full-emphasis look (cream fill, dark text, shadow) when phone is hidden — otherwise Google would render with the secondary/outlined treatment it was given once it became the non-primary option, looking like a demoted button when it's actually the only one. |

---

## What was deliberately **not** touched

Read this before deleting anything that looks orphaned.

- **`app/login-phone.tsx`** — the full OTP screen (phone entry, MSG91 widget mount/init,
  passcode entry, resend). Stays reachable at `/login-phone` by direct URL for QA.
- **`supabase/functions/verify-phone-otp/index.ts`** — the Edge Function that verifies the
  MSG91 access token server-side (using the `MSG91_AUTHKEY` secret) and mints the Supabase
  session. Still deployed. Nothing wrong was ever found here — the failure happens before
  the client ever calls this function.
- **`lib/auth.ts`** — `signInWithPhoneAccessToken()` and `linkGoogleIdentity()` are both
  intact and unused while the flag is off. `linkGoogleIdentity()` in particular has no
  dependency on the flag — see the next row.
- **`app/(tabs)/profile.tsx`** — the "Link Google account" menu row (visible only when
  `!user.app_metadata.providers.includes('google')`) was **not** gated behind
  `PHONE_OTP_LOGIN_ENABLED`. It doesn't need to be: with phone signup unreachable, no new
  account can exist without a Google identity already attached, so the row's own existing
  condition naturally stops showing it. It's left wired in case a phone-only test account
  from this debugging session (or a future re-enable) needs it.
- **`app/_layout.tsx`** — the root auth gate's `login-phone` special-casing
  (`inAuthGroup` check, `pathname !== '/login-phone'` in the saved-deep-link-target logic)
  is untouched, so a signed-out visit to `/login-phone` by direct URL still works correctly
  instead of bouncing to `/login`.
- **MSG91 dashboard configuration** — widget (`SecureOTPWidgetYXQ4`), Token, and Authkey all
  stay configured exactly as they are. Nothing to undo there; the debugging above concluded
  the dashboard side is correctly configured.
- **No database changes** — this feature never touched schema. `profiles.phone_number`
  already existed; `handle_new_user()` needed no changes since it fires on any `auth.users`
  insert regardless of provider.

---

## Re-enable checklist

1. Work through "What to check next" above first — flipping the flag back on without a fix
   just reproduces the same broken experience.
2. Once MSG91 sends and verifies a real OTP successfully outside of this debugging session's
   dead end, flip `PHONE_OTP_LOGIN_ENABLED` to `true` in `constants/authFlags.ts`.
3. `npx tsc --noEmit`.
4. Open `/login` — the phone button returns, and the Google button reverts to its
   secondary/outlined look (the primary look was only for phone-hidden state).
5. Full sign-in test: phone entry → OTP receipt → verify → session established → root auth
   gate routes correctly (new user → `/community-select`, existing → their community).
6. Test the "Link Google account" flow in Profile for an account that signed up via phone —
   confirm `linkIdentity()` behavior on **both** web and native (the open risk flagged in the
   original plan doc: `linkIdentity('google')` is redirect-based, while this app's existing
   native Google sign-in avoids redirects entirely via the native ID-token flow — this was
   never actually verified working on native before the feature was hidden).
7. Move the row from the inventory table in [`README.md`](README.md) if fully re-enabled,
   update the pointer in [`../disabled-features.md`](../disabled-features.md) §1c, and revert
   the "Hidden" notes in [`../features.md`](../features.md) §1.
