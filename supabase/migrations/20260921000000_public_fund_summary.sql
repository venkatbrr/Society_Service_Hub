-- ============================================================
-- Migration: Public fund summary for shared links
-- Date: 2026-09-21
-- ============================================================
-- The fund Share button puts `<origin>/funds/<id>` into a WhatsApp group.
-- Anyone tapping it who is not signed in currently gets bounced to /login with
-- no idea what they are being asked to sign in for. This RPC gives that visitor
-- the headline numbers — and nothing else.
--
-- Deliberately NOT exposed here: contributor names, flat numbers, per-block
-- breakdowns, payment methods, collector names, expense titles. Those identify
-- who paid what to anyone holding a forwarded link, so they stay behind auth.
-- Only aggregates and the fund's own name cross the line.

CREATE OR REPLACE FUNCTION public.get_fund_public_summary(p_event_id UUID)
RETURNS TABLE (
  fund_title         TEXT,
  community_name     TEXT,
  is_closed          BOOLEAN,
  collected          NUMERIC,
  spent              NUMERIC,
  balance            NUMERIC,
  contributor_count  INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.title::TEXT,
    c.name::TEXT,
    COALESCE(e.is_closed, false),
    COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'), 0)::NUMERIC,
    COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense'), 0)::NUMERIC,
    (COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'), 0)
      - COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense'), 0))::NUMERIC,
    COUNT(*) FILTER (WHERE t.type = 'income')::INT
  FROM public.events e
  JOIN public.communities c ON c.id = e.community_id
  LEFT JOIN public.event_transactions t ON t.event_id = e.id
  WHERE e.id = p_event_id
    AND COALESCE(c.funds_enabled, false)
  GROUP BY e.title, c.name, e.is_closed;
$$;

COMMENT ON FUNCTION public.get_fund_public_summary(UUID) IS
  'Aggregates only, for the signed-out landing on a shared fund link. Never add a column that names a person, a flat, or a single transaction — the whole point is that a forwarded WhatsApp link cannot reveal who paid what.';

GRANT EXECUTE ON FUNCTION public.get_fund_public_summary(UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
