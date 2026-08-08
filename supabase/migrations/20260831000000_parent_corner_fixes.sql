-- ============================================================
-- M1. mcn_parent_corner: scope UPDATE and DELETE to the row's community.
-- ============================================================

DROP POLICY IF EXISTS "mcn_parent_corner_update" ON public.mcn_parent_corner;
CREATE POLICY "mcn_parent_corner_update"
  ON public.mcn_parent_corner FOR UPDATE
  USING (
    (
      community_id = public.get_user_community_id()
      AND (
        user_id = auth.uid()
        OR public.is_community_lead(auth.uid())
      )
    )
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    (
      community_id = public.get_user_community_id()
      AND (
        user_id = auth.uid()
        OR public.is_community_lead(auth.uid())
      )
    )
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "mcn_parent_corner_delete" ON public.mcn_parent_corner;
CREATE POLICY "mcn_parent_corner_delete"
  ON public.mcn_parent_corner FOR DELETE
  USING (
    (
      community_id = public.get_user_community_id()
      AND (
        user_id = auth.uid()
        OR public.is_community_lead(auth.uid())
      )
    )
    OR public.is_platform_admin(auth.uid())
  );

-- ============================================================
-- M2. Length and value constraints.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.mcn_parent_corner'::regclass
      AND conname  = 'mcn_parent_corner_text_lengths'
  ) THEN
    ALTER TABLE public.mcn_parent_corner
      ADD CONSTRAINT mcn_parent_corner_text_lengths CHECK (
        length(student_name)  BETWEEN 1 AND 60
        AND length(school_name)   BETWEEN 1 AND 100
        AND length(board)         BETWEEN 1 AND 40
        AND length(grade_class)   BETWEEN 1 AND 40
        AND length(parent_name)   BETWEEN 1 AND 60
        AND length(flat_number)   BETWEEN 1 AND 12
        AND length(contact_phone) BETWEEN 1 AND 15
        AND (notes IS NULL OR length(notes) <= 300)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.mcn_parent_corner'::regclass
      AND conname  = 'mcn_parent_corner_intents_valid'
  ) THEN
    ALTER TABLE public.mcn_parent_corner
      ADD CONSTRAINT mcn_parent_corner_intents_valid CHECK (
        coalesce(array_length(intents, 1), 0) <= 7
        AND intents <@ ARRAY[
          'carpool','study_group','homework_help',
          'school_info','activities','playdate','other'
        ]::text[]
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
