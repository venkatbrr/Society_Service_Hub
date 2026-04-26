-- Add 'community_lead' to app_role_type enum.
-- Must be in a separate migration (own transaction) because PostgreSQL
-- does not allow using a newly-added enum value in the same transaction.
ALTER TYPE public.app_role_type ADD VALUE IF NOT EXISTS 'community_lead';
