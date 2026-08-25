-- ============================================================
-- Migration: Community-run business listings
-- Date: 2026-08-25
-- ============================================================
--
-- Until now every mcn_listings row was a resident's side business, so the
-- directory rendered it as "<owner name> · <flat>" and the anti-spam triggers
-- (one per category, 5 active, 1 new per day) treated the owner as a person.
--
-- A society also runs businesses of its own — the community pharmacy, the
-- society store — which belong to no flat and need a president / vice
-- president to list them on the community's behalf. Those get a new
-- `is_community_business` flag:
--
--   * only a community lead (president / vice_president) or a platform admin
--     can set or clear it (RLS WITH CHECK + a trigger with a readable error);
--   * `owner_id` is still the lead who created it, so the existing
--     owner-or-lead manage/update/delete paths keep working unchanged;
--   * the per-resident anti-spam limits neither apply to it nor count it,
--     since a lead may need to list several community businesses in one go.
-- ============================================================

ALTER TABLE public.mcn_listings
  ADD COLUMN IF NOT EXISTS is_community_business BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.mcn_listings.is_community_business IS
  'TRUE when the society itself runs this business (community pharmacy, society store). Set only by a president/VP or platform admin; the listing is shown as community-run instead of owner name + flat, and is exempt from the per-resident listing limits.';

-- ============================================================
-- 1. Only leads / platform admins may flag a listing community-run
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_community_business_authority()
RETURNS TRIGGER AS $$
BEGIN
  -- Nothing to police unless the flag is being turned on or off.
  IF TG_OP = 'UPDATE' AND NEW.is_community_business IS NOT DISTINCT FROM OLD.is_community_business THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.is_community_business IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_community_lead(auth.uid()) AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the president or vice president can list a business on behalf of the community.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_community_business_authority ON public.mcn_listings;
CREATE TRIGGER trg_enforce_community_business_authority
BEFORE INSERT OR UPDATE OF is_community_business ON public.mcn_listings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_community_business_authority();

-- ============================================================
-- 2. Same guard in RLS, and give the platform admin the update override it
--    was missing (the delete policy already has one — 20260822000100).
-- ============================================================

DROP POLICY IF EXISTS "mcn_listings_insert" ON public.mcn_listings;
CREATE POLICY "mcn_listings_insert"
  ON public.mcn_listings FOR INSERT
  WITH CHECK (
    community_id = get_user_community_id()
    AND owner_id = auth.uid()
    AND (
      is_community_business = FALSE
      OR public.is_community_lead(auth.uid())
      OR public.is_platform_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "mcn_listings_update" ON public.mcn_listings;
CREATE POLICY "mcn_listings_update"
  ON public.mcn_listings FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR public.is_community_lead(auth.uid())
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    (
      owner_id = auth.uid()
      OR public.is_community_lead(auth.uid())
      OR public.is_platform_admin(auth.uid())
    )
    AND (
      is_community_business = FALSE
      OR public.is_community_lead(auth.uid())
      OR public.is_platform_admin(auth.uid())
    )
  );

-- ============================================================
-- 3. Per-resident anti-spam limits ignore community-run listings
--    (both as the row being written and as rows already on file)
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_one_listing_per_owner_category()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_community_business IS TRUE THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.mcn_listings l
    WHERE l.owner_id = NEW.owner_id
      AND l.category_id = NEW.category_id
      AND l.is_community_business IS NOT TRUE
      AND l.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'You already have a business listed under this category. Edit that listing instead of creating another.'
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.enforce_max_active_listings_per_owner()
RETURNS TRIGGER AS $$
DECLARE
  v_active_count INTEGER;
  v_max_active CONSTANT INTEGER := 5;
BEGIN
  IF NEW.is_active IS NOT TRUE OR NEW.is_community_business IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_active_count
  FROM public.mcn_listings l
  WHERE l.owner_id = NEW.owner_id
    AND l.is_active = TRUE
    AND l.is_community_business IS NOT TRUE
    AND l.id <> NEW.id;

  IF v_active_count >= v_max_active THEN
    RAISE EXCEPTION 'You can have at most % active business listings at a time. Pause or delete one before adding another.', v_max_active;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.enforce_listing_creation_rate_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_community_business IS TRUE THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.mcn_listings l
    WHERE l.owner_id = NEW.owner_id
      AND l.is_community_business IS NOT TRUE
      AND l.created_at > now() - INTERVAL '24 hours'
  ) THEN
    RAISE EXCEPTION 'You can only create one new business listing per day. Please try again later.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The max-active trigger must also fire when a listing is flipped between
-- personal and community-run, so the quota is re-checked on the way back.
DROP TRIGGER IF EXISTS trg_enforce_max_active_listings_per_owner ON public.mcn_listings;
CREATE TRIGGER trg_enforce_max_active_listings_per_owner
BEFORE INSERT OR UPDATE OF is_active, owner_id, is_community_business ON public.mcn_listings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_max_active_listings_per_owner();

DROP TRIGGER IF EXISTS trg_one_listing_per_owner_category ON public.mcn_listings;
CREATE TRIGGER trg_one_listing_per_owner_category
BEFORE INSERT OR UPDATE OF owner_id, category_id, is_community_business ON public.mcn_listings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_one_listing_per_owner_category();

NOTIFY pgrst, 'reload schema';
