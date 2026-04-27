-- Fraud Detection Schema Changes
-- Adds review text support, fraud status tracking, and audit logging

-- 1. Add review text column to ratings
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS review_text TEXT;

-- 2. Add fraud status and triggered rules to ratings
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS fraud_status TEXT DEFAULT 'pass'
    CHECK (fraud_status IN ('pass', 'queued_low', 'hidden', 'blocked'));
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS fraud_rules_triggered JSONB DEFAULT '[]'::jsonb;

-- 3. Add fraud status to service_providers
ALTER TABLE service_providers ADD COLUMN IF NOT EXISTS fraud_status TEXT DEFAULT 'pass'
    CHECK (fraud_status IN ('pass', 'queued_low', 'hidden', 'blocked'));

-- 4. Enable pg_trgm extension for text similarity (used by R-R4)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 5. Create fraud verdicts audit table
CREATE TABLE IF NOT EXISTS fraud_verdicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('provider', 'review')),
    entity_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('PASS', 'QUEUE_LOW_PRIORITY', 'HIDE_PENDING_REVIEW', 'BLOCK')),
    triggered_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    flag_count INT NOT NULL DEFAULT 0,
    hard_block_triggered BOOLEAN NOT NULL DEFAULT false,
    summary TEXT,
    input_snapshot JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE fraud_verdicts ENABLE ROW LEVEL SECURITY;

-- Only platform admins can view fraud verdicts
CREATE POLICY "Platform admins can view fraud verdicts"
    ON fraud_verdicts FOR SELECT
    USING (is_platform_admin(auth.uid()));

-- Service role can insert fraud verdicts (from Edge Function)
CREATE POLICY "Service role can insert fraud verdicts"
    ON fraud_verdicts FOR INSERT
    WITH CHECK (true);
