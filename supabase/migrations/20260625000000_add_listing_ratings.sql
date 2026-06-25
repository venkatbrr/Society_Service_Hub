-- 1. Make provider_id nullable on ratings
ALTER TABLE public.ratings ALTER COLUMN provider_id DROP NOT NULL;

-- 2. Add listing_id to ratings table
ALTER TABLE public.ratings ADD COLUMN listing_id UUID REFERENCES public.mcn_listings(id) ON DELETE CASCADE;

-- 3. Add check constraint to ensure exactly one target is rated
ALTER TABLE public.ratings ADD CONSTRAINT rating_target_check
  CHECK (
    (provider_id IS NOT NULL AND listing_id IS NULL) OR
    (provider_id IS NULL AND listing_id IS NOT NULL)
  );

-- 4. Add unique constraint for (user_id, listing_id)
ALTER TABLE public.ratings ADD CONSTRAINT ratings_user_id_listing_id_key UNIQUE (user_id, listing_id);

-- 5. Update ratings SELECT policy to support listing ratings
DROP POLICY IF EXISTS "Users can view ratings in their community" ON public.ratings;

CREATE POLICY "Users can view ratings in their community"
  ON public.ratings
  FOR SELECT
  USING (
    public.is_user_approved(auth.uid())
    AND (
      (provider_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.service_providers sp
        WHERE sp.id = provider_id AND sp.community_id = get_user_community_id()
      ))
      OR
      (listing_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.mcn_listings l
        WHERE l.id = listing_id AND l.community_id = get_user_community_id()
      ))
    )
  );

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
