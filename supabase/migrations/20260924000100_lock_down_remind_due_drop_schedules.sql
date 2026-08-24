-- Follow-up to 20260924000000. That migration revoked EXECUTE on
-- `remind_due_drop_schedules()` from PUBLIC and anon, but **not from
-- `authenticated`** — which is the role that actually reaches PostgREST. The
-- security advisor caught it: any signed-in resident could POST to
-- /rest/v1/rpc/remind_due_drop_schedules and fire a reminder at every host in
-- every community, and burn each schedule's `last_reminded_on` so the real
-- sweep that day found nothing to do.
--
-- Only the daily Edge Function calls this, and it authenticates with the
-- service-role key, which bypasses GRANTs entirely — so no role needs EXECUTE.

REVOKE EXECUTE ON FUNCTION public.remind_due_drop_schedules() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
