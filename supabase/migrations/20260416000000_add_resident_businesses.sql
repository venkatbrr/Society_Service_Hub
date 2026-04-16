-- migration 20260416000000_add_resident_businesses.sql

-- Add flat_number to profiles if missing (needed for RPC)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS flat_number TEXT;

-- resident_businesses: basically a home business run by a resident
CREATE TABLE public.resident_businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  cover_photo_url TEXT,
  whatsapp_number TEXT,
  phone_number TEXT,
  operating_hours TEXT,
  order_cutoff TEXT,
  is_accepting_orders BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT one_business_per_user_per_community UNIQUE (owner_id, community_id)
);

-- business_offerings: catalog items for a business
CREATE TABLE public.business_offerings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.resident_businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL,
  price_unit TEXT DEFAULT 'per item',
  category TEXT,
  photo_url TEXT,
  availability TEXT DEFAULT 'always',
  is_available BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- business_inquiries: tracks interactions (WhatsApp/Call)
CREATE TABLE public.business_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.resident_businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inquiry_type TEXT NOT NULL CHECK (inquiry_type IN ('whatsapp', 'call')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Modify existing tables to support businesses
ALTER TABLE public.ratings ALTER COLUMN provider_id DROP NOT NULL;
ALTER TABLE public.ratings ADD COLUMN business_id UUID REFERENCES public.resident_businesses(id) ON DELETE CASCADE;

ALTER TABLE public.favorites ALTER COLUMN provider_id DROP NOT NULL;
ALTER TABLE public.favorites ADD COLUMN business_id UUID REFERENCES public.resident_businesses(id) ON DELETE CASCADE;

-- Constraints to ensure exactly one target
ALTER TABLE public.ratings ADD CONSTRAINT rating_target_check
  CHECK (
    (provider_id IS NOT NULL AND business_id IS NULL) OR
    (provider_id IS NULL AND business_id IS NOT NULL)
  );

ALTER TABLE public.favorites ADD CONSTRAINT favorite_target_check
  CHECK (
    (provider_id IS NOT NULL AND business_id IS NULL) OR
    (provider_id IS NULL AND business_id IS NOT NULL)
  );

-- Unique constraints for user-business pairs
CREATE UNIQUE INDEX IF NOT EXISTS ratings_user_business_idx ON public.ratings (user_id, business_id) WHERE business_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_business_idx ON public.favorites (user_id, business_id) WHERE business_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.resident_businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_inquiries ENABLE ROW LEVEL SECURITY;

-- resident_businesses policies
CREATE POLICY "Community members can view businesses"
  ON public.resident_businesses FOR SELECT
  USING (community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create their own business"
  ON public.resident_businesses FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
    AND community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Owners can update their business"
  ON public.resident_businesses FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can delete their business"
  ON public.resident_businesses FOR DELETE
  USING (owner_id = auth.uid());

-- business_offerings policies
CREATE POLICY "Community members can view offerings"
  ON public.business_offerings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.resident_businesses rb
      WHERE rb.id = business_offerings.business_id
      AND rb.community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Business owners can manage offerings"
  ON public.business_offerings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.resident_businesses rb
      WHERE rb.id = business_offerings.business_id
      AND rb.owner_id = auth.uid()
    )
  );

-- business_inquiries policies
CREATE POLICY "Users can log inquiries"
  ON public.business_inquiries FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Business owners can view their inquiries"
  ON public.business_inquiries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.resident_businesses rb
      WHERE rb.id = business_inquiries.business_id
      AND rb.owner_id = auth.uid()
    )
  );

-- Update Ratings Select policy to support businesses
DROP POLICY IF EXISTS "Users can view ratings in their community" ON public.ratings;
CREATE POLICY "Users can view ratings in their community"
  ON public.ratings
  FOR SELECT
  USING (
    (provider_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.service_providers sp 
      WHERE sp.id = provider_id AND sp.community_id = get_user_community_id()
    ))
    OR
    (business_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.resident_businesses rb
      WHERE rb.id = business_id AND rb.community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
    ))
  );

-- RPC: Get business listing with aggregated data
CREATE OR REPLACE FUNCTION get_community_businesses(p_community_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  category TEXT,
  cover_photo_url TEXT,
  is_accepting_orders BOOLEAN,
  operating_hours TEXT,
  order_cutoff TEXT,
  owner_id UUID,
  owner_name TEXT,
  owner_flat TEXT,
  avg_rating NUMERIC,
  rating_count BIGINT,
  inquiry_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rb.id,
    rb.name,
    rb.description,
    rb.category,
    rb.cover_photo_url,
    rb.is_accepting_orders,
    rb.operating_hours,
    rb.order_cutoff,
    rb.owner_id,
    p.full_name AS owner_name,
    p.flat_number AS owner_flat,
    COALESCE(AVG(r.rating), 0)::NUMERIC AS avg_rating,
    COUNT(DISTINCT r.id) AS rating_count,
    COUNT(DISTINCT bi.id) AS inquiry_count
  FROM public.resident_businesses rb
  JOIN public.profiles p ON p.id = rb.owner_id
  LEFT JOIN public.ratings r ON r.business_id = rb.id
  LEFT JOIN public.business_inquiries bi ON bi.business_id = rb.id
  WHERE rb.community_id = p_community_id
  GROUP BY rb.id, p.full_name, p.flat_number
  ORDER BY rb.is_accepting_orders DESC, avg_rating DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
