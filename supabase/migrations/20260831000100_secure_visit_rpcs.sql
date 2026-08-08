-- ============================================================
-- Secure the two visit RPCs.
--
-- Both were SECURITY DEFINER with no authorization and no search_path pin,
-- and both were EXECUTE-able by anon. An unauthenticated caller holding
-- only the public anon key could read every visit in every community
-- (provider phone numbers, host name + flat number) and every joiner
-- (name, flat number, note).
--
-- Also drops auto_complete_past_visits(), an anon-executable mass UPDATE that
-- was never scheduled (pg_cron is not installed on this project) and has no
-- call site in app/ or supabase/functions/.
--
-- FEDERATION: deliberately preserved and deliberately honoured. The new
-- authorization is built from get_user_partner_community_ids() and
-- can_user_see_visit() rather than a hand-rolled community comparison, so it
-- matches the additive cross-community RLS policies instead of contradicting
-- them. Nothing federation-related is dropped, disabled, or narrowed here.
-- Today both helpers resolve to "the caller's own community", so behaviour is
-- identical to the single-community policies. See docs/cross-community.md.
-- ============================================================

-- ------------------------------------------------------------
-- 1. get_community_visits — authorize, pin search_path.
--    Signature is UNCHANGED so CREATE OR REPLACE succeeds and no
--    client call site needs editing.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_community_visits(
  p_community_id UUID,
  p_user_id UUID,
  p_status TEXT DEFAULT 'upcoming',
  p_time_scope TEXT DEFAULT 'upcoming'
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  category TEXT,
  provider_id UUID,
  provider_name TEXT,
  provider_phone TEXT,
  provider_whatsapp TEXT,
  visit_date DATE,
  visit_time_slot TEXT,
  estimated_cost TEXT,
  max_joiners INTEGER,
  status TEXT,
  created_by UUID,
  creator_name TEXT,
  creator_flat TEXT,
  creator_avatar_url TEXT,
  joiner_count BIGINT,
  has_user_joined BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_platform_admin(v_caller)
     AND p_community_id NOT IN (
       SELECT public.get_user_partner_community_ids('visits', v_caller)
     ) THEN
    RAISE EXCEPTION 'Not authorized to read visits for this community';
  END IF;

  RETURN QUERY
  SELECT
    sv.id, sv.title, sv.description, sv.category, sv.provider_id,
    sv.provider_name, sv.provider_phone, sv.provider_whatsapp,
    sv.visit_date, sv.visit_time_slot, sv.estimated_cost, sv.max_joiners,
    sv.status, sv.created_by,
    p.full_name  AS creator_name,
    p.flat_number AS creator_flat,
    p.avatar_url AS creator_avatar_url,
    COUNT(DISTINCT vj.id) AS joiner_count,
    EXISTS (
      SELECT 1 FROM public.visit_joiners vj2
      WHERE vj2.visit_id = sv.id AND vj2.user_id = v_caller
    ) AS has_user_joined,
    sv.created_at
  FROM public.service_visits sv
  JOIN public.profiles p ON p.id = sv.created_by
  LEFT JOIN public.visit_joiners vj ON vj.visit_id = sv.id
  WHERE sv.community_id = p_community_id
    AND public.can_user_see_visit(sv.id, v_caller)
    AND sv.status = ANY(string_to_array(p_status, ','))
    AND (
      (p_time_scope = 'upcoming' AND sv.visit_date >= CURRENT_DATE)
      OR
      (p_time_scope = 'past'     AND sv.visit_date <  CURRENT_DATE)
    )
  GROUP BY sv.id, p.full_name, p.flat_number, p.avatar_url
  ORDER BY
    CASE WHEN p_time_scope = 'upcoming' THEN sv.visit_date END ASC,
    CASE WHEN p_time_scope = 'past'     THEN sv.visit_date END DESC,
    sv.created_at DESC;
END;
$$;

-- ------------------------------------------------------------
-- 2. get_visit_joiners — authorize against the visit's community.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_visit_joiners(p_visit_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_name TEXT,
  flat_number TEXT,
  avatar_url TEXT,
  note TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.service_visits sv WHERE sv.id = p_visit_id) THEN
    RETURN;
  END IF;

  IF NOT (public.is_platform_admin(v_caller)
          OR public.can_user_see_visit(p_visit_id, v_caller)) THEN
    RAISE EXCEPTION 'Not authorized to read joiners for this visit';
  END IF;

  RETURN QUERY
  SELECT
    vj.id,
    vj.user_id,
    p.full_name AS user_name,
    COALESCE(vj.flat_number, p.flat_number) AS flat_number,
    p.avatar_url,
    vj.note,
    vj.created_at AS joined_at
  FROM public.visit_joiners vj
  JOIN public.profiles p ON p.id = vj.user_id
  WHERE vj.visit_id = p_visit_id
  ORDER BY vj.created_at ASC;
END;
$$;

-- ------------------------------------------------------------
-- 3. Grants. Revoke PUBLIC as well as anon.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_community_visits(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_visit_joiners(UUID)                      FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_community_visits(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_visit_joiners(UUID)                      TO authenticated;

-- ------------------------------------------------------------
-- 4. Drop auto_complete_past_visits().
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.auto_complete_past_visits();

NOTIFY pgrst, 'reload schema';
