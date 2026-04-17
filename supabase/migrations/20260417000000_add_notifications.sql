-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- e.g. 'new_visit'
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}', -- store extra info like visit_id
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add push token to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Notifications
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Function to handle new service visit notification
CREATE OR REPLACE FUNCTION public.handle_new_visit_notification()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert notifications for all other residents in the community
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT 
    p.id, 
    'new_visit',
    'New Planned Visit',
    (SELECT full_name FROM profiles WHERE id = NEW.created_by) || ' scheduled a ' || NEW.category || ' visit.',
    jsonb_build_object('visit_id', NEW.id)
  FROM public.profiles p
  WHERE p.community_id = NEW.community_id
    AND p.id != NEW.created_by;
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to notify on new visit
CREATE TRIGGER on_service_visit_created
  AFTER INSERT ON public.service_visits
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_visit_notification();

-- Grant access to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
