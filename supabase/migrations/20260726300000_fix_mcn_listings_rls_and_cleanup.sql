-- Fix mcn_listings RLS update and delete policies
drop policy if exists "mcn_listings_update" on public.mcn_listings;
drop policy if exists "mcn_listings_delete" on public.mcn_listings;

create policy "mcn_listings_update"
  on public.mcn_listings for update
  using (owner_id = auth.uid() or public.is_community_lead(auth.uid()));

create policy "mcn_listings_delete"
  on public.mcn_listings for delete
  using (owner_id = auth.uid() or public.is_community_lead(auth.uid()));

-- Delete test listings requested by user ('Fashion' and 'mang')
delete from public.mcn_listings
where lower(name) in ('fashion', 'mang');

notify pgrst, 'reload schema';
