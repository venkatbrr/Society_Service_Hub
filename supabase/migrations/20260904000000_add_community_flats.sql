-- ============================================================
-- Migration: Add community_flats, profiles.flat_id & sync triggers
-- Date: 2026-09-04
-- ============================================================

-- ============================================================
-- Section 1 - community_flats table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.community_flats (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  block_id     UUID REFERENCES public.community_blocks(id) ON DELETE CASCADE,
  flat_number  TEXT NOT NULL CHECK (flat_number = upper(flat_number)
                                    AND flat_number ~ '^[A-Z0-9]{1,10}$'),
  floor_label  TEXT CHECK (floor_label IS NULL OR length(floor_label) <= 4),
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PG15+ NULLS NOT DISTINCT so the no-block case is still deduplicated
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_flats_unique
  ON public.community_flats (community_id, block_id, flat_number) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_community_flats_block_active
  ON public.community_flats (block_id) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_community_flats_community_active
  ON public.community_flats (community_id) WHERE archived_at IS NULL;

-- Floor label derivation trigger
CREATE OR REPLACE FUNCTION public.derive_flat_floor_label()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF length(NEW.flat_number) > 2 THEN
    NEW.floor_label := substr(NEW.flat_number, 1, length(NEW.flat_number) - 2);
  ELSE
    NEW.floor_label := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS flat_floor_label_trigger ON public.community_flats;
CREATE TRIGGER flat_floor_label_trigger
BEFORE INSERT OR UPDATE OF flat_number ON public.community_flats
FOR EACH ROW
EXECUTE FUNCTION public.derive_flat_floor_label();

-- Block assignment integrity trigger
CREATE OR REPLACE FUNCTION public.validate_flat_block_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  block_community_id UUID;
BEGIN
  IF NEW.block_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT community_id
  INTO block_community_id
  FROM public.community_blocks
  WHERE id = NEW.block_id;

  IF block_community_id IS NULL THEN
    RAISE EXCEPTION 'Assigned block does not exist';
  END IF;

  IF NEW.community_id IS NULL OR block_community_id IS DISTINCT FROM NEW.community_id THEN
    RAISE EXCEPTION 'Flat block must belong to the same community';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS flat_block_guard ON public.community_flats;
CREATE TRIGGER flat_block_guard
BEFORE INSERT OR UPDATE OF community_id, block_id ON public.community_flats
FOR EACH ROW
EXECUTE FUNCTION public.validate_flat_block_assignment();

-- ============================================================
-- Section 2 - profiles.flat_id & sync trigger
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS flat_id UUID REFERENCES public.community_flats(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_flat_id
  ON public.profiles (flat_id) WHERE flat_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_profile_flat_denorm()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  flat_row   public.community_flats%ROWTYPE;
  block_name TEXT;
BEGIN
  IF NEW.flat_id IS NOT NULL THEN
    SELECT * INTO flat_row
    FROM public.community_flats
    WHERE id = NEW.flat_id;

    IF flat_row.id IS NULL THEN
      RAISE EXCEPTION 'Selected flat does not exist';
    END IF;

    IF flat_row.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Selected flat is archived';
    END IF;

    IF NEW.community_id IS NOT NULL AND flat_row.community_id IS DISTINCT FROM NEW.community_id THEN
      RAISE EXCEPTION 'Flat must belong to the profile community';
    END IF;

    NEW.block_id := flat_row.block_id;

    IF flat_row.block_id IS NOT NULL THEN
      SELECT name INTO block_name
      FROM public.community_blocks
      WHERE id = flat_row.block_id;

      NEW.flat_number := COALESCE(block_name, '') || '-' || flat_row.flat_number;
    ELSE
      NEW.flat_number := flat_row.flat_number;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.flat_id IS NOT NULL AND NEW.flat_id IS NULL THEN
    NEW.block_id := NULL;
    NEW.flat_number := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_flat_sync_trigger ON public.profiles;
CREATE TRIGGER profile_flat_sync_trigger
BEFORE INSERT OR UPDATE OF flat_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_flat_denorm();

-- ============================================================
-- Section 3 - block disable integrity guards
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_community_blocks_enabled(p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_community_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Only community leads can manage blocks';
  END IF;

  SELECT * INTO caller_profile
  FROM public.profiles
  WHERE id = auth.uid();

  IF caller_profile.community_id IS NULL THEN
    RAISE EXCEPTION 'Community not found';
  END IF;

  IF NOT p_enabled THEN
    IF EXISTS (
      SELECT 1 FROM public.community_flats
      WHERE community_id = caller_profile.community_id
        AND block_id IS NOT NULL
        AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Cannot disable blocks while active flats are linked to blocks. Archive the flats first.';
    END IF;

    UPDATE public.profiles
    SET block_id = NULL
    WHERE community_id = caller_profile.community_id;

    UPDATE public.fund_roles fr
    SET block_id = NULL
    FROM public.events e
    WHERE fr.event_id = e.id
      AND e.community_id = caller_profile.community_id
      AND fr.role = 'collector';
  END IF;

  UPDATE public.communities
  SET blocks_enabled = p_enabled
  WHERE id = caller_profile.community_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_set_blocks_enabled(
  p_community_id UUID,
  p_enabled BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can toggle blocks';
  END IF;

  IF NOT p_enabled THEN
    IF EXISTS (
      SELECT 1 FROM public.community_flats
      WHERE community_id = p_community_id
        AND block_id IS NOT NULL
        AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Cannot disable blocks while active flats are linked to blocks. Archive the flats first.';
    END IF;

    UPDATE public.profiles
    SET block_id = NULL
    WHERE community_id = p_community_id;

    UPDATE public.fund_roles fr
    SET block_id = NULL
    FROM public.events e
    WHERE fr.event_id = e.id
      AND e.community_id = p_community_id
      AND fr.role = 'collector';
  END IF;

  UPDATE public.communities
  SET blocks_enabled = p_enabled
  WHERE id = p_community_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Community not found';
  END IF;
END;
$$;

-- ============================================================
-- Section 4 - RLS Policies on community_flats
-- ============================================================

ALTER TABLE public.community_flats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_flats_select" ON public.community_flats;
CREATE POLICY "community_flats_select"
  ON public.community_flats
  FOR SELECT
  TO authenticated
  USING (archived_at IS NULL);

-- ============================================================
-- Section 5 - RPCs for resident & community operations
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_community_flats(
  p_community_id UUID,
  p_block_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  block_id UUID,
  block_name TEXT,
  flat_number TEXT,
  floor_label TEXT,
  resident_count INT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    f.id,
    f.block_id,
    b.name AS block_name,
    f.flat_number,
    f.floor_label,
    COUNT(p.id)::INT AS resident_count
  FROM public.community_flats f
  LEFT JOIN public.community_blocks b ON b.id = f.block_id AND b.archived_at IS NULL
  LEFT JOIN public.profiles p ON p.flat_id = f.id AND p.removed_at IS NULL
  WHERE f.community_id = p_community_id
    AND f.archived_at IS NULL
    AND (p_block_id IS NULL OR f.block_id = p_block_id)
  GROUP BY f.id, f.block_id, b.name, f.flat_number, f.floor_label
  ORDER BY
    COALESCE(b.name, '') ASC,
    length(f.flat_number) ASC,
    f.flat_number ASC;
$$;

CREATE OR REPLACE FUNCTION public.set_my_flat(p_flat_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  caller_profile public.profiles%ROWTYPE;
  flat_row public.community_flats%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO caller_profile
  FROM public.profiles
  WHERE id = caller_id;

  IF caller_profile.id IS NULL OR caller_profile.community_id IS NULL THEN
    RAISE EXCEPTION 'You must join a community before setting your flat';
  END IF;

  IF p_flat_id IS NULL THEN
    UPDATE public.profiles
    SET flat_id = NULL
    WHERE id = caller_id;
    RETURN;
  END IF;

  SELECT * INTO flat_row
  FROM public.community_flats
  WHERE id = p_flat_id;

  IF flat_row.id IS NULL OR flat_row.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Selected flat not found or archived';
  END IF;

  IF flat_row.community_id IS DISTINCT FROM caller_profile.community_id THEN
    RAISE EXCEPTION 'Selected flat does not belong to your community';
  END IF;

  UPDATE public.profiles
  SET flat_id = p_flat_id
  WHERE id = caller_id;
END;
$$;

-- Community lead flat operations
CREATE OR REPLACE FUNCTION public.add_community_flats(
  p_block_id UUID,
  p_flat_numbers TEXT[]
)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_profile public.profiles%ROWTYPE;
  block_row public.community_blocks%ROWTYPE;
  raw_num TEXT;
  clean_num TEXT;
  created_count INT := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_community_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Only community leads can add flats';
  END IF;

  SELECT * INTO caller_profile FROM public.profiles WHERE id = auth.uid();

  SELECT * INTO block_row
  FROM public.community_blocks
  WHERE id = p_block_id;

  IF block_row.id IS NULL OR block_row.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Block not found or archived';
  END IF;

  IF block_row.community_id IS DISTINCT FROM caller_profile.community_id THEN
    RAISE EXCEPTION 'Block does not belong to your community';
  END IF;

  IF p_flat_numbers IS NULL OR array_length(p_flat_numbers, 1) = 0 THEN
    RETURN 0;
  END IF;

  FOREACH raw_num IN ARRAY p_flat_numbers LOOP
    clean_num := upper(regexp_replace(COALESCE(raw_num, ''), '[^A-Za-z0-9]', '', 'g'));
    IF length(clean_num) > 0 AND length(clean_num) <= 10 THEN
      INSERT INTO public.community_flats (community_id, block_id, flat_number)
      VALUES (caller_profile.community_id, p_block_id, clean_num)
      ON CONFLICT (community_id, block_id, flat_number) DO UPDATE
        SET archived_at = NULL, updated_at = now()
        WHERE public.community_flats.archived_at IS NOT NULL;

      IF FOUND THEN
        created_count := created_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN created_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_community_flat(p_flat_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_profile public.profiles%ROWTYPE;
  flat_row public.community_flats%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_community_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Only community leads can archive flats';
  END IF;

  SELECT * INTO caller_profile FROM public.profiles WHERE id = auth.uid();

  SELECT * INTO flat_row
  FROM public.community_flats
  WHERE id = p_flat_id;

  IF flat_row.id IS NULL THEN
    RAISE EXCEPTION 'Flat not found';
  END IF;

  IF flat_row.community_id IS DISTINCT FROM caller_profile.community_id THEN
    RAISE EXCEPTION 'Flat does not belong to your community';
  END IF;

  UPDATE public.community_flats
  SET archived_at = now(), updated_at = now()
  WHERE id = p_flat_id;

  -- Disconnect residents mapped to this flat
  UPDATE public.profiles
  SET flat_id = NULL
  WHERE flat_id = p_flat_id;
END;
$$;

-- Platform admin flat operations
CREATE OR REPLACE FUNCTION public.platform_add_community_flats(
  p_community_id UUID,
  p_block_id UUID,
  p_flat_numbers TEXT[]
)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  raw_num TEXT;
  clean_num TEXT;
  created_count INT := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can add flats';
  END IF;

  IF p_block_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.community_blocks
      WHERE id = p_block_id AND community_id = p_community_id
    ) THEN
      RAISE EXCEPTION 'Block does not belong to the given community';
    END IF;
  END IF;

  IF p_flat_numbers IS NULL OR array_length(p_flat_numbers, 1) = 0 THEN
    RETURN 0;
  END IF;

  FOREACH raw_num IN ARRAY p_flat_numbers LOOP
    clean_num := upper(regexp_replace(COALESCE(raw_num, ''), '[^A-Za-z0-9]', '', 'g'));
    IF length(clean_num) > 0 AND length(clean_num) <= 10 THEN
      INSERT INTO public.community_flats (community_id, block_id, flat_number)
      VALUES (p_community_id, p_block_id, clean_num)
      ON CONFLICT (community_id, block_id, flat_number) DO UPDATE
        SET archived_at = NULL, updated_at = now()
        WHERE public.community_flats.archived_at IS NOT NULL;

      IF FOUND THEN
        created_count := created_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN created_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_archive_community_flat(p_flat_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can archive flats';
  END IF;

  UPDATE public.community_flats
  SET archived_at = now(), updated_at = now()
  WHERE id = p_flat_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Flat not found';
  END IF;

  UPDATE public.profiles
  SET flat_id = NULL
  WHERE flat_id = p_flat_id;
END;
$$;

-- ============================================================
-- Section 6 - Grants & reload
-- ============================================================

GRANT SELECT ON public.community_flats TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_community_flats(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_flat(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_community_flats(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_community_flat(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_add_community_flats(UUID, UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_archive_community_flat(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
