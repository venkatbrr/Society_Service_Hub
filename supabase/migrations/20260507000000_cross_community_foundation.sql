-- ============================================================
-- Migration: Cross-Community Federation — Backend Foundation
-- Date: 2026-05-07
--
-- Status: BACKEND ACTIVE, UI DEFERRED.
--
-- This migration creates the schema, helpers, RLS policies, and
-- RPCs required for future cross-community features (provider
-- discovery across communities, co-hosted visits, joint funds,
-- shared announcements).
--
-- No UI in the current app calls any of the new objects yet.
-- The new tables start empty, the new columns have safe
-- defaults that match today's behaviour, and existing screens
-- continue to query the same rows they always did.
--
-- Design rules baked into this migration:
--   1. Additive only. No DROP / RENAME / redefinition of existing
--      tables, columns, RPCs, RLS policies, or notification types.
--   2. `get_user_community_id()` keeps its current meaning
--      (the user's HOME community). New helpers handle the
--      cross-community access set.
--   3. New RLS policies are added with distinct names and union
--      with existing policies via Postgres' OR semantics across
--      multiple permissive SELECT policies.
--   4. `user_services` is untouched.
--   5. Marketplace tables stay dropped.
--
-- Companion docs:
--   - docs/cross-community.md            (architecture reference)
--   - docs/cross-community-changelog.md  (append-only log)
--   - docs/decisions/0001-additive-rls-for-cross-community.md
-- ============================================================


-- ============================================================
-- SECTION 1: community_partnerships
-- Pairwise relationship between two communities.
-- Stored once, with canonical ordering community_a_id < community_b_id.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.community_partnerships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_a_id  UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  community_b_id  UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','active','paused','revoked')),
  scope           JSONB NOT NULL DEFAULT
                    '{"providers": true, "visits": false, "funds": false, "announcements": false}'::jsonb,
  initiated_by    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT partnerships_canonical_order CHECK (community_a_id < community_b_id),
  CONSTRAINT partnerships_distinct        CHECK (community_a_id <> community_b_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partnerships_unique_pair
  ON public.community_partnerships (community_a_id, community_b_id);

CREATE INDEX IF NOT EXISTS idx_partnerships_status
  ON public.community_partnerships (status);


-- ============================================================
-- SECTION 2: community_groups + community_group_members
-- Named clusters of 2+ communities (e.g., a city cluster).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.community_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (length(btrim(name)) > 0 AND length(name) <= 100),
  description TEXT CHECK (description IS NULL OR length(description) <= 500),
  visibility  TEXT NOT NULL DEFAULT 'private'
                CHECK (visibility IN ('private','discoverable')),
  created_by  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_group_members (
  group_id     UUID NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member'
                 CHECK (role IN ('owner','member')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, community_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_community
  ON public.community_group_members (community_id);


-- ============================================================
-- SECTION 3: Provider visibility model
--   - Add visibility, shared_by_community_id, is_verified to
--     service_providers.
--   - Add provider_shares for explicit per-target overrides.
--
--   IMPORTANT: We KEEP the existing
--   `enforce_unique_provider_phone_per_community` constraint.
--   Two communities may legitimately list the same plumber.
-- ============================================================

ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'community'
    CHECK (visibility IN ('community','partners','group','public')),
  ADD COLUMN IF NOT EXISTS shared_by_community_id UUID
    REFERENCES public.communities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;

-- Backfill: every existing provider stays community-scoped.
UPDATE public.service_providers
SET shared_by_community_id = community_id
WHERE shared_by_community_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_providers_visibility
  ON public.service_providers (visibility)
  WHERE visibility <> 'community';

CREATE TABLE IF NOT EXISTS public.provider_shares (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL CHECK (target_type IN ('community','group','partnership')),
  target_id    UUID NOT NULL,
  shared_by    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_shares_target
  ON public.provider_shares (target_type, target_id);


-- ============================================================
-- SECTION 4: Cross-community visits — schema only, no UI yet.
-- ============================================================

ALTER TABLE public.service_visits
  ADD COLUMN IF NOT EXISTS is_cross_community BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS host_community_id UUID
    REFERENCES public.communities(id) ON DELETE SET NULL;

UPDATE public.service_visits
SET host_community_id = community_id
WHERE host_community_id IS NULL;

CREATE TABLE IF NOT EXISTS public.service_visit_communities (
  visit_id     UUID NOT NULL REFERENCES public.service_visits(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (visit_id, community_id)
);

CREATE INDEX IF NOT EXISTS idx_visit_communities_community
  ON public.service_visit_communities (community_id);


-- ============================================================
-- SECTION 5: Cross-community funds — schema only, no UI yet.
-- Existing community-scoped funds get fund_scope = 'community'
-- and existing RLS continues to govern them unchanged.
-- ============================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS fund_scope TEXT NOT NULL DEFAULT 'community'
    CHECK (fund_scope IN ('community','partnership','group')),
  ADD COLUMN IF NOT EXISTS partnership_id UUID
    REFERENCES public.community_partnerships(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS group_id UUID
    REFERENCES public.community_groups(id) ON DELETE SET NULL;

-- Sanity: a fund's scope must match which FK is set.
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_fund_scope_consistency;
ALTER TABLE public.events
  ADD CONSTRAINT events_fund_scope_consistency CHECK (
    (fund_scope = 'community'   AND partnership_id IS NULL AND group_id IS NULL)
 OR (fund_scope = 'partnership' AND partnership_id IS NOT NULL AND group_id IS NULL)
 OR (fund_scope = 'group'       AND group_id IS NOT NULL AND partnership_id IS NULL)
  );


-- ============================================================
-- SECTION 6: community_announcements + announcement_audiences
-- ============================================================

CREATE TABLE IF NOT EXISTS public.community_announcements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  author_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  title         TEXT NOT NULL CHECK (length(btrim(title)) > 0 AND length(title) <= 140),
  body          TEXT NOT NULL CHECK (length(btrim(body)) > 0 AND length(body) <= 4000),
  visibility    TEXT NOT NULL DEFAULT 'community'
                  CHECK (visibility IN ('community','partners','group','public')),
  pinned        BOOLEAN NOT NULL DEFAULT false,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_community
  ON public.community_announcements (community_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.announcement_audiences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.community_announcements(id) ON DELETE CASCADE,
  target_type     TEXT NOT NULL CHECK (target_type IN ('community','group','partnership')),
  target_id       UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, target_type, target_id)
);


-- ============================================================
-- SECTION 7: Enable RLS on every new table.
-- Default-deny; specific policies below.
-- ============================================================

ALTER TABLE public.community_partnerships      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_groups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_group_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_shares             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_visit_communities   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_announcements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_audiences      ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- SECTION 8: New helper functions.
--
-- These are NEW functions. We do NOT redefine
-- get_user_community_id() — its meaning (the user's home
-- community) is preserved everywhere else.
-- ============================================================

-- Returns the set of community IDs the caller can see content from
-- given a capability flag from partnerships.scope (jsonb key).
-- Always includes the caller's own home community.
CREATE OR REPLACE FUNCTION public.get_user_partner_community_ids(
  p_capability TEXT DEFAULT 'providers',
  p_user_id    UUID DEFAULT auth.uid()
)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH home AS (
    SELECT community_id FROM public.profiles
    WHERE id = COALESCE(p_user_id, auth.uid())
      AND community_id IS NOT NULL
      AND removed_at IS NULL
  ),
  partner AS (
    SELECT CASE
             WHEN cp.community_a_id = h.community_id THEN cp.community_b_id
             ELSE cp.community_a_id
           END AS community_id
    FROM public.community_partnerships cp
    JOIN home h
      ON cp.community_a_id = h.community_id
      OR cp.community_b_id = h.community_id
    WHERE cp.status = 'active'
      AND COALESCE((cp.scope ->> p_capability)::boolean, false) = true
  ),
  group_peers AS (
    SELECT m2.community_id
    FROM public.community_group_members m1
    JOIN public.community_group_members m2 ON m1.group_id = m2.group_id
    JOIN home h ON m1.community_id = h.community_id
    WHERE m2.community_id <> m1.community_id
  )
  SELECT community_id FROM home
  UNION
  SELECT community_id FROM partner
  UNION
  SELECT community_id FROM group_peers;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_partner_community_ids(TEXT, UUID) TO authenticated;


-- Visibility predicate for a single provider.
CREATE OR REPLACE FUNCTION public.can_user_see_provider(
  p_provider_id UUID,
  p_user_id     UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH p AS (
    SELECT * FROM public.service_providers WHERE id = p_provider_id
  ),
  caller AS (
    SELECT community_id FROM public.profiles
    WHERE id = COALESCE(p_user_id, auth.uid())
      AND removed_at IS NULL
  )
  SELECT EXISTS (
    SELECT 1 FROM p, caller
    WHERE
      -- Own community: always visible (matches existing policy).
      p.community_id = caller.community_id
      -- Public.
      OR p.visibility = 'public'
      -- Partner-visible and a partnership exists with providers capability.
      OR (
        p.visibility IN ('partners','group')
        AND p.community_id IN (
          SELECT public.get_user_partner_community_ids('providers', p_user_id)
        )
      )
      -- Explicit share targeting the caller's community / group / partnership.
      OR EXISTS (
        SELECT 1 FROM public.provider_shares ps
        WHERE ps.provider_id = p.id
          AND (
            (ps.target_type = 'community' AND ps.target_id = caller.community_id)
            OR (ps.target_type = 'group' AND ps.target_id IN (
              SELECT group_id FROM public.community_group_members
              WHERE community_id = caller.community_id
            ))
            OR (ps.target_type = 'partnership' AND ps.target_id IN (
              SELECT id FROM public.community_partnerships
              WHERE status = 'active'
                AND (community_a_id = caller.community_id OR community_b_id = caller.community_id)
            ))
          )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_user_see_provider(UUID, UUID) TO authenticated;


-- Visibility predicate for a single visit.
CREATE OR REPLACE FUNCTION public.can_user_see_visit(
  p_visit_id UUID,
  p_user_id  UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH v AS (
    SELECT * FROM public.service_visits WHERE id = p_visit_id
  ),
  caller AS (
    SELECT community_id FROM public.profiles
    WHERE id = COALESCE(p_user_id, auth.uid())
      AND removed_at IS NULL
  )
  SELECT EXISTS (
    SELECT 1 FROM v, caller
    WHERE
      v.community_id = caller.community_id
      OR (
        v.is_cross_community
        AND EXISTS (
          SELECT 1 FROM public.service_visit_communities svc
          WHERE svc.visit_id = v.id
            AND svc.community_id = caller.community_id
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_user_see_visit(UUID, UUID) TO authenticated;


-- Visibility predicate for a single announcement.
CREATE OR REPLACE FUNCTION public.can_user_see_announcement(
  p_announcement_id UUID,
  p_user_id         UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH a AS (
    SELECT * FROM public.community_announcements WHERE id = p_announcement_id
  ),
  caller AS (
    SELECT community_id FROM public.profiles
    WHERE id = COALESCE(p_user_id, auth.uid())
      AND removed_at IS NULL
  )
  SELECT EXISTS (
    SELECT 1 FROM a, caller
    WHERE
      a.community_id = caller.community_id
      OR a.visibility = 'public'
      OR (
        a.visibility IN ('partners','group')
        AND a.community_id IN (
          SELECT public.get_user_partner_community_ids('announcements', p_user_id)
        )
      )
      OR EXISTS (
        SELECT 1 FROM public.announcement_audiences aud
        WHERE aud.announcement_id = a.id
          AND (
            (aud.target_type = 'community'   AND aud.target_id = caller.community_id)
            OR (aud.target_type = 'group'    AND aud.target_id IN (
              SELECT group_id FROM public.community_group_members
              WHERE community_id = caller.community_id
            ))
            OR (aud.target_type = 'partnership' AND aud.target_id IN (
              SELECT id FROM public.community_partnerships
              WHERE status = 'active'
                AND (community_a_id = caller.community_id OR community_b_id = caller.community_id)
            ))
          )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_user_see_announcement(UUID, UUID) TO authenticated;


-- ============================================================
-- SECTION 9: ADDITIVE RLS policies.
--
-- Existing community-scoped SELECT policies on service_providers
-- and service_visits remain in place. Postgres unions multiple
-- permissive SELECT policies with OR, so adding policies cannot
-- reduce access — only widen it for callers who satisfy the
-- new helpers.
--
-- Because no current screen sets visibility to anything other
-- than the default 'community', and no provider_shares rows
-- exist, these new policies match zero additional rows in
-- practice today. They become live the moment someone sets a
-- non-default visibility or inserts a share.
--
-- Writes are NOT widened here. Cross-community writes flow
-- through dedicated SECURITY DEFINER RPCs introduced in Section 10.
-- ============================================================

-- Providers: cross-community read.
DROP POLICY IF EXISTS service_providers_select_cross_community
  ON public.service_providers;
CREATE POLICY service_providers_select_cross_community
  ON public.service_providers
  FOR SELECT
  USING (public.can_user_see_provider(id));

-- Visits: cross-community read.
DROP POLICY IF EXISTS service_visits_select_cross_community
  ON public.service_visits;
CREATE POLICY service_visits_select_cross_community
  ON public.service_visits
  FOR SELECT
  USING (public.can_user_see_visit(id));

-- Announcements: own community + cross-community read.
DROP POLICY IF EXISTS community_announcements_select_visible
  ON public.community_announcements;
CREATE POLICY community_announcements_select_visible
  ON public.community_announcements
  FOR SELECT
  USING (public.can_user_see_announcement(id));

-- Announcement writes: author of caller's own community only.
DROP POLICY IF EXISTS community_announcements_insert_own
  ON public.community_announcements;
CREATE POLICY community_announcements_insert_own
  ON public.community_announcements
  FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND community_id = public.get_user_community_id()
  );

DROP POLICY IF EXISTS community_announcements_update_own
  ON public.community_announcements;
CREATE POLICY community_announcements_update_own
  ON public.community_announcements
  FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS community_announcements_delete_own
  ON public.community_announcements;
CREATE POLICY community_announcements_delete_own
  ON public.community_announcements
  FOR DELETE
  USING (author_id = auth.uid());

-- Partnerships: members of either side can see, only community
-- leads can mutate (mutations actually flow through RPCs).
DROP POLICY IF EXISTS community_partnerships_select_members
  ON public.community_partnerships;
CREATE POLICY community_partnerships_select_members
  ON public.community_partnerships
  FOR SELECT
  USING (
    community_a_id = public.get_user_community_id()
    OR community_b_id = public.get_user_community_id()
  );

-- Groups: discoverable groups visible to all; private only to members.
DROP POLICY IF EXISTS community_groups_select_visible
  ON public.community_groups;
CREATE POLICY community_groups_select_visible
  ON public.community_groups
  FOR SELECT
  USING (
    visibility = 'discoverable'
    OR EXISTS (
      SELECT 1 FROM public.community_group_members m
      WHERE m.group_id = community_groups.id
        AND m.community_id = public.get_user_community_id()
    )
  );

DROP POLICY IF EXISTS community_group_members_select_visible
  ON public.community_group_members;
CREATE POLICY community_group_members_select_visible
  ON public.community_group_members
  FOR SELECT
  USING (
    community_id = public.get_user_community_id()
    OR EXISTS (
      SELECT 1 FROM public.community_group_members m
      WHERE m.group_id = community_group_members.group_id
        AND m.community_id = public.get_user_community_id()
    )
  );

-- provider_shares: visible only to source community members
-- (the provider's home) and to the targeted audience.
DROP POLICY IF EXISTS provider_shares_select_relevant
  ON public.provider_shares;
CREATE POLICY provider_shares_select_relevant
  ON public.provider_shares
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.service_providers sp
      WHERE sp.id = provider_shares.provider_id
        AND sp.community_id = public.get_user_community_id()
    )
    OR (
      target_type = 'community'
      AND target_id = public.get_user_community_id()
    )
  );

-- service_visit_communities: visible if caller is in either
-- the host community or the joined community.
DROP POLICY IF EXISTS service_visit_communities_select
  ON public.service_visit_communities;
CREATE POLICY service_visit_communities_select
  ON public.service_visit_communities
  FOR SELECT
  USING (
    community_id = public.get_user_community_id()
    OR EXISTS (
      SELECT 1 FROM public.service_visits sv
      WHERE sv.id = service_visit_communities.visit_id
        AND sv.community_id = public.get_user_community_id()
    )
  );

-- announcement_audiences: visible to source community and to
-- targeted communities.
DROP POLICY IF EXISTS announcement_audiences_select
  ON public.announcement_audiences;
CREATE POLICY announcement_audiences_select
  ON public.announcement_audiences
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.community_announcements a
      WHERE a.id = announcement_audiences.announcement_id
        AND a.community_id = public.get_user_community_id()
    )
    OR (
      target_type = 'community'
      AND target_id = public.get_user_community_id()
    )
  );


-- ============================================================
-- SECTION 10: RPCs for cross-community workflows.
-- All SECURITY DEFINER, all granted to authenticated, all with
-- explicit auth and authorization checks.
-- ============================================================

-- 10.1 Request a partnership between caller's community and a target.
CREATE OR REPLACE FUNCTION public.request_community_partnership(
  p_target_community_id UUID,
  p_scope               JSONB DEFAULT '{"providers": true}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_community_id UUID;
  partnership_id      UUID;
  a_id                UUID;
  b_id                UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_community_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Only community leads can initiate partnerships';
  END IF;

  SELECT community_id INTO caller_community_id
  FROM public.profiles WHERE id = auth.uid();

  IF caller_community_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no community';
  END IF;

  IF caller_community_id = p_target_community_id THEN
    RAISE EXCEPTION 'Cannot partner with your own community';
  END IF;

  -- Canonical ordering.
  IF caller_community_id < p_target_community_id THEN
    a_id := caller_community_id; b_id := p_target_community_id;
  ELSE
    a_id := p_target_community_id; b_id := caller_community_id;
  END IF;

  INSERT INTO public.community_partnerships (
    community_a_id, community_b_id, status, scope, initiated_by
  ) VALUES (
    a_id, b_id, 'pending', COALESCE(p_scope, '{}'::jsonb), auth.uid()
  )
  ON CONFLICT (community_a_id, community_b_id) DO UPDATE
    SET status       = 'pending',
        scope        = EXCLUDED.scope,
        initiated_by = auth.uid(),
        accepted_by  = NULL,
        updated_at   = now()
  RETURNING id INTO partnership_id;

  -- Notify community leads of the target community.
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    p.id,
    'partnership_request',
    'New partnership request',
    (SELECT name FROM public.communities WHERE id = caller_community_id)
      || ' wants to collaborate with your community.',
    jsonb_build_object(
      'partnership_id', partnership_id,
      'from_community_id', caller_community_id,
      'scope', COALESCE(p_scope, '{}'::jsonb)
    )
  FROM public.profiles p
  WHERE p.community_id = p_target_community_id
    AND p.app_role = 'community_lead'::public.app_role_type;

  RETURN partnership_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_community_partnership(UUID, JSONB) TO authenticated;


-- 10.2 Accept a partnership.
CREATE OR REPLACE FUNCTION public.accept_community_partnership(
  p_partnership_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_community_id UUID;
  partnership         public.community_partnerships%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_community_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Only community leads can accept partnerships';
  END IF;

  SELECT community_id INTO caller_community_id
  FROM public.profiles WHERE id = auth.uid();

  SELECT * INTO partnership FROM public.community_partnerships
  WHERE id = p_partnership_id;

  IF partnership.id IS NULL THEN
    RAISE EXCEPTION 'Partnership not found';
  END IF;

  IF partnership.community_a_id <> caller_community_id
     AND partnership.community_b_id <> caller_community_id THEN
    RAISE EXCEPTION 'You are not a member of either community in this partnership';
  END IF;

  -- The accepting lead must be on the OTHER side from the initiator.
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = partnership.initiated_by
      AND community_id = caller_community_id
  ) THEN
    RAISE EXCEPTION 'The initiating community cannot also accept the partnership';
  END IF;

  UPDATE public.community_partnerships
  SET status      = 'active',
      accepted_by = auth.uid(),
      updated_at  = now()
  WHERE id = p_partnership_id;

  -- Notify the initiator.
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    partnership.initiated_by,
    'partnership_accepted',
    'Partnership accepted',
    'Your partnership request was accepted.',
    jsonb_build_object('partnership_id', p_partnership_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_community_partnership(UUID) TO authenticated;


-- 10.3 Pause / revoke / reactivate partnership.
CREATE OR REPLACE FUNCTION public.set_partnership_status(
  p_partnership_id UUID,
  p_status         TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_community_id UUID;
  partnership         public.community_partnerships%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_status NOT IN ('paused','revoked','active') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  IF NOT public.is_community_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Only community leads can change partnership status';
  END IF;

  SELECT community_id INTO caller_community_id
  FROM public.profiles WHERE id = auth.uid();

  SELECT * INTO partnership FROM public.community_partnerships
  WHERE id = p_partnership_id;

  IF partnership.id IS NULL THEN
    RAISE EXCEPTION 'Partnership not found';
  END IF;

  IF partnership.community_a_id <> caller_community_id
     AND partnership.community_b_id <> caller_community_id THEN
    RAISE EXCEPTION 'You are not in this partnership';
  END IF;

  UPDATE public.community_partnerships
  SET status     = p_status,
      updated_at = now()
  WHERE id = p_partnership_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_partnership_status(UUID, TEXT) TO authenticated;


-- 10.4 Set provider visibility (creator or community lead).
CREATE OR REPLACE FUNCTION public.set_provider_visibility(
  p_provider_id UUID,
  p_visibility  TEXT,
  p_targets     JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  provider public.service_providers%ROWTYPE;
  caller_community_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_visibility NOT IN ('community','partners','group','public') THEN
    RAISE EXCEPTION 'Invalid visibility: %', p_visibility;
  END IF;

  SELECT * INTO provider FROM public.service_providers WHERE id = p_provider_id;
  IF provider.id IS NULL THEN
    RAISE EXCEPTION 'Provider not found';
  END IF;

  SELECT community_id INTO caller_community_id
  FROM public.profiles WHERE id = auth.uid();

  IF provider.created_by <> auth.uid()
     AND NOT (public.is_community_lead(auth.uid())
              AND caller_community_id = provider.community_id) THEN
    RAISE EXCEPTION 'Only the provider creator or a community lead can change visibility';
  END IF;

  UPDATE public.service_providers
  SET visibility = p_visibility,
      updated_at = now()
  WHERE id = p_provider_id;

  -- Optional explicit targets: array of { target_type, target_id }.
  IF p_targets IS NOT NULL AND jsonb_typeof(p_targets) = 'array' THEN
    DELETE FROM public.provider_shares WHERE provider_id = p_provider_id;

    INSERT INTO public.provider_shares (provider_id, target_type, target_id, shared_by)
    SELECT
      p_provider_id,
      (elem ->> 'target_type'),
      (elem ->> 'target_id')::uuid,
      auth.uid()
    FROM jsonb_array_elements(p_targets) AS elem
    WHERE (elem ->> 'target_type') IN ('community','group','partnership');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_provider_visibility(UUID, TEXT, JSONB) TO authenticated;


-- 10.5 List visible providers — main read RPC for the future UI.
CREATE OR REPLACE FUNCTION public.list_visible_providers(
  p_search      TEXT     DEFAULT NULL,
  p_category    TEXT     DEFAULT NULL,
  p_communities UUID[]   DEFAULT NULL
)
RETURNS TABLE (
  id                     UUID,
  name                   TEXT,
  phone                  TEXT,
  category               TEXT,
  description            TEXT,
  flat_block             TEXT,
  avg_rating             NUMERIC,
  rating_count           INTEGER,
  visibility             TEXT,
  is_verified            BOOLEAN,
  origin_community_id    UUID,
  origin_community_name  TEXT,
  is_own_community       BOOLEAN,
  created_at             TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH caller AS (
    SELECT community_id FROM public.profiles WHERE id = auth.uid()
  )
  SELECT
    sp.id,
    sp.name,
    sp.phone,
    sp.category,
    sp.description,
    sp.flat_block,
    sp.avg_rating,
    sp.rating_count,
    sp.visibility,
    sp.is_verified,
    sp.community_id        AS origin_community_id,
    c.name                 AS origin_community_name,
    (sp.community_id = (SELECT community_id FROM caller)) AS is_own_community,
    sp.created_at
  FROM public.service_providers sp
  JOIN public.communities c ON c.id = sp.community_id
  WHERE
    public.can_user_see_provider(sp.id)
    AND (p_category IS NULL OR sp.category = p_category)
    AND (
      p_search IS NULL
      OR sp.name  ILIKE '%' || p_search || '%'
      OR sp.phone ILIKE '%' || p_search || '%'
    )
    AND (
      p_communities IS NULL
      OR sp.community_id = ANY (p_communities)
    )
  ORDER BY
    (sp.community_id = (SELECT community_id FROM caller)) DESC,
    sp.avg_rating DESC NULLS LAST,
    sp.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_visible_providers(TEXT, TEXT, UUID[]) TO authenticated;


-- 10.6 List partner communities (for the future picker UI).
CREATE OR REPLACE FUNCTION public.list_partner_communities()
RETURNS TABLE (
  community_id   UUID,
  community_name TEXT,
  partnership_id UUID,
  status         TEXT,
  scope          JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH caller AS (
    SELECT community_id FROM public.profiles WHERE id = auth.uid()
  )
  SELECT
    CASE
      WHEN cp.community_a_id = caller.community_id THEN cp.community_b_id
      ELSE cp.community_a_id
    END AS community_id,
    c.name,
    cp.id,
    cp.status,
    cp.scope
  FROM public.community_partnerships cp
  JOIN caller ON cp.community_a_id = caller.community_id
              OR cp.community_b_id = caller.community_id
  JOIN public.communities c
    ON c.id = CASE
                WHEN cp.community_a_id = caller.community_id THEN cp.community_b_id
                ELSE cp.community_a_id
              END
  ORDER BY cp.status, c.name;
$$;

GRANT EXECUTE ON FUNCTION public.list_partner_communities() TO authenticated;


-- ============================================================
-- SECTION 11: Reload PostgREST schema cache.
-- ============================================================

NOTIFY pgrst, 'reload schema';
