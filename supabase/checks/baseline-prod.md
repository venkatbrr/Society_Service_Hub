# Prod schema baseline

Project: `mbzvcaoulawdugfearmj` (production)
Captured: 2026-08-08
Query: [schema-fingerprint.sql](schema-fingerprint.sql)

Run the same query against preprod after replaying migrations. Every `hash`
must match this table. Recapture this baseline whenever migrations are pushed
to prod.

| section | n | hash |
|---|---|---|
| 01_migrations | 124 | `5ca9a420e98b702bc72ee4091c1b9784` |
| 02_columns | 503 | `83453ca16cb0f3255b8e005f6a8d1665` |
| 03_constraints | 260 | `aa0c38331177615188fe5d9b6b4b985e` |
| 04_indexes | 126 | `3458eeef6621b10429b8e55079dce150` |
| 05_policies | 172 | `93ea1f78f6b7e31ed8fab70545449bf3` |
| 06_rls_enabled | 49 | `6636d5a045ef439d51a51915955320e8` |
| 07_functions | 137 | `fb974eb15d95e540a42201887737d96a` |
| 08_triggers | 47 | `267b80fe5bd700d7e7030b02cf199f21` |
| 09_enums | 11 | `bb3cab304a82523da0ebe9b331a0914d` |
| 10_extensions | 6 | `5420b42e856b586e9fed20787e8f9e85` |

## Notes on expected mismatches

- **`10_extensions`** may legitimately differ if Supabase provisions a newer
  default extension version on a project created later. Compare the extension
  *names* before treating it as drift.
- **`01_migrations`** matching proves the same migration files were applied.
  It does **not** prove the resulting schema is identical — that is what
  sections 02–09 are for.

## Environment facts captured at baseline

- `pg_cron` is **not installed**. Extensions present: `pg_stat_statements`,
  `pg_trgm`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`.
- **Zero edge functions are deployed.** `supabase/functions/check_due_services`
  and `supabase/functions/fraud-check` exist in the repo but not on the project.
- Consequence: `public.notify_due_services()` exists but nothing schedules it,
  and `lib/fraudCheck.ts` calls a function that isn't there (it fails open —
  see [two-environment-setup-plan.md](../../docs/new_features_to_implement/two-environment-setup-plan.md) §13).
