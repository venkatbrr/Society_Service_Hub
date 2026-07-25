-- Create mcn_parent_corner table
create table if not exists public.mcn_parent_corner (
  id               uuid primary key default gen_random_uuid(),
  community_id     uuid not null references public.communities(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  student_name     text not null,
  institution_type text not null default 'school' check (institution_type in ('school', 'college', 'preschool')),
  school_name      text not null,
  board            text not null,
  grade_class      text not null,
  parent_name      text not null,
  flat_number      text not null,
  contact_phone    text not null,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Indexing for performance
create index if not exists mcn_parent_corner_community_idx on public.mcn_parent_corner(community_id);
create index if not exists mcn_parent_corner_school_idx on public.mcn_parent_corner(school_name);
create index if not exists mcn_parent_corner_user_idx on public.mcn_parent_corner(user_id);

-- RLS Policies
alter table public.mcn_parent_corner enable row level security;

create policy "mcn_parent_corner_select"
  on public.mcn_parent_corner for select
  using (community_id = get_user_community_id());

create policy "mcn_parent_corner_insert"
  on public.mcn_parent_corner for insert
  with check (community_id = get_user_community_id() and user_id = auth.uid());

create policy "mcn_parent_corner_update"
  on public.mcn_parent_corner for update
  using (user_id = auth.uid()
    or exists (select 1 from public.profiles
               where id = auth.uid() and app_role = 'community_lead'
                 and community_id = get_user_community_id()));

create policy "mcn_parent_corner_delete"
  on public.mcn_parent_corner for delete
  using (user_id = auth.uid()
    or exists (select 1 from public.profiles
               where id = auth.uid() and app_role = 'community_lead'
                 and community_id = get_user_community_id()));
