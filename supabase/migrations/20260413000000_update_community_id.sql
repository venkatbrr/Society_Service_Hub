-- Helper function to extract community_id from JWT app_metadata or user_metadata
CREATE OR REPLACE FUNCTION get_user_community_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'community_id'),
    (auth.jwt() -> 'user_metadata' ->> 'community_id')
  )::UUID;
$$;
