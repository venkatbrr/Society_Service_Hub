create table public.mcn_posts (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('business', 'borrow')),
  title        text not null,
  description  text,
  contact_hint text,         -- optional: WhatsApp number or short contact note
  is_available boolean not null default true,  -- owner can mark as fulfilled/unavailable
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_mcn_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

create trigger mcn_posts_updated_at
  before update on public.mcn_posts
  for each row execute function public.touch_mcn_posts_updated_at();

-- Indexes
create index mcn_posts_community_kind_idx on public.mcn_posts(community_id, kind);
create index mcn_posts_user_idx on public.mcn_posts(user_id);

alter table public.mcn_posts enable row level security;

-- Any community member can read posts in their community
create policy "mcn_posts_select"
  on public.mcn_posts for select
  using (community_id = get_user_community_id());

-- Any resident can create a post in their community
create policy "mcn_posts_insert"
  on public.mcn_posts for insert
  with check (
    community_id = get_user_community_id()
    and user_id = auth.uid()
  );

-- Owner can update their own post; community lead can update any post
create policy "mcn_posts_update"
  on public.mcn_posts for update
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
        and app_role = 'community_lead'
        and community_id = get_user_community_id()
    )
  );

-- Owner can delete their own post; community lead can delete any post
create policy "mcn_posts_delete"
  on public.mcn_posts for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
        and app_role = 'community_lead'
        and community_id = get_user_community_id()
    )
  );
