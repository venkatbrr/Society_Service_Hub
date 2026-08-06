-- Anti-spam control for food drops: a host may have at most 3 drops open
-- (status = 'open' and cutoff not yet passed) at the same time. Unlike
-- business listings, drops are meant to be re-hosted repeatedly over time —
-- this caps concurrent flooding of the "Open Pre-orders" tab, not repeat use.

CREATE OR REPLACE FUNCTION public.enforce_max_open_drops_per_host()
RETURNS TRIGGER AS $$
DECLARE
  v_open_count INTEGER;
  v_max_open CONSTANT INTEGER := 3;
BEGIN
  IF NEW.status IS DISTINCT FROM 'open' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_open_count
  FROM public.mcn_preorder_drops d
  WHERE d.created_by = NEW.created_by
    AND d.status = 'open'
    AND d.cutoff_at > now()
    AND d.id <> NEW.id;

  IF v_open_count >= v_max_open THEN
    RAISE EXCEPTION 'You can have at most % open food drops at the same time. Close or wait for one to reach its cut-off before hosting another.', v_max_open;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_max_open_drops_per_host ON public.mcn_preorder_drops;
CREATE TRIGGER trg_enforce_max_open_drops_per_host
BEFORE INSERT OR UPDATE OF status, cutoff_at ON public.mcn_preorder_drops
FOR EACH ROW
EXECUTE FUNCTION public.enforce_max_open_drops_per_host();

NOTIFY pgrst, 'reload schema';
