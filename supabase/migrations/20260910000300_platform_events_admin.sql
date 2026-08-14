-- Migration: platform admin surface for community events and the events
-- coordinator grant.
--
-- The community events module shipped 2026-09-07 with `community_events`,
-- `community_event_contacts` and the `community_event_organizers` grant table
-- (the "events coordinator" role — deliberately a grant rather than an
-- `app_role_type` value, because `profiles.app_role` is single-valued and a
-- president must be able to hold it too).
--
-- The admin console had no surface for any of it, and could not have had one:
-- every policy on those tables keys on `get_user_community_id()`, which is NULL
-- for a platform admin, so a direct read returns `[]` with no error. These
-- SECURITY DEFINER RPCs are the only path.

-- 1. Read: community events --------------------------------------------------

CREATE OR REPLACE FUNCTION public.platform_get_community_events(p_community_id UUID DEFAULT NULL)
RETURNS TABLE (
  event_id UUID,
  community_id UUID,
  community_name TEXT,
  title TEXT,
  category TEXT,
  description TEXT,
  image_url TEXT,
  venue TEXT,
  event_date DATE,
  start_time TIME,
  end_time TIME,
  registration_last_date DATE,
  entry_fee NUMERIC,
  registration_link TEXT,
  status TEXT,
  cancelled_at TIMESTAMPTZ,
  cancellation_note TEXT,
  poster_id UUID,
  poster_name TEXT,
  poster_flat TEXT,
  poster_role TEXT,
  contact_count BIGINT,
  contacts JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view community events';
  END IF;

  RETURN QUERY
  SELECT
    e.id AS event_id,
    e.community_id,
    COALESCE(c.name, '') AS community_name,
    e.title,
    e.category,
    e.description,
    e.image_url,
    e.venue,
    e.event_date,
    e.start_time,
    e.end_time,
    e.registration_last_date,
    e.entry_fee,
    e.registration_link,
    e.status,
    e.cancelled_at,
    e.cancellation_note,
    e.created_by AS poster_id,
    COALESCE(p.full_name, 'Resident') AS poster_name,
    COALESCE(p.flat_number, '') AS poster_flat,
    -- Why they were allowed to post: an explicit grant, or lead standing.
    CASE
      WHEN p.app_role = 'president' THEN 'President'
      WHEN p.app_role = 'vice_president' THEN 'Vice President'
      WHEN EXISTS (
        SELECT 1 FROM public.community_event_organizers o
        WHERE o.community_id = e.community_id AND o.user_id = e.created_by
      ) THEN 'Events coordinator'
      ELSE 'Resident'
    END AS poster_role,
    (SELECT COUNT(*)::BIGINT FROM public.community_event_contacts ct
      WHERE ct.event_id = e.id) AS contact_count,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', ct.name,
          'phone', ct.phone,
          'role_label', ct.role_label
        ) ORDER BY ct.sort_order ASC
      )
      FROM public.community_event_contacts ct
      WHERE ct.event_id = e.id
    ), '[]'::jsonb) AS contacts,
    e.created_at
  FROM public.community_events e
  LEFT JOIN public.communities c ON c.id = e.community_id
  LEFT JOIN public.profiles p ON p.id = e.created_by
  WHERE (p_community_id IS NULL OR e.community_id = p_community_id)
  ORDER BY e.event_date DESC, e.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_community_events(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_community_events(UUID) TO authenticated;

-- 2. Read: events coordinators ----------------------------------------------

CREATE OR REPLACE FUNCTION public.platform_get_event_organizers(p_community_id UUID DEFAULT NULL)
RETURNS TABLE (
  grant_id UUID,
  community_id UUID,
  community_name TEXT,
  user_id UUID,
  full_name TEXT,
  email TEXT,
  flat_number TEXT,
  app_role TEXT,
  events_posted BIGINT,
  granted_by_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view events coordinators';
  END IF;

  RETURN QUERY
  SELECT
    o.id AS grant_id,
    o.community_id,
    COALESCE(c.name, '') AS community_name,
    o.user_id,
    COALESCE(p.full_name, 'Resident') AS full_name,
    p.email,
    COALESCE(p.flat_number, '') AS flat_number,
    p.app_role::TEXT AS app_role,
    (SELECT COUNT(*)::BIGINT FROM public.community_events e
      WHERE e.community_id = o.community_id AND e.created_by = o.user_id) AS events_posted,
    gp.full_name AS granted_by_name,
    o.created_at
  FROM public.community_event_organizers o
  LEFT JOIN public.communities c ON c.id = o.community_id
  JOIN public.profiles p ON p.id = o.user_id
  LEFT JOIN public.profiles gp ON gp.id = o.granted_by
  WHERE (p_community_id IS NULL OR o.community_id = p_community_id)
    AND p.removed_at IS NULL
  ORDER BY full_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_event_organizers(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_get_event_organizers(UUID) TO authenticated;

-- 3. Write: grant the events coordinator role --------------------------------
-- Guards mirror platform_set_fund_treasurer (20260820000000): the target must
-- be an active member of *this* community and must not be a platform admin.
-- Leads are allowed to hold the grant — they can post regardless, but recording
-- it keeps the coordinator list an honest answer to "who runs events here".

CREATE OR REPLACE FUNCTION public.platform_set_event_organizer(
  p_community_id UUID,
  p_target_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can assign events coordinators';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.communities WHERE id = p_community_id) THEN
    RAISE EXCEPTION 'Community not found';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE id = p_target_user_id;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;
  IF v_target.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot assign a removed resident as events coordinator';
  END IF;
  IF v_target.community_id IS DISTINCT FROM p_community_id THEN
    RAISE EXCEPTION 'Target user is not a member of this community';
  END IF;
  IF v_target.app_role = 'admin' THEN
    RAISE EXCEPTION 'Platform admins cannot hold a community events grant';
  END IF;

  INSERT INTO public.community_event_organizers (community_id, user_id, granted_by)
  VALUES (p_community_id, p_target_user_id, auth.uid())
  ON CONFLICT (community_id, user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_set_event_organizer(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_event_organizer(UUID, UUID) TO authenticated;

-- 4. Write: revoke the events coordinator role -------------------------------
-- Revoking the grant never touches events the person already posted; those stay
-- attributed to them, exactly as when a lead revokes the grant in the app.

CREATE OR REPLACE FUNCTION public.platform_remove_event_organizer(
  p_community_id UUID,
  p_target_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can revoke events coordinators';
  END IF;

  DELETE FROM public.community_event_organizers
  WHERE community_id = p_community_id
    AND user_id = p_target_user_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- A DELETE matching zero rows does not raise; say so explicitly rather than
  -- letting the console report a success it did not achieve.
  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'That resident does not hold the events coordinator grant';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_remove_event_organizer(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_remove_event_organizer(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
