import { ArrowLeft } from '@untitledui/icons/ArrowLeft';
import { MinusCircle } from '@untitledui/icons/MinusCircle';
import { Paperclip } from '@untitledui/icons/Paperclip';
import { Pencil01 } from '@untitledui/icons/Pencil01';
import { PlusCircle } from '@untitledui/icons/PlusCircle';
import { Shield01 } from '@untitledui/icons/Shield01';
import { Trash01 } from '@untitledui/icons/Trash01';
import { XClose } from '@untitledui/icons/XClose';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
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
import { HeaderBackButton } from '../../components/HeaderBackButton';
import { Rupees } from '../../components/Rupees';
import { Verandah } from '../../constants/Colors';
import { VerandahBorder, VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { cloudinaryUrl } from '../../lib/cloudinary';
import { Tables } from '../../lib/database.types';
import {
    MAX_COLLECTORS,
    MAX_TREASURERS,
    MIN_TREASURERS,
    formatRole,
    formatRoleForFundContext,
    getEffectiveFundRole,
    getFundPermissions,
    getRoleAccessSummary,
} from '../../lib/fundRoles';
import { goBackSmart, replaceTracked } from '../../lib/navigation';
import { supabase } from '../../lib/supabase';
import { getMissingFundSchemaMessage, isMissingFundSchemaError } from '../../lib/supabaseErrors';

type FundDetail = Tables<'events'> & {
  community?: Pick<Tables<'communities'>, 'funds_enabled' | 'blocks_enabled'> | null;
  event_transactions: Tables<'event_transactions'>[];
  fund_roles: Tables<'fund_roles'>[];
};

type CommunityMember = Pick<Tables<'profiles'>, 'id' | 'full_name' | 'app_role' | 'flat_number'>;

/**
 * Mirrors the ledger's own flat ordering — `length(flat_number), flat_number`
 * in list_collection_targets_for_collector — so a flat sits in the same place
 * whether the list came out of Postgres or was grouped here on the client.
 * Ground-floor numbers (G1) sort ahead of 102 because they are shorter, which
 * is the order a collection sheet is read in.
 */
const compareFlatNumbers = (a: string, b: string) => a.length - b.length || a.localeCompare(b);

export default function FundDetailScreen() {
  const { id } = useLocalSearchParams();
  const [fund, setFund] = useState<FundDetail | null>(null);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [flats, setFlats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [pendingCollectorId, setPendingCollectorId] = useState<string | null>(null);
  const [selectedCollectorBlockId, setSelectedCollectorBlockId] = useState<string | null>(null);
  const [blockNames, setBlockNames] = useState<Map<string, string>>(new Map());
  const [searchTreasurer, setSearchTreasurer] = useState('');
  const [searchCollector, setSearchCollector] = useState('');
  const [selectedExpense, setSelectedExpense] = useState<Tables<'event_transactions'> | null>(null);
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

      const [transactionsResult, rolesResult, profilesResult, blocksResult, flatsResult] = await Promise.all([
        supabase.from('event_transactions').select('*').eq('event_id', id as string),
        supabase.from('fund_roles').select('*').eq('event_id', id as string),
        supabase.from('profiles').select('id, full_name, app_role, flat_number').eq('community_id', data.community_id).order('full_name', { ascending: true }),
        supabase.rpc('list_community_blocks', { p_community_id: data.community_id }),
        supabase.rpc('list_community_flats', { p_community_id: data.community_id }),
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
      setFlats(flatsResult.data ?? []);

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
      goBackSmart(router, `/funds/${id as string}`);
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
  const flatLabels = useMemo(
    () => new Map(flats.map((flat) => [
      flat.id,
      flat.block_name ? `${flat.block_name}-${flat.flat_number}` : flat.flat_number
    ])),
    [flats]
  );

  /**
   * Flat id -> the pieces the contributions list needs to group and sort by.
   * `list_community_flats` is readable by every approved member of the
   * community, so a resident gets the same block grouping the treasurer sees.
   */
  const flatMeta = useMemo(
    () =>
      new Map<string, { blockName: string | null; flatNumber: string }>(
        flats.map((flat) => [
          flat.id as string,
          {
            blockName: (flat.block_name as string | null) ?? null,
            flatNumber: ((flat.flat_number as string | null) ?? '').trim(),
          },
        ])
      ),
    [flats]
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
        <TouchableOpacity style={[styles.roleAction, { backgroundColor: colors.surface2, marginTop: 12 }]} onPress={() => replaceTracked(router, '/(tabs)/community')}>
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

  const flatNumberOf = (transaction: Tables<'event_transactions'>) => {
    const flatId = (transaction as any).contributor_flat_id as string | null;
    return (flatId ? flatMeta.get(flatId)?.flatNumber : '') ?? '';
  };
  const blockNameOf = (transaction: Tables<'event_transactions'>) => {
    const flatId = (transaction as any).contributor_flat_id as string | null;
    return (flatId ? flatMeta.get(flatId)?.blockName : null) ?? null;
  };

  /**
   * Contributions read the way the collection sheet does: one section per
   * block, flats in flat-number order inside it. Rows with no block — outside
   * sponsors, a member in a community with no flat inventory, or a flat
   * archived after it paid — fall into a trailing group rather than vanishing.
   */
  const contributionGroups = (() => {
    const byBlock = new Map<string, Tables<'event_transactions'>[]>();
    const unplaced: Tables<'event_transactions'>[] = [];

    incomeTransactions.forEach((transaction) => {
      const blockName = blockNameOf(transaction);
      if (!blockName) {
        unplaced.push(transaction);
        return;
      }
      const existing = byBlock.get(blockName);
      if (existing) {
        existing.push(transaction);
      } else {
        byBlock.set(blockName, [transaction]);
      }
    });

    const groups = Array.from(byBlock.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([blockName, rows]) => ({
        key: blockName,
        title: `Block ${blockName}`,
        isBlock: true,
        rows: [...rows].sort((a, b) => compareFlatNumbers(flatNumberOf(a), flatNumberOf(b))),
      }));

    if (unplaced.length > 0) {
      // Flat-numbered rows still sort by flat; sponsors have nothing to sort by
      // and keep newest-first behind them.
      const withFlat = unplaced.filter((transaction) => flatNumberOf(transaction));
      const withoutFlat = unplaced.filter((transaction) => !flatNumberOf(transaction));

      groups.push({
        key: '__unplaced__',
        title: groups.length > 0 ? 'Other contributions' : 'All contributions',
        isBlock: false,
        rows: [
          ...withFlat.sort((a, b) => compareFlatNumbers(flatNumberOf(a), flatNumberOf(b))),
          ...withoutFlat.sort((a, b) => getCreatedAtTime(b.created_at) - getCreatedAtTime(a.created_at)),
        ],
      });
    }

    return groups.map((group) => ({
      ...group,
      total: group.rows.reduce((sum, row) => sum + Number(row.amount), 0),
    }));
  })();

  // Headers only earn their space once at least one block has collected
  // something — a community with no block inventory gets the plain list back.
  const showContributionGroupHeaders = contributionGroups.some((group) => group.isBlock);

  /**
   * Per-block totals, rendered for everyone. The point of the fund screen is
   * that a resident can check their block's numbers without asking the
   * treasurer, so this is deliberately outside every permission gate.
   */
  const blockSummary = (() => {
    const rows = new Map<string, { blockName: string; totalFlats: number; paidFlats: number; collected: number }>();

    flats.forEach((flat) => {
      const blockName = (flat.block_name as string | null) ?? null;
      if (!blockName) return;
      const entry = rows.get(blockName) ?? { blockName, totalFlats: 0, paidFlats: 0, collected: 0 };
      entry.totalFlats += 1;
      rows.set(blockName, entry);
    });

    incomeTransactions.forEach((transaction) => {
      const blockName = blockNameOf(transaction);
      if (!blockName) return;
      const entry = rows.get(blockName);
      if (!entry) return;
      entry.paidFlats += 1;
      entry.collected += Number(transaction.amount);
    });

    return Array.from(rows.values()).sort((a, b) => a.blockName.localeCompare(b.blockName));
  })();

  const blockSummaryTotals = blockSummary.reduce(
    (acc, row) => ({ paidFlats: acc.paidFlats + row.paidFlats, totalFlats: acc.totalFlats + row.totalFlats }),
    { paidFlats: 0, totalFlats: 0 }
  );
  const unassignedIncome = incomeTransactions
    .filter((transaction) => !blockNameOf(transaction))
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const treasurers = (fund.fund_roles ?? []).filter((assignment) => assignment.role === 'treasurer');
  const collectors = (fund.fund_roles ?? []).filter((assignment) => assignment.role === 'collector');
  const handleDeleteFund = async () => {
    if (!fund) return;
    const confirmDelete = async () => {
      try {
        const { error: rpcError } = await supabase.rpc('delete_community_fund', { p_event_id: fund.id });
        if (rpcError) {
          const { error } = await supabase.from('events').delete().eq('id', fund.id);
          if (error) throw error;
        }
        Toast.show({ type: 'success', text1: 'Fund deleted successfully' });
        replaceTracked(router, '/funds');
      } catch (err: any) {
        Toast.show({ type: 'error', text1: 'Error deleting fund', text2: err.message });
      }
    };

    const title = 'Delete fund';
    const message = `Are you sure you want to delete "${fund.title}"? All transactions and role assignments will be deleted. This cannot be undone.`;

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${title}\n${message}`)) {
        void confirmDelete();
      }
    } else {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete },
      ]);
    }
  };

  const visibleMembers = members.filter(
    (member) =>
      member.id !== user?.id &&
      member.app_role !== 'admin' &&
      member.app_role !== 'president' &&
      member.app_role !== 'vice_president'
  );
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
  const roleAccessSummary = getRoleAccessSummary(fundRole);

  const handleAssignRole = async (targetUserId: string, role: Tables<'fund_roles'>['role']) => {
    if (!user?.id) {
      return;
    }

    if (role === 'treasurer') {
      try {
        setSavingRoleId(targetUserId);
        if (treasurers.length > 0) {
          const { error: updateErr } = await supabase
            .from('fund_roles')
            .update({
              user_id: targetUserId,
              assigned_by: user.id,
            })
            .eq('id', treasurers[0].id);

          if (updateErr) throw updateErr;
        } else {
          const { error: insError } = await supabase.from('fund_roles').insert({
            event_id: fund.id,
            user_id: targetUserId,
            role: 'treasurer',
            assigned_by: user.id,
          });

          if (insError) throw insError;
        }

        Toast.show({
          type: 'success',
          text1: 'Treasurer updated',
          text2: `${profileNames.get(targetUserId) ?? 'Resident'} is now the treasurer.`,
        });
        await fetchFundDetail();
      } catch (error: any) {
        Toast.show({ type: 'error', text1: 'Error updating treasurer', text2: error.message });
      } finally {
        setSavingRoleId(null);
      }
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

    if (assignment.role === 'treasurer') {
      const assigneeName = profileNames.get(assignment.user_id) ?? 'Resident';
      const title = 'Remove treasurer?';
      const message = `Remove ${assigneeName} as treasurer? You will need to assign another resident as treasurer.`;
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.confirm(`${title}\n${message}`)) {
          removeNow();
        }
      } else {
        Alert.alert(title, message, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: removeNow },
        ]);
      }
      return;
    }

    if (assignment.role === 'collector') {
      const assigneeName = profileNames.get(assignment.user_id) ?? 'Resident';
      const blockName = assignment.block_id ? blockNames.get(assignment.block_id) ?? 'this block' : null;
      const title = assignment.block_id ? 'Remove block in-charge?' : 'Remove collector?';
      const message = assignment.block_id
        ? `Remove ${assigneeName} as block in-charge for ${blockName}? Past contributions they recorded will remain in the ledger.`
        : `Remove ${assigneeName} as collector? Past contributions they recorded will remain in the ledger.`;

      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.confirm(`${title}\n${message}`)) {
          removeNow();
        }
      } else {
        Alert.alert(title, message, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: removeNow },
        ]);
      }
      return;
    }

    removeNow();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.header, { backgroundColor: colors.background }]}>
          <View style={styles.headerRow}>
            <HeaderBackButton onPress={() => goBackSmart(router, `/funds/${fund.id}`)} color={Verandah.primary} style={styles.iconButton} />
            <View style={styles.headerTextContainer}>
              <Text style={styles.fundTitle}>{fund.title}</Text>
              <Text style={styles.headerLabel}>Fund Transparency</Text>
            </View>
          </View>

          {fund.description ? (
            <Text style={styles.fundDesc}>{fund.description}</Text>
          ) : null}

          {(appRole === 'president' || appRole === 'vice_president') && (
            <View style={{ backgroundColor: colors.surface2, padding: 12, borderRadius: 12, marginBottom: 12, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 15, fontWeight: '500', color: colors.text }}>
                  {fund.is_closed ? 'Fund closed' : 'Fund open'}
                </Text>
                <Switch
                  value={!fund.is_closed}
                  onValueChange={handleToggleFundStatus}
                  trackColor={{ false: Verandah.border, true: Verandah.primary }}
                />
              </View>
              <TouchableOpacity
                onPress={handleDeleteFund}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8, backgroundColor: Verandah.dangerSoft }}
                activeOpacity={0.8}
              >
                <Trash01 size={16} color={Verandah.danger} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: Verandah.danger }}>Delete fund</Text>
              </TouchableOpacity>
            </View>
          )}

          {fund.is_closed && (
            <View style={{ backgroundColor: Verandah.cautionSoft, padding: 12, borderRadius: 12, marginBottom: 12 }}>
              <Text style={{ color: Verandah.caution, fontSize: 14, fontWeight: '500' }}>This fund is closed. No new transactions can be recorded.</Text>
            </View>
          )}

          <View style={styles.roleSummaryCard}>
            <Text style={styles.roleSummaryTitle}>You are a {formatRoleForFundContext(fundRole, undefined, appRole)}</Text>
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
            <Shield01 size={18} color={Verandah.accent} aria-hidden={true} />
          </View>
          <Text style={[styles.accessText, { color: colors.textMuted }]}>{roleAccessSummary}</Text>
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
              <PlusCircle size={18} color={permissions.canAddContribution && !fund.is_closed ? '#FFF' : colors.textMuted} aria-hidden={true} />
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
              <MinusCircle size={18} color={permissions.canAddExpense && !fund.is_closed ? '#FFF' : colors.textMuted} aria-hidden={true} />
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

        {blockSummary.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Block-wise Collection</Text>
              <Text style={[styles.sectionBadge, { color: colors.textMuted }]}>
                {blockSummaryTotals.paidFlats} of {blockSummaryTotals.totalFlats} flats
              </Text>
            </View>
            <View style={styles.blockSummaryCard}>
              {blockSummary.map((row, index) => (
                <View
                  key={row.blockName}
                  style={[styles.blockSummaryRow, index > 0 ? styles.blockSummaryDivider : null]}
                >
                  <Text style={[styles.blockSummaryName, { color: colors.text }]}>Block {row.blockName}</Text>
                  <Text style={[styles.blockSummaryMeta, { color: colors.textMuted }]}>
                    {row.paidFlats}/{row.totalFlats} flats
                  </Text>
                  <Rupees amount={row.collected} size="sm" tone={row.collected > 0 ? 'in' : 'neutral'} />
                </View>
              ))}
              {unassignedIncome > 0 ? (
                <View style={[styles.blockSummaryRow, styles.blockSummaryDivider]}>
                  <Text style={[styles.blockSummaryName, { color: colors.text }]}>Other</Text>
                  <Text style={[styles.blockSummaryMeta, { color: colors.textMuted }]}>Sponsors & unlisted flats</Text>
                  <Rupees amount={unassignedIncome} size="sm" tone="in" />
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {permissions.canManageTreasurers ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Manage Treasurer</Text>
              <Text style={[styles.sectionBadge, { color: colors.textMuted }]}>
                {treasurers.length}/{MAX_TREASURERS}
              </Text>
            </View>
            <Text style={[styles.helperText, { color: colors.textMuted }]}>Keep 1 active treasurer on this fund to manage expenses and collectors.</Text>

            {treasurers.map((assignment) => (
              <View key={assignment.id} style={styles.roleRow}>
                <View style={styles.roleInfo}>
                  <Text style={[styles.roleName, { color: colors.text }]}>{profileNames.get(assignment.user_id) ?? 'Resident'}</Text>
                  <Text style={[styles.roleMeta, { color: colors.textMuted }]}>Treasurer</Text>
                </View>
                <TouchableOpacity
                  style={[styles.roleAction, { backgroundColor: Verandah.dangerSoft }]}
                  disabled={savingRoleId === assignment.id}
                  onPress={() => handleRemoveRole(assignment)}
                >
                  {savingRoleId === assignment.id ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Text style={[styles.roleActionText, { color: colors.accent }]}>
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
                      (member.flat_number || '').toLowerCase().includes(searchTreasurer.toLowerCase())
                  )
                  .slice(0, searchTreasurer.trim() ? undefined : 3)
                  .map((member) => (
                    <View key={member.id} style={styles.roleRow}>
                      <View style={styles.roleInfo}>
                        <Text style={[styles.roleName, { color: colors.text }]}>{profileNames.get(member.id) ?? 'Resident'}</Text>
                        <View style={styles.roleMetaRow}>
                          <Text style={[styles.roleMeta, { color: colors.textMuted }]}>
                            {member.flat_number ? `Flat: ${member.flat_number}` : 'No flat set'}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[styles.roleAction, { backgroundColor: Verandah.accentSoft }]}
                        disabled={savingRoleId === member.id}
                        onPress={() => handleAssignRole(member.id, 'treasurer')}
                      >
                        {savingRoleId === member.id ? (
                          <ActivityIndicator size="small" color={Verandah.accent} />
                        ) : (
                          <Text style={[styles.roleActionText, { color: Verandah.accent }]}>
                            {treasurers.length > 0 ? 'Replace' : 'Set Treasurer'}
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
                      (member.flat_number || '').toLowerCase().includes(searchCollector.toLowerCase())
                  )
                  .slice(0, searchCollector.trim() ? undefined : 3)
                  .map((member) => (
                    <View key={member.id} style={styles.roleRow}>
                      <View style={styles.roleInfo}>
                        <Text style={[styles.roleName, { color: colors.text }]}>{profileNames.get(member.id) ?? 'Resident'}</Text>
                        <View style={styles.roleMetaRow}>
                          <Text style={[styles.roleMeta, { color: colors.textMuted }]}>
                            {member.flat_number ? `Flat: ${member.flat_number}` : 'No flat set'}
                          </Text>
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
            <Text style={[styles.sectionBadge, { color: colors.textMuted }]}>
              {incomeTransactions.length} of {flats.length} flats collected
            </Text>
          </View>
          {contributionGroups.map((group) => (
            <View key={group.key}>
              {showContributionGroupHeaders ? (
                <View style={styles.groupHeader}>
                  <Text style={[styles.groupTitle, { color: colors.text }]}>{group.title}</Text>
                  <View style={styles.groupHeaderMeta}>
                    <Text style={[styles.groupMeta, { color: colors.textMuted }]}>
                      {group.rows.length} {group.isBlock ? (group.rows.length === 1 ? 'flat' : 'flats') : (group.rows.length === 1 ? 'entry' : 'entries')}
                    </Text>
                    <Rupees amount={group.total} size="sm" tone="in" />
                  </View>
                </View>
              ) : null}
              {group.rows.map((transaction) => {
                // A sponsor row has no contributor profile — the payer's name lives
                // on the row itself, and only a lead may edit it (20260825000000).
                const sponsorName = ((transaction as any).sponsor_name as string | null) ?? null;
                const canEditRow = sponsorName ? permissions.canManageTreasurers : permissions.canAddContribution;
                const RowContent = (
                  <>
                    <View style={[styles.avatar, { backgroundColor: Verandah.accentSoft }]}>
                      <PlusCircle size={16} color={Verandah.accent} />
                    </View>
                    <View style={styles.transMain}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.transName, { color: colors.text }]}>
                          {sponsorName ??
                            ((transaction as any).contributor_name ??
                              (transaction.contributor_user_id
                                ? profileNames.get(transaction.contributor_user_id) ?? 'Resident'
                                : transaction.title || 'Contribution'))}
                        </Text>
                        {canEditRow && (
                          <Pencil01 size={13} color={colors.textMuted} />
                        )}
                      </View>
                      <Text style={[styles.transDate, { color: colors.textMuted }]}>
                        {(() => {
                          const dateText = new Date(transaction.created_at ?? Date.now()).toLocaleDateString();

                          if (sponsorName) {
                            return `Outside sponsor · ${dateText}`;
                          }

                          const flatLabel = (transaction as any).contributor_flat_id
                            ? flatLabels.get((transaction as any).contributor_flat_id)
                            : (transaction.contributor_user_id ? profileFlats.get(transaction.contributor_user_id) : null);

                          return flatLabel ? `Flat ${flatLabel} · ${dateText}` : dateText;
                        })()}
                      </Text>
                    </View>
                    <Rupees amount={Number(transaction.amount)} size="sm" tone="in" showSign={true} />
                  </>
                );

                if (canEditRow) {
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
            </View>
          ))}
          {incomeTransactions.length === 0 ? <Text style={[styles.emptyNote, { color: colors.textMuted }]}>No collections logged yet.</Text> : null}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Expense List</Text>
            <Text style={[styles.sectionBadge, { color: colors.textMuted }]}>{expenseTransactions.length} entries</Text>
          </View>
          {expenseTransactions.map((transaction) => {
            const receiptUrl = ((transaction as any).image_url || null) || (() => {
              const match = (transaction.description || '').match(/\[Receipt:\s*(https?:\/\/[^\]]+)\]/i) || (transaction.description || '').match(/(https:\/\/res\.cloudinary\.com\/[^\s]+)/i);
              return match ? match[1] : null;
            })();
            const cleanDescription = (transaction.description || '').replace(/\[Receipt:\s*https?:\/\/[^\]]+\]/gi, '').trim();

            return (
              <TouchableOpacity
                key={transaction.id}
                style={styles.transactionRow}
                onPress={() => setSelectedExpense(transaction)}
                activeOpacity={0.75}
              >
                <View style={[styles.avatar, { backgroundColor: Verandah.dangerSoft }]}>
                  <MinusCircle size={16} color={Verandah.danger} />
                </View>
                <View style={styles.transMain}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.transName, { color: colors.text }]}>{transaction.title || 'Expense'}</Text>
                    {receiptUrl ? (
                      <Paperclip size={14} color={Verandah.primary} />
                    ) : null}
                  </View>
                  <Text style={[styles.transDate, { color: colors.textMuted }]}>
                    {cleanDescription
                      ? `${cleanDescription} • ${new Date(transaction.created_at ?? Date.now()).toLocaleDateString()}`
                      : new Date(transaction.created_at ?? Date.now()).toLocaleDateString()}
                  </Text>
                </View>
                <Rupees amount={Number(transaction.amount)} size="sm" tone="out" />
              </TouchableOpacity>
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

      <Modal visible={!!selectedExpense} transparent animationType="slide" onRequestClose={() => setSelectedExpense(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.background, padding: 20 }]}>
            {selectedExpense && (() => {
              const receiptUrl = ((selectedExpense as any).image_url || null) || (() => {
                const match = (selectedExpense.description || '').match(/\[Receipt:\s*(https?:\/\/[^\]]+)\]/i) || (selectedExpense.description || '').match(/(https:\/\/res\.cloudinary\.com\/[^\s]+)/i);
                return match ? match[1] : null;
              })();
              const cleanDescription = (selectedExpense.description || '').replace(/\[Receipt:\s*https?:\/\/[^\]]+\]/gi, '').trim();

              return (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <Text style={[styles.modalTitle, { color: colors.text, fontSize: 18 }]}>Expense Details</Text>
                    <TouchableOpacity onPress={() => setSelectedExpense(null)} style={{ padding: 4 }}>
                      <XClose size={22} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  <View style={{ backgroundColor: Verandah.card, padding: 14, borderRadius: 14, marginBottom: 14, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Expense Name</Text>
                    <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text, marginBottom: 12 }}>{selectedExpense.title || 'Expense'}</Text>
                    
                    <Text style={{ fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Amount Spent</Text>
                    <Rupees amount={Number(selectedExpense.amount)} size="md" tone="out" />
                    
                    <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 10 }}>
                      Logged on {new Date(selectedExpense.created_at ?? Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>

                    {cleanDescription ? (
                      <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: colors.border }}>
                        <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 2 }}>Notes</Text>
                        <Text style={{ fontSize: 14, color: colors.text }}>{cleanDescription}</Text>
                      </View>
                    ) : null}
                  </View>

                  {receiptUrl ? (
                    <View style={{ marginBottom: 14 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 }}>Bill / Receipt Photo</Text>
                      <TouchableOpacity
                        onPress={() => {
                          if (Platform.OS === 'web' && typeof window !== 'undefined') {
                            window.open(receiptUrl, '_blank');
                          }
                        }}
                        activeOpacity={0.9}
                      >
                        <Image
                          source={{ uri: cloudinaryUrl(receiptUrl) }}
                          style={{ width: '100%', height: 180, borderRadius: 12, backgroundColor: colors.surface2 }}
                          contentFit="contain"
                        />
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    <TouchableOpacity
                      style={[styles.roleAction, { backgroundColor: colors.surface2, flex: 1, height: 42, borderRadius: 12, marginLeft: 0 }]}
                      onPress={() => setSelectedExpense(null)}
                    >
                      <Text style={[styles.roleActionText, { color: colors.text }]}>Close</Text>
                    </TouchableOpacity>

                    {permissions.canAddExpense ? (
                      <TouchableOpacity
                        style={[styles.roleAction, { backgroundColor: Verandah.accent, flex: 1, height: 42, borderRadius: 12, marginLeft: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}
                        onPress={() => {
                          const expId = selectedExpense.id;
                          setSelectedExpense(null);
                          router.push(`/funds/add-transaction?event_id=${fund.id}&type=expense&transaction_id=${expId}`);
                        }}
                      >
                        <Pencil01 size={15} color="#FFF" style={{ marginRight: 6 }} />
                        <Text style={[styles.roleActionText, { color: '#FFF', fontWeight: '600' }]}>Edit Expense</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </>
              );
            })()}
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
    paddingTop: Platform.OS === 'web' ? 16 : VerandahLayout.screenPaddingTop,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  headerTextContainer: {
    flex: 1,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Verandah.cardMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIcon: {
    color: Verandah.primaryFg,
  },
  fundTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Verandah.textPrimary,
    lineHeight: 24,
  },
  headerLabel: {
    color: Verandah.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 1,
  },
  fundDesc: {
    fontSize: 12,
    color: Verandah.textSecondary,
    marginBottom: 8,
    lineHeight: 16,
  },
  roleSummaryCard: {
    backgroundColor: Verandah.card,
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    gap: 2,
    borderWidth: VerandahBorder.tile,
    borderColor: Verandah.border,
  },
  roleSummaryTitle: {
    color: Verandah.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  roleSummaryText: {
    color: Verandah.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    backgroundColor: Verandah.card,
    borderRadius: 14,
    padding: 10,
    borderWidth: VerandahBorder.tile,
    borderColor: Verandah.border,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  sumLabel: {
    color: Verandah.textSecondary,
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  sumValue: {
    color: Verandah.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  sumDivider: {
    width: 1,
    height: '100%',
    backgroundColor: Verandah.border,
  },
  accessCard: {
    backgroundColor: Verandah.card,
    marginHorizontal: 16,
    marginTop: -4,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Verandah.border,
  },
  accessHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  accessIcon: {
    fontSize: 16,
    lineHeight: 18,
  },
  accessTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  accessText: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 2,
  },
  actionsCard: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    minHeight: 40,
    height: 40,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  actionIcon: {
    fontSize: 16,
    lineHeight: 18,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  sectionBadge: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
    backgroundColor: Verandah.card,
    padding: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Verandah.border,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  statusEmoji: {
    fontSize: 14,
    lineHeight: 16,
  },
  transMain: {
    flex: 1,
  },
  transName: {
    fontSize: 14,
    fontWeight: '600',
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
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  transAmount: {
    fontSize: 14,
    fontWeight: '500',
  },
  emptyNote: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  blockSummaryCard: {
    backgroundColor: Verandah.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Verandah.border,
    paddingHorizontal: 10,
  },
  blockSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  blockSummaryDivider: {
    borderTopWidth: 1,
    borderTopColor: Verandah.border,
  },
  blockSummaryName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  blockSummaryMeta: {
    fontSize: 11,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  groupHeaderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  groupMeta: {
    fontSize: 11,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Verandah.card,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    marginBottom: 5,
    borderWidth: 1,
    borderColor: Verandah.border,
  },
  roleInfo: {
    flex: 1,
  },
  roleName: {
    fontSize: 14,
    fontWeight: '600',
  },
  roleMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  roleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    marginBottom: 8,
    fontSize: 13,
  },
  roleAction: {
    minWidth: 72,
    minHeight: 32,
    height: 32,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginLeft: 8,
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
