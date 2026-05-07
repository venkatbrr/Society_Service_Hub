SELECT
  COALESCE(fund_scope, 'null') AS fund_scope,
  COUNT(*)::int AS fund_count
FROM public.events
GROUP BY fund_scope
ORDER BY fund_scope;

SELECT * FROM public.list_partner_communities();

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claim.sub',
  (
    SELECT id::text
    FROM public.profiles
    WHERE community_id IS NOT NULL
      AND removed_at IS NULL
    ORDER BY created_at
    LIMIT 1
  ),
  true
);

WITH caller AS (
  SELECT community_id
  FROM public.profiles
  WHERE id::text = current_setting('request.jwt.claim.sub', true)
)
SELECT
  (SELECT COUNT(*)::int FROM public.list_visible_providers(NULL, NULL, NULL)) AS visible_provider_count,
  (SELECT COUNT(*)::int FROM public.service_providers WHERE community_id = (SELECT community_id FROM caller)) AS caller_community_provider_count;
