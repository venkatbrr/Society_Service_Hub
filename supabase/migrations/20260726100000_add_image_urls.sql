-- Add image_url to business listings (cover/logo photo)
alter table public.mcn_listings
  add column if not exists image_url text;

-- Add image_url to products/services (product photo)
alter table public.mcn_products
  add column if not exists image_url text;

-- Notify PostgREST to reload schema cache
notify pgrst, 'reload schema';
