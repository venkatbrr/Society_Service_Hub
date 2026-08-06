-- ============================================================
-- Migration: Give platform admin a real override on MCN delete policies
-- Date: 2026-08-22
-- ============================================================
--
-- Rule: the platform admin (app_role='admin', community_id IS NULL) has
-- ultimate powers across ALL communities — everything a president/VP can do
-- and more.
--
-- The MCN delete policies added in 20260814000000 read as
--   owner OR is_community_lead() OR is_admin()
-- which LOOKS like it covers admins, but public.is_admin() is only an alias
-- that calls public.is_community_lead(). So the third clause is a duplicate of
-- the second and the platform admin got no override at all.
--
-- Repoint them to public.is_platform_admin(), matching the convention used by
-- 20260821000000_mcn_listing_spam_controls.sql and by the sibling *_update
-- policies fixed in 20260822000000.
--
-- Deliberately NOT changed here: the events / fund_roles policies
-- ("Admins and community leads can ... funds/treasurers"). Those are gated on
-- `community_id = get_user_community_id()`, which is NULL for a platform admin,
-- so no role clause can make them pass. Platform admins manage funds through
-- the SECURITY DEFINER platform_* RPCs, which bypass RLS by design.
-- ============================================================

DROP POLICY IF EXISTS "mcn_posts_delete" ON public.mcn_posts;
CREATE POLICY "mcn_posts_delete"
  ON public.mcn_posts FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.is_community_lead(auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "mcn_listings_delete" ON public.mcn_listings;
CREATE POLICY "mcn_listings_delete"
  ON public.mcn_listings FOR DELETE
  USING (
    owner_id = auth.uid()
    OR public.is_community_lead(auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "mcn_carpools_delete" ON public.mcn_carpools;
CREATE POLICY "mcn_carpools_delete"
  ON public.mcn_carpools FOR DELETE
  USING (
    created_by = auth.uid()
    OR public.is_community_lead(auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "mcn_parent_corner_delete" ON public.mcn_parent_corner;
CREATE POLICY "mcn_parent_corner_delete"
  ON public.mcn_parent_corner FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.is_community_lead(auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "mcn_preorder_drops_delete" ON public.mcn_preorder_drops;
CREATE POLICY "mcn_preorder_drops_delete"
  ON public.mcn_preorder_drops FOR DELETE
  USING (
    created_by = auth.uid()
    OR public.is_community_lead(auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

NOTIFY pgrst, 'reload schema';
