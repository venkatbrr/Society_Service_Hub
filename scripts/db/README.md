# Database maintenance scripts

Destructive, hand-run scripts. Deliberately **not** wired into `package.json` —
a full data wipe should never be one `npm run` keystroke away.

## `reset-community-data.sql`

Clears every community and every resident, plus everything that hangs off them,
without touching the schema.

**Deletes** — profiles, `auth.users`, announcements, events, funds, marketplace
listings/orders/pre-orders, carpools, parent corner, service
providers/visits/hires/ratings, blood donors, notifications, audit rows — and,
unless `wooru.keep_community_shell` is `true`, the communities, blocks, flats
and emergency contacts as well.

**`wooru.keep_community_shell`** (CONFIG block) — set `true` to keep
`communities`, `community_blocks`, `community_flats` and `emergency_contacts`
while still removing every resident and everything they created. This is the
pre-launch mode: the flat roster survives so new users can sign up and pick
their flat, with zero test accounts left. Occupancy is derived from
`profiles.flat_id`, so every flat reads as vacant once the profiles are gone.

**Keeps** —

- The schema itself: tables, columns, RLS policies, RPCs, triggers, enums. The
  script runs no DDL; it only deletes rows.
- `public.mcn_business_categories`, the global marketplace catalog. It is the
  only table in `public` that is neither community- nor user-scoped.
- Platform admin accounts — profiles with `app_role = 'admin'` and
  `community_id IS NULL`, which is exactly what `public.is_platform_admin()`
  recognises, plus any emails listed in the CONFIG block. `thewooru@gmail.com`
  is kept by default because `is_platform_admin()` hardcodes it. Spared profiles
  get their `community_id` / `block_id` / `flat_id` cleared so they survive the
  `communities` delete.

### Running it

Run as `postgres` / service role — psql or the Supabase SQL editor. **Not**
through PostgREST: the profile guard triggers
(`enforce_profile_membership_guard`, `enforce_profile_role_change_permissions`)
only bypass when `auth.uid()` is `NULL`, which holds for direct SQL.

1. Open the file and set `wooru.confirm` to `WIPE-COMMUNITIES-AND-RESIDENTS` in
   the CONFIG block. It refuses to run otherwise.
2. `psql "$DATABASE_URL" -f scripts/db/reset-community-data.sql`

It prints a before / after / deleted row count per table when it finishes.

**Dry run:** change the trailing `commit;` to `rollback;`. The report still
prints; nothing is kept.

The delete order respects every `ON DELETE NO ACTION` / `RESTRICT` edge in the
schema (`events`, `service_providers`, `profiles` → `communities`;
`mcn_order_items` → `mcn_products`; `community_events.created_by` →
`profiles`). Re-check `pg_constraint` before reordering it.

## `delete-resident.sql`

Hard-deletes **one** account — the `auth.users` row, its profile, and everything
cascading off them. Set `wooru.target_email` (or `wooru.target_user_id`) in the
CONFIG block.

Defaults to a **preview**: it prints the account, its role and flat, and a count
of every piece of content that would go, then deletes nothing. Set
`wooru.confirm` to `DELETE` to apply.

Guards: refuses platform admins outright, and refuses a community's only
president/VP unless `wooru.allow_last_lead` is `true`.

**To remove someone from a community but keep their account, don't use this** —
the admin console's `platform_soft_remove_resident()`,
`platform_remove_resident_from_community()` and `community_lead_remove_resident()`
do that reversibly.

> **Known bug in `platform_delete_user()`** (the admin console's delete path, as
> of 2026-08-15). It clears `fund_roles`, `notifications`, `ratings` and
> `favorites` — all of which already cascade from `auth.users`, so those deletes
> are redundant — while leaving the five relations that actually block the
> delete with `ON DELETE NO ACTION`: `events.created_by`,
> `event_transactions.created_by`, `service_providers.created_by`,
> `community_events.created_by`, `community_event_organizers.granted_by`. It
> therefore raises a foreign-key violation for any user who created an event,
> recorded a fund transaction, added a service provider, or granted organizer
> rights. `delete-resident.sql` handles all five plus the `RESTRICT` edge on
> `mcn_order_items.product_id`; the RPC still needs fixing.

## `reset-cloudinary-uploads.mjs`

Uploaded images do **not** live in Supabase storage. `lib/cloudinary.ts` sends
them to Cloudinary under `wooru/` via an unsigned preset, and the database only
stores the resulting `secure_url`. The `community-uploads` Supabase bucket
exists but is unused and empty. So the SQL wipe orphans every avatar, listing
photo and drop image in Cloudinary; this clears them.

```bash
set -a; . ./.env; set +a
node scripts/db/reset-cloudinary-uploads.mjs          # dry run: counts + size
node scripts/db/reset-cloudinary-uploads.mjs --yes    # delete
```

`--prefix <path>` narrows the scope (defaults to `wooru`).

Needs `CLOUDINARY_URL` (`cloudinary://<key>:<secret>@<cloud>`) with **Admin API**
credentials. As of 2026-08-15 the value in `.env` is still the placeholder
`your_api_key` — the app never needs it, because uploads use the unsigned
preset. Until real credentials are set, purge the `wooru/` folder from the
Cloudinary Media Library UI instead. The secret grants full account control:
environment only, never committed.
