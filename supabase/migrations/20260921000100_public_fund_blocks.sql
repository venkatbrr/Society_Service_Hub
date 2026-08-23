-- ============================================================
-- Migration: Public block-wise collection for shared fund links
-- Date: 2026-09-21
-- ============================================================
-- Companion to get_fund_public_summary. A resident who taps the WhatsApp link
-- before signing in should be able to see how their block is doing — that is
-- the number that makes them want to pay — without the contribution list,
-- which names who paid what.
--
-- Same line as the summary RPC: aggregates cross, identities do not. A block
-- with a single contributor still only ever reports a count and a sum.

CREATE OR REPLACE FUNCTION public.get_fund_public_blocks(p_event_id UUID)
RETURNS TABLE (
  block_name   TEXT,
  total_flats  INT,
  paid_flats   INT,
  collected    NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.name::TEXT,
    COUNT(f.id)::INT,
    COUNT(t.id)::INT,
    COALESCE(SUM(t.amount), 0)::NUMERIC
  FROM public.events e
  JOIN public.communities c      ON c.id = e.community_id AND COALESCE(c.funds_enabled, false)
  JOIN public.community_flats f  ON f.community_id = e.community_id AND f.archived_at IS NULL
  JOIN public.community_blocks b ON b.id = f.block_id AND b.archived_at IS NULL
  LEFT JOIN public.event_transactions t
    ON t.contributor_flat_id = f.id
   AND t.event_id = e.id
   AND t.type = 'income'
  WHERE e.id = p_event_id
  GROUP BY b.name
  ORDER BY b.name;
$$;

COMMENT ON FUNCTION public.get_fund_public_blocks(UUID) IS
  'Per-block totals for the signed-out landing on a shared fund link. Aggregates only — never add contributor names, flat numbers, or transaction rows.';

GRANT EXECUTE ON FUNCTION public.get_fund_public_blocks(UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
