-- Enable pgcrypto for UUIDs
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create Communities table
CREATE TABLE public.communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,       
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create Profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  community_id UUID REFERENCES public.communities(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create Service Providers table
CREATE TABLE public.service_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  category TEXT NOT NULL,          
  description TEXT,
  flat_block TEXT,                 
  avg_rating NUMERIC(2,1) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create Favorites table
CREATE TABLE public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider_id)
);

-- Create Ratings table
CREATE TABLE public.ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider_id)
);

-- Set up Row Level Security (RLS)
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

-- Helper function to extract community_id from JWT app_metadata
CREATE OR REPLACE FUNCTION get_user_community_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'community_id')::UUID;
$$;

-- Policies for Communities
CREATE POLICY "Anyone can view communities"
  ON public.communities
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create communities"
  ON public.communities
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Policies for Profiles
CREATE POLICY "Users can view profiles in their community"
  ON public.profiles
  FOR SELECT
  USING (community_id = get_user_community_id() OR id = auth.uid());

CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Policies for Service Providers
CREATE POLICY "Users can view providers in their community"
  ON public.service_providers
  FOR SELECT
  USING (community_id = get_user_community_id());

CREATE POLICY "Users can insert providers in their community"
  ON public.service_providers
  FOR INSERT
  WITH CHECK (community_id = get_user_community_id() AND created_by = auth.uid());

CREATE POLICY "Users can update providers they created"
  ON public.service_providers
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete providers they created"
  ON public.service_providers
  FOR DELETE
  USING (created_by = auth.uid());

-- Policies for Favorites
CREATE POLICY "Users can view their own favorites"
  ON public.favorites
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own favorites"
  ON public.favorites
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own favorites"
  ON public.favorites
  FOR DELETE
  USING (user_id = auth.uid());

-- Policies for Ratings
CREATE POLICY "Users can view ratings in their community"
  ON public.ratings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.service_providers sp 
      WHERE sp.id = provider_id AND sp.community_id = get_user_community_id()
    )
  );

CREATE POLICY "Users can insert their own ratings"
  ON public.ratings
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own ratings"
  ON public.ratings
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Function & Trigger to update avg_rating on service_providers when a rating is added/updated
CREATE OR REPLACE FUNCTION update_provider_rating()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.service_providers
    SET rating_count = rating_count + 1,
        avg_rating = (avg_rating * rating_count + NEW.rating) / (rating_count + 1)
    WHERE id = NEW.provider_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.service_providers
    SET avg_rating = (avg_rating * rating_count - OLD.rating + NEW.rating) / rating_count
    WHERE id = NEW.provider_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.service_providers
    SET rating_count = GREATEST(rating_count - 1, 0),
        avg_rating = CASE 
          WHEN rating_count - 1 > 0 THEN (avg_rating * rating_count - OLD.rating) / (rating_count - 1)
          ELSE 0
        END
    WHERE id = OLD.provider_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_rating_change
AFTER INSERT OR UPDATE OR DELETE ON public.ratings
FOR EACH ROW EXECUTE FUNCTION update_provider_rating();

-- Function & Trigger to automatically create a profile after auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    new.id, 
    new.raw_user_meta_data->>'full_name', 
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
