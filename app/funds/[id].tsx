import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../../constants/Colors';
import { APP_EMOJIS } from '../../constants/emojis';
import { useAuth } from '../../context/AuthContext';
import { Tables } from '../../lib/database.types';
import {
    MAX_COLLECTORS,
    MAX_TREASURERS,
    MIN_TREASURERS,
    formatRole,
    getEffectiveFundRole,
    getFundPermissions,
    getRestrictionHint,
} from '../../lib/fundRoles';
import { supabase } from '../../lib/supabase';
import { getMissingFundSchemaMessage, isMissingFundSchemaError } from '../../lib/supabaseErrors';

type FundDetail = Tables<'events'> & {
  event_transactions: Tables<'event_transactions'>[];
  fund_roles: Tables<'fund_roles'>[];
};

type CommunityMember = Pick<Tables<'profiles'>, 'id' | 'full_name' | 'app_role'>;

export default function FundDetailScreen() {
  const { id } = useLocalSearchParams();
  const [fund, setFund] = useState<FundDetail | null>(null);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const { user, appRole } = useAuth();
  const router = useRouter();
  const colors = Colors.light;

  const fetchFundDetail = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('events').select('*').eq('id', id as string).single();

      if (error) throw error;

      const [transactionsResult, rolesResult, profilesResult] = await Promise.all([
        supabase.from('event_transactions').select('*').eq('event_id', data.id),
        supabase.from('fund_roles').select('*').eq('event_id', data.id),
        supabase.from('profiles').select('id, full_name, app_role').eq('community_id', data.community_id).order('full_name', { ascending: true }),
      ]);

      if (transactionsResult.error && !isMissingFundSchemaError(transactionsResult.error)) {
        throw transactionsResult.error;
      }

      if (rolesResult.error && !isMissingFundSchemaError(rolesResult.error)) {
        throw rolesResult.error;
      }

      if (profilesResult.error) throw profilesResult.error;

      setFund({
        ...data,
        event_transactions: transactionsResult.data ?? [],
        fund_roles: rolesResult.data ?? [],
      });
      setMembers(profilesResult.data ?? []);

      if (transactionsResult.error || rolesResult.error) {
        Toast.show({ type: 'error', text1: 'Funds partially loaded', text2: getMissingFundSchemaMessage() });
      }
    } catch (error: any) {
      console.error(error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: isMissingFundSchemaError(error) ? getMissingFundSchemaMessage() : 'Fund not found',
      });
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useFocusEffect(
    useCallback(() => {
      fetchFundDetail();
    }, [fetchFundDetail])
  );

  const profileNames = useMemo(
    () => new Map(members.map((member) => [member.id, member.full_name?.trim() || 'Resident'])),
    [members]
  );

  if (loading || !fund) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const fundRole = getEffectiveFundRole(appRole, fund.fund_roles ?? [], user?.id);
  const permissions = getFundPermissions(fundRole);
  const getCreatedAtTime = (value: string | null) => (value ? new Date(value).getTime() : 0);
  const incomeTransactions = [...(fund.event_transactions ?? [])]
    .filter((transaction) => transaction.type === 'income')
    .sort((a, b) => getCreatedAtTime(b.created_at) - getCreatedAtTime(a.created_at));
  const expenseTransactions = [...(fund.event_transactions ?? [])]
    .filter((transaction) => transaction.type === 'expense')
    .sort((a, b) => getCreatedAtTime(b.created_at) - getCreatedAtTime(a.created_at));
  const income = incomeTransactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const expense = expenseTransactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const balance = income - expense;
  const treasurers = (fund.fund_roles ?? []).filter((assignment) => assignment.role === 'treasurer');
  const collectors = (fund.fund_roles ?? []).filter((assignment) => assignment.role === 'collector');
  const visibleMembers = members.filter((member) => member.app_role !== 'community_admin');
  const paidByMemberId = new Map(
    incomeTransactions
      .filter((transaction) => transaction.contributor_user_id)
      .map((transaction) => [transaction.contributor_user_id as string, transaction])
  );
  const availableTreasurers = visibleMembers.filter(
    (member) => !treasurers.some((assignment) => assignment.user_id === member.id)
  );
  const availableCollectors = visibleMembers.filter(
    (member) =>
      !treasurers.some((assignment) => assignment.user_id === member.id) &&
      !collectors.some((assignment) => assignment.user_id === member.id)
  );
  const roleSummary = {
    treasurers: treasurers.map((assignment) => profileNames.get(assignment.user_id) ?? 'Resident').join(', '),
    collectors: collectors.map((assignment) => profileNames.get(assignment.user_id) ?? 'Resident').join(', '),
  };
  const addContributionHint =
    fundRole === 'resident'
      ? 'Only collectors and treasurers can add contributions.'
      : 'You can record a contribution and mark a resident as paid.';
  const addExpenseHint = permissions.canAddExpense
    ? 'Only treasurers should record expenses so the audit trail stays clean.'
    : 'Only treasurers can add expenses.';

  const handleAssignRole = async (targetUserId: string, role: Tables<'fund_roles'>['role']) => {
    if (!user?.id) {
      return;
    }

    if (role === 'treasurer' && treasurers.length >= MAX_TREASURERS) {
      Toast.show({
        type: 'error',
        text1: 'Treasurer limit reached',
        text2: `Each fund can have only ${MAX_TREASURERS} treasurers.`,
      });
      return;
    }

    if (role === 'collector' && collectors.length >= MAX_COLLECTORS) {
      Toast.show({
        type: 'error',
        text1: 'Collector limit reached',
        text2: `Each fund can have only ${MAX_COLLECTORS} collectors.`,
      });
      return;
    }

    try {
      setSavingRoleId(targetUserId);
      const { error } = await supabase.from('fund_roles').upsert(
        {
          event_id: fund.id,
          user_id: targetUserId,
          role,
          assigned_by: user.id,
        },
        { onConflict: 'event_id,user_id' }
      );

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: `${formatRole(role)} assigned`,
        text2: `${profileNames.get(targetUserId) ?? 'Resident'} now has fund access.`,
      });
      await fetchFundDetail();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message });
    } finally {
      setSavingRoleId(null);
    }
  };

  const handleRemoveRole = async (assignment: Tables<'fund_roles'>) => {
    if (assignment.role === 'treasurer' && treasurers.length <= MIN_TREASURERS) {
      Toast.show({
        type: 'error',
        text1: 'Cannot remove treasurer',
        text2: 'A fund must always have at least 1 treasurer.',
      });
      return;
    }

    try {
      setSavingRoleId(assignment.id);
      const { error } = await supabase.from('fund_roles').delete().eq('id', assignment.id);

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: `${formatRole(assignment.role)} removed`,
        text2: `${profileNames.get(assignment.user_id) ?? 'Resident'} is now view-only for this fund.`,
      });
      await fetchFundDetail();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message });
    } finally {
      setSavingRoleId(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          style={styles.header}
        >
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.headerLabel}>Fund Transparency</Text>
            <View style={{ width: 40 }} />
          </View>

          <Text style={styles.fundTitle}>{fund.title}</Text>
          <Text style={styles.fundDesc}>{fund.description || 'Transparent community fund tracking for every resident.'}</Text>

          <View style={styles.roleSummaryCard}>
            <Text style={styles.roleSummaryTitle}>You are a {formatRole(fundRole)}</Text>
            <Text style={styles.roleSummaryText}>Treasurers: {roleSummary.treasurers || 'Not assigned yet'}</Text>
            <Text style={styles.roleSummaryText}>Collectors: {roleSummary.collectors || 'None assigned'}</Text>
          </View>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.sumLabel}>Collected</Text>
              <Text style={styles.sumValue}>Rs {income.toLocaleString()}</Text>
            </View>
            <View style={styles.sumDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.sumLabel}>Spent</Text>
              <Text style={styles.sumValue}>Rs {expense.toLocaleString()}</Text>
            </View>
            <View style={styles.sumDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.sumLabel}>Balance</Text>
              <Text style={styles.sumValue}>Rs {balance.toLocaleString()}</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.accessCard}>
          <View style={styles.accessHeader}>
            <Text style={[styles.accessTitle, { color: colors.text }]}>Role Access</Text>
            <Text style={styles.accessIcon}>{APP_EMOJIS.admin}</Text>
          </View>
          <Text style={[styles.accessText, { color: colors.textMuted }]}>{getRestrictionHint(fundRole)}</Text>
          <Text style={[styles.accessText, { color: colors.textMuted }]}>{addContributionHint}</Text>
          <Text style={[styles.accessText, { color: colors.textMuted }]}>{addExpenseHint}</Text>
        </View>

        <View style={styles.actionsCard}>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                { backgroundColor: permissions.canAddContribution ? colors.secondary : colors.surface2 },
              ]}
              onPress={() => router.push(`/funds/add-transaction?event_id=${fund.id}&type=income`)}
              disabled={!permissions.canAddContribution}
            >
              <Text style={styles.actionIcon}>{APP_EMOJIS.contribution}</Text>
              <Text
                style={[
                  styles.actionButtonText,
                  { color: permissions.canAddContribution ? '#FFF' : colors.textMuted },
                ]}
              >
                Add Contribution
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionButton,
                { backgroundColor: permissions.canAddExpense ? colors.accent : colors.surface2 },
              ]}
              onPress={() => router.push(`/funds/add-transaction?event_id=${fund.id}&type=expense`)}
              disabled={!permissions.canAddExpense}
            >
              <Text style={styles.actionIcon}>{APP_EMOJIS.expense}</Text>
              <Text
                style={[
                  styles.actionButtonText,
                  { color: permissions.canAddExpense ? '#FFF' : colors.textMuted },
                ]}
              >
                Add Expense
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Contribution Status</Text>
            <Text style={[styles.sectionBadge, { color: colors.textMuted }]}>
              {incomeTransactions.length} paid / {visibleMembers.length} members
            </Text>
          </View>

          {visibleMembers.map((member) => {
            const contribution = paidByMemberId.get(member.id);
            const isPaid = Boolean(contribution);

            return (
              <View key={member.id} style={styles.transactionRow}>
                <View style={[styles.avatar, { backgroundColor: isPaid ? '#DCFCE7' : '#FEF3C7' }]}>
                  <Text style={styles.statusEmoji}>{isPaid ? APP_EMOJIS.success : APP_EMOJIS.loading}</Text>
                </View>
                <View style={styles.transMain}>
                  <Text style={[styles.transName, { color: colors.text }]}>{profileNames.get(member.id) ?? 'Resident'}</Text>
                  <Text style={[styles.transDate, { color: colors.textMuted }]}>
                    {isPaid && contribution
                      ? `Paid on ${new Date(contribution.created_at ?? Date.now()).toLocaleDateString()}`
                      : 'Pending contribution'}
                  </Text>
                </View>
                <View style={styles.statusBlock}>
                  <Text style={[styles.statusLabel, { color: isPaid ? '#15803D' : '#B45309' }]}>
                    {isPaid ? 'Paid' : 'Pending'}
                  </Text>
                  <Text style={[styles.transAmount, { color: isPaid ? colors.secondary : colors.textMuted }]}>
                    {isPaid && contribution ? `Rs ${Number(contribution.amount).toLocaleString()}` : '--'}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {permissions.canManageTreasurers ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Manage Treasurers</Text>
              <Text style={[styles.sectionBadge, { color: colors.textMuted }]}>
                {treasurers.length}/{MAX_TREASURERS}
              </Text>
            </View>
            <Text style={[styles.helperText, { color: colors.textMuted }]}>Keep at least 1 treasurer active on every fund.</Text>

            {treasurers.map((assignment) => (
              <View key={assignment.id} style={styles.roleRow}>
                <View style={styles.roleInfo}>
                  <Text style={[styles.roleName, { color: colors.text }]}>{profileNames.get(assignment.user_id) ?? 'Resident'}</Text>
                  <Text style={[styles.roleMeta, { color: colors.textMuted }]}>Treasurer</Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.roleAction,
                    { backgroundColor: treasurers.length <= MIN_TREASURERS ? colors.surface2 : '#FEE2E2' },
                  ]}
                  disabled={treasurers.length <= MIN_TREASURERS || savingRoleId === assignment.id}
                  onPress={() => handleRemoveRole(assignment)}
                >
                  {savingRoleId === assignment.id ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Text
                      style={[
                        styles.roleActionText,
                        { color: treasurers.length <= MIN_TREASURERS ? colors.textMuted : colors.accent },
                      ]}
                    >
                      Remove
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ))}

            {availableTreasurers.map((member) => (
              <View key={member.id} style={styles.roleRow}>
                <View style={styles.roleInfo}>
                  <Text style={[styles.roleName, { color: colors.text }]}>{profileNames.get(member.id) ?? 'Resident'}</Text>
                  <Text style={[styles.roleMeta, { color: colors.textMuted }]}>
                    {collectors.some((assignment) => assignment.user_id === member.id)
                      ? 'Collector today'
                      : 'Resident'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.roleAction, { backgroundColor: '#DCFCE7' }]}
                  disabled={savingRoleId === member.id || treasurers.length >= MAX_TREASURERS}
                  onPress={() => handleAssignRole(member.id, 'treasurer')}
                >
                  {savingRoleId === member.id ? (
                    <ActivityIndicator size="small" color="#15803D" />
                  ) : (
                    <Text
                      style={[
                        styles.roleActionText,
                        { color: treasurers.length >= MAX_TREASURERS ? colors.textMuted : '#15803D' },
                      ]}
                    >
                      Add
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        {permissions.canManageCollectors ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Manage Collectors</Text>
              <Text style={[styles.sectionBadge, { color: colors.textMuted }]}>
                {collectors.length}/{MAX_COLLECTORS}
              </Text>
            </View>
            <Text style={[styles.helperText, { color: colors.textMuted }]}>Collectors can add contributions and mark residents as paid.</Text>

            {collectors.map((assignment) => (
              <View key={assignment.id} style={styles.roleRow}>
                <View style={styles.roleInfo}>
                  <Text style={[styles.roleName, { color: colors.text }]}>{profileNames.get(assignment.user_id) ?? 'Resident'}</Text>
                  <Text style={[styles.roleMeta, { color: colors.textMuted }]}>Collector</Text>
                </View>
                <TouchableOpacity
                  style={[styles.roleAction, { backgroundColor: '#FEE2E2' }]}
                  disabled={savingRoleId === assignment.id}
                  onPress={() => handleRemoveRole(assignment)}
                >
                  {savingRoleId === assignment.id ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Text style={[styles.roleActionText, { color: colors.accent }]}>Remove</Text>
                  )}
                </TouchableOpacity>
              </View>
            ))}

            {availableCollectors.map((member) => (
              <View key={member.id} style={styles.roleRow}>
                <View style={styles.roleInfo}>
                  <Text style={[styles.roleName, { color: colors.text }]}>{profileNames.get(member.id) ?? 'Resident'}</Text>
                  <Text style={[styles.roleMeta, { color: colors.textMuted }]}>Resident</Text>
                </View>
                <TouchableOpacity
                  style={[styles.roleAction, { backgroundColor: '#DCFCE7' }]}
                  disabled={savingRoleId === member.id || collectors.length >= MAX_COLLECTORS}
                  onPress={() => handleAssignRole(member.id, 'collector')}
                >
                  {savingRoleId === member.id ? (
                    <ActivityIndicator size="small" color="#15803D" />
                  ) : (
                    <Text
                      style={[
                        styles.roleActionText,
                        { color: collectors.length >= MAX_COLLECTORS ? colors.textMuted : '#15803D' },
                      ]}
                    >
                      Add
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Expense List</Text>
            <Text style={[styles.sectionBadge, { color: colors.textMuted }]}>{expenseTransactions.length} entries</Text>
          </View>
          {expenseTransactions.map((transaction) => (
            <View key={transaction.id} style={styles.transactionRow}>
              <View style={[styles.avatar, { backgroundColor: '#FEE2E2' }]}>
                <Text style={styles.statusEmoji}>{APP_EMOJIS.expense}</Text>
              </View>
              <View style={styles.transMain}>
                <Text style={[styles.transName, { color: colors.text }]}>{transaction.title || 'Expense'}</Text>
                <Text style={[styles.transDate, { color: colors.textMuted }]}>
                  {transaction.description?.trim()
                    ? `${transaction.description.trim()} - ${new Date(transaction.created_at ?? Date.now()).toLocaleDateString()}`
                    : new Date(transaction.created_at ?? Date.now()).toLocaleDateString()}
                </Text>
              </View>
              <Text style={[styles.transAmount, { color: colors.accent }]}>
                Rs {Number(transaction.amount).toLocaleString()}
              </Text>
            </View>
          ))}
          {expenseTransactions.length === 0 ? <Text style={[styles.emptyNote, { color: colors.textMuted }]}>No expenses logged yet.</Text> : null}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 70,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIcon: {
    color: '#FFF',
  },
  headerLabel: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  fundTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  fundDesc: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 20,
    lineHeight: 22,
  },
  roleSummaryCard: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 24,
    padding: 18,
    marginBottom: 20,
    gap: 6,
  },
  roleSummaryTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  roleSummaryText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    lineHeight: 18,
  },
  summaryGrid: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 24,
    padding: 18,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  sumLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sumValue: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
  },
  sumDivider: {
    width: 1,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  accessCard: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    marginHorizontal: 24,
    marginTop: -30,
    padding: 24,
    borderRadius: 24,
    elevation: 0,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  accessHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  accessIcon: {
    fontSize: 18,
    lineHeight: 20,
  },
  accessTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  accessText: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 4,
  },
  actionsCard: {
    marginHorizontal: 24,
    marginTop: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  actionIcon: {
    fontSize: 18,
    lineHeight: 20,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '800',
  },
  section: {
    paddingHorizontal: 24,
    marginTop: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionBadge: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.85)',
    padding: 12,
    borderRadius: 20,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statusEmoji: {
    fontSize: 16,
    lineHeight: 18,
  },
  transMain: {
    flex: 1,
  },
  transName: {
    fontSize: 15,
    fontWeight: '600',
  },
  transDate: {
    fontSize: 12,
    marginTop: 2,
  },
  statusBlock: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  transAmount: {
    fontSize: 14,
    fontWeight: '800',
  },
  emptyNote: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.85)',
    padding: 14,
    borderRadius: 20,
    marginBottom: 12,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  roleInfo: {
    flex: 1,
  },
  roleName: {
    fontSize: 15,
    fontWeight: '700',
  },
  roleMeta: {
    fontSize: 12,
    marginTop: 4,
  },
  roleAction: {
    minWidth: 84,
    minHeight: 38,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginLeft: 12,
  },
  roleActionText: {
    fontSize: 13,
    fontWeight: '800',
  },
});
