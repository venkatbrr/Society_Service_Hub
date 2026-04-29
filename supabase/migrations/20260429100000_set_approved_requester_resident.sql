-- Keep approved community requesters as residents.
-- Product requirement: the first user in a newly approved community should not be auto-promoted to community_lead.

CREATE OR REPLACE FUNCTION public.platform_approve_community_request(p_request_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req              public.community_requests%ROWTYPE;
  requester        public.profiles%ROWTYPE;
  new_community_id UUID;
  generated_code   TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can approve community requests';
  END IF;

  SELECT * INTO req
  FROM public.community_requests
  WHERE id = p_request_id
    AND status = 'pending';

  IF req.id IS NULL THEN
    RAISE EXCEPTION 'Pending request not found';
  END IF;

  SELECT * INTO requester
  FROM public.profiles
  WHERE id = req.requested_by;

  IF requester.id IS NULL THEN
    RAISE EXCEPTION 'Requester profile not found';
  END IF;

  generated_code := public.generate_community_code();

  INSERT INTO public.communities (name, code, pincode, city, area, community_type, approximate_units, address)
  VALUES (
    req.name,
    generated_code,
    req.pincode,
    req.city,
    req.area,
    req.community_type,
    req.approximate_units,
    req.address
  )
  RETURNING id INTO new_community_id;

  UPDATE public.community_requests
  SET status                 = 'approved',
      reviewed_by            = auth.uid(),
      reviewed_at            = now(),
      resulting_community_id = new_community_id,
      rejection_reason       = NULL
  WHERE id = req.id;

  PERFORM public.set_audit_context(auth.uid(), 'platform approved community request');

  UPDATE public.profiles
  SET community_id = new_community_id,
      app_role     = 'resident'::public.app_role_type,
      removed_at   = NULL,
      removed_by   = NULL
  WHERE id = req.requested_by;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    req.requested_by,
    'community_approved',
    'Community request approved!',
    'Your community "' || req.name || '" has been approved. '
      || 'Your community code is: ' || generated_code
      || '. Share it with your neighbors to let them join!',
    jsonb_build_object(
      'community_id',   new_community_id,
      'community_name', req.name,
      'community_code', generated_code
    )
  );

  RETURN new_community_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
