create table public.mcn_listings (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  name         text not null,                     -- e.g. "Ramana's Mango Corner"
  description  text,                              -- short description of the business
  contact_phone text,                             -- normalized 10-digit, optional
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger mcn_listings_updated_at
  before update on public.mcn_listings
  for each row execute function public.touch_mcn_posts_updated_at();

create index mcn_listings_community_idx on public.mcn_listings(community_id, is_active);
create index mcn_listings_owner_idx on public.mcn_listings(owner_id);


create table public.mcn_products (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.mcn_listings(id) on delete cascade,
  name        text not null,                      -- e.g. "Banginapalli", "Rasalu", "Alphonso"
  description text,                               -- optional details
  unit        text not null check (unit in ('kg', 'piece', 'litre', 'dozen', 'box', 'pack')),
  price       numeric(10,2) not null check (price >= 0),
  is_available boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index mcn_products_listing_idx on public.mcn_products(listing_id, is_available);


create table public.mcn_orders (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.mcn_listings(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  buyer_id     uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'fulfilled', 'cancelled')),
  buyer_note   text,                              -- optional note from buyer
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger mcn_orders_updated_at
  before update on public.mcn_orders
  for each row execute function public.touch_mcn_posts_updated_at();

create index mcn_orders_listing_idx on public.mcn_orders(listing_id, status);
create index mcn_orders_buyer_idx on public.mcn_orders(buyer_id);


create table public.mcn_order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.mcn_orders(id) on delete cascade,
  product_id uuid not null references public.mcn_products(id) on delete restrict,
  quantity   numeric(8,2) not null check (quantity > 0),
  unit_price numeric(10,2) not null,              -- snapshot of price at order time
  created_at timestamptz not null default now()
);

create index mcn_order_items_order_idx on public.mcn_order_items(order_id);


-- RLS Policies

-- mcn_listings
alter table public.mcn_listings enable row level security;

create policy "mcn_listings_select"
  on public.mcn_listings for select
  using (community_id = get_user_community_id());

create policy "mcn_listings_insert"
  on public.mcn_listings for insert
  with check (community_id = get_user_community_id() and owner_id = auth.uid());

create policy "mcn_listings_update"
  on public.mcn_listings for update
  using (owner_id = auth.uid()
    or exists (select 1 from public.profiles
               where id = auth.uid() and app_role = 'community_lead'
                 and community_id = get_user_community_id()));

create policy "mcn_listings_delete"
  on public.mcn_listings for delete
  using (owner_id = auth.uid()
    or exists (select 1 from public.profiles
               where id = auth.uid() and app_role = 'community_lead'
                 and community_id = get_user_community_id()));

-- mcn_products
alter table public.mcn_products enable row level security;

-- Any community member can read products of listings in their community
create policy "mcn_products_select"
  on public.mcn_products for select
  using (exists (
    select 1 from public.mcn_listings l
    where l.id = listing_id
      and l.community_id = get_user_community_id()
  ));

-- Only the listing owner manages products
create policy "mcn_products_insert"
  on public.mcn_products for insert
  with check (exists (
    select 1 from public.mcn_listings l
    where l.id = listing_id and l.owner_id = auth.uid()
  ));

create policy "mcn_products_update"
  on public.mcn_products for update
  using (exists (
    select 1 from public.mcn_listings l
    where l.id = listing_id and l.owner_id = auth.uid()
  ));

create policy "mcn_products_delete"
  on public.mcn_products for delete
  using (exists (
    select 1 from public.mcn_listings l
    where l.id = listing_id and l.owner_id = auth.uid()
  ));

-- mcn_orders
alter table public.mcn_orders enable row level security;

-- Buyer can see their own orders; listing owner can see orders for their listings
create policy "mcn_orders_select"
  on public.mcn_orders for select
  using (
    buyer_id = auth.uid()
    or exists (
      select 1 from public.mcn_listings l
      where l.id = listing_id and l.owner_id = auth.uid()
    )
  );

create policy "mcn_orders_insert"
  on public.mcn_orders for insert
  with check (community_id = get_user_community_id() and buyer_id = auth.uid());

-- Listing owner can update status; buyer cannot change status
create policy "mcn_orders_update"
  on public.mcn_orders for update
  using (exists (
    select 1 from public.mcn_listings l
    where l.id = listing_id and l.owner_id = auth.uid()
  ));

-- Buyer can cancel (delete) their own pending order
create policy "mcn_orders_delete"
  on public.mcn_orders for delete
  using (buyer_id = auth.uid() and status = 'pending');

-- mcn_order_items
alter table public.mcn_order_items enable row level security;

-- Readable by buyer and listing owner (via order lookup)
create policy "mcn_order_items_select"
  on public.mcn_order_items for select
  using (exists (
    select 1 from public.mcn_orders o
    join public.mcn_listings l on l.id = o.listing_id
    where o.id = order_id
      and (o.buyer_id = auth.uid() or l.owner_id = auth.uid())
  ));

create policy "mcn_order_items_insert"
  on public.mcn_order_items for insert
  with check (exists (
    select 1 from public.mcn_orders o
    where o.id = order_id and o.buyer_id = auth.uid()
  ));

-- Notify PostgREST to reload schema cache
notify pgrst, 'reload schema';
