-- Second of the call sites broken by 20260918000000_hide_resident_email_from_residents.
--
-- The approvals queue resolves the requester behind each `community_requests`
-- row with `from('profiles').select('id, full_name, phone_number, email')`.
-- `email` is not in that migration's column grant, so the read fails and the
-- whole Approvals screen renders "Error loading community requests".
--
-- Same remedy as `platform_get_community_residents`: a SECURITY DEFINER lookup
-- gated on `is_platform_admin()`, rather than widening the grant that keeps
-- residents from reading each other's addresses.
--
-- Kept generic (takes an id array) because contact resolution by id is the
-- shape the console needs in more than one place.

CREATE OR REPLACE FUNCTION public.platform_get_profiles_contact(p_ids uuid[])
RETURNS TABLE(
  id           uuid,
  full_name    text,
  phone_number text,
  email        text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can look up profile contact details';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.phone_number, p.email
  FROM public.profiles p
  WHERE p.id = ANY(p_ids);
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_get_profiles_contact(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_profiles_contact(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
