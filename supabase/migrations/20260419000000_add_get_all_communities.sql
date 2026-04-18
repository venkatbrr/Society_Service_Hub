-- Migration: Add get_all_communities RPC
-- Returns all approved communities with resident counts for the join-a-community discovery screen.

CREATE OR REPLACE FUNCTION public.get_all_communities(p_search TEXT DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  name TEXT,
  community_type TEXT,
  city TEXT,
  area TEXT,
  pincode TEXT,
  resident_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.community_type,
    c.city,
    c.area,
    c.pincode,
    COUNT(p.id) FILTER (WHERE p.approval_status = 'approved')::BIGINT AS resident_count
  FROM public.communities c
  LEFT JOIN public.profiles p ON p.community_id = c.id AND p.removed_at IS NULL
  WHERE
    p_search IS NULL
    OR p_search = ''
    OR c.name ILIKE '%' || p_search || '%'
    OR c.city ILIKE '%' || p_search || '%'
    OR c.area ILIKE '%' || p_search || '%'
    OR c.pincode ILIKE '%' || p_search || '%'
  GROUP BY c.id, c.name, c.community_type, c.city, c.area, c.pincode
  ORDER BY c.name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_communities(TEXT) TO authenticated, anon;
