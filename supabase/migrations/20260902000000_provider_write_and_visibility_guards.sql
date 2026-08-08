-- Migration: 20260902000000_provider_write_and_visibility_guards.sql
-- M1: Lock down provider column writes, pin tenant in policies, reinstate approval check, add RLS fraud filter, add moderation RPC.

-- §1. Revoke blanket UPDATE grant and grant specific columns only.
REVOKE UPDATE ON public.service_providers FROM authenticated, anon;
REVOKE INSERT ON public.service_providers FROM anon;

GRANT UPDATE (name, phone, category, description, flat_block, details, updated_at)
  ON public.service_providers TO authenticated;

-- §2. Pin tenant column in UPDATE policy, and restore approval check on INSERT policy.
DROP POLICY IF EXISTS "Users can update providers they created" ON public.service_providers;
CREATE POLICY "Users can update providers they created"
  ON public.service_providers FOR UPDATE
  USING (created_by = auth.uid() AND public.is_user_approved(auth.uid())
         AND community_id = public.get_user_community_id())
  WITH CHECK (created_by = auth.uid() AND public.is_user_approved(auth.uid())
              AND community_id = public.get_user_community_id());

DROP POLICY IF EXISTS "Users can insert providers in their community" ON public.service_providers;
CREATE POLICY "Users can insert providers in their community"
  ON public.service_providers FOR INSERT
  WITH CHECK (community_id = public.get_user_community_id()
              AND created_by = auth.uid()
              AND public.is_user_approved(auth.uid()));

-- §3. Include fraud filter in SELECT policy for residents (leads, admins, and author see hidden rows).
DROP POLICY IF EXISTS "Users can view providers in their community" ON public.service_providers;
CREATE POLICY "Users can view providers in their community"
  ON public.service_providers FOR SELECT
  USING (
    community_id = public.get_user_community_id()
    AND public.is_user_approved(auth.uid())
    AND (
      COALESCE(fraud_status, 'pass') IN ('pass', 'queued_low')
      OR created_by = auth.uid()
      OR public.is_community_lead(auth.uid())
      OR public.is_platform_admin(auth.uid())
    )
  );

-- §4. Moderation RPC for leads and platform admins to update fraud_status and is_verified.
CREATE OR REPLACE FUNCTION public.set_provider_moderation_state(
  p_provider_id  UUID,
  p_fraud_status TEXT DEFAULT NULL,
  p_is_verified  BOOLEAN DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_community UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT community_id INTO v_community FROM public.service_providers WHERE id = p_provider_id;
  IF v_community IS NULL THEN RAISE EXCEPTION 'Provider not found'; END IF;

  IF NOT (
    public.is_platform_admin(auth.uid())
    OR (public.is_community_lead(auth.uid()) AND v_community = public.get_user_community_id())
  ) THEN
    RAISE EXCEPTION 'Only community leads and platform admins can moderate providers';
  END IF;

  IF p_fraud_status IS NOT NULL
     AND p_fraud_status NOT IN ('pass','queued_low','hidden','blocked') THEN
    RAISE EXCEPTION 'Invalid fraud_status: %', p_fraud_status;
  END IF;

  UPDATE public.service_providers
  SET fraud_status = COALESCE(p_fraud_status, fraud_status),
      is_verified  = COALESCE(p_is_verified,  is_verified),
      updated_at   = now()
  WHERE id = p_provider_id;
END; $$;

REVOKE ALL ON FUNCTION public.set_provider_moderation_state(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_provider_moderation_state(UUID, TEXT, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
