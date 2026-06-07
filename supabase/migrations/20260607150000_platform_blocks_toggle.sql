-- ============================================================
-- Migration: Platform set blocks enabled RPC + auto-enable on add
-- Date: 2026-06-07
-- ============================================================

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

  UPDATE public.communities
  SET blocks_enabled = p_enabled
  WHERE id = p_community_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Community not found';
  END IF;

  IF NOT p_enabled THEN
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
END;
$$;

-- Update platform_add_community_block to automatically set blocks_enabled = true
CREATE OR REPLACE FUNCTION public.platform_add_community_block(p_community_id UUID, p_name TEXT)
RETURNS public.community_blocks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  inserted_row public.community_blocks%ROWTYPE;
  existing_row public.community_blocks%ROWTYPE;
  block_name TEXT := btrim(p_name);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can add blocks';
  END IF;

  IF block_name IS NULL OR length(block_name) = 0 THEN
    RAISE EXCEPTION 'Block name is required';
  END IF;

  -- Auto-enable blocks on the community
  UPDATE public.communities
  SET blocks_enabled = true
  WHERE id = p_community_id;

  SELECT *
  INTO existing_row
  FROM public.community_blocks
  WHERE community_id = p_community_id
    AND name = block_name
  LIMIT 1;

  IF FOUND THEN
    IF existing_row.archived_at IS NULL THEN
      RAISE EXCEPTION 'Block already exists';
    END IF;

    UPDATE public.community_blocks
    SET archived_at = NULL,
        updated_at = now()
    WHERE id = existing_row.id
    RETURNING * INTO inserted_row;

    RETURN inserted_row;
  END IF;

  INSERT INTO public.community_blocks (community_id, name)
  VALUES (p_community_id, block_name)
  RETURNING * INTO inserted_row;

  RETURN inserted_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_set_blocks_enabled(UUID, BOOLEAN) TO authenticated;
