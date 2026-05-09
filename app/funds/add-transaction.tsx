import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { BlockPicker } from '../../components/BlockPicker';
import { Colors } from '../../constants/Colors';
import { APP_EMOJIS } from '../../constants/emojis';
import { useAuth } from '../../context/AuthContext';
import { Tables } from '../../lib/database.types';
import { formatRole, getEffectiveFundRole, getFundPermissions } from '../../lib/fundRoles';
import { supabase } from '../../lib/supabase';
import { getMissingFundSchemaMessage, isMissingFundSchemaError } from '../../lib/supabaseErrors';

type FundContext = Pick<Tables<'events'>, 'id' | 'community_id' | 'title'> & {
  community: Pick<Tables<'communities'>, 'funds_enabled' | 'blocks_enabled'> | null;
  fund_roles: Tables<'fund_roles'>[];
  event_transactions: Pick<Tables<'event_transactions'>, 'contributor_user_id' | 'type'>[];
};

type EligibleContributor = {
  user_id: string;
  full_name: string;
  flat_no: string | null;
  has_contributed: boolean;
};

export default function AddTransactionScreen() {
  const { event_id, type: initialType } = useLocalSearchParams();
  const { user, appRole, myBlockId, refreshSession } = useAuth();
  const router = useRouter();
  const colors = Colors.light;

  const [type, setType] = useState<'income' | 'expense'>((initialType as 'income' | 'expense') || 'income');
  const [fund, setFund] = useState<FundContext | null>(null);
  const [members, setMembers] = useState<EligibleContributor[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingContext, setIsFetchingContext] = useState(true);
  const [showBlockPrompt, setShowBlockPrompt] = useState(false);
  const [selectedMyBlock, setSelectedMyBlock] = useState<string | null>(myBlockId ?? null);

  useEffect(() => {
    const loadContext = async () => {
      try {
        setIsFetchingContext(true);
        const { data, error } = await supabase
          .from('events')
          .select('id, community_id, title, community:communities!inner(funds_enabled, blocks_enabled)')
          .eq('id', event_id as string)
          .single();

        if (error) throw error;

        const [rolesResult, transactionsResult, contributorsResult] = await Promise.all([
          supabase.from('fund_roles').select('*').eq('event_id', data.id),
          supabase.from('event_transactions').select('contributor_user_id, type').eq('event_id', data.id),
          supabase.rpc('list_eligible_contributors_for_collector', { p_event_id: data.id }),
        ]);

        if (rolesResult.error && !isMissingFundSchemaError(rolesResult.error)) {
          throw rolesResult.error;
        }

        if (transactionsResult.error && !isMissingFundSchemaError(transactionsResult.error)) {
          throw transactionsResult.error;
        }

        if (contributorsResult.error) throw contributorsResult.error;

        const visibleMembers = (contributorsResult.data ?? []) as EligibleContributor[];
        const paidMemberIds = new Set(
          visibleMembers.filter((member) => member.has_contributed).map((member) => member.user_id)
        );
        const defaultMember = visibleMembers.find((member) => !paidMemberIds.has(member.user_id));

        setFund({
          ...data,
          community: (data as any).community ?? null,
          fund_roles: rolesResult.data ?? [],
          event_transactions: transactionsResult.data ?? [],
        });
        setMembers(visibleMembers);
        setSelectedMemberId(defaultMember?.user_id ?? null);

        if (rolesResult.error || transactionsResult.error) {
          Toast.show({ type: 'error', text1: 'Funds partially loaded', text2: getMissingFundSchemaMessage() });
        }
      } catch (error: any) {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: isMissingFundSchemaError(error)
            ? getMissingFundSchemaMessage()
            : error.message || 'Unable to load fund details',
        });
        router.back();
      } finally {
        setIsFetchingContext(false);
      }
    };

    loadContext();
  }, [event_id, router]);

  useEffect(() => {
    setSelectedMyBlock(myBlockId ?? null);
  }, [myBlockId]);

  const fundRole = useMemo(() => {
    if (!fund) {
      return 'resident' as const;
    }

    return getEffectiveFundRole(appRole, fund.fund_roles ?? [], user?.id);
  }, [appRole, fund, user?.id]);

  const permissions = useMemo(() => getFundPermissions(fundRole), [fundRole]);
  const paidMemberIds = useMemo(
    () =>
      new Set(
        (fund?.event_transactions ?? [])
          .filter((transaction) => transaction.type === 'income' && transaction.contributor_user_id)
          .map((transaction) => transaction.contributor_user_id as string)
      ),
    [fund?.event_transactions]
  );

  const fundsInactive = Boolean(fund && !fund.community?.funds_enabled);

  useEffect(() => {
    if (!permissions.canAddContribution && type === 'income' && !isFetchingContext) {
      Toast.show({
        type: 'error',
        text1: 'Access denied',
        text2: 'Only collectors or treasurers can add contributions',
      });
    }

    if (!permissions.canAddExpense && type === 'expense' && !isFetchingContext) {
      Toast.show({
        type: 'error',
        text1: 'Access denied',
        text2: 'Only treasurers can add expenses',
      });
    }
  }, [isFetchingContext, permissions.canAddContribution, permissions.canAddExpense, type]);

  useEffect(() => {
    if (
      !isFetchingContext &&
      type === 'income' &&
      fund?.community?.blocks_enabled &&
      !myBlockId &&
      permissions.canAddContribution
    ) {
      setShowBlockPrompt(true);
    }
  }, [fund?.community?.blocks_enabled, isFetchingContext, myBlockId, permissions.canAddContribution, type]);

  const handleChangeType = (nextType: 'income' | 'expense') => {
    if (nextType === 'income' && !permissions.canAddContribution) {
      Toast.show({ type: 'error', text1: 'Access denied', text2: 'Only collectors or treasurers can add contributions' });
      return;
    }

    if (nextType === 'expense' && !permissions.canAddExpense) {
      Toast.show({ type: 'error', text1: 'Access denied', text2: 'Only treasurers can add expenses' });
      return;
    }

    setType(nextType);
    setTitle('');
    setNotes('');
  };

  const handleSave = async () => {
    if (!amount.trim() || isNaN(Number(amount)) || Number(amount) <= 0) {
      Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Please enter a valid amount' });
      return;
    }

    if (type === 'income' && !permissions.canAddContribution) {
      Toast.show({ type: 'error', text1: 'Access denied', text2: 'Only collectors or treasurers can add contributions' });
      return;
    }

    if (type === 'expense' && !permissions.canAddExpense) {
      Toast.show({ type: 'error', text1: 'Access denied', text2: 'Only treasurers can add expenses' });
      return;
    }

    if (type === 'income') {
      if (!selectedMemberId) {
        Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Select a resident to mark as paid.' });
        return;
      }

      if (paidMemberIds.has(selectedMemberId)) {
        Toast.show({ type: 'error', text1: 'Already paid', text2: 'This resident is already marked as paid.' });
        return;
      }
    }

    if (type === 'expense' && !title.trim()) {
      Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Expense name is required' });
      return;
    }

    setIsLoading(true);
    try {
      const memberName = members.find((member) => member.user_id === selectedMemberId)?.full_name?.trim() || 'Resident';
      const payload =
        type === 'income'
          ? {
              event_id: event_id as string,
              created_by: user?.id as string,
              amount: Number(amount),
              type,
              title: memberName,
              description: notes.trim() || null,
              category: 'Contribution',
              contributor_user_id: selectedMemberId,
            }
          : {
              event_id: event_id as string,
              created_by: user?.id as string,
              amount: Number(amount),
              type,
              title: title.trim(),
              description: notes.trim() || null,
              category: 'Expense',
              contributor_user_id: null,
            };

      const { error } = await supabase.from('event_transactions').insert(payload);

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: type === 'income' ? 'Contribution added' : 'Expense added',
        text2: type === 'income' ? `${memberName} is now marked as paid.` : 'The fund ledger was updated successfully.',
      });
      router.back();
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: isMissingFundSchemaError(error) ? getMissingFundSchemaMessage() : error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetchingContext || !fund) {
    return (
      <View style={[styles.loadingState, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (fundsInactive) {
    return (
      <View style={[styles.loadingState, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>Funds are not active in this community.</Text>
        <TouchableOpacity style={[styles.backInactiveBtn, { borderColor: colors.border }]} onPress={() => router.replace('/(tabs)/community')}>
          <Text style={[styles.backInactiveText, { color: colors.primary }]}>Back to community</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>{type === 'income' ? 'Add Contribution' : 'Add Expense'}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {fund.title} - You are a {formatRole(fundRole)}
          </Text>
        </View>

        <View style={[styles.form, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <View style={[styles.tabContainer, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <TouchableOpacity
              style={[
                styles.tab,
                type === 'income' ? { backgroundColor: colors.surface } : {},
              ]}
              onPress={() => handleChangeType('income')}
            >
              <Text style={[styles.tabText, { color: type === 'income' ? colors.primary : colors.textMuted }]}>Contribution</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tab,
                type === 'expense' ? { backgroundColor: colors.surface } : {},
              ]}
              onPress={() => handleChangeType('expense')}
            >
              <Text style={[styles.tabText, { color: type === 'expense' ? colors.accent : colors.textMuted }]}>Expense</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.notice, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <Text style={styles.noticeIcon}>{APP_EMOJIS.info}</Text>
            <Text style={[styles.noticeText, { color: colors.textMuted }]}>
              {type === 'income'
                ? permissions.canAddContribution
                  ? 'Select a resident, add the received amount, and they will appear as paid in the fund.'
                  : 'Only collectors or treasurers can add contributions.'
                : permissions.canAddExpense
                  ? 'Add the expense name, amount, and optional note for transparent bookkeeping.'
                  : 'Only treasurers can add expenses.'}
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>AMOUNT</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
            />
          </View>

          {type === 'income' ? (
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>SELECT RESIDENT</Text>
              {members.map((member) => {
                const isPaid = paidMemberIds.has(member.user_id);
                const isSelected = selectedMemberId === member.user_id;

                return (
                  <TouchableOpacity
                    key={member.user_id}
                    style={[
                      styles.memberRow,
                      {
                        backgroundColor: isSelected ? colors.primary + '08' : colors.glass,
                        borderColor: isSelected ? colors.primary : colors.border,
                        opacity: isPaid ? 0.55 : 1,
                      },
                    ]}
                    onPress={() => {
                      if (isPaid) {
                        Toast.show({ type: 'error', text1: 'Already paid', text2: 'This resident is already marked as paid.' });
                        return;
                      }

                      setSelectedMemberId(member.user_id);
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={styles.memberInfo}>
                      <Text style={[styles.memberName, { color: colors.text }]}>{member.full_name?.trim() || 'Resident'}</Text>
                      <Text style={[styles.memberMeta, { color: colors.textMuted }]}>{member.flat_no ? `Flat ${member.flat_no}` : 'Flat not set'}</Text>
                    </View>
                    <View style={styles.memberStatus}>
                      <Text style={[styles.memberStatusText, { color: isPaid ? colors.secondary : colors.textMuted }]}>
                        {isPaid ? 'Paid' : isSelected ? 'Selected' : 'Pending'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>EXPENSE NAME</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                placeholder="e.g. Water tanker payment"
                placeholderTextColor={colors.textMuted}
                value={title}
                onChangeText={setTitle}
              />
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>NOTES (OPTIONAL)</Text>
            <TextInput
              style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder={type === 'income' ? 'Receipt reference or collection note' : 'Vendor note or context'}
              placeholderTextColor={colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.glass }]}>
        <TouchableOpacity
          onPress={handleSave}
          disabled={isLoading}
          activeOpacity={0.85}
          style={[styles.saveButton, { backgroundColor: type === 'income' ? colors.primary : colors.accent }]}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.saveButtonText}>{type === 'income' ? 'Save Contribution' : 'Save Expense'}</Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={showBlockPrompt} transparent animationType="slide" onRequestClose={() => setShowBlockPrompt(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Set your block to continue</Text>
            {fund?.community_id ? <BlockPicker value={selectedMyBlock} onChange={setSelectedMyBlock} communityId={fund.community_id} /> : null}
            <TouchableOpacity
              style={[styles.modalPrimary, { backgroundColor: colors.primary }]}
              onPress={async () => {
                const { error } = await supabase.rpc('set_my_block', { p_block_id: selectedMyBlock });
                if (error) {
                  Toast.show({ type: 'error', text1: 'Unable to set block', text2: error.message });
                  return;
                }
                await refreshSession();
                setShowBlockPrompt(false);
              }}
            >
              <Text style={styles.modalPrimaryText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
  },
  header: {
    marginBottom: 32,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.surface2,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -4,
  },
  title: {
    fontSize: 28,
    fontWeight: '500',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 6,
    lineHeight: 20,
  },
  form: {
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
  },
  notice: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 24,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1.5,
    marginBottom: 10,
    marginLeft: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 4,
    marginBottom: 24,
    borderWidth: 1,
  },
  tab: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noticeIcon: {
    fontSize: 18,
    lineHeight: 20,
  },
  tabText: {
    fontWeight: '500',
    fontSize: 14,
  },
  input: {
    height: 56,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: '500',
  },
  textArea: {
    minHeight: 110,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    fontSize: 16,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '500',
  },
  memberMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
  },
  memberStatus: {
    marginLeft: 12,
  },
  memberStatusText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  footer: {
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
  },
  saveButton: {
    height: 60,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 0,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '500',
  },
  backInactiveBtn: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backInactiveText: {
    fontSize: 13,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  modalPrimary: {
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalPrimaryText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
  },
});
