-- Migration: real activity tracking for platform DAU/MAU.
--
-- Why: `platform_get_community_dashboard_v2` computed DAU/MAU from
-- `profiles.updated_at` — a column that has never existed on `public.profiles`.
-- Every call to that function raised `42703 column "updated_at" does not exist`,
-- and because the admin console destructured only `data` (never `error`) the
-- failure surfaced as a dashboard full of zeroes instead of an error.
--
-- This migration gives the platform a real activity signal in two parts:
--   1. `profiles.last_active_at` + `touch_last_active()` — an explicit heartbeat
--      the app pings on foreground. Accurate going forward, empty for history.
--   2. `v_user_activity` — a derived signal UNIONing the timestamps the app
--      already writes, so DAU/MAU are populated retroactively from day one.
-- `user_last_seen` combines both and is what the dashboard RPCs read.

-- 1. Heartbeat column -------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_community_last_active
  ON public.profiles (community_id, last_active_at DESC);

COMMENT ON COLUMN public.profiles.last_active_at IS
  'Last app foreground ping, written only by touch_last_active(). NULL for users who have not opened the app since 2026-09-10.';

-- 2. Heartbeat RPC ----------------------------------------------------------
-- Takes no arguments on purpose: a SECURITY DEFINER function with a
-- caller-supplied user id is an RLS bypass. It can only ever stamp auth.uid().

CREATE OR REPLACE FUNCTION public.touch_last_active()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET last_active_at = now()
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.touch_last_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_last_active() TO authenticated;

-- 3. Derived activity signal ------------------------------------------------
-- Every table below is something a resident had to actively do. Deliberately
-- excluded: `profiles.created_at` (signing up is not recurring activity — it is
-- counted separately as new_residents_30d).

-- `security_invoker = true` is mandatory: a plain view runs with the *owner's*
-- rights and would hand every authenticated user the whole platform's activity
-- stream. With invoker rights the caller's RLS applies, while the platform_*
-- SECURITY DEFINER functions below still read it in full as the table owner.

CREATE OR REPLACE VIEW public.v_user_activity
WITH (security_invoker = true) AS
  SELECT buyer_id   AS user_id, created_at FROM public.mcn_preorder_orders WHERE buyer_id IS NOT NULL
  UNION ALL
  SELECT created_by AS user_id, created_at FROM public.mcn_preorder_drops  WHERE created_by IS NOT NULL
  UNION ALL
  SELECT owner_id   AS user_id, created_at FROM public.mcn_listings        WHERE owner_id IS NOT NULL
  UNION ALL
  SELECT user_id,               created_at FROM public.ratings             WHERE user_id IS NOT NULL
  UNION ALL
  SELECT user_id,               created_at FROM public.provider_hires      WHERE user_id IS NOT NULL
  UNION ALL
  SELECT created_by AS user_id, created_at FROM public.service_visits      WHERE created_by IS NOT NULL
  UNION ALL
  SELECT created_by AS user_id, created_at FROM public.community_events    WHERE created_by IS NOT NULL
  UNION ALL
  SELECT created_by AS user_id, created_at FROM public.event_transactions  WHERE created_by IS NOT NULL;

COMMENT ON VIEW public.v_user_activity IS
  'Derived activity stream: one row per deliberate user write. Backs DAU/MAU for history predating the last_active_at heartbeat.';

-- `user_last_seen` merges the heartbeat with the derived stream. Same
-- invoker-rights reasoning as above.

CREATE OR REPLACE VIEW public.user_last_seen
WITH (security_invoker = true) AS
  SELECT
    p.id            AS user_id,
    p.community_id,
    GREATEST(
      COALESCE(p.last_active_at, '-infinity'::timestamptz),
      COALESCE(a.last_action_at, '-infinity'::timestamptz)
    ) AS last_seen_at
  FROM public.profiles p
  LEFT JOIN (
    SELECT user_id, MAX(created_at) AS last_action_at
    FROM public.v_user_activity
    GROUP BY user_id
  ) a ON a.user_id = p.id
  WHERE p.removed_at IS NULL;

COMMENT ON VIEW public.user_last_seen IS
  'Best available last-seen timestamp per active profile: heartbeat or derived activity, whichever is later.';

REVOKE ALL ON public.v_user_activity FROM anon;
REVOKE ALL ON public.user_last_seen  FROM anon;
GRANT SELECT ON public.v_user_activity TO authenticated;
GRANT SELECT ON public.user_last_seen  TO authenticated;

NOTIFY pgrst, 'reload schema';
