-- =====================================================================
-- Wooru — delete one resident, permanently
-- =====================================================================
--
-- Hard-deletes a single account: the `auth.users` row, its profile, and
-- everything that cascades off them. The person can sign up again later,
-- but as a brand-new user with none of their history.
--
-- WHEN NOT TO USE THIS
--   To take someone out of a community while keeping their account, use
--   the admin console instead — it calls RPCs built for exactly that:
--     * platform_soft_remove_resident()        — detach, stamp removed_at
--     * platform_remove_resident_from_community() — detach, clean slate
--     * community_lead_remove_resident()       — same, for a president/VP
--   Those are reversible. This script is not.
--
-- WHY NOT JUST CALL platform_delete_user()?
--   Two reasons.
--   1. It starts with `IF auth.uid() IS NULL ... RAISE EXCEPTION`, so it
--      only works over PostgREST as a signed-in platform admin. From psql
--      or the SQL editor `auth.uid()` is NULL and it always throws.
--   2. It only clears fund_roles / notifications / ratings / favorites —
--      all four of which already cascade from auth.users anyway. It does
--      NOT clear the six relations that actually block the delete with
--      ON DELETE NO ACTION:
--          events.created_by                   → auth.users
--          event_transactions.created_by       → auth.users
--          service_providers.created_by        → auth.users
--          feedback_reports.user_id            → auth.users
--          community_events.created_by         → profiles
--          community_event_organizers.granted_by → profiles
--      So it raises a foreign-key violation for any user who ever created
--      an event, recorded a fund transaction, added a service provider,
--      filed a bug report, or granted organizer rights. This script handles
--      all six, plus the RESTRICT edge on mcn_order_items.product_id.
--
--      That list is hand-maintained and drifts as migrations land. To
--      re-derive it, select from pg_constraint where confrelid is
--      auth.users / public.profiles and confdeltype in ('a','r').
--      Last reconciled: 2026-08-17.
--
-- HOW TO RUN
--   As `postgres` / service role — psql or the Supabase SQL editor.
--   Set the target and the confirm latch in CONFIG, then:
--
--     psql "$DATABASE_URL" -f scripts/db/delete-resident.sql
--
--   DRY RUN: leave `wooru.confirm` as 'NO'. The script prints the full
--   blast radius and deletes nothing. That is the default.
--
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- CONFIG
-- ---------------------------------------------------------------------

-- Identify the target by email (preferred) or by user id. Set one.
select set_config('wooru.target_email',   'someone@example.com', true);
select set_config('wooru.target_user_id', '',                    true);

-- 'NO' = preview only. Set to 'DELETE' to actually remove the account.
select set_config('wooru.confirm', 'NO', true);

-- Allow deleting a community's only president/VP. The RPCs refuse this
-- so a society is never left leaderless — keep it 'false' unless you are
-- deliberately tearing down.
select set_config('wooru.allow_last_lead', 'false', true);

-- ---------------------------------------------------------------------

do $$
declare
  uid       uuid;
  target    record;
  leads     integer;
  n         bigint;
  total     bigint := 0;
  dry       boolean := coalesce(current_setting('wooru.confirm', true), 'NO') <> 'DELETE';

  -- label, count query. Every one is scoped to the target user.
  probes text[][] := array[
    ['listings',                'select count(*) from public.mcn_listings where owner_id = $1'],
    ['products (their listings)','select count(*) from public.mcn_products p join public.mcn_listings l on l.id = p.listing_id where l.owner_id = $1'],
    ['orders they placed',      'select count(*) from public.mcn_orders where buyer_id = $1'],
    ['orders on their listings','select count(*) from public.mcn_orders o join public.mcn_listings l on l.id = o.listing_id where l.owner_id = $1'],
    ['pre-order drops',         'select count(*) from public.mcn_preorder_drops where created_by = $1'],
    ['pre-orders they placed',  'select count(*) from public.mcn_preorder_orders where buyer_id = $1'],
    ['service providers added', 'select count(*) from public.service_providers where created_by = $1'],
    ['service visits',          'select count(*) from public.service_visits where created_by = $1'],
    ['provider hires',          'select count(*) from public.provider_hires where user_id = $1'],
    ['ratings',                 'select count(*) from public.ratings where user_id = $1'],
    ['favorites',               'select count(*) from public.favorites where user_id = $1'],
    ['tracked services',        'select count(*) from public.user_services where user_id = $1'],
    ['events created',          'select count(*) from public.events where created_by = $1'],
    ['fund transactions',       'select count(*) from public.event_transactions where created_by = $1'],
    ['fund roles',              'select count(*) from public.fund_roles where user_id = $1'],
    ['community events',        'select count(*) from public.community_events where created_by = $1'],
    ['carpools',                'select count(*) from public.mcn_carpools where created_by = $1'],
    ['carpool requests',        'select count(*) from public.mcn_carpool_requests where rider_id = $1'],
    ['parent corner entries',   'select count(*) from public.mcn_parent_corner where user_id = $1'],
    ['schools added',           'select count(*) from public.schools where created_by = $1'],
    ['blood donor record',      'select count(*) from public.blood_donors where user_id = $1'],
    ['notifications',           'select count(*) from public.notifications where user_id = $1'],
    ['bug/feedback reports',    'select count(*) from public.feedback_reports where user_id = $1']
  ];
  i integer;
begin
  ------------------------------------------------------------------
  -- Resolve the target
  ------------------------------------------------------------------
  if coalesce(nullif(current_setting('wooru.target_user_id', true), ''), '') <> '' then
    uid := nullif(current_setting('wooru.target_user_id', true), '')::uuid;
  else
    select u.id into uid
    from auth.users u
    where lower(u.email) = lower(trim(coalesce(current_setting('wooru.target_email', true), '')));
  end if;

  if uid is null then
    raise exception 'No account found. Set wooru.target_email or wooru.target_user_id in CONFIG.';
  end if;

  select u.id, u.email, p.full_name, p.app_role, p.community_id, p.flat_number, c.name as community
    into target
  from auth.users u
  left join public.profiles p    on p.id = u.id
  left join public.communities c on c.id = p.community_id
  where u.id = uid;

  ------------------------------------------------------------------
  -- Guards
  ------------------------------------------------------------------
  if target.app_role = 'admin'::public.app_role_type
     or lower(coalesce(target.email,'')) in ('thewooru@gmail.com','societyservicehub@gmail.com') then
    raise exception 'Refusing to delete a platform admin account (%).', target.email;
  end if;

  if target.community_id is not null
     and target.app_role in ('president'::public.app_role_type, 'vice_president'::public.app_role_type)
     and coalesce(current_setting('wooru.allow_last_lead', true), 'false') <> 'true'
  then
    select count(*) into leads
    from public.profiles p
    where p.community_id = target.community_id
      and p.app_role in ('president'::public.app_role_type, 'vice_president'::public.app_role_type)
      and p.removed_at is null;

    if leads <= 1 then
      raise exception
        'Refusing: % is the only lead of "%". Promote someone else first, or set wooru.allow_last_lead to true.',
        target.email, target.community;
    end if;
  end if;

  ------------------------------------------------------------------
  -- Report the blast radius
  ------------------------------------------------------------------
  raise notice '--------------------------------------------------';
  raise notice 'Target : %  (%)', target.email, coalesce(target.full_name, 'no name');
  raise notice 'Role   : %', coalesce(target.app_role::text, 'no profile');
  raise notice 'Society: %  flat %', coalesce(target.community, '—'), coalesce(target.flat_number, '—');
  raise notice '--------------------------------------------------';

  for i in 1 .. array_length(probes, 1) loop
    execute probes[i][2] into n using uid;
    total := total + n;
    if n > 0 then
      raise notice '  % : %', rpad(probes[i][1], 26), n;
    end if;
  end loop;

  if total = 0 then
    raise notice '  (no content — clean account)';
  end if;
  raise notice '--------------------------------------------------';

  if dry then
    raise notice 'PREVIEW ONLY. Nothing deleted.';
    raise notice 'Set wooru.confirm to ''DELETE'' in CONFIG to apply.';
    return;
  end if;

  ------------------------------------------------------------------
  -- Clear the relations that would block the delete
  --
  -- ON DELETE NO ACTION / RESTRICT edges only. Everything else
  -- (notifications, ratings, favorites, carpools, parent corner,
  -- listings, pre-orders, hires, blood donor row, ...) cascades from
  -- auth.users or profiles and needs no help.
  ------------------------------------------------------------------

  -- mcn_order_items.product_id is RESTRICT — it blocks even when the
  -- referencing order is itself being cascaded away.
  delete from public.mcn_order_items
   where product_id in (
     select pr.id from public.mcn_products pr
     join public.mcn_listings l on l.id = pr.listing_id
     where l.owner_id = uid
   );
  delete from public.mcn_orders
   where listing_id in (select id from public.mcn_listings where owner_id = uid);

  -- events.created_by / event_transactions.created_by → auth.users
  delete from public.event_transactions
   where event_id in (select id from public.events where created_by = uid);
  delete from public.event_transactions where created_by = uid;
  delete from public.fund_roles
   where event_id in (select id from public.events where created_by = uid);
  delete from public.events where created_by = uid;

  -- community_events.created_by / community_event_organizers.granted_by → profiles
  delete from public.community_event_contacts
   where event_id in (select id from public.community_events where created_by = uid);
  delete from public.community_events where created_by = uid;
  delete from public.community_event_organizers
   where user_id = uid or granted_by = uid;

  -- service_providers.created_by → auth.users. Children cascade; other
  -- residents' visits keep their rows with provider_id set to NULL.
  delete from public.service_providers where created_by = uid;

  -- feedback_reports.user_id → auth.users. Added 2026-08-17: this edge is
  -- NO ACTION like the five above and was missing here, so deleting anyone
  -- who had ever filed a bug report or feedback aborted with a foreign-key
  -- violation. `user_id` is NOT NULL, so the rows go rather than orphaning.
  delete from public.feedback_reports where user_id = uid;

  ------------------------------------------------------------------
  -- Delete the account. Cascades to profiles and the rest.
  ------------------------------------------------------------------
  perform public.allow_membership_change();
  delete from auth.users where id = uid;

  raise notice 'DELETED % (% rows of content).', target.email, total;
end $$;

-- Change to `rollback;` if you want a guaranteed no-op even with
-- wooru.confirm set to 'DELETE'.
commit;
