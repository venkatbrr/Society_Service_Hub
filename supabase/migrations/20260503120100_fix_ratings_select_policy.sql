-- Fix: Recreate the SELECT policy on ratings that was dropped by cascade

CREATE POLICY "Users can view ratings in their community"
  ON public.ratings
  FOR SELECT
  USING (
    public.is_user_approved(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.service_providers sp
      WHERE sp.id = provider_id AND sp.community_id = get_user_community_id()
    )
  );
