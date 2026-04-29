-- Prefer authoritative profile.community_id for RLS checks.
-- Fallback to JWT metadata for edge cases where profile is not yet available.
CREATE OR REPLACE FUNCTION public.get_user_community_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_community_id uuid;
BEGIN
  SELECT p.community_id
  INTO v_profile_community_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_profile_community_id IS NOT NULL THEN
    RETURN v_profile_community_id;
  END IF;

  RETURN COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'community_id')::uuid,
    (auth.jwt() -> 'user_metadata' ->> 'community_id')::uuid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_community_id() TO authenticated;
