-- Fix ambiguous "code" column reference in generate_community_code().
-- The local variable `code` collides with communities.code inside the
-- WHERE clause even when table-qualified. Rename the variable to
-- `generated_code` to eliminate the ambiguity entirely.

CREATE OR REPLACE FUNCTION public.generate_community_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars           TEXT    := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  generated_code  TEXT;
  exists_count    INTEGER;
  i               INTEGER;
BEGIN
  LOOP
    generated_code := '';
    FOR i IN 1..6 LOOP
      generated_code := generated_code || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
    END LOOP;

    SELECT COUNT(*) INTO exists_count
    FROM public.communities
    WHERE communities.code = generated_code;

    EXIT WHEN exists_count = 0;
  END LOOP;

  RETURN generated_code;
END;
$$;

NOTIFY pgrst, 'reload schema';
