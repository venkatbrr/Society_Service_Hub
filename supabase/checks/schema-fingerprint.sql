-- Schema fingerprint — environment drift check (Docker-free)
--
-- Purpose: prove that two Supabase projects (prod vs preprod) have an
-- identical `public` schema, without needing `supabase db diff` (which
-- requires Docker for its shadow database).
--
-- Usage:
--   1. Run this on PROD, save the output as the baseline.
--   2. Replay all migrations onto PREPROD, run this there.
--   3. Compare the two outputs row by row.
--
-- Every `hash` must match. A differing section tells you exactly WHERE the
-- drift is (policies vs functions vs columns), which a single whole-schema
-- hash would not. `n` is the object count in that section, shown so a
-- mismatch is easier to interpret at a glance.
--
-- A mismatch means something was changed in the dashboard and never captured
-- as a migration. Fix by writing a catch-up migration, not by hand-editing
-- the other environment.

with
cols as (
  select count(*) n, md5(string_agg(sig, E'\n' order by sig)) h from (
    select format('%s.%s|%s|%s|%s', table_name, column_name, data_type,
                  is_nullable, coalesce(column_default, '-')) sig
    from information_schema.columns where table_schema = 'public'
  ) s
),
cons as (
  select count(*) n, md5(string_agg(sig, E'\n' order by sig)) h from (
    select format('%s|%s|%s', rel.relname, c.conname, pg_get_constraintdef(c.oid)) sig
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
  ) s
),
idx as (
  select count(*) n, md5(string_agg(sig, E'\n' order by sig)) h from (
    select format('%s|%s', indexname, indexdef) sig
    from pg_indexes where schemaname = 'public'
  ) s
),
pol as (
  select count(*) n, md5(string_agg(sig, E'\n' order by sig)) h from (
    select format('%s|%s|%s|%s|%s|%s', tablename, policyname, cmd,
                  array_to_string(roles, ','), coalesce(qual, '-'),
                  coalesce(with_check, '-')) sig
    from pg_policies where schemaname = 'public'
  ) s
),
rls as (
  select count(*) n, md5(string_agg(sig, E'\n' order by sig)) h from (
    select format('%s|%s', rel.relname, rel.relrowsecurity) sig
    from pg_class rel
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public' and rel.relkind = 'r'
  ) s
),
fns as (
  select count(*) n, md5(string_agg(sig, E'\n' order by sig)) h from (
    select format('%s|%s', p.proname, md5(pg_get_functiondef(p.oid))) sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prokind in ('f', 'p')
      -- exclude functions owned by an extension: those follow the extension
      -- version, not our migrations, so they are not drift
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  ) s
),
trg as (
  select count(*) n, md5(string_agg(sig, E'\n' order by sig)) h from (
    select format('%s|%s', t.tgname, pg_get_triggerdef(t.oid)) sig
    from pg_trigger t
    join pg_class rel on rel.oid = t.tgrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public' and not t.tgisinternal
  ) s
),
enums as (
  select count(*) n, md5(string_agg(sig, E'\n' order by sig)) h from (
    select format('%s|%s|%s', t.typname, e.enumsortorder, e.enumlabel) sig
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace ns on ns.oid = t.typnamespace
    where ns.nspname = 'public'
  ) s
),
exts as (
  select count(*) n, md5(string_agg(sig, E'\n' order by sig)) h from (
    select format('%s|%s', extname, extversion) sig from pg_extension
  ) s
),
migs as (
  select count(*) n, md5(string_agg(version, ',' order by version)) h
  from supabase_migrations.schema_migrations
)
select '01_migrations' as section, n, h from migs
union all select '02_columns',     n, h from cols
union all select '03_constraints', n, h from cons
union all select '04_indexes',     n, h from idx
union all select '05_policies',    n, h from pol
union all select '06_rls_enabled', n, h from rls
union all select '07_functions',   n, h from fns
union all select '08_triggers',    n, h from trg
union all select '09_enums',       n, h from enums
union all select '10_extensions',  n, h from exts
order by section;
