-- Structured intent tags for Parent Corner entries (carpool, study group, etc.)
-- so the directory can be filtered by what a parent is looking for, instead of
-- relying only on free-text notes.
alter table public.mcn_parent_corner
  add column if not exists intents text[] not null default '{}';

create index if not exists mcn_parent_corner_intents_idx
  on public.mcn_parent_corner using gin (intents);

notify pgrst, 'reload schema';
