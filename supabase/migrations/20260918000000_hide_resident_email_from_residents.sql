-- No resident ever sees another resident's email address — including a
-- president or vice president, who is a neighbour like anyone else.
--
-- Removing it from the UI is not enough: `profiles` carries a plain
-- `SELECT`-for-my-community RLS policy, and RLS is row-level only, so any
-- resident could read every email in their society with a one-line
-- `from('profiles').select('email')` against the public API. Worse,
-- `profiles_select_public_hosts` extends that read to **anonymous** visitors for
-- anyone who has ever hosted a menu, a listing, or a carpool.
--
-- Postgres has no column-level RLS, so the fix is column-level GRANTs.
--
-- Platform admins are unaffected: the console reads through `platform_*`
-- SECURITY DEFINER functions, which run as the owner and bypass these grants.

-- 1. Column-level read grants on profiles ------------------------------------
--
-- A column-level REVOKE does NOT override a table-level grant — the table-level
-- privilege has to go first, then the columns are granted back individually.
-- (Probed on prod: with only the column REVOKE applied, `SELECT email` still
-- succeeded.) Same shape as the `REVOKE ... FROM PUBLIC, anon` trap in
-- docs/CLAUDE.md §9.
--
-- Consequence to know about: `SELECT *` on profiles now fails outright with
-- "permission denied for table profiles" rather than silently omitting the
-- column, so every client read must name its columns. `context/AuthContext.tsx`
-- was the only `select('*')` and now lists them.

REVOKE SELECT ON public.profiles FROM authenticated, anon;

GRANT SELECT (
  id,
  full_name,
  avatar_url,
  community_id,
  created_at,
  app_role,
  flat_number,
  expo_push_token,
  phone_number,
  removed_at,
  removed_by,
  block_id,
  flat_id,
  last_active_at
) ON public.profiles TO authenticated, anon;

-- `email` is deliberately absent above. A resident reads their OWN email from
-- the auth session (`useAuth().user.email`), never from this table, so nothing
-- in the app needs it. Any column added to `profiles` in future must be added
-- to this GRANT or it becomes unreadable — including to its own owner.

-- 2. Residents directory -----------------------------------------------------
--
-- The RPC is SECURITY DEFINER, so the grants above do not restrain it. It used
-- to return `email` to community leads. Dropping the column from the signature
-- removes the capability rather than hiding it behind a branch.

DROP FUNCTION IF EXISTS public.get_residents_directory(boolean);

CREATE FUNCTION public.get_residents_directory(p_include_phone boolean DEFAULT false)
RETURNS TABLE(
  id uuid,
  full_name text,
  flat_number text,
  phone_number text,
  app_role app_role_type,
  block_id uuid,
  block_name text
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

  -- Phone stays lead-visible; only email is withdrawn. A lead needs a way to
  -- reach a resident about funds and block duties, and the phone number is the
  -- channel this app already uses everywhere (WhatsApp links, order contacts).
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

REVOKE EXECUTE ON FUNCTION public.get_residents_directory(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_residents_directory(boolean) TO authenticated;

-- 3. Pending flat-addition requests ------------------------------------------
--
-- Lead-facing review queue. It named the requester by email as a fallback when
-- they had no full_name set, which is the same disclosure by another route.
-- Phone is retained for the same reason as above.

DROP FUNCTION IF EXISTS public.list_pending_flat_addition_requests(uuid);

CREATE FUNCTION public.list_pending_flat_addition_requests(p_community_id uuid)
RETURNS TABLE(
  id uuid,
  community_id uuid,
  block_id uuid,
  block_name text,
  requested_by uuid,
  requester_name text,
  requester_phone text,
  flat_number text,
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    r.id,
    r.community_id,
    r.block_id,
    b.name AS block_name,
    r.requested_by,
    p.full_name AS requester_name,
    p.phone_number AS requester_phone,
    r.flat_number,
    r.created_at
  FROM public.flat_addition_requests r
  JOIN public.community_blocks b ON b.id = r.block_id
  JOIN public.profiles p ON p.id = r.requested_by
  WHERE r.community_id = p_community_id
    AND r.status = 'pending'
  ORDER BY r.created_at ASC;
$function$;

REVOKE EXECUTE ON FUNCTION public.list_pending_flat_addition_requests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pending_flat_addition_requests(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
