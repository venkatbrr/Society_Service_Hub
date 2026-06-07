-- Allow re-adding an archived block name by restoring the archived row
CREATE OR REPLACE FUNCTION public.add_community_block(p_name TEXT)
RETURNS public.community_blocks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_profile public.profiles%ROWTYPE;
  inserted_row public.community_blocks%ROWTYPE;
  existing_row public.community_blocks%ROWTYPE;
  block_name TEXT := btrim(p_name);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_community_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Only community leads can add blocks';
  END IF;

  IF block_name IS NULL OR length(block_name) = 0 THEN
    RAISE EXCEPTION 'Block name is required';
  END IF;

  SELECT * INTO caller_profile FROM public.profiles WHERE id = auth.uid();

  IF caller_profile.community_id IS NULL OR NOT public.is_funds_enabled(caller_profile.community_id) THEN
    RAISE EXCEPTION 'Funds must be active before adding blocks';
  END IF;

  SELECT *
  INTO existing_row
  FROM public.community_blocks
  WHERE community_id = caller_profile.community_id
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
  VALUES (caller_profile.community_id, block_name)
  RETURNING * INTO inserted_row;

  RETURN inserted_row;
END;
$$;

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

  IF NOT public.is_funds_enabled(p_community_id) THEN
    RAISE EXCEPTION 'Blocks can be managed only when funds are active';
  END IF;

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
