-- Update the helper function to check both app_metadata and user_metadata
CREATE OR REPLACE FUNCTION get_user_community_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'community_id')::UUID,
    (auth.jwt() -> 'user_metadata' ->> 'community_id')::UUID
  );
$$;
