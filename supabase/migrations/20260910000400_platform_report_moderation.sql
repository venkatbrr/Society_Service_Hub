-- Migration: provider report moderation for platform admins, plus
-- authorisation guards on two previously ungated inventory functions.
--
-- Part 1 fixes a feature that could never have worked. The admin console
-- resolved provider reports with a direct UPDATE on `provider_reports`, but its
-- UPDATE policy requires `is_user_approved(auth.uid())`, which in turn requires
-- `community_id IS NOT NULL` — the exact opposite of what `is_platform_admin()`
-- requires. The follow-up `.select('id')` was blocked by the SELECT policy too,
-- so the console reported "Update failed" every time.
--
-- Part 2 closes a real information leak: `list_community_blocks` and
-- `list_community_flats` are SECURITY DEFINER, take a caller-supplied
-- `p_community_id`, and had no authorisation check at all — any authenticated
-- user could enumerate any society's block and flat inventory.

-- 1. Provider report moderation ---------------------------------------------

CREATE OR REPLACE FUNCTION public.platform_resolve_provider_report(
  p_report_id UUID,
  p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can resolve provider reports';
  END IF;

  IF p_status NOT IN ('reviewed', 'dismissed') THEN
    RAISE EXCEPTION 'Invalid report status: %. Expected reviewed or dismissed.', p_status;
  END IF;

  UPDATE public.provider_reports
  SET status = p_status,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_report_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Provider report not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_resolve_provider_report(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_resolve_provider_report(UUID, TEXT) TO authenticated;

-- 2. Guard the community inventory readers ------------------------------------
-- Both keep their existing signature, return type and ordering so the app and
-- the console are unaffected; they simply refuse to answer for a community the
-- caller has nothing to do with.

CREATE OR REPLACE FUNCTION public.list_community_blocks(p_community_id UUID)
RETURNS SETOF public.community_blocks
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_platform_admin(auth.uid())
    OR p_community_id = public.get_user_community_id()
  ) THEN
    RAISE EXCEPTION 'Not authorised to list blocks for this community';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.community_blocks
  WHERE community_id = p_community_id
    AND archived_at IS NULL
  ORDER BY name;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_community_flats(
  p_community_id UUID,
  p_block_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  block_id UUID,
  block_name TEXT,
  flat_number TEXT,
  floor_label TEXT,
  resident_count INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_platform_admin(auth.uid())
    OR p_community_id = public.get_user_community_id()
  ) THEN
    RAISE EXCEPTION 'Not authorised to list flats for this community';
  END IF;

  RETURN QUERY
  SELECT
    f.id,
    f.block_id,
    b.name AS block_name,
    f.flat_number,
    f.floor_label,
    COUNT(p.id)::INT AS resident_count
  FROM public.community_flats f
  LEFT JOIN public.community_blocks b ON b.id = f.block_id AND b.archived_at IS NULL
  LEFT JOIN public.profiles p ON p.flat_id = f.id AND p.removed_at IS NULL
  WHERE f.community_id = p_community_id
    AND f.archived_at IS NULL
    AND (p_block_id IS NULL OR f.block_id = p_block_id)
  GROUP BY f.id, f.block_id, b.name, f.flat_number, f.floor_label
  ORDER BY
    COALESCE(b.name, '') ASC,
    length(f.flat_number) ASC,
    f.flat_number ASC;
END;
$$;

NOTIFY pgrst, 'reload schema';
