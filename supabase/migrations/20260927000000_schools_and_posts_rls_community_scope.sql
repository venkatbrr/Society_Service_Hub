-- supabase/migrations/20260927000000_schools_and_posts_rls_community_scope.sql
--
-- Hardens the write policies on the three tables behind the two hidden MCN
-- surfaces — `schools` / `school_reviews` (SCHOOLS_CATALOG_ENABLED) and
-- `mcn_posts` (BORROW_SHARE_ENABLED). Two defects, both dating from the
-- original 2026-07 migrations:
--
--   1. The UPDATE policies on `schools` and `mcn_posts` have a USING clause and
--      no WITH CHECK. Postgres then re-uses USING only for row *selection* — the
--      post-update row is never re-checked — so the owner of a row could rewrite
--      `community_id` (moving their school listing or borrow post into another
--      society's directory) or hand the row to another user by rewriting
--      `created_by` / `user_id`, and the policy would still pass.
--
--   2. The lead-moderation clause is not community-scoped. `is_community_lead()`
--      answers "is this user a president or vice-president anywhere", not "of
--      this row's community" — so a president of society A could update or
--      delete a school, review, or borrow post belonging to society B by id.
--
-- No screen does either; the exposure is direct PostgREST calls. Both surfaces
-- are hidden today, which is why this lands before they come back.
--
-- The replacement is the pattern already used by `mcn_parent_corner` (migration
-- 20260831000000): community-pinned owner-or-lead, with the platform admin
-- override outside the pin, because platform admins have `community_id IS NULL`
-- and `get_user_community_id()` therefore returns NULL for them.
--
-- Four sibling MCN tables carry defect (2) as well — mcn_listings, mcn_carpools,
-- mcn_preorder_drops, mcn_preorder_items/mcn_products. They belong to LIVE
-- features and are deliberately out of scope here; see docs/CLAUDE.md §9.

-- 1. schools ------------------------------------------------------------------
DROP POLICY IF EXISTS "schools_update" ON public.schools;
CREATE POLICY "schools_update"
  ON public.schools FOR UPDATE
  USING (
    (
      community_id = public.get_user_community_id()
      AND (created_by = auth.uid() OR public.is_community_lead(auth.uid()))
    )
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    (
      community_id = public.get_user_community_id()
      AND (created_by = auth.uid() OR public.is_community_lead(auth.uid()))
    )
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "schools_delete" ON public.schools;
CREATE POLICY "schools_delete"
  ON public.schools FOR DELETE
  USING (
    (
      community_id = public.get_user_community_id()
      AND (created_by = auth.uid() OR public.is_community_lead(auth.uid()))
    )
    OR public.is_platform_admin(auth.uid())
  );

-- 2. school_reviews -----------------------------------------------------------
-- The UPDATE policy already had WITH CHECK, but neither clause pinned the
-- community, so a resident could rewrite their own review's `community_id` and
-- move it into another society's report card.
DROP POLICY IF EXISTS "school_reviews_update" ON public.school_reviews;
CREATE POLICY "school_reviews_update"
  ON public.school_reviews FOR UPDATE
  USING (
    (community_id = public.get_user_community_id() AND user_id = auth.uid())
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    (community_id = public.get_user_community_id() AND user_id = auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "school_reviews_delete" ON public.school_reviews;
CREATE POLICY "school_reviews_delete"
  ON public.school_reviews FOR DELETE
  USING (
    (
      community_id = public.get_user_community_id()
      AND (user_id = auth.uid() OR public.is_community_lead(auth.uid()))
    )
    OR public.is_platform_admin(auth.uid())
  );

-- 3. mcn_posts ----------------------------------------------------------------
DROP POLICY IF EXISTS "mcn_posts_update" ON public.mcn_posts;
CREATE POLICY "mcn_posts_update"
  ON public.mcn_posts FOR UPDATE
  USING (
    (
      community_id = public.get_user_community_id()
      AND (user_id = auth.uid() OR public.is_community_lead(auth.uid()))
    )
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    (
      community_id = public.get_user_community_id()
      AND (user_id = auth.uid() OR public.is_community_lead(auth.uid()))
    )
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "mcn_posts_delete" ON public.mcn_posts;
CREATE POLICY "mcn_posts_delete"
  ON public.mcn_posts FOR DELETE
  USING (
    (
      community_id = public.get_user_community_id()
      AND (user_id = auth.uid() OR public.is_community_lead(auth.uid()))
    )
    OR public.is_platform_admin(auth.uid())
  );

-- 4. update_school_aspect_averages() ------------------------------------------
-- The review-aggregate trigger is SECURITY DEFINER with a mutable search_path,
-- and EXECUTE is granted to `anon` / `authenticated`, so it is reachable at
-- /rest/v1/rpc/update_school_aspect_averages. Calling a trigger function
-- directly always errors ("can only be called as a trigger"), so this is
-- hardening rather than a live hole — but both are flagged by Supabase's own
-- security advisor and both are cheap to close. Body is byte-for-byte the
-- version from 20260802000000; only the search_path pin and the grants change.
CREATE OR REPLACE FUNCTION public.update_school_aspect_averages()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_school_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_school_id := OLD.school_id;
  ELSE
    target_school_id := NEW.school_id;
  END IF;

  IF target_school_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    UPDATE public.schools
    SET
      review_count = COALESCE((SELECT COUNT(*) FROM public.school_reviews WHERE school_id = target_school_id), 0),
      avg_academics = COALESCE((SELECT ROUND(AVG(academics_score)::numeric, 1) FROM public.school_reviews WHERE school_id = target_school_id), 0),
      avg_teachers = COALESCE((SELECT ROUND(AVG(teachers_score)::numeric, 1) FROM public.school_reviews WHERE school_id = target_school_id), 0),
      avg_infrastructure = COALESCE((SELECT ROUND(AVG(infrastructure_score)::numeric, 1) FROM public.school_reviews WHERE school_id = target_school_id), 0),
      avg_sports_activities = COALESCE((SELECT ROUND(AVG(sports_activities_score)::numeric, 1) FROM public.school_reviews WHERE school_id = target_school_id), 0),
      avg_safety = COALESCE((SELECT ROUND(AVG(safety_score)::numeric, 1) FROM public.school_reviews WHERE school_id = target_school_id), 0),
      avg_transport = COALESCE((SELECT ROUND(AVG(transport_score)::numeric, 1) FROM public.school_reviews WHERE school_id = target_school_id), 0),
      avg_value = COALESCE((SELECT ROUND(AVG(value_score)::numeric, 1) FROM public.school_reviews WHERE school_id = target_school_id), 0),
      avg_happiness = COALESCE((SELECT ROUND(AVG(happiness_score)::numeric, 1) FROM public.school_reviews WHERE school_id = target_school_id), 0),
      updated_at = now()
    WHERE id = target_school_id::uuid;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.update_school_aspect_averages() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_school_aspect_averages() FROM anon;
REVOKE ALL ON FUNCTION public.update_school_aspect_averages() FROM authenticated;

-- The trigger runs as the definer (postgres), so no role grant is needed for it
-- to keep firing. Re-assert it anyway: CREATE OR REPLACE does not drop it, but
-- an explicit statement makes the wiring obvious to the next reader.
DROP TRIGGER IF EXISTS on_school_review_change ON public.school_reviews;
CREATE TRIGGER on_school_review_change
AFTER INSERT OR UPDATE OR DELETE ON public.school_reviews
FOR EACH ROW EXECUTE FUNCTION public.update_school_aspect_averages();

NOTIFY pgrst, 'reload schema';
