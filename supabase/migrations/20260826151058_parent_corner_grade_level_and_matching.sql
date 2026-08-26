-- Parent Corner: structured grade level + intent matching.
--
-- `grade_class` is free text ("Class 8 - B", "2nd Year B.Tech (CSE)"), which
-- cannot be banded or compared. Matching two parents needs "within a year of
-- each other", so this adds a numeric ladder alongside the label:
--
--    -3 Playgroup · -2 Nursery · -1 LKG · 0 UKG
--     1..12  Class 1..12
--    13..17  College year 1..5
--
-- The label column stays the source of truth for display; grade_level only
-- exists so entries can be ranked and banded.

-- ============================================================
-- 1. grade_level column
-- ============================================================

ALTER TABLE public.mcn_parent_corner
  ADD COLUMN IF NOT EXISTS grade_level SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.mcn_parent_corner'::regclass
      AND conname  = 'mcn_parent_corner_grade_level_range'
  ) THEN
    ALTER TABLE public.mcn_parent_corner
      ADD CONSTRAINT mcn_parent_corner_grade_level_range CHECK (
        grade_level IS NULL OR grade_level BETWEEN -3 AND 17
      );
  END IF;
END $$;

COMMENT ON COLUMN public.mcn_parent_corner.grade_level IS
  'Numeric grade ladder for banded matching: -3 playgroup, -2 nursery, -1 LKG, 0 UKG, 1-12 school class, 13-17 college year. NULL when it could not be derived. Display always uses grade_class.';

-- ============================================================
-- 2. Best-effort parser, used for backfill and by the add form
-- ============================================================

CREATE OR REPLACE FUNCTION public.parse_parent_corner_grade_level(
  p_grade_class      text,
  p_institution_type text
)
RETURNS smallint
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_text text := lower(coalesce(p_grade_class, ''));
  v_num  int;
BEGIN
  IF btrim(v_text) = '' THEN
    RETURN NULL;
  END IF;

  -- Pre-school labels are checked first: "LKG - A" contains no useful digit,
  -- and "Nursery 2" would otherwise parse as Class 2.
  IF v_text ~ 'playgroup|play group|play-group|pre[ -]?kg|pre[ -]?nursery' THEN RETURN -3; END IF;
  IF v_text ~ 'nursery'                                                    THEN RETURN -2; END IF;
  IF v_text ~ '(^|[^a-z])lkg([^a-z]|$)|lower kg'                           THEN RETURN -1; END IF;
  IF v_text ~ '(^|[^a-z])ukg([^a-z]|$)|upper kg'                           THEN RETURN  0; END IF;

  v_num := NULLIF(substring(v_text from '([0-9]{1,2})'), '')::int;
  IF v_num IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_institution_type = 'college' THEN
    IF v_num BETWEEN 1 AND 5 THEN
      RETURN (12 + v_num)::smallint;
    END IF;
    RETURN NULL;
  END IF;

  IF v_num BETWEEN 1 AND 12 THEN
    RETURN v_num::smallint;
  END IF;

  RETURN NULL;
END;
$fn$;

-- Backfill existing rows. Anything ambiguous stays NULL and simply matches on
-- intent and school instead of grade.
UPDATE public.mcn_parent_corner
SET grade_level = public.parse_parent_corner_grade_level(grade_class, institution_type)
WHERE grade_level IS NULL;

CREATE INDEX IF NOT EXISTS mcn_parent_corner_match_idx
  ON public.mcn_parent_corner (community_id, grade_level);

-- ============================================================
-- 3. Intent labels (used in notification copy)
-- ============================================================

CREATE OR REPLACE FUNCTION public.parent_corner_intent_label(p_intent text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT CASE p_intent
    WHEN 'carpool'       THEN 'carpooling'
    WHEN 'study_group'   THEN 'a study group'
    WHEN 'homework_help' THEN 'homework help'
    WHEN 'school_info'   THEN 'school info & updates'
    WHEN 'activities'    THEN 'a sports / activities buddy'
    WHEN 'playdate'      THEN 'a playdate'
    ELSE                      'the same thing'
  END;
$fn$;

-- ============================================================
-- 4. notify_parent_corner_matches
-- ============================================================
--
-- `notifications` has no INSERT policy — every fan-out in this app goes through
-- a SECURITY DEFINER function, so this one does too. The notification body is
-- built here from the stored rows rather than passed in by the client: a
-- caller-supplied body would let any resident write arbitrary text into a
-- neighbour's notification feed.

CREATE OR REPLACE FUNCTION public.notify_parent_corner_matches(
  p_entry_id         uuid,
  p_target_entry_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_entry    public.mcn_parent_corner%ROWTYPE;
  v_inserted integer := 0;
BEGIN
  SELECT * INTO v_entry
  FROM public.mcn_parent_corner
  WHERE id = p_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent Corner entry not found';
  END IF;

  IF v_entry.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only notify matches for your own entry';
  END IF;

  IF COALESCE(array_length(p_target_entry_ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  IF array_length(p_target_entry_ids, 1) > 25 THEN
    RAISE EXCEPTION 'Too many recipients in one request';
  END IF;

  WITH targets AS (
    SELECT DISTINCT ON (t.user_id)
      t.id      AS target_entry_id,
      t.user_id AS target_user_id,
      (
        SELECT public.parent_corner_intent_label(i)
        FROM unnest(v_entry.intents) AS i
        WHERE i = ANY(t.intents)
        LIMIT 1
      ) AS shared_label
    FROM public.mcn_parent_corner t
    WHERE t.id = ANY(p_target_entry_ids)
      AND t.community_id = v_entry.community_id
      AND t.user_id IS DISTINCT FROM v_entry.user_id
      AND t.intents && v_entry.intents
      AND NOT EXISTS (
        SELECT 1 FROM public.notification_preferences np
        WHERE np.user_id = t.user_id
          AND np.channel = 'parent_corner'
          AND np.muted
      )
      -- One nudge per pair per month. Without this, re-opening the match sheet
      -- and tapping again would notify the same neighbour repeatedly.
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = t.user_id
          AND n.type = 'parent_corner_match'
          AND n.data->>'entry_id' = v_entry.id::text
          AND n.created_at > now() - interval '30 days'
      )
    ORDER BY t.user_id, t.id
  )
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT
    targets.target_user_id,
    'parent_corner_match',
    'A neighbour is looking for the same thing',
    COALESCE(NULLIF(btrim(v_entry.parent_name), ''), 'A parent')
      || ' (Flat ' || upper(v_entry.flat_number) || ') is also looking for '
      || COALESCE(targets.shared_label, 'the same thing')
      || ' — ' || v_entry.student_name || ', ' || v_entry.grade_class
      || ' at ' || v_entry.school_name || '.',
    jsonb_build_object(
      'entry_id',         v_entry.id,
      'matched_entry_id', targets.target_entry_id
    )
  FROM targets;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$fn$;

-- `REVOKE ... FROM public` does not undo Supabase's default privileges, which
-- grant EXECUTE on new public-schema functions to anon and authenticated. anon
-- has to be named explicitly or a logged-out caller can still invoke this.
REVOKE ALL     ON FUNCTION public.notify_parent_corner_matches(uuid, uuid[]) FROM public;
REVOKE EXECUTE ON FUNCTION public.notify_parent_corner_matches(uuid, uuid[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.notify_parent_corner_matches(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parse_parent_corner_grade_level(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parent_corner_intent_label(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
