ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS app_role TEXT NOT NULL DEFAULT 'resident'
CHECK (app_role IN ('admin', 'resident'));

UPDATE public.profiles
SET app_role = 'admin'
WHERE id = (
  SELECT id
  FROM public.profiles
  ORDER BY created_at ASC, id ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1
  FROM public.profiles
  WHERE app_role = 'admin'
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  is_first_user BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first_user;

  INSERT INTO public.profiles (id, full_name, avatar_url, app_role)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    CASE WHEN is_first_user THEN 'admin' ELSE 'resident' END
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TABLE IF NOT EXISTS public.fund_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('treasurer', 'collector')),
  assigned_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE public.fund_roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.event_transactions
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS contributor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.event_transactions
SET title = COALESCE(NULLIF(description, ''), category, CASE WHEN type = 'income' THEN 'Contribution' ELSE 'Expense' END)
WHERE title IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS unique_income_contribution_per_member
ON public.event_transactions(event_id, contributor_user_id)
WHERE type = 'income' AND contributor_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
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
      AND app_role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_fund_role(p_event_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_role TEXT;
BEGIN
  IF public.is_admin(p_user_id) THEN
    RETURN 'admin';
  END IF;

  SELECT fr.role
  INTO resolved_role
  FROM public.fund_roles fr
  WHERE fr.event_id = p_event_id
    AND fr.user_id = COALESCE(p_user_id, auth.uid())
  LIMIT 1;

  RETURN COALESCE(resolved_role, 'resident');
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_fund_role_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  role_count INTEGER;
  fund_community_id UUID;
  member_community_id UUID;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    SELECT community_id INTO fund_community_id
    FROM public.events
    WHERE id = NEW.event_id;

    SELECT community_id INTO member_community_id
    FROM public.profiles
    WHERE id = NEW.user_id;

    IF fund_community_id IS NULL THEN
      RAISE EXCEPTION 'Fund not found';
    END IF;

    IF member_community_id IS DISTINCT FROM fund_community_id THEN
      RAISE EXCEPTION 'Assigned member must belong to the same community';
    END IF;

    SELECT COUNT(*)
    INTO role_count
    FROM public.fund_roles
    WHERE event_id = NEW.event_id
      AND role = NEW.role
      AND (TG_OP = 'INSERT' OR id <> NEW.id);

    IF NEW.role = 'treasurer' AND role_count >= 2 THEN
      RAISE EXCEPTION 'A fund can have at most 2 treasurers';
    END IF;

    IF NEW.role = 'collector' AND role_count >= 6 THEN
      RAISE EXCEPTION 'A fund can have at most 6 collectors';
    END IF;

    NEW.updated_at := now();
  END IF;

  IF TG_OP = 'DELETE'
    OR (TG_OP = 'UPDATE' AND OLD.role = 'treasurer' AND NEW.role <> 'treasurer') THEN
    SELECT COUNT(*)
    INTO role_count
    FROM public.fund_roles
    WHERE event_id = OLD.event_id
      AND role = 'treasurer'
      AND id <> OLD.id;

    IF role_count < 1 THEN
      RAISE EXCEPTION 'A fund must always have at least 1 treasurer';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS fund_role_guard ON public.fund_roles;
CREATE TRIGGER fund_role_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.fund_roles
FOR EACH ROW EXECUTE FUNCTION public.validate_fund_role_change();

CREATE OR REPLACE FUNCTION public.validate_event_transaction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  fund_community_id UUID;
  contributor_community_id UUID;
BEGIN
  IF COALESCE(NULLIF(NEW.title, ''), '') = '' THEN
    RAISE EXCEPTION 'Transaction title is required';
  END IF;

  SELECT community_id INTO fund_community_id
  FROM public.events
  WHERE id = NEW.event_id;

  IF NEW.type = 'income' THEN
    IF NEW.contributor_user_id IS NULL THEN
      RAISE EXCEPTION 'Contributor is required for contributions';
    END IF;

    SELECT community_id INTO contributor_community_id
    FROM public.profiles
    WHERE id = NEW.contributor_user_id;

    IF contributor_community_id IS DISTINCT FROM fund_community_id THEN
      RAISE EXCEPTION 'Contributor must belong to the same community';
    END IF;
  ELSE
    NEW.contributor_user_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_transaction_guard ON public.event_transactions;
CREATE TRIGGER event_transaction_guard
BEFORE INSERT OR UPDATE ON public.event_transactions
FOR EACH ROW EXECUTE FUNCTION public.validate_event_transaction();

DROP POLICY IF EXISTS "Users can insert events in their community" ON public.events;
DROP POLICY IF EXISTS "Users can update events they created" ON public.events;
DROP POLICY IF EXISTS "Users can delete events they created" ON public.events;
DROP POLICY IF EXISTS "Users can insert transactions for community events" ON public.event_transactions;
DROP POLICY IF EXISTS "Users can update transactions they created" ON public.event_transactions;
DROP POLICY IF EXISTS "Users can delete transactions they created" ON public.event_transactions;

CREATE POLICY "Admins can create funds in their community"
  ON public.events
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND community_id = get_user_community_id()
    AND public.is_admin(auth.uid())
  );

CREATE POLICY "Admins can update funds in their community"
  ON public.events
  FOR UPDATE
  USING (
    community_id = get_user_community_id()
    AND public.is_admin(auth.uid())
  )
  WITH CHECK (
    community_id = get_user_community_id()
    AND public.is_admin(auth.uid())
  );

CREATE POLICY "Admins can delete funds in their community"
  ON public.events
  FOR DELETE
  USING (
    community_id = get_user_community_id()
    AND public.is_admin(auth.uid())
  );

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
    AND (
      (type = 'income' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer', 'collector'))
      OR
      (type = 'expense' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer'))
    )
  );

CREATE POLICY "Assigned users can update their allowed transactions"
  ON public.event_transactions
  FOR UPDATE
  USING (
    created_by = auth.uid()
    AND (
      (type = 'income' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer', 'collector'))
      OR
      (type = 'expense' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer'))
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    AND (
      (type = 'income' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer', 'collector'))
      OR
      (type = 'expense' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer'))
    )
  );

CREATE POLICY "Assigned users can delete their allowed transactions"
  ON public.event_transactions
  FOR DELETE
  USING (
    created_by = auth.uid()
    AND (
      (type = 'income' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer', 'collector'))
      OR
      (type = 'expense' AND public.get_fund_role(event_id, auth.uid()) IN ('admin', 'treasurer'))
    )
  );

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
  );

CREATE POLICY "Admins can manage treasurers"
  ON public.fund_roles
  FOR INSERT
  WITH CHECK (
    role = 'treasurer'
    AND assigned_by = auth.uid()
    AND public.is_admin(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id
        AND e.community_id = get_user_community_id()
    )
  );

CREATE POLICY "Treasurers can assign collectors"
  ON public.fund_roles
  FOR INSERT
  WITH CHECK (
    role = 'collector'
    AND assigned_by = auth.uid()
    AND public.get_fund_role(event_id, auth.uid()) = 'treasurer'
    AND EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id
        AND e.community_id = get_user_community_id()
    )
  );

CREATE POLICY "Admins can update treasurer roles"
  ON public.fund_roles
  FOR UPDATE
  USING (
    public.is_admin(auth.uid())
  )
  WITH CHECK (
    role = 'treasurer'
    AND assigned_by = auth.uid()
    AND public.is_admin(auth.uid())
  );

CREATE POLICY "Treasurers can update collector roles"
  ON public.fund_roles
  FOR UPDATE
  USING (
    public.get_fund_role(event_id, auth.uid()) = 'treasurer'
  )
  WITH CHECK (
    role = 'collector'
    AND assigned_by = auth.uid()
    AND public.get_fund_role(event_id, auth.uid()) = 'treasurer'
  );

CREATE POLICY "Admins can delete treasurers"
  ON public.fund_roles
  FOR DELETE
  USING (
    role = 'treasurer'
    AND public.is_admin(auth.uid())
  );

CREATE POLICY "Treasurers can delete collectors"
  ON public.fund_roles
  FOR DELETE
  USING (
    role = 'collector'
    AND public.get_fund_role(event_id, auth.uid()) = 'treasurer'
  );
