-- Migration: Add feedback_reports table for bug reports and feature ideas
-- Phase 2 of profile font feedback funds copy plan

CREATE TABLE IF NOT EXISTS public.feedback_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  community_id uuid REFERENCES public.communities(id),
  kind text NOT NULL CHECK (kind IN ('bug', 'feature')),
  message text NOT NULL,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feedback_reports_insert_own ON public.feedback_reports;
CREATE POLICY feedback_reports_insert_own ON public.feedback_reports
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS feedback_reports_select_own ON public.feedback_reports;
CREATE POLICY feedback_reports_select_own ON public.feedback_reports
  FOR SELECT USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
