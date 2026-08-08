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
  unavailable?: boolean;
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
  communityId: string,
  extra?: { name?: string; description?: string; created_by?: string }
): Promise<FraudVerdict> {
  const normalizedPhone = normalizeIndianMobile(phone) ?? phone;

  try {
    const { data, error } = await supabase.functions.invoke('fraud-check', {
      body: {
        type: 'provider',
        data: {
          phone: normalizedPhone,
          community_id: communityId,
          name: extra?.name,
          description: extra?.description,
          created_by: extra?.created_by,
        },
      },
    });

    if (error) {
      console.warn('Fraud check service unavailable, falling back to queued_low:', error.message);
      return createDefaultPassVerdict('provider', 'new');
    }

    return data as FraudVerdict;
  } catch (err) {
    console.warn('Fraud check network error, falling back to queued_low:', err);
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
      console.warn('Fraud check service unavailable, falling back to queued_low:', error.message);
      return createDefaultPassVerdict('review', 'new');
    }

    return data as FraudVerdict;
  } catch (err) {
    console.warn('Fraud check network error, falling back to queued_low:', err);
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
    action: 'QUEUE_LOW_PRIORITY',
    triggered_rules: [],
    flag_count: 0,
    hard_block_triggered: false,
    summary: 'Fraud check service unavailable; defaulting to queued_low status.',
    unavailable: true,
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
        title: 'Submitted',
        message: verdict.unavailable
          ? 'Your submission is live.'
          : 'Your submission is live.',
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
        message: verdict.summary || 'This submission was blocked by safety checks.',
        type: 'error',
      };
  }
}
