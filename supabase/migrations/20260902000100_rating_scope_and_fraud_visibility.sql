-- Migration: 20260902000100_rating_scope_and_fraud_visibility.sql
-- M2: Scope ratings writes to caller's community, add DELETE policy, update rating calculation to exclude hidden/flagged reviews, hide flagged reviews from public select.

-- §1. Scope ratings INSERT and UPDATE policies to caller's community.
DROP POLICY IF EXISTS "Users can insert their own ratings" ON public.ratings;
CREATE POLICY "Users can insert their own ratings"
  ON public.ratings FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_user_approved(auth.uid())
    AND (
      (provider_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.service_providers sp
         WHERE sp.id = provider_id AND sp.community_id = public.get_user_community_id()))
      OR
      (listing_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.mcn_listings l
         WHERE l.id = listing_id AND l.community_id = public.get_user_community_id()))
    )
  );

DROP POLICY IF EXISTS "Users can update their own ratings" ON public.ratings;
CREATE POLICY "Users can update their own ratings"
  ON public.ratings FOR UPDATE
  USING (
    user_id = auth.uid()
    AND public.is_user_approved(auth.uid())
    AND (
      (provider_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.service_providers sp
         WHERE sp.id = provider_id AND sp.community_id = public.get_user_community_id()))
      OR
      (listing_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.mcn_listings l
         WHERE l.id = listing_id AND l.community_id = public.get_user_community_id()))
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_user_approved(auth.uid())
    AND (
      (provider_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.service_providers sp
         WHERE sp.id = provider_id AND sp.community_id = public.get_user_community_id()))
      OR
      (listing_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.mcn_listings l
         WHERE l.id = listing_id AND l.community_id = public.get_user_community_id()))
    )
  );

-- §2. Add DELETE policy for ratings (author, platform admin, or lead in provider/listing's community).
DROP POLICY IF EXISTS "Users can delete their own ratings" ON public.ratings;
CREATE POLICY "Users can delete their own ratings"
  ON public.ratings FOR DELETE
  USING (
    (user_id = auth.uid() AND public.is_user_approved(auth.uid()))
    OR public.is_platform_admin(auth.uid())
    OR (public.is_community_lead(auth.uid()) AND (
          (provider_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM public.service_providers sp
             WHERE sp.id = provider_id AND sp.community_id = public.get_user_community_id()))
          OR
          (listing_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM public.mcn_listings l
             WHERE l.id = listing_id AND l.community_id = public.get_user_community_id()))
        ))
  );

-- §3. Update rating calculation trigger to SECURITY DEFINER + search_path and filter out flagged/hidden reviews.
CREATE OR REPLACE FUNCTION update_provider_rating() RETURNS TRIGGER AS $$
DECLARE target_provider_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN target_provider_id := OLD.provider_id;
  ELSE target_provider_id := NEW.provider_id; END IF;
  IF target_provider_id IS NULL THEN RETURN NULL; END IF;

  UPDATE public.service_providers
  SET rating_count = (SELECT COUNT(*) FROM public.ratings
                      WHERE provider_id = target_provider_id
                        AND COALESCE(fraud_status,'pass') IN ('pass','queued_low')),
      avg_rating   = COALESCE((SELECT ROUND(AVG(rating)::numeric, 1) FROM public.ratings
                               WHERE provider_id = target_provider_id
                                 AND COALESCE(fraud_status,'pass') IN ('pass','queued_low')), 0)
  WHERE id = target_provider_id;
  RETURN NULL;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- §4. Hide flagged/hidden ratings from residents in SELECT policy (authors, leads, admins still see them).
DROP POLICY IF EXISTS "Users can view ratings in their community" ON public.ratings;
CREATE POLICY "Users can view ratings in their community"
  ON public.ratings FOR SELECT
  USING (
    public.is_user_approved(auth.uid())
    AND (
      COALESCE(fraud_status,'pass') IN ('pass','queued_low')
      OR user_id = auth.uid()
      OR public.is_community_lead(auth.uid())
      OR public.is_platform_admin(auth.uid())
    )
    AND (
      (provider_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.service_providers sp
         WHERE sp.id = provider_id AND sp.community_id = public.get_user_community_id()))
      OR
      (listing_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.mcn_listings l
         WHERE l.id = listing_id AND l.community_id = public.get_user_community_id()))
    )
  );

NOTIFY pgrst, 'reload schema';
