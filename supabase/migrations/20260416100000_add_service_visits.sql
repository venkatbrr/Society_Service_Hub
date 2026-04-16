-- New migration file for Service Provider Visits
-- Table: service_visits
CREATE TABLE service_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Provider reference: link to existing provider OR manual entry for unlisted providers
  provider_id UUID REFERENCES service_providers(id) ON DELETE SET NULL,
  provider_name TEXT NOT NULL,
  provider_phone TEXT,
  provider_whatsapp TEXT,

  -- Visit details
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  visit_date DATE NOT NULL,
  visit_time_slot TEXT NOT NULL,
  estimated_cost TEXT,
  max_joiners INTEGER,

  -- Status lifecycle
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'in_progress', 'completed', 'cancelled')),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table: visit_joiners
CREATE TABLE visit_joiners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES service_visits(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note TEXT,
  flat_number TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT one_join_per_user_per_visit UNIQUE (visit_id, user_id)
);

-- RLS Policies
ALTER TABLE service_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_joiners ENABLE ROW LEVEL SECURITY;

-- service_visits: community members can read all, creator can insert/update/delete their own
CREATE POLICY "Community members can view visits"
  ON service_visits FOR SELECT
  USING (community_id = (SELECT community_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create visits"
  ON service_visits FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND community_id = (SELECT community_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Creators can update their visits"
  ON service_visits FOR UPDATE
  USING (created_by = auth.uid());

CREATE POLICY "Creators can delete their visits"
  ON service_visits FOR DELETE
  USING (created_by = auth.uid());

-- visit_joiners: community members can read all joiners for visible visits, users can join/leave themselves
CREATE POLICY "Community members can view joiners"
  ON visit_joiners FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM service_visits sv
      WHERE sv.id = visit_joiners.visit_id
      AND sv.community_id = (SELECT community_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can join visits"
  ON visit_joiners FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM service_visits sv
      WHERE sv.id = visit_joiners.visit_id
      AND sv.community_id = (SELECT community_id FROM profiles WHERE id = auth.uid())
      AND sv.status = 'upcoming'
    )
  );

CREATE POLICY "Users can leave visits"
  ON visit_joiners FOR DELETE
  USING (user_id = auth.uid());

-- RPC: Get upcoming visits with joiner count and user's join status
CREATE OR REPLACE FUNCTION get_community_visits(
  p_community_id UUID,
  p_user_id UUID,
  p_status TEXT DEFAULT 'upcoming'
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
    AND sv.status = p_status
    AND sv.visit_date >= CURRENT_DATE
  GROUP BY sv.id, p.full_name, p.flat_number, p.avatar_url
  ORDER BY sv.visit_date ASC, sv.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Get joiners for a specific visit
CREATE OR REPLACE FUNCTION get_visit_joiners(p_visit_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_name TEXT,
  flat_number TEXT,
  avatar_url TEXT,
  note TEXT,
  joined_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    vj.id,
    vj.user_id,
    p.full_name AS user_name,
    COALESCE(vj.flat_number, p.flat_number) AS flat_number,
    p.avatar_url,
    vj.note,
    vj.created_at AS joined_at
  FROM visit_joiners vj
  JOIN profiles p ON p.id = vj.user_id
  WHERE vj.visit_id = p_visit_id
  ORDER BY vj.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-expire old visits
CREATE OR REPLACE FUNCTION auto_complete_past_visits()
RETURNS void AS $$
BEGIN
  UPDATE service_visits
  SET status = 'completed', updated_at = now()
  WHERE status = 'upcoming'
    AND visit_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
