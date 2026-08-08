-- supabase/migrations/20260903000300_funds_access_status_scope.sql

-- The function RETURNS TABLE, so the signature change requires a DROP first —
-- CREATE OR REPLACE fails with a return-type mismatch (docs/CLAUDE.md §9).
DROP FUNCTION IF EXISTS public.get_funds_access_status(uuid);

CREATE OR REPLACE FUNCTION public.get_funds_access_status()
RETURNS TABLE (
  status           text,
  request_id       uuid,
  rejection_reason text,
  decided_at       timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT far.status, far.id, far.rejection_reason, far.decided_at
  FROM public.funds_access_requests far
  WHERE far.community_id = public.get_user_community_id()
  ORDER BY far.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_funds_access_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_funds_access_status() TO authenticated;

NOTIFY pgrst, 'reload schema';
