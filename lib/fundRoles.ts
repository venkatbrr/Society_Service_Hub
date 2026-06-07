import { Tables } from './database.types';

export type AppRole = Tables<'profiles'>['app_role'];
export type AssignmentRole = Tables<'fund_roles'>['role'];
export type FundAccessRole = 'admin' | AssignmentRole | 'resident';

export const MAX_TREASURERS = 2;
export const MIN_TREASURERS = 1;
export const MAX_COLLECTORS = 6;

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
  if (appRole === 'admin' || appRole === 'community_admin' || appRole === 'community_lead') {
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

export function formatRoleForFundContext(role: FundAccessRole | AssignmentRole, assignment?: FundRoleAssignmentLike) {
  if (!role) {
    return 'Resident';
  }

  if (role === 'admin') {
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

export function getRestrictionHint(role: FundAccessRole) {
  if (role === 'collector') {
    return 'Collectors can add contributions, but only treasurers can add expenses.';
  }

  if (role === 'resident') {
    return 'Residents can view every entry, while collectors add contributions and treasurers handle expenses.';
  }

  if (role === 'admin') {
    return 'Admins can create funds, manage treasurers, and log every transaction.';
  }

  return 'Treasurers can manage collectors, contributions, and expenses for this fund.';
}
