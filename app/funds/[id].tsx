import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { BlockPicker } from '../../components/BlockPicker';
import { Rupees } from '../../components/Rupees';
import { Verandah } from '../../constants/Colors';
import { APP_EMOJIS } from '../../constants/emojis';
import { VerandahLayout, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { Tables } from '../../lib/database.types';
import {
    MAX_COLLECTORS,
    MAX_TREASURERS,
    MIN_TREASURERS,
    formatRole,
    formatRoleForFundContext,
    getEffectiveFundRole,
    getFundPermissions,
    getRestrictionHint,
} from '../../lib/fundRoles';
import { supabase } from '../../lib/supabase';
import { getMissingFundSchemaMessage, isMissingFundSchemaError } from '../../lib/supabaseErrors';

type FundDetail = Tables<'events'> & {
  community?: Pick<Tables<'communities'>, 'funds_enabled' | 'blocks_enabled'> | null;
  event_transactions: Tables<'event_transactions'>[];
  fund_roles: Tables<'fund_roles'>[];
};

type CommunityMember = Pick<Tables<'profiles'>, 'id' | 'full_name' | 'app_role' | 'email' | 'flat_number'>;

export default function FundDetailScreen() {
  const { id } = useLocalSearchParams();
  const [fund, setFund] = useState<FundDetail | null>(null);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [pendingCollectorId, setPendingCollectorId] = useState<string | null>(null);
  const [selectedCollectorBlockId, setSelectedCollectorBlockId] = useState<string | null>(null);
  const [blockNames, setBlockNames] = useState<Map<string, string>>(new Map());
  const [searchTreasurer, setSearchTreasurer] = useState('');
  const [searchCollector, setSearchCollector] = useState('');
  const { user, appRole } = useAuth();
  const router = useRouter();
  const colors = {
    background: Verandah.surface,
    text: Verandah.textPrimary,
    textMuted: Verandah.textSecondary,
    primary: Verandah.primary,
    secondary: Verandah.accent,
    accent: Verandah.danger,
    border: Verandah.border,
    surface2: Verandah.cardMuted,
  };

  const fetchFundDetail = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('*, community:communities!inner(funds_enabled, blocks_enabled)')
        .eq('id', id as string)
        .single();

      if (error) throw error;

      const [transactionsResult, rolesResult, profilesResult, blocksResult] = await Promise.all([
        supabase.from('event_transactions').select('*').eq('event_id', data.id),
        supabase.from('fund_roles').select('*').eq('event_id', data.id),
        supabase.from('profiles').select('id, full_name, app_role, email, flat_number').eq('community_id', data.community_id).order('full_name', { ascending: true }),
        supabase.rpc('list_community_blocks', { p_community_id: data.community_id }),
      ]);

      if (transactionsResult.error && !isMissingFundSchemaError(transactionsResult.error)) {
        throw transactionsResult.error;
      }

      if (rolesResult.error && !isMissingFundSchemaError(rolesResult.error)) {
        throw rolesResult.error;
      }

      if (profilesResult.error) throw profilesResult.error;
      if (blocksResult.error) throw blocksResult.error;

      setFund({
        ...data,
        community: (data as any).community ?? null,
        event_transactions: transactionsResult.data ?? [],
        fund_roles: rolesResult.data ?? [],
      });
      setMembers(profilesResult.data ?? []);
      setBlockNames(new Map(((blocksResult.data ?? []) as Tables<'community_blocks'>[]).map((block) => [block.id, block.name])));

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

  const handleToggleFundStatus = async (isOpen: boolean) => {
    if (!fund) return;
    try {
      const { error } = await supabase.rpc('set_fund_closed', { p_event_id: fund.id, p_closed: !isOpen });
      if (error) throw error;
      setFund((prev) => (prev ? { ...prev, is_closed: !isOpen } : null));
      Toast.show({ type: 'success', text1: isOpen ? 'Fund opened' : 'Fund closed' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: err.message });
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchFundDetail();
    }, [fetchFundDetail])
  );

  const profileNames = useMemo(
    () => new Map(members.map((member) => [member.id, member.full_name?.trim() || 'Resident'])),
    [members]
  );
  const profileFlats = useMemo(
    () => new Map(members.map((member) => [member.id, member.flat_number?.trim() || ''])),
    [members]
  );

  if (loading || !fund) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!fund.community?.funds_enabled) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Funds are not active in this community.</Text>
        <TouchableOpacity style={[styles.roleAction, { backgroundColor: colors.surface2, marginTop: 12 }]} onPress={() => router.replace('/(tabs)/community')}>
          <Text style={[styles.roleActionText, { color: colors.primary }]}>Back to community</Text>
        </TouchableOpacity>
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
  const visibleMembers = members.filter((member) => member.app_role !== 'admin');
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

    if (role === 'collector' && fund.community?.blocks_enabled && !selectedCollectorBlockId) {
      Toast.show({
        type: 'error',
        text1: 'Select a block',
        text2: 'Choose a block scope before assigning a collector.',
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
          block_id: role === 'collector' ? (selectedCollectorBlockId ?? null) : null,
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
      setPendingCollectorId(null);
      setSelectedCollectorBlockId(null);
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

    const removeNow = async () => {
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

    if (assignment.role === 'collector' && assignment.block_id) {
      const assigneeName = profileNames.get(assignment.user_id) ?? 'Resident';
      const blockName = blockNames.get(assignment.block_id) ?? 'this block';
      Alert.alert(
        'Remove block in-charge?',
        `Remove ${assigneeName} as block in-charge for ${blockName}? Past contributions they recorded will remain in the ledger.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: removeNow },
        ]
      );
      return;
    }

    removeNow();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.header, { backgroundColor: colors.background }]}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
              <Ionicons name="arrow-back" size={24} color={Verandah.primary} />
            </TouchableOpacity>
            <Text style={styles.headerLabel}>Fund Transparency</Text>
            <View style={{ width: 40 }} />
          </View>

          <Text style={styles.fundTitle}>{fund.title}</Text>
          <Text style={styles.fundDesc}>{fund.description || 'Transparent community fund tracking for every resident.'}</Text>

          {(appRole === 'president' || appRole === 'vice_president') && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface2, padding: 12, borderRadius: 12, marginBottom: 12 }}>
              <View>
                <Text style={{ fontSize: 15, fontWeight: '500', color: colors.text }}>
                  {fund.is_closed ? 'Fund closed' : 'Fund open'}
                </Text>
              </View>
              <Switch
                value={!fund.is_closed}
                onValueChange={handleToggleFundStatus}
                trackColor={{ false: Verandah.border, true: Verandah.primary }}
              />
            </View>
          )}

          {fund.is_closed && (
            <View style={{ backgroundColor: Verandah.cautionSoft, padding: 12, borderRadius: 12, marginBottom: 12 }}>
              <Text style={{ color: Verandah.caution, fontSize: 14, fontWeight: '500' }}>This fund is closed. No new transactions can be recorded.</Text>
            </View>
          )}

          <View style={styles.roleSummaryCard}>
            <Text style={styles.roleSummaryTitle}>You are a {formatRoleForFundContext(fundRole)}</Text>
            <Text style={styles.roleSummaryText}>Treasurers: {roleSummary.treasurers || 'Not assigned yet'}</Text>
            <Text style={styles.roleSummaryText}>Collectors: {roleSummary.collectors || 'None assigned'}</Text>
          </View>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.sumLabel}>Collected</Text>
              <Rupees amount={income} size="sm" tone="in" />
            </View>
            <View style={styles.sumDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.sumLabel}>Spent</Text>
              <Rupees amount={expense} size="sm" />
            </View>
            <View style={styles.sumDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.sumLabel}>Balance</Text>
              <Rupees amount={balance} size="sm" tone={balance >= 0 ? 'in' : 'out'} />
            </View>
          </View>
        </View>

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
                { backgroundColor: permissions.canAddContribution && !fund.is_closed ? colors.secondary : colors.surface2 },
              ]}
              onPress={() => router.push(`/funds/add-transaction?event_id=${fund.id}&type=income`)}
              disabled={!permissions.canAddContribution || !!fund.is_closed}
            >
              <Text style={styles.actionIcon}>{APP_EMOJIS.contribution}</Text>
              <Text
                style={[
                  styles.actionButtonText,
                  { color: permissions.canAddContribution && !fund.is_closed ? '#FFF' : colors.textMuted },
                ]}
              >
                Add Contribution
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionButton,
                { backgroundColor: permissions.canAddExpense && !fund.is_closed ? colors.accent : colors.surface2 },
              ]}
              onPress={() => router.push(`/funds/add-transaction?event_id=${fund.id}&type=expense`)}
              disabled={!permissions.canAddExpense || !!fund.is_closed}
            >
              <Text style={styles.actionIcon}>{APP_EMOJIS.expense}</Text>
              <Text
                style={[
                  styles.actionButtonText,
                  { color: permissions.canAddExpense && !fund.is_closed ? '#FFF' : colors.textMuted },
                ]}
              >
                Add Expense
              </Text>
            </TouchableOpacity>
          </View>
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
                    { backgroundColor: treasurers.length <= MIN_TREASURERS ? colors.surface2 : Verandah.dangerSoft },
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

            {availableTreasurers.length > 0 ? (
              <>
                <TextInput
                  style={[styles.searchInput, { borderColor: colors.border, backgroundColor: colors.secondary + '15' }]}
                  placeholder="Search by name, email, or flat..."
                  placeholderTextColor={colors.textMuted}
                  value={searchTreasurer}
                  onChangeText={setSearchTreasurer}
                />
                {!searchTreasurer.trim() && availableTreasurers.length > 3 && (
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 12, marginLeft: 4 }}>
                    Type to search all residents...
                  </Text>
                )}
                {availableTreasurers
                  .filter(
                    (member) =>
                      !searchTreasurer.trim() ||
                      (member.full_name || '').toLowerCase().includes(searchTreasurer.toLowerCase()) ||
                      (member.email || '').toLowerCase().includes(searchTreasurer.toLowerCase()) ||
                      (member.flat_number || '').toLowerCase().includes(searchTreasurer.toLowerCase())
                  )
                  .slice(0, searchTreasurer.trim() ? undefined : 3)
                  .map((member) => (
                    <View key={member.id} style={styles.roleRow}>
                      <View style={styles.roleInfo}>
                        <Text style={[styles.roleName, { color: colors.text }]}>{profileNames.get(member.id) ?? 'Resident'}</Text>
                        <View style={styles.roleMetaRow}>
                          <Text style={[styles.roleMeta, { color: colors.textMuted }]}>
                            {member.email || 'No email'}
                          </Text>
                          {member.flat_number ? (
                            <Text style={[styles.roleMeta, { color: colors.textMuted }]}> • Flat: {member.flat_number}</Text>
                          ) : null}
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[styles.roleAction, { backgroundColor: Verandah.accentSoft }]}
                        disabled={savingRoleId === member.id || treasurers.length >= MAX_TREASURERS}
                        onPress={() => handleAssignRole(member.id, 'treasurer')}
                      >
                        {savingRoleId === member.id ? (
                          <ActivityIndicator size="small" color={Verandah.accent} />
                        ) : (
                          <Text
                            style={[
                              styles.roleActionText,
                              { color: treasurers.length >= MAX_TREASURERS ? colors.textMuted : Verandah.accent },
                            ]}
                          >
                            Add
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ))}
              </>
            ) : null}
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
                  <Text style={[styles.roleMeta, { color: colors.textMuted }]}>{assignment.block_id ? `Block: ${blockNames.get(assignment.block_id) ?? 'Unknown'}` : 'All residents'}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.roleAction, { backgroundColor: Verandah.dangerSoft }]}
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

            {availableCollectors.length > 0 ? (
              <>
                <TextInput
                  style={[styles.searchInput, { borderColor: colors.border, backgroundColor: colors.secondary + '15' }]}
                  placeholder="Search by name, email, or flat..."
                  placeholderTextColor={colors.textMuted}
                  value={searchCollector}
                  onChangeText={setSearchCollector}
                />
                {!searchCollector.trim() && availableCollectors.length > 3 && (
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 12, marginLeft: 4 }}>
                    Type to search all residents...
                  </Text>
                )}
                {availableCollectors
                  .filter(
                    (member) =>
                      !searchCollector.trim() ||
                      (member.full_name || '').toLowerCase().includes(searchCollector.toLowerCase()) ||
                      (member.email || '').toLowerCase().includes(searchCollector.toLowerCase()) ||
                      (member.flat_number || '').toLowerCase().includes(searchCollector.toLowerCase())
                  )
                  .slice(0, searchCollector.trim() ? undefined : 3)
                  .map((member) => (
                    <View key={member.id} style={styles.roleRow}>
                      <View style={styles.roleInfo}>
                        <Text style={[styles.roleName, { color: colors.text }]}>{profileNames.get(member.id) ?? 'Resident'}</Text>
                        <View style={styles.roleMetaRow}>
                          <Text style={[styles.roleMeta, { color: colors.textMuted }]}>
                            {member.email || 'No email'}
                          </Text>
                          {member.flat_number ? (
                            <Text style={[styles.roleMeta, { color: colors.textMuted }]}> • Flat: {member.flat_number}</Text>
                          ) : null}
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[styles.roleAction, { backgroundColor: Verandah.accentSoft }]}
                        disabled={savingRoleId === member.id || collectors.length >= MAX_COLLECTORS}
                        onPress={() => {
                          if (fund.community?.blocks_enabled) {
                            setPendingCollectorId(member.id);
                          } else {
                            void handleAssignRole(member.id, 'collector');
                          }
                        }}
                      >
                        {savingRoleId === member.id ? (
                          <ActivityIndicator size="small" color={Verandah.accent} />
                        ) : (
                          <Text
                            style={[
                              styles.roleActionText,
                              { color: collectors.length >= MAX_COLLECTORS ? colors.textMuted : Verandah.accent },
                            ]}
                          >
                            Add
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ))}
              </>
            ) : null}
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Contributions</Text>
            <Text style={[styles.sectionBadge, { color: colors.textMuted }]}>{incomeTransactions.length} entries</Text>
          </View>
          {incomeTransactions.map((transaction) => {
            const RowContent = (
              <>
                <View style={[styles.avatar, { backgroundColor: Verandah.accentSoft }]}>
                  <Text style={styles.statusEmoji}>{APP_EMOJIS.contribution}</Text>
                </View>
                <View style={styles.transMain}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.transName, { color: colors.text }]}>
                      {transaction.contributor_user_id
                        ? profileNames.get(transaction.contributor_user_id) ?? 'Resident'
                        : transaction.title || 'Contribution'}
                    </Text>
                    {permissions.canAddContribution && (
                      <Ionicons name="pencil" size={13} color={colors.textMuted} />
                    )}
                  </View>
                  <Text style={[styles.transDate, { color: colors.textMuted }]}>
                    {(() => {
                      if (!transaction.contributor_user_id) {
                        return new Date(transaction.created_at ?? Date.now()).toLocaleDateString();
                      }

                      const flat = profileFlats.get(transaction.contributor_user_id);
                      const dateText = new Date(transaction.created_at ?? Date.now()).toLocaleDateString();
                      return flat ? `Flat ${flat} · ${dateText}` : dateText;
                    })()}
                  </Text>
                </View>
                <Rupees amount={Number(transaction.amount)} size="sm" tone="in" showSign={true} />
              </>
            );

            if (permissions.canAddContribution) {
              return (
                <TouchableOpacity
                  key={transaction.id}
                  style={styles.transactionRow}
                  onPress={() => router.push(`/funds/add-transaction?event_id=${fund.id}&type=income&transaction_id=${transaction.id}`)}
                >
                  {RowContent}
                </TouchableOpacity>
              );
            }

            return (
              <View key={transaction.id} style={styles.transactionRow}>
                {RowContent}
              </View>
            );
          })}
          {incomeTransactions.length === 0 ? <Text style={[styles.emptyNote, { color: colors.textMuted }]}>No collections logged yet.</Text> : null}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Expense List</Text>
            <Text style={[styles.sectionBadge, { color: colors.textMuted }]}>{expenseTransactions.length} entries</Text>
          </View>
          {expenseTransactions.map((transaction) => {
            const RowContent = (
              <>
                <View style={[styles.avatar, { backgroundColor: Verandah.dangerSoft }]}>
                  <Text style={styles.statusEmoji}>{APP_EMOJIS.expense}</Text>
                </View>
                <View style={styles.transMain}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.transName, { color: colors.text }]}>{transaction.title || 'Expense'}</Text>
                    {permissions.canAddExpense && (
                      <Ionicons name="pencil" size={13} color={colors.textMuted} />
                    )}
                  </View>
                  <Text style={[styles.transDate, { color: colors.textMuted }]}>
                    {transaction.description?.trim()
                      ? `${transaction.description.trim()} - ${new Date(transaction.created_at ?? Date.now()).toLocaleDateString()}`
                      : new Date(transaction.created_at ?? Date.now()).toLocaleDateString()}
                  </Text>
                </View>
                <Rupees amount={Number(transaction.amount)} size="sm" />
              </>
            );

            if (permissions.canAddExpense) {
              return (
                <TouchableOpacity
                  key={transaction.id}
                  style={styles.transactionRow}
                  onPress={() => router.push(`/funds/add-transaction?event_id=${fund.id}&type=expense&transaction_id=${transaction.id}`)}
                >
                  {RowContent}
                </TouchableOpacity>
              );
            }

            return (
              <View key={transaction.id} style={styles.transactionRow}>
                {RowContent}
              </View>
            );
          })}
          {expenseTransactions.length === 0 ? <Text style={[styles.emptyNote, { color: colors.textMuted }]}>No expenses logged yet.</Text> : null}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <Modal visible={!!pendingCollectorId} transparent animationType="slide" onRequestClose={() => setPendingCollectorId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Assign collector scope</Text>
            {fund.community_id ? (
              <BlockPicker
                value={selectedCollectorBlockId}
                onChange={setSelectedCollectorBlockId}
                communityId={fund.community_id}
                hideAllResidents={true}
              />
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.roleAction, { backgroundColor: Verandah.cardMuted, flex: 1 }]} onPress={() => setPendingCollectorId(null)}>
                <Text style={[styles.roleActionText, { color: colors.primary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.roleAction,
                  {
                    backgroundColor: selectedCollectorBlockId ? Verandah.accentSoft : colors.surface2,
                    flex: 1,
                  },
                ]}
                disabled={!selectedCollectorBlockId}
                onPress={() => {
                  if (pendingCollectorId) {
                    void handleAssignRole(pendingCollectorId, 'collector');
                  }
                }}
              >
                <Text
                  style={[
                    styles.roleActionText,
                    { color: selectedCollectorBlockId ? Verandah.accent : colors.textMuted },
                  ]}
                >
                  Assign
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingTop: VerandahLayout.screenPaddingTop,
    paddingBottom: 24,
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
    backgroundColor: Verandah.cardMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIcon: {
    color: Verandah.primaryFg,
  },
  headerLabel: {
    color: Verandah.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  fundTitle: {
    ...VerandahType.display,
    color: Verandah.textPrimary,
    marginBottom: 8,
  },
  fundDesc: {
    fontSize: 15,
    color: Verandah.textSecondary,
    marginBottom: 12,
    lineHeight: 22,
  },
  roleSummaryCard: {
    backgroundColor: Verandah.card,
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
    gap: 4,
    borderWidth: 0.5,
    borderColor: Verandah.border,
  },
  roleSummaryTitle: {
    color: Verandah.textPrimary,
    fontSize: 16,
    fontWeight: '500',
  },
  roleSummaryText: {
    color: Verandah.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  summaryGrid: {
    flexDirection: 'row',
    backgroundColor: Verandah.card,
    borderRadius: 20,
    padding: 14,
    borderWidth: 0.5,
    borderColor: Verandah.border,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  sumLabel: {
    color: Verandah.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sumValue: {
    color: Verandah.textPrimary,
    fontSize: 18,
    fontWeight: '500',
  },
  sumDivider: {
    width: 1,
    height: '100%',
    backgroundColor: Verandah.border,
  },
  accessCard: {
    backgroundColor: Verandah.card,
    marginHorizontal: 24,
    marginTop: -12,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Verandah.border,
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
    fontWeight: '500',
  },
  accessText: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 4,
  },
  actionsCard: {
    marginHorizontal: 24,
    marginTop: 8,
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
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: 24,
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.3,
  },
  sectionBadge: {
    fontSize: 12,
    fontWeight: '500',
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
    marginBottom: 8,
    backgroundColor: Verandah.card,
    padding: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Verandah.border,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statusEmoji: {
    fontSize: 15,
    lineHeight: 18,
  },
  transMain: {
    flex: 1,
  },
  transName: {
    fontSize: 15,
    fontWeight: '500',
  },
  transDate: {
    fontSize: 11,
    marginTop: 1,
  },
  statusBlock: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  transAmount: {
    fontSize: 14,
    fontWeight: '500',
  },
  emptyNote: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Verandah.card,
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Verandah.border,
  },
  roleInfo: {
    flex: 1,
  },
  roleName: {
    fontSize: 15,
    fontWeight: '500',
  },
  roleMeta: {
    fontSize: 12,
    marginTop: 4,
  },
  roleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  searchInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    fontSize: 14,
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
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Verandah.borderStrong,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Verandah.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
});
