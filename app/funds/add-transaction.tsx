import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
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
import { HeaderBackButton } from '../../components/HeaderBackButton';
import { ImageUploader } from '../../components/ImageUploader';
import { Verandah } from '../../constants/Colors';
import { APP_EMOJIS } from '../../constants/emojis';
import { VerandahLayout, VerandahRadius, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { Tables } from '../../lib/database.types';
import { goBackSmart, replaceTracked } from '../../lib/navigation';
import {
    MAX_SPONSOR_NAME_LENGTH,
    MAX_SPONSOR_NOTE_LENGTH,
    MAX_SPONSOR_PHONE_LENGTH,
    MAX_TRANSACTION_AMOUNT,
    MAX_TRANSACTION_AMOUNT_LABEL,
    formatRoleForFundContext,
    getEffectiveFundRole,
    getFundPermissions,
} from '../../lib/fundRoles';
import { supabase } from '../../lib/supabase';
import { getMissingFundSchemaMessage, isMissingFundSchemaError } from '../../lib/supabaseErrors';

type FundContext = Pick<Tables<'events'>, 'id' | 'community_id' | 'title' | 'is_closed'> & {
  community: Pick<Tables<'communities'>, 'funds_enabled' | 'blocks_enabled'> | null;
  fund_roles: Tables<'fund_roles'>[];
  event_transactions: Pick<Tables<'event_transactions'>, 'id' | 'contributor_user_id' | 'type'>[];
};

type EligibleContributor = {
  user_id: string;
  full_name: string;
  flat_no: string | null;
  has_contributed: boolean;
};

const extractImageUrl = (
  imageUrl: string | null | undefined,
  description: string | null | undefined
): { url: string | null; cleanNotes: string } => {
  if (imageUrl) {
    const cleanNotes = (description || '').replace(/\[Receipt:\s*https?:\/\/[^\]]+\]/gi, '').trim();
    return { url: imageUrl, cleanNotes };
  }

  if (!description) {
    return { url: null, cleanNotes: '' };
  }

  const receiptMatch = description.match(/\[Receipt:\s*(https?:\/\/[^\]]+)\]/i);
  if (receiptMatch && receiptMatch[1]) {
    const cleanNotes = description.replace(/\[Receipt:\s*https?:\/\/[^\]]+\]/gi, '').trim();
    return { url: receiptMatch[1], cleanNotes };
  }

  const cloudinaryMatch = description.match(/(https:\/\/res\.cloudinary\.com\/[^\s]+)/i);
  if (cloudinaryMatch && cloudinaryMatch[1]) {
    const cleanNotes = description.replace(cloudinaryMatch[1], '').trim();
    return { url: cloudinaryMatch[1], cleanNotes };
  }

  return { url: null, cleanNotes: description };
};

export default function AddTransactionScreen() {
  const { event_id, type: initialType, transaction_id } = useLocalSearchParams();
  // getImmediateParentRoute() reads event_id off the query string to send the
  // user back to the fund they were recording against, so keep it on the path.
  const selfPath = event_id
    ? `/funds/add-transaction?event_id=${event_id}`
    : '/funds/add-transaction';
  const { user, appRole, myBlockId, refreshSession } = useAuth();
  const router = useRouter();
  const colors = {
    background: Verandah.surface,
    text: Verandah.textPrimary,
    textMuted: Verandah.textSecondary,
    primary: Verandah.primary,
    secondary: Verandah.accent,
    accent: Verandah.danger,
    border: Verandah.border,
    card: Verandah.card,
    surface: Verandah.card,
    surface2: Verandah.cardMuted,
  };

  const [type, setType] = useState<'income' | 'expense'>((initialType as 'income' | 'expense') || 'income');
  const [fund, setFund] = useState<FundContext | null>(null);
  const [members, setMembers] = useState<EligibleContributor[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFetchingContext, setIsFetchingContext] = useState(true);
  const [showBlockPrompt, setShowBlockPrompt] = useState(false);
  const [selectedMyBlock, setSelectedMyBlock] = useState<string | null>(myBlockId ?? null);
  const [searchMember, setSearchMember] = useState('');
  // A contribution names its payer: either a community member or an outside
  // sponsor. Sponsors are the lead's call — see migration 20260825000000.
  const [payerMode, setPayerMode] = useState<'member' | 'sponsor'>('member');
  const [sponsorName, setSponsorName] = useState('');
  const [sponsorPhone, setSponsorPhone] = useState('');
  const [sponsorNote, setSponsorNote] = useState('');

  useEffect(() => {
    const loadContext = async () => {
      try {
        setIsFetchingContext(true);
        const { data, error } = await supabase
          .from('events')
          .select('id, community_id, title, is_closed, community:communities!inner(funds_enabled, blocks_enabled)')
          .eq('id', event_id as string)
          .single();

        if (error) throw error;

        const [rolesResult, transactionsResult, contributorsResult, existingTxResult] = await Promise.all([
          supabase.from('fund_roles').select('*').eq('event_id', data.id),
          supabase.from('event_transactions').select('id, contributor_user_id, type').eq('event_id', data.id),
          supabase.rpc('list_eligible_contributors_for_collector', { p_event_id: data.id }),
          transaction_id
            ? supabase.from('event_transactions').select('*').eq('id', transaction_id as string).single()
            : Promise.resolve({ data: null, error: null } as any),
        ]);

        if (rolesResult.error && !isMissingFundSchemaError(rolesResult.error)) {
          throw rolesResult.error;
        }

        if (transactionsResult.error && !isMissingFundSchemaError(transactionsResult.error)) {
          throw transactionsResult.error;
        }

        if (contributorsResult.error) throw contributorsResult.error;
        if (existingTxResult.error) throw existingTxResult.error;

        const visibleMembers = (contributorsResult.data ?? []) as EligibleContributor[];
        setFund({
          ...data,
          community: (data as any).community ?? null,
          fund_roles: rolesResult.data ?? [],
          event_transactions: transactionsResult.data ?? [],
        });
        setMembers(visibleMembers);

        const existingTx = existingTxResult.data;
        if (existingTx) {
          setAmount(existingTx.amount.toString());
          setType(existingTx.type as 'income' | 'expense');
          if (existingTx.type === 'expense') {
            setTitle(existingTx.title || '');
          }
          const { url, cleanNotes } = extractImageUrl((existingTx as any).image_url, existingTx.description);
          setNotes(cleanNotes);
          setImageUrl(url);
          if (existingTx.type === 'income') {
            const existingSponsorName = ((existingTx as any).sponsor_name as string | null) ?? null;
            if (existingSponsorName) {
              setPayerMode('sponsor');
              setSponsorName(existingSponsorName);
              setSponsorPhone(((existingTx as any).sponsor_phone as string | null) ?? '');
              setSponsorNote(((existingTx as any).sponsor_note as string | null) ?? '');
              setSelectedMemberId(null);
            } else {
              setPayerMode('member');
              setSelectedMemberId(existingTx.contributor_user_id);
            }
          }
        } else {
          const paidMemberIdsSet = new Set(
            visibleMembers.filter((member) => member.has_contributed).map((member) => member.user_id)
          );
          const defaultMember = visibleMembers.find((member) => !paidMemberIdsSet.has(member.user_id));
          setSelectedMemberId(defaultMember?.user_id ?? null);
        }

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
  }, [event_id, transaction_id, router]);

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
  // Only the fund-admin capacity (president / vice president / platform admin)
  // may bring in money from outside the community.
  const canRecordSponsor = permissions.canManageTreasurers;
  const paidMemberIds = useMemo(
    () =>
      new Set(
        (fund?.event_transactions ?? [])
          .filter((transaction) => transaction.type === 'income' && transaction.contributor_user_id && transaction.id !== transaction_id)
          .map((transaction) => transaction.contributor_user_id as string)
      ),
    [fund?.event_transactions, transaction_id]
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
      payerMode === 'member' &&
      fund?.community?.blocks_enabled &&
      !myBlockId &&
      permissions.canAddContribution
    ) {
      setShowBlockPrompt(true);
    }
  }, [fund?.community?.blocks_enabled, isFetchingContext, myBlockId, payerMode, permissions.canAddContribution, type]);

  const handleChangeType = (nextType: 'income' | 'expense') => {
    if (transaction_id) return;

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

    if (nextType === 'expense') {
      setPayerMode('member');
      setSponsorName('');
      setSponsorPhone('');
      setSponsorNote('');
    }
  };

  const handleDelete = () => {
    const title = type === 'income' ? 'Delete contribution?' : 'Delete expense?';
    const message = type === 'income'
      ? 'Are you sure you want to delete this contribution? The resident will be marked as unpaid.'
      : 'Are you sure you want to delete this expense? This will permanently remove it from the fund ledger.';

    const performDelete = async () => {
      setIsDeleting(true);
      try {
        const { error } = await supabase
          .from('event_transactions')
          .delete()
          .eq('id', transaction_id as string);

        if (error) throw error;

        Toast.show({
          type: 'success',
          text1: type === 'income' ? 'Contribution deleted' : 'Expense deleted',
          text2: 'The fund ledger was updated successfully.',
        });
        router.back();
      } catch (error: any) {
        Toast.show({
          type: 'error',
          text1: 'Error deleting',
          text2: error.message,
        });
      } finally {
        setIsDeleting(false);
      }
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${title}\n${message}`)) {
        performDelete();
      }
    } else {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: performDelete },
      ]);
    }
  };

  const handleSave = async () => {
    const amountValue = Number(amount);
    if (!amount.trim() || isNaN(amountValue) || amountValue <= 0) {
      Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Please enter a valid amount' });
      return;
    }

    if (amountValue > MAX_TRANSACTION_AMOUNT) {
      Toast.show({
        type: 'error',
        text1: 'Amount too large',
        text2: `A single entry cannot exceed ₹${MAX_TRANSACTION_AMOUNT_LABEL}.`,
      });
      return;
    }

    // Read the decimals off the typed text — multiplying by 100 and comparing
    // to a rounded value misfires on ordinary values like 100.10.
    if ((amount.trim().split('.')[1] ?? '').length > 2) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Amount can have at most 2 decimal places.',
      });
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

    if (type === 'income' && payerMode === 'sponsor') {
      if (!canRecordSponsor) {
        Toast.show({
          type: 'error',
          text1: 'Access denied',
          text2: 'Only the president or vice president can record a sponsor contribution.',
        });
        return;
      }

      if (!sponsorName.trim()) {
        Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Sponsor name is required.' });
        return;
      }
    }

    if (type === 'income' && payerMode === 'member') {
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
      const isSponsorContribution = type === 'income' && payerMode === 'sponsor';
      const payerName = isSponsorContribution ? sponsorName.trim() : memberName;
      let notesText = notes.trim();
      if (type === 'expense' && imageUrl) {
        notesText = notesText ? `${notesText}\n[Receipt: ${imageUrl}]` : `[Receipt: ${imageUrl}]`;
      }

      const basePayload: any =
        type === 'income'
          ? {
              event_id: event_id as string,
              amount: amountValue,
              type,
              title: payerName,
              description: notes.trim() || null,
              category: isSponsorContribution ? 'Sponsor contribution' : 'Contribution',
              contributor_user_id: isSponsorContribution ? null : selectedMemberId,
              sponsor_name: isSponsorContribution ? sponsorName.trim() : null,
              sponsor_phone: isSponsorContribution ? sponsorPhone.trim() || null : null,
              sponsor_note: isSponsorContribution ? sponsorNote.trim() || null : null,
            }
          : {
              event_id: event_id as string,
              amount: amountValue,
              type,
              title: title.trim(),
              description: notesText || null,
              category: 'Expense',
              contributor_user_id: null,
              sponsor_name: null,
              sponsor_phone: null,
              sponsor_note: null,
            };

      if (imageUrl) {
        basePayload.image_url = imageUrl;
      }

      let { error } = transaction_id
        ? await supabase.from('event_transactions').update(basePayload).eq('id', transaction_id as string)
        : await supabase.from('event_transactions').insert({ ...basePayload, created_by: user?.id as string });

      if (error && 'image_url' in basePayload && isMissingFundSchemaError(error)) {
        delete basePayload.image_url;
        const fallback = transaction_id
          ? await supabase.from('event_transactions').update(basePayload).eq('id', transaction_id as string)
          : await supabase.from('event_transactions').insert({ ...basePayload, created_by: user?.id as string });
        error = fallback.error;
      }

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: transaction_id
          ? type === 'income' ? 'Contribution updated' : 'Expense updated'
          : type === 'income' ? 'Contribution added' : 'Expense added',
        text2: type === 'income' ? `${payerName} status updated.` : 'The fund ledger was updated successfully.',
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
        <TouchableOpacity style={[styles.backInactiveBtn, { borderColor: colors.border }]} onPress={() => replaceTracked(router, '/(tabs)/community')}>
          <Text style={[styles.backInactiveText, { color: colors.primary }]}>Back to community</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (fund?.is_closed) {
    return (
      <View style={[styles.loadingState, { backgroundColor: colors.background, padding: 24 }]}>
        <Ionicons name="lock-closed" size={48} color={Verandah.caution} style={{ marginBottom: 16 }} />
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600', marginBottom: 8, textAlign: 'center' }}>
          Fund is closed
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 15, textAlign: 'center', marginBottom: 24, lineHeight: 22 }}>
          This fund has been closed by the community lead. No new transactions can be recorded or edited.
        </Text>
        <TouchableOpacity style={[styles.backInactiveBtn, { borderColor: colors.border }]} onPress={() => goBackSmart(router, selfPath)}>
          <Text style={[styles.backInactiveText, { color: colors.primary }]}>Go back</Text>
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
          <HeaderBackButton onPress={() => goBackSmart(router, selfPath)} color={colors.text} style={styles.backButton} />
          <View style={styles.headerTextContainer}>
            <Text style={styles.title}>
              {transaction_id
                ? type === 'income' ? 'Edit contribution' : 'Edit expense'
                : type === 'income' ? 'Record contribution' : 'Record expense'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {fund.title} - You are a {formatRoleForFundContext(fundRole, undefined, appRole)}
            </Text>
          </View>
        </View>

        <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.tabContainer, { backgroundColor: colors.card, borderColor: colors.border, opacity: transaction_id ? 0.6 : 1 }]}>
            <TouchableOpacity
              style={[
                styles.tab,
                type === 'income' ? styles.tabActiveIncome : {},
              ]}
              onPress={() => handleChangeType('income')}
              disabled={!!transaction_id}
            >
              <Text style={[styles.tabText, { color: type === 'income' ? colors.primary : colors.textMuted }]}>Contribution</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tab,
                type === 'expense' ? styles.tabActiveExpense : {},
              ]}
              onPress={() => handleChangeType('expense')}
              disabled={!!transaction_id}
            >
              <Text style={[styles.tabText, { color: type === 'expense' ? colors.accent : colors.textMuted }]}>Expense</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={styles.noticeIcon}>{APP_EMOJIS.info}</Text>
            <Text style={[styles.noticeText, { color: colors.textMuted }]}>
              {transaction_id
                ? 'You are editing this transaction. You can modify the amount, title, and notes.'
                : type === 'income'
                  ? payerMode === 'sponsor'
                    ? 'Recording money from outside the community. Name the sponsor so the entry stays traceable.'
                    : permissions.canAddContribution
                      ? 'Select a resident, add the received amount, and they will appear as paid in the fund.'
                      : 'Only collectors or treasurers can add contributions.'
                  : permissions.canAddExpense
                    ? 'Add the expense name, amount, and optional note for transparent bookkeeping.'
                    : 'Only treasurers can add expenses.'}
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Amount</Text>
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
              {canRecordSponsor && !transaction_id ? (
                <View style={[styles.tabContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <TouchableOpacity
                    style={[styles.tab, payerMode === 'member' ? styles.tabActiveIncome : {}]}
                    onPress={() => setPayerMode('member')}
                  >
                    <Text style={[styles.tabText, { color: payerMode === 'member' ? colors.primary : colors.textMuted }]}>
                      Community member
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tab, payerMode === 'sponsor' ? styles.tabActiveIncome : {}]}
                    onPress={() => setPayerMode('sponsor')}
                  >
                    <Text style={[styles.tabText, { color: payerMode === 'sponsor' ? colors.primary : colors.textMuted }]}>
                      Outside sponsor
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <Text style={[styles.label, { color: colors.text }]}>
                {payerMode === 'sponsor' ? 'Sponsor name' : 'Select resident'}
              </Text>
              {payerMode === 'sponsor' ? (
                <>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="e.g. Sharma Electricals"
                    placeholderTextColor={colors.textMuted}
                    value={sponsorName}
                    onChangeText={setSponsorName}
                    maxLength={MAX_SPONSOR_NAME_LENGTH}
                  />

                  <Text style={[styles.label, { color: colors.text, marginTop: 12 }]}>Sponsor phone (optional)</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="Contact number"
                    placeholderTextColor={colors.textMuted}
                    value={sponsorPhone}
                    onChangeText={setSponsorPhone}
                    keyboardType="phone-pad"
                    maxLength={MAX_SPONSOR_PHONE_LENGTH}
                  />

                  <Text style={[styles.label, { color: colors.text, marginTop: 12 }]}>Sponsor note (optional)</Text>
                  <TextInput
                    style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="Organisation, cheque number, or reference"
                    placeholderTextColor={colors.textMuted}
                    value={sponsorNote}
                    onChangeText={setSponsorNote}
                    multiline
                    numberOfLines={2}
                    textAlignVertical="top"
                    maxLength={MAX_SPONSOR_NOTE_LENGTH}
                  />
                </>
              ) : transaction_id ? (
                (() => {
                  const member = members.find((m) => m.user_id === selectedMemberId);
                  if (!member) {
                    return <Text style={{ color: colors.textMuted }}>Resident data unavailable</Text>;
                  }
                  return (
                    <View style={[styles.memberRow, { backgroundColor: colors.card, borderColor: colors.border, opacity: 0.8 }]}>
                      <View style={styles.memberInfo}>
                        <Text style={[styles.memberName, { color: colors.text }]}>{member.full_name?.trim() || 'Resident'}</Text>
                        <Text style={[styles.memberMeta, { color: colors.textMuted }]}>{member.flat_no ? `Flat ${member.flat_no}` : 'Flat not set'}</Text>
                      </View>
                      <View style={[styles.memberStatus, styles.memberStatusPaid]}>
                        <Text style={[styles.memberStatusText, styles.memberStatusTextPaid]}>PAID</Text>
                      </View>
                    </View>
                  );
                })()
              ) : (
                <>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background, marginBottom: 8, height: 42, fontSize: 14 }]}
                    placeholder="Search by name or flat..."
                    placeholderTextColor={colors.textMuted}
                    value={searchMember}
                    onChangeText={setSearchMember}
                  />
                  {!searchMember.trim() && members.length > 3 && (
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8, marginLeft: 4 }}>
                      Type to search all residents...
                    </Text>
                  )}
                  {members
                    .filter(
                      (member) =>
                        !searchMember.trim() ||
                        (member.full_name || '').toLowerCase().includes(searchMember.toLowerCase()) ||
                        (member.flat_no || '').toLowerCase().includes(searchMember.toLowerCase())
                    )
                    .slice(0, searchMember.trim() ? undefined : 3)
                    .map((member) => {
                    const isPaid = paidMemberIds.has(member.user_id);
                    const isSelected = selectedMemberId === member.user_id;

                    return (
                      <TouchableOpacity
                        key={member.user_id}
                        style={[
                          styles.memberRow,
                          {
                            backgroundColor: isSelected ? colors.primary + '08' : colors.card,
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
                        <View
                          style={[
                            styles.memberStatus,
                            isPaid
                              ? styles.memberStatusPaid
                              : isSelected
                                ? styles.memberStatusSelected
                                : styles.memberStatusPending,
                          ]}
                        >
                          <Text
                            style={[
                              styles.memberStatusText,
                              isPaid
                                ? styles.memberStatusTextPaid
                                : isSelected
                                  ? styles.memberStatusTextSelected
                                  : styles.memberStatusTextPending,
                            ]}
                          >
                            {isPaid ? 'Paid' : isSelected ? 'Selected' : 'Pending'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}
            </View>
          ) : (
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Expense name</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                placeholder="e.g. Grocery, Decoration, Tent house, Catering..."
                placeholderTextColor={colors.textMuted}
                value={title}
                onChangeText={setTitle}
              />
            </View>
          )}

          {type === 'expense' && (
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Bill / Receipt photo (optional)</Text>
              <ImageUploader
                currentImageUrl={imageUrl}
                onImageUploaded={(url) => setImageUrl(url)}
                onImageRemoved={() => setImageUrl(null)}
                subfolder="expense_receipts"
                placeholder="Upload bill / receipt photo"
                compact={true}
              />
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Notes (optional)</Text>
            <TextInput
              style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder={type === 'income' ? 'Receipt reference or collection note' : 'Vendor note or context'}
              placeholderTextColor={colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
            />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.card, gap: 12 }]}>
        <TouchableOpacity
          onPress={handleSave}
          disabled={isLoading || isDeleting}
          activeOpacity={0.85}
          style={[styles.saveButton, { backgroundColor: type === 'income' ? colors.primary : colors.accent }]}
        >
          {isLoading ? (
            <ActivityIndicator color={Verandah.primaryFg} />
          ) : (
            <Text style={styles.saveButtonText}>
              {transaction_id
                ? type === 'income' ? 'Update Contribution' : 'Update Expense'
                : type === 'income' ? 'Save Contribution' : 'Save Expense'}
            </Text>
          )}
        </TouchableOpacity>

        {transaction_id && (
          <TouchableOpacity
            onPress={handleDelete}
            disabled={isLoading || isDeleting}
            activeOpacity={0.85}
            style={[styles.deleteButton, { borderColor: colors.accent, borderWidth: 1 }]}
          >
            {isDeleting ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={[styles.deleteButtonText, { color: colors.accent }]}>
                {type === 'income' ? 'Delete Contribution' : 'Delete Expense'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={showBlockPrompt} transparent animationType="slide" onRequestClose={() => setShowBlockPrompt(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Set your block to continue</Text>
            {fund?.community_id ? (
              <BlockPicker
                value={selectedMyBlock}
                onChange={setSelectedMyBlock}
                communityId={fund.community_id}
                hideAllResidents={true}
              />
            ) : null}
            <TouchableOpacity
              style={[
                styles.modalPrimary,
                { backgroundColor: selectedMyBlock ? colors.primary : colors.surface2 },
              ]}
              disabled={!selectedMyBlock}
              onPress={async () => {
                if (!selectedMyBlock) {
                  Toast.show({
                    type: 'error',
                    text1: 'Select a block',
                    text2: 'Choose your block to continue.',
                  });
                  return;
                }

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
    padding: 16,
    paddingTop: Platform.OS === 'web' ? 16 : VerandahLayout.screenPaddingTop,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Verandah.cardMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: Verandah.textPrimary,
    lineHeight: 24,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 16,
  },
  form: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  notice: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginLeft: 2,
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    marginBottom: 10,
    borderWidth: 1,
  },
  tab: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabActiveIncome: {
    backgroundColor: Verandah.accentSoft,
  },
  tabActiveExpense: {
    backgroundColor: Verandah.dangerSoft,
  },
  noticeIcon: {
    fontSize: 15,
    lineHeight: 16,
  },
  tabText: {
    fontWeight: '600',
    fontSize: 13,
  },
  input: {
    height: 40,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '500',
  },
  textArea: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 14,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 5,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '600',
  },
  memberMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '400',
  },
  memberStatus: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: VerandahRadius.pill,
  },
  memberStatusPending: {
    backgroundColor: Verandah.cardMuted,
  },
  memberStatusSelected: {
    backgroundColor: Verandah.primary + '1A',
  },
  memberStatusPaid: {
    backgroundColor: Verandah.accentSoft,
  },
  memberStatusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  memberStatusTextPending: {
    color: Verandah.textSecondary,
  },
  memberStatusTextSelected: {
    color: Verandah.primary,
  },
  memberStatusTextPaid: {
    color: Verandah.accent,
  },
  footer: {
    padding: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
  },
  saveButton: {
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 0,
  },
  saveButtonText: {
    color: Verandah.primaryFg,
    fontSize: 15,
    fontWeight: '600',
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
    color: Verandah.primaryFg,
    fontSize: 14,
    fontWeight: '500',
  },
  deleteButton: {
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
