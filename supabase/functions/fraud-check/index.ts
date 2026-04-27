// Edge Function: fraud-check
// Evaluates provider registrations and review submissions against fraud rules.
// Returns a structured verdict with action and triggered rules.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Profanity blocklist (English + Hindi common terms) ──────────────────────
const PROFANITY_BLOCKLIST = [
  // English
  'fuck', 'shit', 'ass', 'bitch', 'damn', 'bastard', 'crap', 'dick', 'piss',
  'slut', 'whore', 'cunt', 'faggot', 'nigger', 'retard',
  // Hindi (transliterated)
  'madarchod', 'behenchod', 'chutiya', 'gaandu', 'harami', 'randi', 'bhosdi',
  'lauda', 'lodu', 'kamina', 'kutta', 'suar', 'haramkhor',
];

// ── Types ───────────────────────────────────────────────────────────────────
interface TriggeredRule {
  rule_id: string;
  rule_name: string;
  severity: 'HARD_BLOCK' | 'FLAG';
  evidence: string;
}

interface FraudVerdict {
  entity_type: 'provider' | 'review';
  entity_id: string;
  action: 'PASS' | 'QUEUE_LOW_PRIORITY' | 'HIDE_PENDING_REVIEW' | 'BLOCK';
  triggered_rules: TriggeredRule[];
  flag_count: number;
  hard_block_triggered: boolean;
  summary: string;
}

interface ProviderInput {
  provider_id?: string;
  phone: string;
  community_id: string;
}

interface ReviewInput {
  review_id?: string;
  reviewer_id: string;
  provider_id: string;
  review_text: string;
  rating: number;
}

// ── Rule Evaluators ─────────────────────────────────────────────────────────

async function evaluateProviderRules(
  supabase: ReturnType<typeof createClient>,
  input: ProviderInput
): Promise<TriggeredRule[]> {
  const rules: TriggeredRule[] = [];

  // R-P1: Duplicate phone
  const { count: phoneCount } = await supabase
    .from('service_providers')
    .select('*', { count: 'exact', head: true })
    .eq('phone', input.phone)
    .eq('community_id', input.community_id);

  if ((phoneCount ?? 0) >= 1) {
    rules.push({
      rule_id: 'R-P1',
      rule_name: 'Duplicate phone',
      severity: 'HARD_BLOCK',
      evidence: `${phoneCount} existing provider(s) with same phone in this community`,
    });
  }

  return rules;
}

async function evaluateReviewRules(
  supabase: ReturnType<typeof createClient>,
  input: ReviewInput
): Promise<TriggeredRule[]> {
  const rules: TriggeredRule[] = [];

  // ── Parallel context queries ──────────────────────────────────────────
  const now = new Date().toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const [
    profileResult,
    userVelocityResult,
    providerVelocityResult,
    hireCheckResult,
    userRatingsResult,
    rapidSequentialResult,
    similarTextResult,
  ] = await Promise.all([
    // R-R1: Account age
    supabase
      .from('profiles')
      .select('created_at')
      .eq('id', input.reviewer_id)
      .maybeSingle(),

    // R-R2: User velocity (ratings in last 1 hour)
    supabase
      .from('ratings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', input.reviewer_id)
      .gte('created_at', oneHourAgo),

    // R-R3: Provider velocity (ratings in last 24 hours)
    supabase
      .from('ratings')
      .select('*', { count: 'exact', head: true })
      .eq('provider_id', input.provider_id)
      .gte('created_at', twentyFourHoursAgo),

    // R-R6: Transaction record check
    supabase
      .from('provider_hires')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', input.reviewer_id)
      .eq('provider_id', input.provider_id),

    // R-R10, R-R11: User's all ratings (for rating-only abuse + extreme bias)
    supabase
      .from('ratings')
      .select('rating, review_text')
      .eq('user_id', input.reviewer_id),

    // R-R15: Rapid sequential (distinct providers in last 5 min)
    supabase
      .from('ratings')
      .select('provider_id')
      .eq('user_id', input.reviewer_id)
      .gte('created_at', fiveMinAgo),

    // R-R4: Duplicate text similarity (recent reviews for same provider)
    input.review_text && input.review_text.trim().length > 0
      ? supabase
          .from('ratings')
          .select('review_text')
          .eq('provider_id', input.provider_id)
          .not('review_text', 'is', null)
          .neq('user_id', input.reviewer_id)
          .limit(50)
      : Promise.resolve({ data: [] }),
  ]);

  // ── R-R1: New account review ──────────────────────────────────────────
  if (profileResult.data?.created_at) {
    const accountAgeMs = Date.now() - new Date(profileResult.data.created_at).getTime();
    const accountAgeHours = accountAgeMs / (1000 * 60 * 60);
    if (accountAgeHours < 24) {
      rules.push({
        rule_id: 'R-R1',
        rule_name: 'New account review',
        severity: 'FLAG',
        evidence: `Account age ${accountAgeHours.toFixed(1)} hours < 24`,
      });
    }
  }

  // ── R-R2: User velocity ───────────────────────────────────────────────
  const userReviewsLastHour = userVelocityResult.count ?? 0;
  if (userReviewsLastHour > 3) {
    rules.push({
      rule_id: 'R-R2',
      rule_name: 'User velocity',
      severity: 'FLAG',
      evidence: `${userReviewsLastHour} reviews in last 1 hour, threshold is 3`,
    });
  }

  // ── R-R3: Provider velocity ───────────────────────────────────────────
  const providerReviews24h = providerVelocityResult.count ?? 0;
  if (providerReviews24h > 10) {
    rules.push({
      rule_id: 'R-R3',
      rule_name: 'Provider velocity',
      severity: 'FLAG',
      evidence: `${providerReviews24h} reviews for this provider in last 24h, threshold is 10`,
    });
  }

  // ── R-R4: Duplicate text ──────────────────────────────────────────────
  if (input.review_text && input.review_text.trim().length > 0 && similarTextResult.data) {
    const existingTexts = (similarTextResult.data as { review_text: string }[])
      .map((r) => r.review_text)
      .filter(Boolean);

    for (const existing of existingTexts) {
      const similarity = computeTextSimilarity(input.review_text, existing);
      if (similarity > 0.9) {
        rules.push({
          rule_id: 'R-R4',
          rule_name: 'Duplicate text',
          severity: 'FLAG',
          evidence: `Text similarity score ${similarity.toFixed(2)} > 0.90 with existing review`,
        });
        break; // One match is enough
      }
    }
  }

  // ── R-R6: No transaction (HARD BLOCK) ─────────────────────────────────
  const hasTransaction = (hireCheckResult.count ?? 0) > 0;
  if (!hasTransaction) {
    rules.push({
      rule_id: 'R-R6',
      rule_name: 'No transaction',
      severity: 'HARD_BLOCK',
      evidence: 'No provider_hires record found for this user and provider',
    });
  }

  // ── Text-based rules (R-R7, R-R8, R-R9, R-R13) ──────────────────────
  const reviewText = (input.review_text || '').trim();

  if (reviewText.length > 0) {
    // R-R7: Minimum length
    const wordCount = reviewText.split(/\s+/).filter(Boolean).length;
    if (wordCount < 10) {
      rules.push({
        rule_id: 'R-R7',
        rule_name: 'Minimum length',
        severity: 'FLAG',
        evidence: `Word count is ${wordCount}, below threshold of 10`,
      });
    }

    // R-R8: All-caps spam
    const alphaChars = reviewText.replace(/[^a-zA-Z]/g, '');
    if (alphaChars.length > 0) {
      const upperCount = alphaChars.replace(/[^A-Z]/g, '').length;
      const upperRatio = upperCount / alphaChars.length;
      if (upperRatio > 0.7) {
        rules.push({
          rule_id: 'R-R8',
          rule_name: 'All-caps spam',
          severity: 'FLAG',
          evidence: `Uppercase ratio is ${upperRatio.toFixed(2)}, above 0.70`,
        });
      }
    }

    // R-R9: Link/contact in review
    const urlPattern = /https?:\/\/[^\s]+|www\.[^\s]+/i;
    const phonePattern = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    if (urlPattern.test(reviewText) || phonePattern.test(reviewText) || emailPattern.test(reviewText)) {
      rules.push({
        rule_id: 'R-R9',
        rule_name: 'Link/contact in review',
        severity: 'FLAG',
        evidence: 'Review contains URL, phone number, or email pattern',
      });
    }

    // R-R13: Profanity
    const lowerText = reviewText.toLowerCase();
    const foundProfanity = PROFANITY_BLOCKLIST.filter((word) => {
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      return regex.test(lowerText);
    });
    if (foundProfanity.length > 0) {
      rules.push({
        rule_id: 'R-R13',
        rule_name: 'Profanity',
        severity: 'FLAG',
        evidence: `Contains banned keyword(s): ${foundProfanity.join(', ')}`,
      });
    }
  }

  // ── R-R10: Rating-only abuse ──────────────────────────────────────────
  const allUserRatings = (userRatingsResult.data || []) as { rating: number; review_text: string | null }[];
  const ratingsWithoutText = allUserRatings.filter((r) => !r.review_text || r.review_text.trim() === '').length;
  if (ratingsWithoutText >= 5) {
    rules.push({
      rule_id: 'R-R10',
      rule_name: 'Rating-only abuse',
      severity: 'FLAG',
      evidence: `${ratingsWithoutText} ratings without text, threshold is 5`,
    });
  }

  // ── R-R11: Extreme bias ───────────────────────────────────────────────
  const totalReviews = allUserRatings.length;
  if (totalReviews >= 5) {
    const all5Stars = allUserRatings.every((r) => r.rating === 5);
    const all1Star = allUserRatings.every((r) => r.rating === 1);
    if (all5Stars || all1Star) {
      rules.push({
        rule_id: 'R-R11',
        rule_name: 'Extreme bias',
        severity: 'FLAG',
        evidence: `All ${totalReviews} reviews are ${all5Stars ? '5★' : '1★'}`,
      });
    }
  }

  // ── R-R15: Rapid sequential ───────────────────────────────────────────
  const recentProviders = new Set(
    ((rapidSequentialResult.data || []) as { provider_id: string }[]).map((r) => r.provider_id)
  );
  if (recentProviders.size >= 3) {
    rules.push({
      rule_id: 'R-R15',
      rule_name: 'Rapid sequential',
      severity: 'FLAG',
      evidence: `${recentProviders.size} distinct providers reviewed in last 5 minutes, threshold is 3`,
    });
  }

  return rules;
}

// ── Text similarity using bigram overlap (client-side approximation of pg_trgm) ─
function computeTextSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const na = normalize(a);
  const nb = normalize(b);

  if (na === nb) return 1.0;
  if (na.length < 2 || nb.length < 2) return 0;

  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      set.add(s.slice(i, i + 2));
    }
    return set;
  };

  const setA = bigrams(na);
  const setB = bigrams(nb);

  let intersection = 0;
  for (const bg of setA) {
    if (setB.has(bg)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ── Decision Logic ──────────────────────────────────────────────────────────
function computeVerdict(
  entityType: 'provider' | 'review',
  entityId: string,
  triggeredRules: TriggeredRule[]
): FraudVerdict {
  const hardBlockTriggered = triggeredRules.some((r) => r.severity === 'HARD_BLOCK');
  const flagCount = triggeredRules.filter((r) => r.severity === 'FLAG').length;

  let action: FraudVerdict['action'];
  if (hardBlockTriggered) {
    action = 'BLOCK';
  } else if (flagCount === 0) {
    action = 'PASS';
  } else if (flagCount === 1) {
    action = 'QUEUE_LOW_PRIORITY';
  } else if (flagCount <= 3) {
    action = 'HIDE_PENDING_REVIEW';
  } else {
    action = 'BLOCK';
  }

  const summaryParts: string[] = [];
  if (hardBlockTriggered) {
    const blockRules = triggeredRules.filter((r) => r.severity === 'HARD_BLOCK');
    summaryParts.push(`Blocked by ${blockRules.map((r) => r.rule_id).join(', ')}.`);
  }
  if (flagCount > 0) {
    summaryParts.push(`${flagCount} flag-level signal(s) detected.`);
  }
  if (!hardBlockTriggered && flagCount === 0) {
    summaryParts.push('All checks passed.');
  }

  return {
    entity_type: entityType,
    entity_id: entityId,
    action,
    triggered_rules: triggeredRules,
    flag_count: flagCount,
    hard_block_triggered: hardBlockTriggered,
    summary: summaryParts.join(' '),
  };
}

// ── Main Handler ────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // CORS for client-side calls
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json();
    const { type, data } = body;

    let verdict: FraudVerdict;

    if (type === 'provider') {
      const input = data as ProviderInput;
      if (!input.phone || !input.community_id) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: phone, community_id' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const triggeredRules = await evaluateProviderRules(supabase, input);
      verdict = computeVerdict('provider', input.provider_id || 'new', triggeredRules);
    } else if (type === 'review') {
      const input = data as ReviewInput;
      if (!input.reviewer_id || !input.provider_id || input.rating === undefined) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: reviewer_id, provider_id, rating' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const triggeredRules = await evaluateReviewRules(supabase, input);
      verdict = computeVerdict('review', input.review_id || 'new', triggeredRules);
    } else {
      return new Response(
        JSON.stringify({ error: `Invalid type: ${type}. Expected 'provider' or 'review'` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Log verdict to audit table
    await supabase.from('fraud_verdicts').insert({
      entity_type: verdict.entity_type,
      entity_id: verdict.entity_id !== 'new' ? verdict.entity_id : null,
      action: verdict.action,
      triggered_rules: verdict.triggered_rules,
      flag_count: verdict.flag_count,
      hard_block_triggered: verdict.hard_block_triggered,
      summary: verdict.summary,
      input_snapshot: data,
    });

    return new Response(JSON.stringify(verdict), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Fraud check error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
