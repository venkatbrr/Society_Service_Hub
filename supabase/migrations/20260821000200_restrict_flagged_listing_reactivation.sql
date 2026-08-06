-- A listing auto-hidden for review (flagged_for_review_at set, see
-- 20260821000000) should stay hidden until a lead or platform admin looks at
-- it — otherwise the reported owner could just flip it back on themselves,
-- defeating the whole point of "pending lead review".

CREATE OR REPLACE FUNCTION public.enforce_flagged_listing_reactivation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.flagged_for_review_at IS NOT NULL
     AND NEW.is_active = TRUE
     AND OLD.is_active = FALSE
     AND NOT public.is_community_lead(auth.uid())
     AND NOT public.is_platform_admin(auth.uid())
  THEN
    RAISE EXCEPTION 'This listing was hidden for review by a community lead. Only a lead or platform admin can reactivate it.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_flagged_listing_reactivation ON public.mcn_listings;
CREATE TRIGGER trg_enforce_flagged_listing_reactivation
BEFORE UPDATE OF is_active ON public.mcn_listings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_flagged_listing_reactivation();

NOTIFY pgrst, 'reload schema';
