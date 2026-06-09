-- Migration to add schools table for MCN Schools and Comparison features

-- 1. Create schools table
CREATE TABLE IF NOT EXISTS public.schools (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_by    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  level         TEXT NOT NULL CHECK (level IN ('pre_school', 'primary', 'high_school', 'all_in_one')),
  syllabus      TEXT NOT NULL, -- e.g. CBSE, ICSE, State Board, IB, Cambridge
  distance      NUMERIC(4,1) NOT NULL CHECK (distance >= 0), -- distance in km from the society
  fee_range     TEXT NOT NULL, -- e.g. "₹50,000 - ₹80,000 / year"
  facilities    TEXT[] NOT NULL DEFAULT '{}', -- e.g. ['Transport', 'Playground', 'Science Lab', 'Smart Classes']
  description   TEXT,
  contact_phone TEXT,
  website       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Enable Row Level Security
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- 3. Define RLS Policies
DROP POLICY IF EXISTS "schools_select" ON public.schools;
CREATE POLICY "schools_select"
  ON public.schools FOR SELECT
  USING (community_id = get_user_community_id());

DROP POLICY IF EXISTS "schools_insert" ON public.schools;
CREATE POLICY "schools_insert"
  ON public.schools FOR INSERT
  WITH CHECK (community_id = get_user_community_id() AND created_by = auth.uid());

DROP POLICY IF EXISTS "schools_update" ON public.schools;
CREATE POLICY "schools_update"
  ON public.schools FOR UPDATE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND app_role = 'community_lead' AND community_id = get_user_community_id()
    )
  );

DROP POLICY IF EXISTS "schools_delete" ON public.schools;
CREATE POLICY "schools_delete"
  ON public.schools FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND app_role = 'community_lead' AND community_id = get_user_community_id()
    )
  );

-- 4. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
