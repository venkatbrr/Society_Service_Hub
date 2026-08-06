-- Limit each resident to one business listing per category, to stop the
-- same person from posting duplicate/near-duplicate listings to fill the
-- directory. A friendly trigger message is used instead of a bare unique
-- index violation so the client can show the resident something readable.

CREATE OR REPLACE FUNCTION public.enforce_one_listing_per_owner_category()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.mcn_listings l
    WHERE l.owner_id = NEW.owner_id
      AND l.category_id = NEW.category_id
      AND l.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'You already have a business listed under this category. Edit that listing instead of creating another.'
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_one_listing_per_owner_category ON public.mcn_listings;
CREATE TRIGGER trg_one_listing_per_owner_category
BEFORE INSERT OR UPDATE OF owner_id, category_id ON public.mcn_listings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_one_listing_per_owner_category();

NOTIFY pgrst, 'reload schema';
