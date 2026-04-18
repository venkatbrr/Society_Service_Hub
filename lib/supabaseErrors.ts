type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null | undefined;

const getErrorText = (error: PostgrestLikeError) =>
  [error?.message, error?.details, error?.hint].filter(Boolean).join(' ').toLowerCase();

export const isSupabaseSchemaError = (error: PostgrestLikeError) => {
  const text = getErrorText(error);

  return (
    error?.code === 'PGRST200' ||
    error?.code === 'PGRST204' ||
    error?.code === 'PGRST205' ||
    text.includes('schema cache') ||
    text.includes('could not find the table') ||
    text.includes('could not find a relationship between')
  );
};

export const isMissingFundSchemaError = (error: PostgrestLikeError) => {
  if (!error) {
    return false;
  }

  if (error.code === 'PGRST205') {
    return true;
  }

  const text = getErrorText(error);
  return (
    isSupabaseSchemaError(error) &&
    ['events', 'event_transactions', 'fund_roles', 'goal_amount', 'contributor_user_id'].some((resource) =>
      text.includes(resource)
    )
  );
};

export const getMissingFundSchemaMessage = () =>
  'Funds need the latest Supabase migrations before every feature can load.';

export const isMissingOnboardingSchemaError = (error: PostgrestLikeError) => {
  if (!error) {
    return false;
  }

  const text = getErrorText(error);
  return (
    isSupabaseSchemaError(error) &&
    ['approval_status', 'community_requests', 'join_note', 'requested_at', 'pincode'].some((resource) =>
      text.includes(resource)
    )
  );
};

export const getMissingOnboardingSchemaMessage = () =>
  'Onboarding needs the latest Supabase migrations before this flow can load.';
