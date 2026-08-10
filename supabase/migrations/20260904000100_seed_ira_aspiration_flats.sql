-- ============================================================
-- Migration: Reusable platform_seed_community_flats RPC & Seed IRA Aspiration
-- Date: 2026-09-04
-- ============================================================

CREATE OR REPLACE FUNCTION public.platform_seed_community_flats(
  p_community_id UUID,
  p_payload JSONB,
  p_block_label TEXT DEFAULT 'Block'
)
RETURNS TABLE (
  blocks_created INT,
  flats_created INT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  effective_label TEXT;
  block_entry     JSONB;
  block_name_raw  TEXT;
  block_name_val  TEXT;
  current_block_id UUID;
  flat_val_raw    JSONB;
  clean_flat      TEXT;
  b_count         INT := 0;
  f_count         INT := 0;
BEGIN
  -- Allow platform admin callers or direct migration execution (auth.uid() IS NULL)
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can seed community flats';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.communities WHERE id = p_community_id) THEN
    RAISE EXCEPTION 'Community not found: %', p_community_id;
  END IF;

  effective_label := COALESCE(NULLIF(btrim(p_block_label), ''), 'Block');
  IF effective_label NOT IN ('Block', 'Tower') THEN
    effective_label := 'Block';
  END IF;

  UPDATE public.communities
  SET blocks_enabled = true,
      block_label = effective_label
  WHERE id = p_community_id;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'array' THEN
    RETURN QUERY SELECT b_count, f_count;
    RETURN;
  END IF;

  FOR block_entry IN SELECT * FROM jsonb_array_elements(p_payload) LOOP
    block_name_raw := block_entry->>'block';
    block_name_val := btrim(COALESCE(block_name_raw, ''));

    IF length(block_name_val) > 0 THEN
      INSERT INTO public.community_blocks (community_id, name)
      VALUES (p_community_id, block_name_val)
      ON CONFLICT (community_id, name) DO UPDATE
        SET archived_at = NULL, updated_at = now()
      RETURNING id INTO current_block_id;

      b_count := b_count + 1;

      IF block_entry->'flats' IS NOT NULL AND jsonb_typeof(block_entry->'flats') = 'array' THEN
        FOR flat_val_raw IN SELECT * FROM jsonb_array_elements(block_entry->'flats') LOOP
          clean_flat := upper(regexp_replace(trim(both '"' from flat_val_raw::text), '[^A-Za-z0-9]', '', 'g'));

          IF length(clean_flat) > 0 AND length(clean_flat) <= 10 THEN
            INSERT INTO public.community_flats (community_id, block_id, flat_number)
            VALUES (p_community_id, current_block_id, clean_flat)
            ON CONFLICT (community_id, block_id, flat_number) DO UPDATE
              SET archived_at = NULL, updated_at = now()
              WHERE public.community_flats.archived_at IS NOT NULL;

            f_count := f_count + 1;
          END IF;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  RETURN QUERY SELECT b_count, f_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_seed_community_flats(UUID, JSONB, TEXT) TO authenticated;

-- Seed IRA Aspiration (64cd9fa6-ad3b-40f0-9f1e-6b9f6a6fce06)
SELECT * FROM public.platform_seed_community_flats(
  '64cd9fa6-ad3b-40f0-9f1e-6b9f6a6fce06'::UUID,
  '[
    {
      "block": "A",
      "flats": [
        "102","104","106","110","112","114","116","202","204","205","207","209","211","212","213","214","217",
        "302","304","306","309","310","312","313","314","315","317","401","402","404","406","407","408","409",
        "410","412","414","415","502","503","504","506","507","508","509","510","511","513","514","516","601",
        "603","604","607","608","609","610","611","612","613","614","616","617","701","702","704","705","706",
        "707","709","710","712","714","716","801","803","806","807","809","811","812","813","814","815","906",
        "908","910","912","914","916","917","G04","G06","G13","G14"
      ]
    },
    {
      "block": "B",
      "flats": [
        "102","104","106","109","110","114","115","201","202","203","204","205","207","208","209","210","213",
        "214","216","217","302","304","305","306","308","309","310","314","315","317","402","403","407","409",
        "410","411","412","413","414","502","503","504","507","508","510","511","512","514","516","603","604",
        "605","606","607","610","611","612","613","615","617","701","702","706","708","709","710","711","716",
        "801","808","809","811","812","813","814","815","816","817","902","904","906","908","910","912","914",
        "916","G10","G13"
      ]
    },
    {
      "block": "C",
      "flats": [
        "103","104","106","108","109","110","112","203","205","207","209","211","212","213","214","302","303",
        "305","306","308","309","311","312","314","316","317","401","403","405","406","407","408","409","410",
        "411","413","414","415","417","502","503","504","505","506","508","510","511","512","514","515","516",
        "601","607","609","611","613","614","615","701","702","703","705","711","714","716","717","801","805",
        "807","810","811","813","814","816","817","904","906","914","916","G08","G13"
      ]
    },
    {
      "block": "D",
      "flats": [
        "102","104","105","106","110","112","201","203","204","205","207","209","211","212","213","214","215",
        "216","217","302","303","304","308","309","310","316","401","403","404","409","410","414","415","501",
        "502","503","504","506","510","511","512","514","516","601","602","603","605","611","612","613","615",
        "616","617","701","705","706","708","712","716","801","802","806","808","809","811","812","813","814",
        "815","904","906","914","916","917","G04"
      ]
    },
    {
      "block": "E",
      "flats": [
        "108","204","205","206","208","301","303","401","402","404","406","408","501","502","505","506","507",
        "602","604","606","702","703","704","707","801","802","804","806","902","903","G04"
      ]
    }
  ]'::JSONB,
  'Block'
);

NOTIFY pgrst, 'reload schema';
