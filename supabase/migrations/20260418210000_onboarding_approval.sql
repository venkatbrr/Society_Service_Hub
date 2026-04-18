DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'approval_status_type'
  ) THEN
    CREATE TYPE public.approval_status_type AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'community_request_status_type'
  ) THEN
    CREATE TYPE public.community_request_status_type AS ENUM ('pending', 'approved', 'rejected', 'needs_info');
  END IF;
END
$$;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS approval_status public.approval_status_type NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS phone_number TEXT,
ADD COLUMN IF NOT EXISTS join_note TEXT,
ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ DEFAULT now();

UPDATE public.profiles
SET approval_status = 'approved'
WHERE approval_status IS DISTINCT FROM 'approved';

ALTER TABLE public.communities
ADD COLUMN IF NOT EXISTS pincode TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS area TEXT,
ADD COLUMN IF NOT EXISTS community_type TEXT,
ADD COLUMN IF NOT EXISTS approximate_units TEXT;

CREATE TABLE IF NOT EXISTS public.community_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  community_type TEXT NOT NULL,
  city TEXT NOT NULL,
  pincode TEXT NOT NULL,
  area TEXT,
  approximate_units TEXT,
  requester_role TEXT NOT NULL,
  nominated_admin_name TEXT,
  nominated_admin_contact TEXT,
  status public.community_request_status_type NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  resulting_community_id UUID REFERENCES public.communities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_requests_requested_by_idx
ON public.community_requests(requested_by, created_at DESC);

CREATE INDEX IF NOT EXISTS community_requests_status_idx
ON public.community_requests(status, created_at DESC);

ALTER TABLE public.community_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own community requests" ON public.community_requests;
CREATE POLICY "Users can view their own community requests"
  ON public.community_requests
  FOR SELECT
  USING (requested_by = auth.uid());

CREATE OR REPLACE FUNCTION public.is_user_approved(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = COALESCE(p_user_id, auth.uid())
      AND approval_status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.search_communities_by_pincode(p_pincode TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  community_type TEXT,
  city TEXT,
  area TEXT,
  resident_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.community_type,
    c.city,
    c.area,
    COUNT(p.id)::BIGINT AS resident_count
  FROM public.communities c
  LEFT JOIN public.profiles p ON p.community_id = c.id
  WHERE c.pincode = p_pincode
  GROUP BY c.id, c.name, c.community_type, c.city, c.area
  ORDER BY c.name ASC;
$$;

CREATE OR REPLACE FUNCTION public.submit_community_request(
  p_name TEXT,
  p_community_type TEXT,
  p_city TEXT,
  p_pincode TEXT,
  p_area TEXT DEFAULT NULL,
  p_approximate_units TEXT DEFAULT NULL,
  p_requester_role TEXT DEFAULT NULL,
  p_nominated_admin_name TEXT DEFAULT NULL,
  p_nominated_admin_contact TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.community_requests
    WHERE requested_by = auth.uid()
      AND status IN ('pending', 'needs_info')
  ) THEN
    RAISE EXCEPTION 'You already have an active community request.';
  END IF;

  INSERT INTO public.community_requests (
    requested_by,
    name,
    community_type,
    city,
    pincode,
    area,
    approximate_units,
    requester_role,
    nominated_admin_name,
    nominated_admin_contact
  )
  VALUES (
    auth.uid(),
    btrim(p_name),
    btrim(p_community_type),
    btrim(p_city),
    btrim(p_pincode),
    NULLIF(btrim(COALESCE(p_area, '')), ''),
    NULLIF(btrim(COALESCE(p_approximate_units, '')), ''),
    btrim(COALESCE(p_requester_role, 'Resident')),
    NULLIF(btrim(COALESCE(p_nominated_admin_name, '')), ''),
    NULLIF(btrim(COALESCE(p_nominated_admin_contact, '')), '')
  )
  RETURNING id INTO request_id;

  RETURN request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_profile_membership(p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_profile public.profiles%ROWTYPE;
  approver_profile public.profiles%ROWTYPE;
  community_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO approver_profile
  FROM public.profiles
  WHERE id = auth.uid();

  IF approver_profile.app_role <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can approve members';
  END IF;

  SELECT * INTO target_profile
  FROM public.profiles
  WHERE id = p_profile_id;

  IF target_profile.id IS NULL THEN
    RAISE EXCEPTION 'Member request not found';
  END IF;

  IF target_profile.community_id IS DISTINCT FROM approver_profile.community_id THEN
    RAISE EXCEPTION 'Member request belongs to another community';
  END IF;

  UPDATE public.profiles
  SET approval_status = 'approved'
  WHERE id = p_profile_id;

  SELECT name INTO community_name
  FROM public.communities
  WHERE id = approver_profile.community_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    target_profile.id,
    'membership_approved',
    'Community request approved',
    'You''ve been approved to join ' || COALESCE(community_name, 'your community') || '.',
    jsonb_build_object('community_id', approver_profile.community_id, 'approval_status', 'approved')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_profile_membership(p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_profile public.profiles%ROWTYPE;
  approver_profile public.profiles%ROWTYPE;
  community_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO approver_profile
  FROM public.profiles
  WHERE id = auth.uid();

  IF approver_profile.app_role <> 'admin' THEN
    RAISE EXCEPTION 'Only admins can reject members';
  END IF;

  SELECT * INTO target_profile
  FROM public.profiles
  WHERE id = p_profile_id;

  IF target_profile.id IS NULL THEN
    RAISE EXCEPTION 'Member request not found';
  END IF;

  IF target_profile.community_id IS DISTINCT FROM approver_profile.community_id THEN
    RAISE EXCEPTION 'Member request belongs to another community';
  END IF;

  UPDATE public.profiles
  SET approval_status = 'rejected'
  WHERE id = p_profile_id;

  SELECT name INTO community_name
  FROM public.communities
  WHERE id = approver_profile.community_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    target_profile.id,
    'membership_rejected',
    'Community request rejected',
    'Your request to join ' || COALESCE(community_name, 'this community') || ' was rejected.',
    jsonb_build_object('community_id', approver_profile.community_id, 'approval_status', 'rejected')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, app_role)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    'resident'
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP POLICY IF EXISTS "Users can view providers in their community" ON public.service_providers;
CREATE POLICY "Users can view providers in their community"
  ON public.service_providers
  FOR SELECT
  USING (
    community_id = get_user_community_id()
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert providers in their community" ON public.service_providers;
CREATE POLICY "Users can insert providers in their community"
  ON public.service_providers
  FOR INSERT
  WITH CHECK (
    community_id = get_user_community_id()
    AND created_by = auth.uid()
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Users can update providers they created" ON public.service_providers;
CREATE POLICY "Users can update providers they created"
  ON public.service_providers
  FOR UPDATE
  USING (
    created_by = auth.uid()
    AND public.is_user_approved(auth.uid())
  )
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete providers they created" ON public.service_providers;
CREATE POLICY "Users can delete providers they created"
  ON public.service_providers
  FOR DELETE
  USING (
    created_by = auth.uid()
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Community members can view visits" ON public.service_visits;
CREATE POLICY "Community members can view visits"
  ON public.service_visits
  FOR SELECT
  USING (
    community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Users can create visits" ON public.service_visits;
CREATE POLICY "Users can create visits"
  ON public.service_visits
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Creators can update their visits" ON public.service_visits;
CREATE POLICY "Creators can update their visits"
  ON public.service_visits
  FOR UPDATE
  USING (
    created_by = auth.uid()
    AND public.is_user_approved(auth.uid())
  )
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Creators can delete their visits" ON public.service_visits;
CREATE POLICY "Creators can delete their visits"
  ON public.service_visits
  FOR DELETE
  USING (
    created_by = auth.uid()
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Community members can view joiners" ON public.visit_joiners;
CREATE POLICY "Community members can view joiners"
  ON public.visit_joiners
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.service_visits sv
      WHERE sv.id = public.visit_joiners.visit_id
        AND sv.community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
    )
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Users can join visits" ON public.visit_joiners;
CREATE POLICY "Users can join visits"
  ON public.visit_joiners
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.service_visits sv
      WHERE sv.id = public.visit_joiners.visit_id
        AND sv.community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
        AND sv.status = 'upcoming'
    )
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Users can leave visits" ON public.visit_joiners;
CREATE POLICY "Users can leave visits"
  ON public.visit_joiners
  FOR DELETE
  USING (
    user_id = auth.uid()
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Users can view their own favorites" ON public.favorites;
CREATE POLICY "Users can view their own favorites"
  ON public.favorites
  FOR SELECT
  USING (
    user_id = auth.uid()
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert their own favorites" ON public.favorites;
CREATE POLICY "Users can insert their own favorites"
  ON public.favorites
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete their own favorites" ON public.favorites;
CREATE POLICY "Users can delete their own favorites"
  ON public.favorites
  FOR DELETE
  USING (
    user_id = auth.uid()
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Users can view ratings in their community" ON public.ratings;
CREATE POLICY "Users can view ratings in their community"
  ON public.ratings
  FOR SELECT
  USING (
    public.is_user_approved(auth.uid())
    AND (
      (provider_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.service_providers sp
        WHERE sp.id = provider_id AND sp.community_id = get_user_community_id()
      ))
      OR
      (business_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.resident_businesses rb
        WHERE rb.id = business_id AND rb.community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
      ))
    )
  );

DROP POLICY IF EXISTS "Users can insert their own ratings" ON public.ratings;
CREATE POLICY "Users can insert their own ratings"
  ON public.ratings
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Users can update their own ratings" ON public.ratings;
CREATE POLICY "Users can update their own ratings"
  ON public.ratings
  FOR UPDATE
  USING (
    user_id = auth.uid()
    AND public.is_user_approved(auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Users can view hires in their community" ON public.provider_hires;
CREATE POLICY "Users can view hires in their community"
  ON public.provider_hires
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.service_providers sp
      WHERE sp.id = provider_id AND sp.community_id = get_user_community_id()
    )
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert their own hires" ON public.provider_hires;
CREATE POLICY "Users can insert their own hires"
  ON public.provider_hires
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Users can view events in their community" ON public.events;
CREATE POLICY "Users can view events in their community"
  ON public.events
  FOR SELECT
  USING (
    community_id = get_user_community_id()
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can create funds in their community" ON public.events;
CREATE POLICY "Admins can create funds in their community"
  ON public.events
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND community_id = get_user_community_id()
    AND public.is_admin(auth.uid())
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can update funds in their community" ON public.events;
CREATE POLICY "Admins can update funds in their community"
  ON public.events
  FOR UPDATE
  USING (
    community_id = get_user_community_id()
    AND public.is_admin(auth.uid())
    AND public.is_user_approved(auth.uid())
  )
  WITH CHECK (
    community_id = get_user_community_id()
    AND public.is_admin(auth.uid())
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can delete funds in their community" ON public.events;
CREATE POLICY "Admins can delete funds in their community"
  ON public.events
  FOR DELETE
  USING (
    community_id = get_user_community_id()
    AND public.is_admin(auth.uid())
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Users can view transactions for community events" ON public.event_transactions;
CREATE POLICY "Users can view transactions for community events"
  ON public.event_transactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.community_id = get_user_community_id()
    )
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Assigned users can insert fund transactions" ON public.event_transactions;
CREATE POLICY "Assigned users can insert fund transactions"
  ON public.event_transactions
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id
        AND e.community_id = get_user_community_id()
    )
    AND public.is_user_approved(auth.uid())
    AND (
      (type = 'income' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer', 'collector'))
      OR
      (type = 'expense' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer'))
    )
  );

DROP POLICY IF EXISTS "Assigned users can update their allowed transactions" ON public.event_transactions;
CREATE POLICY "Assigned users can update their allowed transactions"
  ON public.event_transactions
  FOR UPDATE
  USING (
    created_by = auth.uid()
    AND public.is_user_approved(auth.uid())
    AND (
      (type = 'income' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer', 'collector'))
      OR
      (type = 'expense' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer'))
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_user_approved(auth.uid())
    AND (
      (type = 'income' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer', 'collector'))
      OR
      (type = 'expense' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer'))
    )
  );

DROP POLICY IF EXISTS "Assigned users can delete their allowed transactions" ON public.event_transactions;
CREATE POLICY "Assigned users can delete their allowed transactions"
  ON public.event_transactions
  FOR DELETE
  USING (
    created_by = auth.uid()
    AND public.is_user_approved(auth.uid())
    AND (
      (type = 'income' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer', 'collector'))
      OR
      (type = 'expense' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer'))
    )
  );

DROP POLICY IF EXISTS "Community members can view fund roles" ON public.fund_roles;
CREATE POLICY "Community members can view fund roles"
  ON public.fund_roles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id
        AND e.community_id = get_user_community_id()
    )
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can manage treasurers" ON public.fund_roles;
CREATE POLICY "Admins can manage treasurers"
  ON public.fund_roles
  FOR INSERT
  WITH CHECK (
    role = 'treasurer'
    AND assigned_by = auth.uid()
    AND public.is_admin(auth.uid())
    AND public.is_user_approved(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id
        AND e.community_id = get_user_community_id()
    )
  );

DROP POLICY IF EXISTS "Treasurers can assign collectors" ON public.fund_roles;
CREATE POLICY "Treasurers can assign collectors"
  ON public.fund_roles
  FOR INSERT
  WITH CHECK (
    role = 'collector'
    AND assigned_by = auth.uid()
    AND public.get_fund_role(event_id, auth.uid()) = 'treasurer'
    AND public.is_user_approved(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id
        AND e.community_id = get_user_community_id()
    )
  );

DROP POLICY IF EXISTS "Admins can update treasurer roles" ON public.fund_roles;
CREATE POLICY "Admins can update treasurer roles"
  ON public.fund_roles
  FOR UPDATE
  USING (
    public.is_admin(auth.uid())
    AND public.is_user_approved(auth.uid())
  )
  WITH CHECK (
    role = 'treasurer'
    AND assigned_by = auth.uid()
    AND public.is_admin(auth.uid())
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Treasurers can update collector roles" ON public.fund_roles;
CREATE POLICY "Treasurers can update collector roles"
  ON public.fund_roles
  FOR UPDATE
  USING (
    public.get_fund_role(event_id, auth.uid()) = 'treasurer'
    AND public.is_user_approved(auth.uid())
  )
  WITH CHECK (
    role = 'collector'
    AND assigned_by = auth.uid()
    AND public.get_fund_role(event_id, auth.uid()) = 'treasurer'
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can delete treasurers" ON public.fund_roles;
CREATE POLICY "Admins can delete treasurers"
  ON public.fund_roles
  FOR DELETE
  USING (
    role = 'treasurer'
    AND public.is_admin(auth.uid())
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Treasurers can delete collectors" ON public.fund_roles;
CREATE POLICY "Treasurers can delete collectors"
  ON public.fund_roles
  FOR DELETE
  USING (
    role = 'collector'
    AND public.get_fund_role(event_id, auth.uid()) = 'treasurer'
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.notifications
  FOR SELECT
  USING (
    user_id = auth.uid()
    AND public.is_user_approved(auth.uid())
  );

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.notifications
  FOR UPDATE
  USING (
    user_id = auth.uid()
    AND public.is_user_approved(auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_user_approved(auth.uid())
  );

NOTIFY pgrst, 'reload schema';