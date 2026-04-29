import { normalizeIndianMobile } from './phone';
import { supabase } from './supabase';

// ── Types ───────────────────────────────────────────────────────────────────

export interface TriggeredRule {
  rule_id: string;
  rule_name: string;
  severity: 'HARD_BLOCK' | 'FLAG';
  evidence: string;
}

export interface FraudVerdict {
  entity_type: 'provider' | 'review';
  entity_id: string;
  action: 'PASS' | 'QUEUE_LOW_PRIORITY' | 'HIDE_PENDING_REVIEW' | 'BLOCK';
  triggered_rules: TriggeredRule[];
  flag_count: number;
  hard_block_triggered: boolean;
  summary: string;
}

// Maps fraud verdict action to the fraud_status column value in the database
function actionToFraudStatus(action: FraudVerdict['action']): string {
  switch (action) {
    case 'PASS':
      return 'pass';
    case 'QUEUE_LOW_PRIORITY':
      return 'queued_low';
    case 'HIDE_PENDING_REVIEW':
      return 'hidden';
    case 'BLOCK':
      return 'blocked';
    default:
      return 'pass';
  }
}

export { actionToFraudStatus };

// ── Provider Fraud Check ────────────────────────────────────────────────────

export async function checkProviderFraud(
  phone: string,
  communityId: string
): Promise<FraudVerdict> {
  const normalizedPhone = normalizeIndianMobile(phone) ?? phone;

  try {
    const { data, error } = await supabase.functions.invoke('fraud-check', {
      body: {
        type: 'provider',
        data: {
          phone: normalizedPhone,
          community_id: communityId,
        },
      },
    });

    if (error) {
      console.warn('Fraud check failed, defaulting to PASS:', error.message);
      return createDefaultPassVerdict('provider', 'new');
    }

    return data as FraudVerdict;
  } catch (err) {
    console.warn('Fraud check network error, defaulting to PASS:', err);
    return createDefaultPassVerdict('provider', 'new');
  }
}

// ── Review Fraud Check ──────────────────────────────────────────────────────

export async function checkReviewFraud(params: {
  reviewerId: string;
  providerId: string;
  reviewText: string;
  rating: number;
}): Promise<FraudVerdict> {
  try {
    const { data, error } = await supabase.functions.invoke('fraud-check', {
      body: {
        type: 'review',
        data: {
          reviewer_id: params.reviewerId,
          provider_id: params.providerId,
          review_text: params.reviewText,
          rating: params.rating,
        },
      },
    });

    if (error) {
      console.warn('Fraud check failed, defaulting to PASS:', error.message);
      return createDefaultPassVerdict('review', 'new');
    }

    return data as FraudVerdict;
  } catch (err) {
    console.warn('Fraud check network error, defaulting to PASS:', err);
    return createDefaultPassVerdict('review', 'new');
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function createDefaultPassVerdict(
  entityType: 'provider' | 'review',
  entityId: string
): FraudVerdict {
  return {
    entity_type: entityType,
    entity_id: entityId,
    action: 'PASS',
    triggered_rules: [],
    flag_count: 0,
    hard_block_triggered: false,
    summary: 'Fraud check unavailable, defaulting to pass.',
  };
}

/**
 * Returns a user-friendly message for the fraud verdict action.
 */
export function getFraudActionMessage(verdict: FraudVerdict): {
  title: string;
  message: string;
  type: 'success' | 'info' | 'error';
} {
  switch (verdict.action) {
    case 'PASS':
      return { title: 'Success', message: '', type: 'success' };
    case 'QUEUE_LOW_PRIORITY':
      return {
        title: 'Submitted for review',
        message: 'Your submission will be visible after a quick review.',
        type: 'info',
      };
    case 'HIDE_PENDING_REVIEW':
      return {
        title: 'Under review',
        message: 'Your submission has been flagged and will be reviewed by a moderator.',
        type: 'info',
      };
    case 'BLOCK':
      return {
        title: 'Submission blocked',
        message: verdict.summary || 'This submission was blocked by our safety checks.',
        type: 'error',
      };
  }
}
