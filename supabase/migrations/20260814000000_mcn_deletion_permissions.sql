-- ============================================================
-- Migration: Enhanced MCN Deletion Permissions for Publishers and Community Leads (President/VP)
-- Date: 2026-08-14
-- ============================================================

-- 1. mcn_preorder_drops: allow host/creator OR community lead (president/vp) / admin to delete
DROP POLICY IF EXISTS "mcn_preorder_drops_delete" ON public.mcn_preorder_drops;
CREATE POLICY "mcn_preorder_drops_delete"
  ON public.mcn_preorder_drops FOR DELETE
  USING (
    created_by = auth.uid()
    OR public.is_community_lead(auth.uid())
    OR public.is_admin(auth.uid())
  );

-- 2. mcn_listings: allow owner OR community lead (president/vp) / admin to delete
DROP POLICY IF EXISTS "mcn_listings_delete" ON public.mcn_listings;
CREATE POLICY "mcn_listings_delete"
  ON public.mcn_listings FOR DELETE
  USING (
    owner_id = auth.uid()
    OR public.is_community_lead(auth.uid())
    OR public.is_admin(auth.uid())
  );

-- 3. mcn_carpools: allow creator OR community lead (president/vp) / admin to delete
DROP POLICY IF EXISTS "mcn_carpools_delete" ON public.mcn_carpools;
CREATE POLICY "mcn_carpools_delete"
  ON public.mcn_carpools FOR DELETE
  USING (
    created_by = auth.uid()
    OR public.is_community_lead(auth.uid())
    OR public.is_admin(auth.uid())
  );

-- 4. mcn_parent_corner: allow creator OR community lead (president/vp) / admin to delete
DROP POLICY IF EXISTS "mcn_parent_corner_delete" ON public.mcn_parent_corner;
CREATE POLICY "mcn_parent_corner_delete"
  ON public.mcn_parent_corner FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.is_community_lead(auth.uid())
    OR public.is_admin(auth.uid())
  );

-- 5. mcn_posts: allow creator OR community lead (president/vp) / admin to delete
DROP POLICY IF EXISTS "mcn_posts_delete" ON public.mcn_posts;
CREATE POLICY "mcn_posts_delete"
  ON public.mcn_posts FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.is_community_lead(auth.uid())
    OR public.is_admin(auth.uid())
  );
