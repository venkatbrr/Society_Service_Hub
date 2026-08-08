-- Rebrand: Society Service Hub -> Wooru
--
-- Moves the hardcoded platform-admin break-glass address off the retired brand.
--
-- Two accounts are platform admins and BOTH keep that access:
--   societyservicehub@gmail.com  -- via its profile row (app_role='admin', community_id IS NULL)
--   thewooru@gmail.com           -- via its profile row AND the break-glass branch below
--
-- Verified before writing this migration: both rows already satisfy the profile
-- branch, so replacing the hardcoded email removes nothing from either account.
-- With two admins, each is the other's recovery path -- which is what the
-- single hardcoded address used to provide on its own.
--
-- The old address is left in earlier migrations on purpose: `supabase db push`
-- tracks migrations by filename, not content, so editing an applied file is a
-- silent no-op. This file supersedes them via CREATE OR REPLACE.
--
-- Signatures are unchanged, so no RLS policy or dependent function needs
-- dropping, and `gen types` output is unaffected.

-- 1) Break-glass identity check.
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = COALESCE(p_user_id, auth.uid())
      AND p.app_role = 'admin'::public.app_role_type
      AND p.community_id IS NULL
  )
  OR EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = COALESCE(p_user_id, auth.uid())
      AND lower(COALESCE(u.email, '')) = 'thewooru@gmail.com'
  );
$$;

-- 2) New signups: auto-promote the canonical admin address.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, app_role, email)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    CASE
      WHEN lower(COALESCE(new.email, '')) = 'thewooru@gmail.com'
        THEN 'admin'::public.app_role_type
      ELSE 'resident'::public.app_role_type
    END,
    new.email
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3) Idempotent backfill. A platform admin must have no community: is_platform_admin()
--    requires community_id IS NULL, and profile_block_guard rejects a block_id that
--    outlives its community, so block_id is cleared in the same statement.
UPDATE public.profiles
SET app_role = 'admin'::public.app_role_type,
    community_id = NULL,
    block_id = NULL,
    flat_number = NULL
WHERE lower(email) = 'thewooru@gmail.com'
  AND (app_role <> 'admin'::public.app_role_type OR community_id IS NOT NULL);

NOTIFY pgrst, 'reload schema';
