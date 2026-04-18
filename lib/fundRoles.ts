import { Tables } from './database.types';

export type AppRole = Tables<'profiles'>['app_role'];
export type AssignmentRole = Tables<'fund_roles'>['role'];
export type FundAccessRole = 'admin' | AssignmentRole | 'resident';

export const MAX_TREASURERS = 2;
export const MIN_TREASURERS = 1;
export const MAX_COLLECTORS = 6;

export function getEffectiveFundRole(
  appRole: AppRole | null | undefined,
  assignments: Tables<'fund_roles'>[],
  userId: string | null | undefined
): FundAccessRole {
  if (appRole === 'admin') {
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
    canManageCollectors: role === 'treasurer',
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
