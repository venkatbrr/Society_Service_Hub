-- supabase/migrations/20260903000200_scope_community_reads.sql

-- Replace the world-readable policy. The platform-admin policy already exists
-- separately ("Platform admins can view all communities") and is left alone.
DROP POLICY IF EXISTS "Anyone can view communities" ON public.communities;

CREATE POLICY communities_select_own
  ON public.communities FOR SELECT
  TO authenticated
  USING (id = public.get_user_community_id());

-- Pre-join read for the approved-request screen: the founder must see the code
-- for the community their own approved request produced, before they join it.
CREATE OR REPLACE FUNCTION public.get_my_requested_community()
RETURNS TABLE (
  id            uuid,
  name          text,
  code          text,
  blocks_enabled boolean,
  block_label   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.code, c.blocks_enabled, c.block_label
  FROM public.community_requests r
  JOIN public.communities c ON c.id = r.resulting_community_id
  WHERE r.requested_by = auth.uid()
    AND r.status = 'approved'
    AND r.resulting_community_id IS NOT NULL
  ORDER BY r.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_requested_community() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_requested_community() TO authenticated;

NOTIFY pgrst, 'reload schema';
