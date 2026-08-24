-- Removes the recurring-menu reminder shipped hours earlier in
-- 20260924000000 / 20260924000100.
--
-- WHY: the reminder was the whole mechanism — a daily notification the host
-- taps to publish — and Wooru's shipping target is the web/PWA, where a
-- notification cannot be relied on to reach anyone. A feature whose only
-- trigger may never arrive is worse than no feature: the host sets a rhythm,
-- trusts it, and quietly stops publishing.
--
-- Recurrence is replaced by an explicit **Republish** action on the host's own
-- tiles under "Mine", which asks only for the new closing and delivery time.
-- No schedule to store, and nothing that depends on a notification arriving.
--
-- Verified empty (0 rows) before dropping, so no host data is lost.

DROP FUNCTION IF EXISTS public.remind_due_drop_schedules();
DROP FUNCTION IF EXISTS public.mcn_drop_schedule_due_on(TEXT, SMALLINT[], DATE, DATE);
DROP TABLE IF EXISTS public.mcn_drop_schedules;

NOTIFY pgrst, 'reload schema';
