import { Tables } from './database.types';

export type AppRole = Tables<'profiles'>['app_role'];
export type AssignmentRole = Tables<'fund_roles'>['role'];
export type FundAccessRole = 'admin' | AssignmentRole | 'resident';

export const MAX_TREASURERS = 1;
export const MIN_TREASURERS = 1;
export const MAX_COLLECTORS = 6;

/**
 * Ledger limits mirrored from migration 20260825000000. The database is the
 * authority — these exist so the form can say what is wrong before the round
 * trip, not so the client can decide.
 */
export const MAX_TRANSACTION_AMOUNT = 1000000;
export const MAX_TRANSACTION_AMOUNT_LABEL = '10,00,000';
export const MAX_SPONSOR_NAME_LENGTH = 80;
export const MAX_SPONSOR_PHONE_LENGTH = 20;
export const MAX_SPONSOR_NOTE_LENGTH = 280;

/** Free-text bounds on an "other contribution" — mirrored from 20260929000000. */
export const MAX_PURPOSE_LABEL_LENGTH = 60;
export const MAX_CONTRIBUTOR_FLAT_LABEL_LENGTH = 20;

type CommunityLike = {
  funds_enabled?: boolean | null;
  blocks_enabled?: boolean | null;
} | null | undefined;

type FundRoleAssignmentLike = {
  role?: AssignmentRole | null;
  block_id?: string | null;
} | null | undefined;

export function getEffectiveFundRole(
  appRole: AppRole | null | undefined,
  assignments: Tables<'fund_roles'>[],
  userId: string | null | undefined
): FundAccessRole {
  if (appRole === 'admin' || appRole === 'president' || appRole === 'vice_president') {
    return 'admin';
  }

  if (!userId) {
    return 'resident';
  }

  return assignments.find((assignment) => assignment.user_id === userId)?.role ?? 'resident';
}

export function getFundPermissions(role: FundAccessRole) {
  return {
    canCreateFund: role === 'admin',
    canManageTreasurers: role === 'admin',
    canManageCollectors: role === 'admin' || role === 'treasurer',
    canAddContribution: role === 'admin' || role === 'treasurer' || role === 'collector',
    canAddExpense: role === 'admin' || role === 'treasurer',
  };
}

export function formatRole(role: FundAccessRole | AppRole | AssignmentRole) {
  if (!role) {
    return 'Resident';
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function isFundsEnabled(community: CommunityLike) {
  return Boolean(community?.funds_enabled);
}

export function isBlockScopedAssignment(assignment: FundRoleAssignmentLike) {
  return assignment?.role === 'collector' && !!assignment?.block_id;
}

export function formatRoleForFundContext(
  role: FundAccessRole | AssignmentRole,
  assignment?: FundRoleAssignmentLike,
  appRole?: AppRole | null
) {
  if (!role) {
    return 'Resident';
  }

  if (role === 'admin') {
    // Three app roles collapse into the 'admin' fund capacity (see
    // getEffectiveFundRole). Show the person's actual role rather than a
    // fourth invented label — what they can do is already spelled out by
    // getRoleAccessSummary right below it in the UI.
    if (appRole === 'president') return 'President';
    if (appRole === 'vice_president') return 'Vice President';
    if (appRole === 'admin') return 'Platform admin';
    return 'Fund admin';
  }

  if (role === 'collector') {
    return isBlockScopedAssignment(assignment) ? 'Block in-charge' : 'Collector';
  }

  if (role === 'treasurer') {
    return 'Treasurer';
  }

  return 'Resident';
}

/** One short, plain-language line describing what the caller can do with this fund. */
export function getRoleAccessSummary(role: FundAccessRole) {
  if (role === 'collector') {
    return 'You can add contributions. Only the treasurer adds expenses.';
  }

  if (role === 'resident') {
    return 'View only — the treasurer and collectors manage this fund.';
  }

  if (role === 'admin') {
    return 'Full access — contributions, expenses, and role management.';
  }

  return 'You can add contributions, add expenses, and manage collectors.';
}
