-- Enhancement 5: Add is_closed to events
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS is_closed BOOLEAN DEFAULT FALSE;

-- Enhancement 5: RPC to toggle fund status
CREATE OR REPLACE FUNCTION public.set_fund_closed(p_event_id UUID, p_closed BOOLEAN)
RETURNS public.events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.events;
  v_community_id UUID;
BEGIN
  IF NOT public.is_community_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Only community leads can close or open funds';
  END IF;
  
  -- Get event and check community
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  SELECT community_id INTO v_community_id FROM public.profiles WHERE id = auth.uid();

  IF v_event.community_id != v_community_id THEN
     RAISE EXCEPTION 'You do not have permission to modify this fund';
  END IF;

  UPDATE public.events
  SET is_closed = p_closed
  WHERE id = p_event_id
  RETURNING * INTO v_event;

  RETURN v_event;
END;
$$;

-- Enhancements 4 and 9: Update get_residents_directory
DROP FUNCTION IF EXISTS public.get_residents_directory(BOOLEAN);

CREATE OR REPLACE FUNCTION public.get_residents_directory(p_include_phone BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
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
SET search_path = public
AS $$
DECLARE
  caller              public.profiles%ROWTYPE;
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
$$;
