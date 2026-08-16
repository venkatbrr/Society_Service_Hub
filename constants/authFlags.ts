/**
 * Auth surface flags.
 *
 * Email/password auth is **fully implemented and still enabled in Supabase** —
 * `signUpWithEmail` / `signInWithEmail` in `lib/auth.ts` work, existing
 * password accounts can still sign in, and the reset flow is intact. Only the
 * UI is hidden, so residents onboard through Google alone.
 *
 * Why: Google accounts arrive pre-verified, which removes the confirmation
 * email entirely — and with it the dependency on Supabase's rate-limited
 * built-in SMTP, plus password resets, password strength rules, and
 * "I forgot my password" support.
 *
 * To bring the email UI back, flip this to `true`. Nothing else needs changing.
 * Before doing so, check `docs/disabled-features.md` for the SMTP prerequisite:
 * signup confirmation emails are unusable at volume until custom SMTP is set up.
 */
export const EMAIL_AUTH_UI_ENABLED = false;

/**
 * Phone OTP login is **fully implemented** — `app/login-phone.tsx`, the
 * `verify-phone-otp` Edge Function, `signInWithPhoneAccessToken()` and
 * `linkGoogleIdentity()` in `lib/auth.ts` are all deployed and untouched.
 * Only the entry point on the login screen is hidden.
 *
 * Why: the MSG91 widget integration throws an unresolved client-side "Token
 * is missing!" error from MSG91's own `otp-provider.js` before any request
 * reaches MSG91's servers (confirmed via their dashboard Logs — zero attempts
 * recorded despite repeated tries), even after fixing a real duplicate-init
 * bug in the client code. Root cause not found. Google remains the sole
 * visible sign-in method until this is debugged further.
 *
 * See `docs/hidden-features/phone-otp-login.md` for the full writeup before
 * touching anything under `app/login-phone.tsx` or `supabase/functions/verify-phone-otp/`.
 */
export const PHONE_OTP_LOGIN_ENABLED = false;
