-- Fixes a regression from 20260918000000_hide_resident_email_from_residents.
--
-- That migration revoked table-level SELECT on `profiles` and granted back a
-- column list that deliberately omits `email`. Its header reasoned that
-- "platform admins are unaffected: the console reads through `platform_*`
-- SECURITY DEFINER functions" — but the community detail screen was the one
-- place that still read the table directly:
--
--   supabase.from('profiles').select('id, full_name, email, ...')
--
-- A column-level grant miss fails the whole statement rather than omitting the
-- column, so that screen died with "permission denied for table profiles" and
-- the admin console could not list residents for any community at all.
--
-- The console legitimately needs `email`: it searches on it, shows it per
-- resident, names the account in the hard-delete confirmation, and exports it
-- to CSV. So the fix is to give it the same SECURITY DEFINER route every other
-- panel on that screen already uses, not to widen the resident-facing grant.

CREATE OR REPLACE FUNCTION public.platform_get_community_residents(p_community_id uuid)
RETURNS TABLE(
  id           uuid,
  full_name    text,
  email        text,
  flat_number  text,
  phone_number text,
  app_role     public.app_role_type,
  removed_at   timestamptz,
  created_at   timestamptz,
  community_id uuid,
  block_id     uuid
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can list community residents';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.email,
    p.flat_number,
    p.phone_number,
    p.app_role,
    p.removed_at,
    p.created_at,
    p.community_id,
    p.block_id
  FROM public.profiles p
  WHERE p.community_id = p_community_id
  ORDER BY p.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_get_community_residents(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_community_residents(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
