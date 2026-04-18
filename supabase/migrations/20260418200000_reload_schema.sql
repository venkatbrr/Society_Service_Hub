-- Force PostgREST schema cache reload
-- This notifies PostgREST to pick up the new function signature
NOTIFY pgrst, 'reload schema';
