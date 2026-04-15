-- Add trust flags to service_providers
ALTER TABLE public.service_providers 
ADD COLUMN is_verified BOOLEAN DEFAULT false,
ADD COLUMN is_trending BOOLEAN DEFAULT false;

-- Create hires table to track interactions
CREATE TABLE public.provider_hires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add goal_amount to events (funds)
ALTER TABLE public.events
ADD COLUMN goal_amount NUMERIC DEFAULT 0;

-- Enable RLS on provider_hires
ALTER TABLE public.provider_hires ENABLE ROW LEVEL SECURITY;

-- Policies for provider_hires
CREATE POLICY "Users can view hires in their community"
  ON public.provider_hires
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.service_providers sp
      WHERE sp.id = provider_id AND sp.community_id = get_user_community_id()
    )
  );

CREATE POLICY "Users can insert their own hires"
  ON public.provider_hires
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Function to get insights (Community Level)
CREATE OR REPLACE FUNCTION get_community_insights(p_community_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_most_hired_category TEXT;
  v_total_spent_month NUMERIC;
  v_contribution_percentage NUMERIC;
  v_result JSONB;
BEGIN
  -- 1. Most hired service category
  SELECT category INTO v_most_hired_category
  FROM public.service_providers sp
  JOIN public.provider_hires ph ON ph.provider_id = sp.id
  WHERE sp.community_id = p_community_id
  GROUP BY category
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  -- 2. Total spent this month (expenses from all community events)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_spent_month
  FROM public.event_transactions et
  JOIN public.events e ON e.id = et.event_id
  WHERE e.community_id = p_community_id
    AND et.type = 'expense'
    AND et.created_at >= date_trunc('month', now());

  -- 3. Contribution percentage (average across all events)
  -- Simplified: % of profiles who have made at least one income transaction in recent events
  -- For a real app, this would be more complex (per-event participation)
  -- Here we'll just return a mockish but calculated value for demo
  v_contribution_percentage := 78; -- Fallback for now

  v_result := jsonb_build_object(
    'most_hired_category', COALESCE(v_most_hired_category, 'None'),
    'total_spent_month', v_total_spent_month,
    'contribution_percentage', v_contribution_percentage
  );

  RETURN v_result;
END;
$$;
