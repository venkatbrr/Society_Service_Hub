-- ============================================================
-- Migration: Drop legacy 'community_lead' / 'community_admin' enum values
-- Date: 2026-08-22
-- ============================================================
--
-- After 20260822000000 repointed every remaining check, nothing in the
-- database references these two values. They only survive because Postgres
-- cannot DROP an enum value, and their presence is a live source of confusion
-- (they still surface in psql, in lib/database.types.ts, and in tooling).
--
-- Postgres has no ALTER TYPE ... DROP VALUE, so we swap the type:
--   rename old -> create new -> recast column -> drop old.
--
-- Preconditions verified before writing this migration:
--   * profiles.app_role is the ONLY column in the database typed app_role_type.
--   * ZERO policies reference app_role directly (they all go through the
--     is_community_lead() / is_platform_admin() helpers), so no policy holds a
--     hard dependency on the type OID.
--   * get_residents_directory(BOOLEAN) is the ONLY function with the type in
--     its signature — the one hard function dependency.
--   * plpgsql / string-bodied SQL function bodies are re-resolved at runtime,
--     so the other ~20 functions referencing the type inside their bodies pick
--     up the new type automatically.
-- ============================================================

-- Defensive, idempotent backfill. A no-op today (verified: zero such rows),
-- but makes this migration safe if it is ever replayed against older data.
UPDATE public.profiles
SET app_role = 'president'::public.app_role_type
WHERE app_role IN (
  'community_lead'::public.app_role_type,
  'community_admin'::public.app_role_type
);

-- Drop the hard dependencies on the old type.
DROP FUNCTION IF EXISTS public.get_residents_directory(BOOLEAN);
ALTER TABLE public.profiles ALTER COLUMN app_role DROP DEFAULT;

-- profile_audit_log_on_profiles has app_role in its WHEN clause, which counts
-- as a trigger dependency on the column and blocks ALTER COLUMN ... TYPE.
-- Dropped here and recreated verbatim after the swap. The other two triggers
-- on profiles do not reference app_role (profile_block_guard is scoped to
-- UPDATE OF community_id, block_id) and are left alone.
DROP TRIGGER IF EXISTS profile_audit_log_on_profiles ON public.profiles;

-- Swap the type.
ALTER TYPE public.app_role_type RENAME TO app_role_type_old;

CREATE TYPE public.app_role_type AS ENUM (
  'admin',            -- platform admin (community_id IS NULL); ultimate powers
  'resident',
  'president',        -- community lead
  'vice_president'    -- community lead, identical powers to president
);

ALTER TABLE public.profiles
  ALTER COLUMN app_role TYPE public.app_role_type
  USING app_role::TEXT::public.app_role_type;

ALTER TABLE public.profiles
  ALTER COLUMN app_role SET DEFAULT 'resident'::public.app_role_type;

DROP TYPE public.app_role_type_old;

-- Recreate the audit trigger exactly as it was.
CREATE TRIGGER profile_audit_log_on_profiles
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (
    old.app_role IS DISTINCT FROM new.app_role
    OR old.community_id IS DISTINCT FROM new.community_id
  )
  EXECUTE FUNCTION public.profile_audit_log_trigger();

-- Recreate the one function whose signature referenced the old type.
-- Body is unchanged from its previous definition: it already gates on
-- is_community_lead() / is_platform_admin() and needs no logic change.
CREATE OR REPLACE FUNCTION public.get_residents_directory(p_include_phone BOOLEAN DEFAULT false)
RETURNS TABLE(
  id UUID,
  full_name TEXT,
  flat_number TEXT,
  phone_number TEXT,
  email TEXT,
  app_role public.app_role_type,
  block_id UUID,
  block_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller                    public.profiles%ROWTYPE;
  caller_can_view_sensitive BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT p.* INTO caller
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF caller.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF (caller.community_id IS NULL OR caller.removed_at IS NOT NULL)
     AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only active community members can access the directory';
  END IF;

  IF caller.community_id IS NULL AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Community not selected';
  END IF;

  caller_can_view_sensitive :=
    public.is_platform_admin(auth.uid())
    OR public.is_community_lead(auth.uid());

  IF p_include_phone AND NOT caller_can_view_sensitive THEN
    RAISE EXCEPTION 'Only community leads can view phone numbers';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.flat_number,
    CASE
      WHEN p_include_phone AND caller_can_view_sensitive THEN p.phone_number
      ELSE NULL
    END AS phone_number,
    CASE
      WHEN caller_can_view_sensitive THEN p.email
      ELSE NULL
    END AS email,
    p.app_role,
    p.block_id,
    cb.name AS block_name
  FROM public.profiles p
  LEFT JOIN public.community_blocks cb ON p.block_id = cb.id
  WHERE p.community_id = caller.community_id
    AND p.removed_at IS NULL
  ORDER BY p.full_name NULLS LAST;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_residents_directory(BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
