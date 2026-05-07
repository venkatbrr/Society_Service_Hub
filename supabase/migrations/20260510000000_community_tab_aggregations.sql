CREATE OR REPLACE FUNCTION public.get_community_pulse(p_limit integer DEFAULT 5)
RETURNS TABLE (
  kind text,
  happened_at timestamptz,
  summary text,
  entity_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH home AS (
    SELECT get_user_community_id() AS community_id
  ),
  visit_items AS (
    SELECT
      'visit_scheduled'::text AS kind,
      COALESCE(v.created_at, now()) AS happened_at,
      CONCAT(
        COALESCE(NULLIF(v.title, ''), 'Service visit'),
        ' scheduled for ',
        to_char(v.visit_date::date, 'Dy DD Mon')
      ) AS summary,
      v.id AS entity_id
    FROM public.service_visits v
    JOIN home h ON h.community_id = v.community_id
    ORDER BY COALESCE(v.created_at, now()) DESC
    LIMIT 8
  ),
  fund_items AS (
    SELECT
      'fund_created'::text AS kind,
      COALESCE(e.created_at, now()) AS happened_at,
      CONCAT('New ', COALESCE(NULLIF(e.title, ''), 'community'), ' fund opened') AS summary,
      e.id AS entity_id
    FROM public.events e
    JOIN home h ON h.community_id = e.community_id
    ORDER BY COALESCE(e.created_at, now()) DESC
    LIMIT 8
  ),
  provider_items AS (
    SELECT
      'provider_added'::text AS kind,
      COALESCE(sp.created_at, now()) AS happened_at,
      CONCAT(
        COALESCE(NULLIF(sp.category, ''), 'Service provider'),
        ' ',
        COALESCE(NULLIF(sp.name, ''), 'added')
      ) AS summary,
      sp.id AS entity_id
    FROM public.service_providers sp
    JOIN home h ON h.community_id = sp.community_id
    ORDER BY COALESCE(sp.created_at, now()) DESC
    LIMIT 8
  ),
  recent_hires AS (
    SELECT
      'recent_hire'::text AS kind,
      MAX(ph.created_at) AS happened_at,
      CONCAT(
        COUNT(*)::int,
        ' residents hired ',
        COALESCE(NULLIF(sp.name, ''), COALESCE(NULLIF(sp.category, ''), 'a provider')),
        ' this week'
      ) AS summary,
      sp.id AS entity_id
    FROM public.provider_hires ph
    JOIN public.service_providers sp ON sp.id = ph.provider_id
    JOIN home h ON h.community_id = sp.community_id
    WHERE ph.created_at >= now() - interval '7 days'
    GROUP BY sp.id, sp.name, sp.category
    HAVING COUNT(*) >= 3
    ORDER BY MAX(ph.created_at) DESC
    LIMIT 8
  ),
  combined AS (
    SELECT * FROM visit_items
    UNION ALL
    SELECT * FROM fund_items
    UNION ALL
    SELECT * FROM provider_items
    UNION ALL
    SELECT * FROM recent_hires
  )
  SELECT c.kind, c.happened_at, c.summary, c.entity_id
  FROM combined c
  ORDER BY c.happened_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 5), 0);
$$;

CREATE OR REPLACE FUNCTION public.get_my_community_funds_overview()
RETURNS TABLE (
  active_funds_count integer,
  total_collected numeric,
  total_spent numeric,
  total_available numeric,
  funds_contributed_to integer,
  your_total_contributed numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH home AS (
    SELECT get_user_community_id() AS community_id
  ),
  community_funds AS (
    SELECT e.id
    FROM public.events e
    JOIN home h ON h.community_id = e.community_id
  ),
  totals AS (
    SELECT
      COALESCE(SUM(CASE WHEN et.type = 'income' THEN et.amount ELSE 0 END), 0)::numeric AS total_collected,
      COALESCE(SUM(CASE WHEN et.type = 'expense' THEN et.amount ELSE 0 END), 0)::numeric AS total_spent
    FROM public.event_transactions et
    JOIN community_funds cf ON cf.id = et.event_id
  ),
  mine AS (
    SELECT
      COUNT(DISTINCT et.event_id)::int AS funds_contributed_to,
      COALESCE(SUM(et.amount), 0)::numeric AS your_total_contributed
    FROM public.event_transactions et
    JOIN community_funds cf ON cf.id = et.event_id
    WHERE et.type = 'income'
      AND et.contributor_user_id = auth.uid()
  )
  SELECT
    (SELECT COUNT(*)::int FROM community_funds) AS active_funds_count,
    totals.total_collected,
    totals.total_spent,
    (totals.total_collected - totals.total_spent)::numeric AS total_available,
    mine.funds_contributed_to,
    mine.your_total_contributed
  FROM totals, mine;
$$;

GRANT EXECUTE ON FUNCTION public.get_community_pulse(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_community_funds_overview() TO authenticated;

NOTIFY pgrst, 'reload schema';
