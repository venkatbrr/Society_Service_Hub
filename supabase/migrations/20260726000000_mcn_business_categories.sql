create table public.mcn_business_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  emoji text not null default '🏪',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.mcn_business_categories (name, emoji, sort_order) values
  ('Food & Beverages', '🍱', 1),
  ('Home Services', '🏠', 2),
  ('Health & Wellness', '💆', 3),
  ('Education & Tutoring', '📚', 4),
  ('Beauty & Personal Care', '💇', 5),
  ('Fitness & Yoga', '🧘', 6),
  ('Electronics & Repair', '🔧', 7),
  ('Clothing & Tailoring', '👗', 8),
  ('Pet Services', '🐾', 9),
  ('Transport & Delivery', '🚗', 10),
  ('Event & Party', '🎉', 11),
  ('Photography', '📸', 12),
  ('Legal & Finance', '⚖️', 13),
  ('Cleaning & Laundry', '🧹', 14),
  ('Gardening & Plants', '🌱', 15),
  ('Other', '🏪', 99);

alter table public.mcn_listings
  add column category_id uuid references public.mcn_business_categories(id);

create index mcn_listings_category_idx on public.mcn_listings(category_id);

alter table public.mcn_products
  alter column price drop not null;

alter table public.mcn_products
  drop constraint if exists mcn_products_price_check;

alter table public.mcn_products
  add constraint mcn_products_price_check check (price is null or price >= 0);

alter table public.mcn_products
  add column item_type text not null default 'product'
    check (item_type in ('product', 'service'));

alter table public.mcn_business_categories enable row level security;

create policy "mcn_categories_select"
  on public.mcn_business_categories for select
  using (true);

notify pgrst, 'reload schema';
