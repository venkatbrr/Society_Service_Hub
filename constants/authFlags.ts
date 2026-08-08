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
