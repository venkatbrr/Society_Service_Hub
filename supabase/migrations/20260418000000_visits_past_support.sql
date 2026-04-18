-- Migration: Add time scope support to get_community_visits
-- Adds p_time_scope parameter: 'upcoming' (date >= today) or 'past' (date < today)
-- This enables the "Past Visits" section in the UI

CREATE OR REPLACE FUNCTION get_community_visits(
  p_community_id UUID,
  p_user_id UUID,
  p_status TEXT DEFAULT 'upcoming',
  p_time_scope TEXT DEFAULT 'upcoming'
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  category TEXT,
  provider_id UUID,
  provider_name TEXT,
  provider_phone TEXT,
  provider_whatsapp TEXT,
  visit_date DATE,
  visit_time_slot TEXT,
  estimated_cost TEXT,
  max_joiners INTEGER,
  status TEXT,
  created_by UUID,
  creator_name TEXT,
  creator_flat TEXT,
  creator_avatar_url TEXT,
  joiner_count BIGINT,
  has_user_joined BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sv.id,
    sv.title,
    sv.description,
    sv.category,
    sv.provider_id,
    sv.provider_name,
    sv.provider_phone,
    sv.provider_whatsapp,
    sv.visit_date,
    sv.visit_time_slot,
    sv.estimated_cost,
    sv.max_joiners,
    sv.status,
    sv.created_by,
    p.full_name AS creator_name,
    p.flat_number AS creator_flat,
    p.avatar_url AS creator_avatar_url,
    COUNT(DISTINCT vj.id) AS joiner_count,
    EXISTS (
      SELECT 1 FROM visit_joiners vj2
      WHERE vj2.visit_id = sv.id AND vj2.user_id = p_user_id
    ) AS has_user_joined,
    sv.created_at
  FROM service_visits sv
  JOIN profiles p ON p.id = sv.created_by
  LEFT JOIN visit_joiners vj ON vj.visit_id = sv.id
  WHERE sv.community_id = p_community_id
    AND sv.status = ANY(string_to_array(p_status, ','))
    AND (
      (p_time_scope = 'upcoming' AND sv.visit_date >= CURRENT_DATE)
      OR
      (p_time_scope = 'past' AND sv.visit_date < CURRENT_DATE)
    )
  GROUP BY sv.id, p.full_name, p.flat_number, p.avatar_url
  ORDER BY
    CASE WHEN p_time_scope = 'upcoming' THEN sv.visit_date END ASC,
    CASE WHEN p_time_scope = 'past' THEN sv.visit_date END DESC,
    sv.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
