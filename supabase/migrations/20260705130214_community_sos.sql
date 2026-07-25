-- ============================================================
-- Community SOS
-- - Blood donor registry (community-scoped, opt-in)
-- - Emergency contacts (global defaults + community-managed)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.blood_donors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blood_group TEXT NOT NULL CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  contact_phone TEXT NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  note TEXT CHECK (note IS NULL OR length(note) <= 140),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, community_id)
);

CREATE INDEX IF NOT EXISTS blood_donors_community_available_group_idx
  ON public.blood_donors (community_id, is_available, blood_group);

CREATE INDEX IF NOT EXISTS blood_donors_community_created_idx
  ON public.blood_donors (community_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_blood_donors_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS blood_donors_updated_at_trigger ON public.blood_donors;
CREATE TRIGGER blood_donors_updated_at_trigger
  BEFORE UPDATE ON public.blood_donors
  FOR EACH ROW EXECUTE FUNCTION public.touch_blood_donors_updated_at();

ALTER TABLE public.blood_donors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view blood donors in own community" ON public.blood_donors;
CREATE POLICY "Users can view blood donors in own community"
  ON public.blood_donors
  FOR SELECT
  USING (community_id = public.get_user_community_id());

DROP POLICY IF EXISTS "Users can insert own donor profile" ON public.blood_donors;
CREATE POLICY "Users can insert own donor profile"
  ON public.blood_donors
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND community_id = public.get_user_community_id()
  );

DROP POLICY IF EXISTS "Users can update own donor profile" ON public.blood_donors;
CREATE POLICY "Users can update own donor profile"
  ON public.blood_donors
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own donor profile" ON public.blood_donors;
CREATE POLICY "Users can delete own donor profile"
  ON public.blood_donors
  FOR DELETE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Leads admins can moderate donor profile" ON public.blood_donors;
CREATE POLICY "Leads admins can moderate donor profile"
  ON public.blood_donors
  FOR DELETE
  USING (
    public.is_platform_admin(auth.uid())
    OR (
      community_id = public.get_user_community_id()
      AND public.is_community_lead(auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blood_donors TO authenticated;

CREATE TABLE IF NOT EXISTS public.emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('hospital','ambulance','police','fire','security','helpline','other')),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  description TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS emergency_contacts_scope_active_sort_idx
  ON public.emergency_contacts (community_id, is_active, sort_order, name);

CREATE INDEX IF NOT EXISTS emergency_contacts_global_active_sort_idx
  ON public.emergency_contacts (is_active, sort_order, name)
  WHERE community_id IS NULL;

CREATE OR REPLACE FUNCTION public.touch_emergency_contacts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS emergency_contacts_updated_at_trigger ON public.emergency_contacts;
CREATE TRIGGER emergency_contacts_updated_at_trigger
  BEFORE UPDATE ON public.emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION public.touch_emergency_contacts_updated_at();

ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view scoped emergency contacts" ON public.emergency_contacts;
CREATE POLICY "Users can view scoped emergency contacts"
  ON public.emergency_contacts
  FOR SELECT
  USING (
    community_id = public.get_user_community_id()
    OR community_id IS NULL
  );

DROP POLICY IF EXISTS "Leads admins can insert emergency contacts" ON public.emergency_contacts;
CREATE POLICY "Leads admins can insert emergency contacts"
  ON public.emergency_contacts
  FOR INSERT
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR (
      community_id = public.get_user_community_id()
      AND public.is_community_lead(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Leads admins can update emergency contacts" ON public.emergency_contacts;
CREATE POLICY "Leads admins can update emergency contacts"
  ON public.emergency_contacts
  FOR UPDATE
  USING (
    public.is_platform_admin(auth.uid())
    OR (
      community_id = public.get_user_community_id()
      AND public.is_community_lead(auth.uid())
    )
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR (
      community_id = public.get_user_community_id()
      AND public.is_community_lead(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Leads admins can delete emergency contacts" ON public.emergency_contacts;
CREATE POLICY "Leads admins can delete emergency contacts"
  ON public.emergency_contacts
  FOR DELETE
  USING (
    public.is_platform_admin(auth.uid())
    OR (
      community_id = public.get_user_community_id()
      AND public.is_community_lead(auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.emergency_contacts TO authenticated;

INSERT INTO public.emergency_contacts (community_id, category, name, phone, description, sort_order, is_active, created_by)
SELECT NULL, seed.category, seed.name, seed.phone, seed.description, seed.sort_order, true, NULL
FROM (
  VALUES
    ('helpline', 'National Emergency (all-in-one)', '112', '24x7', 0),
    ('ambulance', 'Ambulance', '108', '24x7', 10),
    ('ambulance', 'Medical Helpline', '102', '24x7', 11),
    ('police', 'Police', '100', '24x7', 20),
    ('fire', 'Fire', '101', '24x7', 30),
    ('helpline', 'Women Helpline', '1091', '24x7', 40),
    ('helpline', 'Child Helpline', '1098', '24x7', 41),
    ('helpline', 'Road Accident Emergency', '1073', '24x7', 42)
) AS seed(category, name, phone, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.emergency_contacts ec
  WHERE ec.community_id IS NULL
    AND ec.category = seed.category
    AND ec.name = seed.name
    AND ec.phone = seed.phone
);
