SELECT COALESCE(fund_scope, 'null') AS fund_scope, COUNT(*)::int AS fund_count FROM public.events GROUP BY fund_scope ORDER BY fund_scope;
