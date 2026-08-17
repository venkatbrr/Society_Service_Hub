-- Notification Preferences Table
-- Allows residents to mute specific broadcast channels (e.g. food_drops, parent_corner).

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel    TEXT NOT NULL CHECK (channel IN ('food_drops', 'parent_corner')),
  muted      BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_preferences_select_own ON public.notification_preferences;
CREATE POLICY notification_preferences_select_own ON public.notification_preferences
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS notification_preferences_insert_own ON public.notification_preferences;
CREATE POLICY notification_preferences_insert_own ON public.notification_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notification_preferences_update_own ON public.notification_preferences;
CREATE POLICY notification_preferences_update_own ON public.notification_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notification_preferences_delete_own ON public.notification_preferences;
CREATE POLICY notification_preferences_delete_own ON public.notification_preferences
  FOR DELETE USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_channel_muted(p_user_id UUID, p_channel TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT muted FROM public.notification_preferences
     WHERE user_id = p_user_id AND channel = p_channel),
    false
  );
$$;

NOTIFY pgrst, 'reload schema';
