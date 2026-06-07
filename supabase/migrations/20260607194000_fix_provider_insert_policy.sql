-- Fix provider creation for current onboarding flow.
-- Community membership already gates insert via get_user_community_id() equality,
-- so do not additionally require legacy approval semantics.

DROP POLICY IF EXISTS "Users can insert providers in their community" ON public.service_providers;

CREATE POLICY "Users can insert providers in their community"
  ON public.service_providers
  FOR INSERT
  WITH CHECK (
    community_id = public.get_user_community_id()
    AND created_by = auth.uid()
  );
