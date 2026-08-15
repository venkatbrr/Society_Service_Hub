-- =====================================================================
-- Wooru — reset community & resident data
-- =====================================================================
--
-- WHAT THIS DELETES
--   Every community and every resident, plus all the data that hangs off
--   them: blocks, flats, announcements, events, funds, marketplace
--   listings/orders/pre-orders, carpools, parent corner, service
--   providers/visits/hires/ratings, blood donors, emergency contacts,
--   notifications, audit rows, and the matching `auth.users` accounts.
--
-- WHAT THIS KEEPS
--   * The schema itself — tables, columns, RLS policies, RPCs, triggers,
--     enums. This script only removes ROWS. It runs no DDL.
--   * `public.mcn_business_categories` — the global marketplace catalog,
--     the only table in `public` that is neither community- nor
--     user-scoped.
--   * Platform admin accounts (see CONFIG below), so you are not locked
--     out of the admin console after the wipe.
--   * Uploaded images. They live in Cloudinary under `wooru/`, not in
--     Supabase storage (`lib/cloudinary.ts`; the `community-uploads`
--     bucket is unused and empty). The DB only stores the delivery URL,
--     so this wipe orphans every image — run `reset-cloudinary-uploads.mjs`
--     afterwards to clear them.
--
-- HOW TO RUN
--   Run as `postgres` / service role — psql, or the Supabase SQL editor.
--   Do NOT run it through PostgREST. The profile guard triggers
--   (`enforce_profile_membership_guard`, `enforce_profile_role_change_permissions`)
--   only bypass when `auth.uid()` is NULL, which is true for direct SQL.
--
--     psql "$DATABASE_URL" -f scripts/db/reset-community-data.sql
--
--   DRY RUN: change the final `commit;` to `rollback;`. The report at the
--   bottom still prints the before/after counts, and nothing is kept.
--
--   This is deliberately NOT wired into package.json — a full data wipe
--   should never be one `npm run` keystroke away.
--
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- CONFIG — edit these three lines before running
-- ---------------------------------------------------------------------

-- Safety latch. Must read exactly 'WIPE-COMMUNITIES-AND-RESIDENTS'.
select set_config('wooru.confirm', 'NO', true);

-- 'true'  → keep the society shell: communities, community_blocks,
--           community_flats, emergency_contacts. Residents and every
--           trace of their activity still go. This is what you want
--           before a launch: the flat roster stays intact so people can
--           sign up and pick their flat, with zero test users left.
-- 'false' → also delete the communities themselves (full reset).
select set_config('wooru.keep_community_shell', 'true', true);

-- Keep profiles where app_role = 'admin' AND community_id IS NULL —
-- this is the exact shape `public.is_platform_admin()` recognises.
select set_config('wooru.keep_platform_admins', 'true', true);

-- Extra accounts to spare, by email (comma-separated, case-insensitive).
-- `thewooru@gmail.com` is hardcoded into `is_platform_admin()`, so it is
-- kept by default — dropping it would orphan that override.
select set_config('wooru.keep_emails', 'thewooru@gmail.com', true);

-- ---------------------------------------------------------------------
-- Guard
-- ---------------------------------------------------------------------

do $$
begin
  if coalesce(current_setting('wooru.confirm', true), '') is distinct from 'WIPE-COMMUNITIES-AND-RESIDENTS' then
    raise exception
      'Refusing to run. Set wooru.confirm to ''WIPE-COMMUNITIES-AND-RESIDENTS'' in the CONFIG block above.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Accounts to spare
-- ---------------------------------------------------------------------

create temporary table _keep_users on commit drop as
with keep_emails as (
  select lower(trim(e)) as email
  from unnest(string_to_array(coalesce(nullif(current_setting('wooru.keep_emails', true), ''), ''), ',')) as e
  where trim(e) <> ''
)
select distinct u.id
from auth.users u
left join public.profiles p on p.id = u.id
where (
        coalesce(current_setting('wooru.keep_platform_admins', true), 'true') = 'true'
        and p.app_role = 'admin'::public.app_role_type
        and p.community_id is null
      )
   or lower(coalesce(u.email, '')) in (select email from keep_emails);

-- ---------------------------------------------------------------------
-- Before snapshot
-- ---------------------------------------------------------------------

create temporary table _wipe_report (
  tbl          text primary key,
  before_count bigint,
  after_count  bigint,
  disposition  text
) on commit drop;

do $$
declare
  wiped text[] := array[
    'public.announcement_audiences','public.blood_donors','public.communities',
    'public.community_announcements','public.community_blocks','public.community_event_contacts',
    'public.community_event_organizers','public.community_events','public.community_flats',
    'public.community_group_members','public.community_groups','public.community_partnerships',
    'public.community_requests','public.emergency_contacts','public.event_transactions',
    'public.events','public.favorites','public.flat_addition_requests','public.fraud_verdicts',
    'public.fund_roles','public.funds_access_requests','public.funds_access_revocations',
    'public.hire_feedback','public.mcn_carpool_requests','public.mcn_carpools',
    'public.mcn_listing_reports','public.mcn_listings','public.mcn_order_items','public.mcn_orders',
    'public.mcn_parent_corner','public.mcn_posts','public.mcn_preorder_drops',
    'public.mcn_preorder_items','public.mcn_preorder_order_items','public.mcn_preorder_orders',
    'public.mcn_products','public.notifications','public.profile_audit_log','public.profiles',
    'public.provider_hires','public.provider_personal_notes','public.provider_public_rating_nudges',
    'public.provider_reports','public.provider_shares','public.ratings','public.school_reviews',
    'public.schools','public.service_providers','public.service_visit_communities',
    'public.service_visits','public.user_service_history','public.user_services',
    'public.visit_joiners','auth.users'
  ];
  kept text[] := array['public.mcn_business_categories'];
  t text;
  n bigint;
begin
  foreach t in array wiped loop
    execute format('select count(*) from %s', t) into n;
    insert into _wipe_report (tbl, before_count, disposition) values (t, n, 'wiped');
  end loop;

  foreach t in array kept loop
    execute format('select count(*) from %s', t) into n;
    insert into _wipe_report (tbl, before_count, disposition) values (t, n, 'preserved');
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Detach the spared accounts from their community
--
-- Done first, so the `communities` delete below is not blocked by
-- `profiles.community_id` (ON DELETE NO ACTION). Clearing `flat_id` also
-- clears the denormalised block/flat columns via `sync_profile_flat_denorm`.
-- ---------------------------------------------------------------------

update public.profiles
   set community_id = null,
       block_id     = null,
       flat_id      = null,
       removed_by   = null,
       removed_at   = null
 where id in (select id from _keep_users)
   and (community_id is not null or block_id is not null or flat_id is not null
        or removed_by is not null or removed_at is not null);

-- ---------------------------------------------------------------------
-- Delete, leaves first
--
-- The order respects every ON DELETE NO ACTION / RESTRICT edge in the
-- schema; do not reshuffle it without re-checking pg_constraint.
-- ---------------------------------------------------------------------

-- Deepest children
delete from public.announcement_audiences;
delete from public.community_event_contacts;
delete from public.community_group_members;
delete from public.mcn_preorder_order_items;
delete from public.mcn_order_items;             -- before mcn_products (RESTRICT)
delete from public.hire_feedback;
delete from public.user_service_history;
delete from public.visit_joiners;
delete from public.service_visit_communities;
delete from public.flat_addition_requests;
delete from public.funds_access_revocations;
delete from public.funds_access_requests;
delete from public.event_transactions;          -- before events + auth.users
delete from public.fund_roles;                  -- before events + community_blocks
delete from public.mcn_carpool_requests;
delete from public.mcn_listing_reports;
delete from public.provider_reports;
delete from public.provider_shares;
delete from public.provider_personal_notes;
delete from public.provider_public_rating_nudges;
delete from public.favorites;
delete from public.ratings;
delete from public.school_reviews;
delete from public.blood_donors;
delete from public.notifications;
delete from public.fraud_verdicts;

-- Community-scoped content
delete from public.events;                      -- before groups, partnerships, communities
delete from public.community_events;            -- before profiles (created_by NO ACTION)
delete from public.community_event_organizers;  -- before profiles (granted_by NO ACTION)
delete from public.community_announcements;
delete from public.community_groups;
delete from public.community_partnerships;
delete from public.community_requests;

-- Marketplace
delete from public.mcn_preorder_orders;
delete from public.mcn_preorder_items;
delete from public.mcn_preorder_drops;
delete from public.mcn_orders;
delete from public.mcn_products;
delete from public.mcn_listings;                -- mcn_business_categories survives
delete from public.mcn_carpools;
delete from public.mcn_parent_corner;
delete from public.mcn_posts;
delete from public.schools;

-- Services
delete from public.provider_hires;
delete from public.user_services;
delete from public.service_visits;
delete from public.service_providers;           -- before communities + auth.users

-- Residents
delete from public.profiles
 where id not in (select id from _keep_users);

delete from public.profile_audit_log;           -- after profiles: the detach above logs rows

-- Community skeleton — skipped when wooru.keep_community_shell is true.
-- Kept `emergency_contacts` rows have their `created_by` set to NULL by the
-- auth.users delete below; the column is nullable, so that is a no-op.
do $$
begin
  if coalesce(current_setting('wooru.keep_community_shell', true), 'false') <> 'true' then
    delete from public.emergency_contacts;
    delete from public.community_flats;
    delete from public.community_blocks;
    delete from public.communities;
  end if;
end $$;

-- Auth accounts (cascades to auth.identities / auth.sessions / refresh tokens)
delete from auth.users
 where id not in (select id from _keep_users);

-- ---------------------------------------------------------------------
-- After snapshot
-- ---------------------------------------------------------------------

do $$
declare
  r record;
  n bigint;
begin
  for r in select tbl from _wipe_report loop
    execute format('select count(*) from %s', r.tbl) into n;
    update _wipe_report set after_count = n where tbl = r.tbl;
  end loop;
end $$;

select
  tbl                                            as "table",
  case when after_count >= before_count
       then 'kept' else disposition end          as disposition,
  before_count                                   as "before",
  after_count                                    as "after",
  before_count - after_count                     as "deleted"
from _wipe_report
where before_count > 0 or after_count > 0
order by 2, tbl;

-- Change to `rollback;` for a dry run.
commit;
