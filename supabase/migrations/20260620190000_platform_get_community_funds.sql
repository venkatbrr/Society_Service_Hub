-- Migration: Platform get community funds RPC
-- Date: 2026-06-20

CREATE OR REPLACE FUNCTION public.platform_get_community_funds(p_community_id UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  is_closed BOOLEAN,
  created_at TIMESTAMPTZ,
  income NUMERIC,
  expense NUMERIC,
  balance NUMERIC,
  treasurers JSONB,
  collectors JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view community funds';
  END IF;

  RETURN QUERY
  WITH fund_totals AS (
    SELECT
      et.event_id,
      COALESCE(SUM(CASE WHEN et.type = 'income' THEN et.amount ELSE 0 END), 0)::NUMERIC AS income,
      COALESCE(SUM(CASE WHEN et.type = 'expense' THEN et.amount ELSE 0 END), 0)::NUMERIC AS expense
    FROM public.event_transactions et
    GROUP BY et.event_id
  ),
  fund_treasurers AS (
    SELECT
      fr.event_id,
      COALESCE(jsonb_agg(
        jsonb_build_object(
          'user_id', p.id,
          'full_name', p.full_name,
          'email', p.email
        ) ORDER BY p.full_name
      ) FILTER (WHERE p.id IS NOT NULL), '[]'::jsonb) AS treasurers
    FROM public.fund_roles fr
    JOIN public.profiles p ON fr.user_id = p.id
    WHERE fr.role = 'treasurer'
    GROUP BY fr.event_id
  ),
  fund_collectors AS (
    SELECT
      fr.event_id,
      COALESCE(jsonb_agg(
        jsonb_build_object(
          'user_id', p.id,
          'full_name', p.full_name,
          'email', p.email,
          'block_id', fr.block_id,
          'block_name', cb.name
        ) ORDER BY p.full_name
      ) FILTER (WHERE p.id IS NOT NULL), '[]'::jsonb) AS collectors
    FROM public.fund_roles fr
    JOIN public.profiles p ON fr.user_id = p.id
    LEFT JOIN public.community_blocks cb ON fr.block_id = cb.id
    WHERE fr.role = 'collector'
    GROUP BY fr.event_id
  )
  SELECT
    e.id,
    e.title,
    e.description,
    e.is_closed,
    e.created_at,
    COALESCE(ft.income, 0) AS income,
    COALESCE(ft.expense, 0) AS expense,
    (COALESCE(ft.income, 0) - COALESCE(ft.expense, 0)) AS balance,
    COALESCE(tr.treasurers, '[]'::jsonb) AS treasurers,
    COALESCE(col.collectors, '[]'::jsonb) AS collectors
  FROM public.events e
  LEFT JOIN fund_totals ft ON e.id = ft.event_id
  LEFT JOIN fund_treasurers tr ON e.id = tr.event_id
  LEFT JOIN fund_collectors col ON e.id = col.event_id
  WHERE e.community_id = p_community_id
  ORDER BY e.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_get_community_funds(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
