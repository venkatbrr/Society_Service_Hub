-- Create Events table
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create Event Transactions table
CREATE TABLE public.event_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_transactions ENABLE ROW LEVEL SECURITY;

-- Policies for Events
CREATE POLICY "Users can view events in their community"
  ON public.events
  FOR SELECT
  USING (community_id = get_user_community_id());

CREATE POLICY "Users can insert events in their community"
  ON public.events
  FOR INSERT
  WITH CHECK (community_id = get_user_community_id() AND created_by = auth.uid());

CREATE POLICY "Users can update events they created"
  ON public.events
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete events they created"
  ON public.events
  FOR DELETE
  USING (created_by = auth.uid());

-- Policies for Event Transactions
CREATE POLICY "Users can view transactions for community events"
  ON public.event_transactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.community_id = get_user_community_id()
    )
  );

CREATE POLICY "Users can insert transactions for community events"
  ON public.event_transactions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.community_id = get_user_community_id()
    ) AND created_by = auth.uid()
  );

CREATE POLICY "Users can update transactions they created"
  ON public.event_transactions
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete transactions they created"
  ON public.event_transactions
  FOR DELETE
  USING (created_by = auth.uid());
