import { useLocalSearchParams, useRouter } from 'expo-router';
import { InfoCircle } from '@untitledui/icons/InfoCircle';
import { Lock01 } from '@untitledui/icons/Lock01';
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
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { Tables } from '../../lib/database.types';
import { SUGGESTED_PURPOSE_LABELS } from '../../lib/fundLedger';
import { goBackSmart, replaceTracked } from '../../lib/navigation';
import {
    MAX_CONTRIBUTOR_FLAT_LABEL_LENGTH,
    MAX_CONTRIBUTOR_PHONE_LENGTH,
    MAX_PURPOSE_LABEL_LENGTH,
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
  community: Pick<Tables<'communities'>, 'funds_enabled' | 'blocks_enabled' | 'block_label'> | null;
  fund_roles: Tables<'fund_roles'>[];
  event_transactions: Pick<Tables<'event_transactions'>, 'id' | 'contributor_user_id' | 'contributor_flat_id' | 'contributor_name' | 'type'>[];
};

type CollectionTarget = {
  flat_id: string;
  block_id: string | null;
  block_name: string | null;
  flat_number: string;
  floor_label: string | null;
  flat_label: string;
  resident_user_id: string | null;
  resident_name: string | null;
  occupant_name: string | null;
  resident_count: number;
  has_contributed: boolean;
  contributed_amount: number | null;
  contribution_id: string | null;
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
  const { user, profile, appRole, myBlockId, refreshSession } = useAuth();
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
  const [members, setMembers] = useState<CollectionTarget[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<CollectionTarget | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [contributorName, setContributorName] = useState('');
  const [existingTransaction, setExistingTransaction] = useState<any | null>(null);
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
  // Two ways to record money: a flat's share (picked off the collection grid)
  // or an ad-hoc contribution from someone who names what it was for. 'sponsor'
  // is still a reachable mode — rows written before the tabs merged open in it
  // for editing — but the form no longer offers it for a new entry.
  const [payerMode, setPayerMode] = useState<'member' | 'other' | 'sponsor'>('member');
  const [otherName, setOtherName] = useState('');
  const [otherFlatLabel, setOtherFlatLabel] = useState('');
  const [otherPhone, setOtherPhone] = useState('');
  const [purposeLabel, setPurposeLabel] = useState('');
  // Cash is the default because that is how a collector walking the block is
  // actually handed money. Applies to expenses too — see 20260919000000.
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'online'>('cash');
  const [sponsorName, setSponsorName] = useState('');
  const [sponsorPhone, setSponsorPhone] = useState('');
  const [sponsorNote, setSponsorNote] = useState('');

  useEffect(() => {
    const loadContext = async () => {
      try {
        setIsFetchingContext(true);
        const { data, error } = await supabase
          .from('events')
          .select('id, community_id, title, is_closed, community:communities!inner(funds_enabled, blocks_enabled, block_label)')
          .eq('id', event_id as string)
          .single();

        if (error) throw error;

        const [rolesResult, transactionsResult, contributorsResult, existingTxResult] = await Promise.all([
          supabase.from('fund_roles').select('*').eq('event_id', data.id),
          supabase.from('event_transactions').select('id, contributor_user_id, contributor_flat_id, contributor_name, type').eq('event_id', data.id),
          supabase.rpc('list_collection_targets_for_collector', { p_event_id: data.id }),
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

        const visibleMembers = (contributorsResult.data ?? []) as CollectionTarget[];
        setFund({
          ...data,
          community: (data as any).community ?? null,
          fund_roles: rolesResult.data ?? [],
          event_transactions: transactionsResult.data ?? [],
        });
        setMembers(visibleMembers);

        const existingTx = existingTxResult.data;
        setExistingTransaction(existingTx);
        if (existingTx) {
          setAmount(existingTx.amount.toString());
          setType(existingTx.type as 'income' | 'expense');
          if (existingTx.type === 'expense') {
            setTitle(existingTx.title || '');
          }
          const { url, cleanNotes } = extractImageUrl((existingTx as any).image_url, existingTx.description);
          setNotes(cleanNotes);
          setImageUrl(url);
          // Rows written before 20260919000000 have no method. Leave the
          // toggle on its default rather than asserting the row was cash —
          // saving the edit is what records the treasurer's actual answer.
          const existingMethod = ((existingTx as any).payment_method as string | null) ?? null;
          if (existingMethod === 'cash' || existingMethod === 'online') {
            setPaymentMethod(existingMethod);
          }
          if (existingTx.type === 'income') {
            const existingSponsorName = ((existingTx as any).sponsor_name as string | null) ?? null;
            const existingPurposeLabel = ((existingTx as any).purpose_label as string | null) ?? null;
            if (existingSponsorName) {
              setPayerMode('sponsor');
              setSponsorName(existingSponsorName);
              setSponsorPhone(((existingTx as any).sponsor_phone as string | null) ?? '');
              setSponsorNote(((existingTx as any).sponsor_note as string | null) ?? '');
              setSelectedTarget(null);
            } else if (existingPurposeLabel) {
              setPayerMode('other');
              setPurposeLabel(existingPurposeLabel);
              setOtherName(existingTx.contributor_name || '');
              setOtherFlatLabel(((existingTx as any).contributor_flat_label as string | null) ?? '');
              setOtherPhone(((existingTx as any).contributor_phone as string | null) ?? '');
              setSelectedTarget(null);
            } else {
              setPayerMode('member');
              const target = visibleMembers.find((m) => m.flat_id === existingTx.contributor_flat_id);
              if (target) {
                setSelectedTarget(target);
                if (target.block_id) {
                  setSelectedBlockId(target.block_id);
                }
              }
              setContributorName(existingTx.contributor_name || '');
            }
          }
        } else {
          const defaultTarget = visibleMembers.find((member) => !member.has_contributed);
          if (defaultTarget) {
            setSelectedTarget(defaultTarget);
            setContributorName(defaultTarget.resident_name ?? defaultTarget.occupant_name ?? '');
            if (defaultTarget.block_id) {
              setSelectedBlockId(defaultTarget.block_id);
            }
          }
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
  // Only the general contribution is one-per-flat. A flat with three offerings
  // against it has still not paid its share, and must stay selectable.
  const paidFlatIds = useMemo(
    () =>
      new Set(
        (fund?.event_transactions ?? [])
          .filter(
            (transaction) =>
              transaction.type === 'income' &&
              transaction.contributor_flat_id &&
              transaction.id !== transaction_id
          )
          .map((transaction) => transaction.contributor_flat_id as string)
      ),
    [fund?.event_transactions, transaction_id]
  );

  /**
   * Two ways to record money, and anyone who may add a contribution gets both.
   *
   * There is no third "Outside sponsor" tab: once Other contribution existed, a
   * collector wanting to log "Sharma Electricals — for the lighting" simply
   * typed it there, so the president-only rule on sponsor rows was guarding a
   * door with no wall beside it. The sponsor shape stays a legal payer shape —
   * existing rows still read as "Outside sponsor" and open here for editing —
   * it is just not something the form offers to create any more.
   */
  const payerModes: { key: 'member' | 'other'; label: string }[] = [
    { key: 'member', label: 'General contribution' },
    { key: 'other', label: 'Other contribution' },
  ];

  /** Empty means the form is self-explanatory and the notice card is skipped. */
  const noticeText = (() => {
    if (transaction_id) {
      return 'You are editing this transaction. You can modify the amount, title, and notes.';
    }
    if (type === 'expense') {
      return permissions.canAddExpense
        ? 'Add the expense name, amount, and optional note for transparent bookkeeping.'
        : 'Only treasurers can add expenses.';
    }
    if (!permissions.canAddContribution) {
      return 'Only collectors or treasurers can add contributions.';
    }
    if (payerMode === 'other') {
      return 'Money given for something specific — by a resident, or by a shop or business outside the society. Name who gave it and what it was for; no flat needs to be picked.';
    }
    return '';
  })();

  const blocks = useMemo(() => {
    const blockMap = new Map<string, string>();
    members.forEach((m) => {
      if (m.block_id && m.block_name) {
        blockMap.set(m.block_id, m.block_name);
      }
    });
    return Array.from(blockMap.entries()).map(([id, name]) => ({ id, name }));
  }, [members]);

  // Set default block when blocks load and none selected
  useEffect(() => {
    if (blocks.length > 0 && !selectedBlockId) {
      if (myBlockId) {
        const matchingBlock = blocks.find((b) => b.id === myBlockId);
        if (matchingBlock) {
          setSelectedBlockId(myBlockId);
          return;
        }
      }
      setSelectedBlockId(blocks[0].id);
    }
  }, [blocks, selectedBlockId, myBlockId]);

  const filteredTargets = useMemo(() => {
    return members.filter((m) => {
      if (selectedBlockId && m.block_id !== selectedBlockId) return false;
      if (searchMember.trim()) {
        const q = searchMember.trim().toLowerCase();
        return (
          m.flat_number.toLowerCase().includes(q) ||
          (m.resident_name || '').toLowerCase().includes(q) ||
          (m.occupant_name || '').toLowerCase().includes(q) ||
          (m.flat_label || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [members, selectedBlockId, searchMember]);

  const groupedByFloor = useMemo(() => {
    const groups = new Map<string, CollectionTarget[]>();
    filteredTargets.forEach((t) => {
      const floorKey = t.floor_label ? (t.floor_label.toUpperCase().startsWith('G') ? 'Ground Floor' : `Floor ${t.floor_label}`) : 'Units';
      if (!groups.has(floorKey)) {
        groups.set(floorKey, []);
      }
      groups.get(floorKey)!.push(t);
    });
    return Array.from(groups.entries());
  }, [filteredTargets]);

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
    setPaymentMethod('cash');
    setSelectedTarget(null);
    setContributorName('');

    if (nextType === 'expense') {
      setPayerMode('member');
      setSponsorName('');
      setSponsorPhone('');
      setSponsorNote('');
      setOtherName('');
      setOtherFlatLabel('');
      setPurposeLabel('');
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

    if (type === 'income' && payerMode === 'other') {
      if (!otherName.trim()) {
        Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Contributor name is required.' });
        return;
      }

      if (!purposeLabel.trim()) {
        Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Say what the contribution is for.' });
        return;
      }
    }

    if (type === 'income' && payerMode === 'member') {
      if (!selectedTarget) {
        Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Select a flat to mark as paid.' });
        return;
      }

      if (paidFlatIds.has(selectedTarget.flat_id)) {
        Toast.show({
          type: 'error',
          text1: 'Already paid',
          text2: 'This flat has already contributed. Record anything extra under Other contribution.',
        });
        return;
      }

      if (!contributorName.trim()) {
        Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Payer name is required.' });
        return;
      }
    }

    if (type === 'expense' && !title.trim()) {
      Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Expense name is required' });
      return;
    }

    setIsLoading(true);
    try {
      const isSponsorContribution = type === 'income' && payerMode === 'sponsor';
      const isOtherContribution = type === 'income' && payerMode === 'other';
      const payerName = isSponsorContribution
        ? sponsorName.trim()
        : isOtherContribution
          ? otherName.trim()
          : contributorName.trim();
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
              category: isSponsorContribution
                ? 'Sponsor contribution'
                : isOtherContribution
                  ? 'Other contribution'
                  : 'Contribution',
              // An other contribution marks no flat as paid, so it deliberately
              // carries no flat key — its flat, if given, is a free-text note.
              purpose_label: isOtherContribution ? purposeLabel.trim() : null,
              contributor_flat_label: isOtherContribution ? otherFlatLabel.trim() || null : null,
              contributor_phone: isOtherContribution ? otherPhone.trim() || null : null,
              contributor_user_id: isSponsorContribution || isOtherContribution ? null : selectedTarget?.resident_user_id,
              contributor_flat_id: isSponsorContribution || isOtherContribution ? null : selectedTarget?.flat_id,
              contributor_name: isSponsorContribution ? null : payerName,
              sponsor_name: isSponsorContribution ? sponsorName.trim() : null,
              sponsor_phone: isSponsorContribution ? sponsorPhone.trim() || null : null,
              sponsor_note: isSponsorContribution ? sponsorNote.trim() || null : null,
              payment_method: paymentMethod,
              // Self-recording: whoever is entering the row is who collected
              // it. Keeps the audit trail complete without another form field.
              collected_by_name: profile?.full_name?.trim() || null,
            }
          : {
              event_id: event_id as string,
              amount: amountValue,
              type,
              title: title.trim(),
              description: notesText || null,
              category: 'Expense',
              purpose_label: null,
              contributor_flat_label: null,
              contributor_phone: null,
              contributor_user_id: null,
              contributor_flat_id: null,
              contributor_name: null,
              sponsor_name: null,
              sponsor_phone: null,
              sponsor_note: null,
              payment_method: paymentMethod,
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
        text2: type === 'income'
          ? isOtherContribution
            ? `${payerName} · for ${purposeLabel.trim()}.`
            : `${payerName} status updated.`
          : 'The fund ledger was updated successfully.',
      });
      router.back();
    } catch (error: any) {
      let msg = error.message;
      if (error.code === '23505' || (error.message && error.message.includes('unique_income_contribution_per_flat'))) {
        // Only a flat's share can collide — other contributions carry no flat
        // key and sit outside both unique indexes.
        msg = 'This flat has already contributed. Record anything extra under Other contribution.';
      }
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: isMissingFundSchemaError(error) ? getMissingFundSchemaMessage() : msg,
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
        <Lock01 size={48} color={Verandah.caution} style={{ marginBottom: 16 }} />
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

          {/* Only shown when there is something worth saying. Recording a
              flat's share needs no explanation — the tab, the grid and the
              PAID badges already say it — and an empty notice box is worse
              than no notice box. */}
          {noticeText ? (
            <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <InfoCircle size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
              <Text style={[styles.noticeText, { color: colors.textMuted }]}>{noticeText}</Text>
            </View>
          ) : null}

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

          {/* Applies to contributions and expenses alike. */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Payment method</Text>
            <View style={[styles.tabContainer, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 0 }]}>
              {(['cash', 'online'] as const).map((method) => {
                const isActive = paymentMethod === method;
                return (
                  <TouchableOpacity
                    key={method}
                    style={[
                      styles.tab,
                      isActive ? (type === 'income' ? styles.tabActiveIncome : styles.tabActiveExpense) : {},
                    ]}
                    onPress={() => setPaymentMethod(method)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text style={[styles.tabText, { color: isActive ? colors.primary : colors.textMuted }]}>
                      {method === 'cash' ? 'Cash' : 'Online'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {type === 'income' ? (
            <View style={styles.inputGroup}>
              {/*
                A general contribution is the flat's share, picked off the grid
                and counted in the paid/unpaid roll. An other contribution is
                someone handing over money for something specific — it just
                needs a name, what it was for, and the amount.
              */}
              {!transaction_id ? (
                <View style={[styles.tabContainer, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 0 }]}>
                  {payerModes.map((mode) => {
                    const isSelected = payerMode === mode.key;
                    return (
                      <TouchableOpacity
                        key={mode.key}
                        style={[styles.tab, isSelected ? styles.tabActiveIncome : {}]}
                        onPress={() => setPayerMode(mode.key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Text
                          style={[styles.tabText, { color: isSelected ? colors.primary : colors.textMuted }]}
                          numberOfLines={1}
                        >
                          {mode.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}

              <Text style={[styles.label, { color: colors.text, marginTop: transaction_id ? 0 : 12 }]}>
                {payerMode === 'sponsor'
                  ? 'Sponsor name'
                  : payerMode === 'other'
                    ? 'Contributor name'
                    : 'Select resident flat'}
              </Text>

              {payerMode === 'other' ? (
                <>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="e.g. Ramesh Kumar, or Sharma Electricals"
                    placeholderTextColor={colors.textMuted}
                    value={otherName}
                    onChangeText={setOtherName}
                    maxLength={MAX_SPONSOR_NAME_LENGTH}
                  />

                  <Text style={[styles.label, { color: colors.text, marginTop: 12 }]}>Flat (optional)</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="e.g. A-207"
                    placeholderTextColor={colors.textMuted}
                    value={otherFlatLabel}
                    onChangeText={setOtherFlatLabel}
                    maxLength={MAX_CONTRIBUTOR_FLAT_LABEL_LENGTH}
                    autoCapitalize="characters"
                  />
                  <Text style={[styles.purposeHint, { color: colors.textMuted }]}>
                    Just a note of where the money came from. It does not mark that flat as having paid its share.
                  </Text>

                  {/* Kept from the old sponsor form: the number you need to
                      thank the shop that paid for the lighting, or ask them
                      again next year. Never shown on the contributions list. */}
                  <Text style={[styles.label, { color: colors.text, marginTop: 12 }]}>Phone (optional)</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="Contact number"
                    placeholderTextColor={colors.textMuted}
                    value={otherPhone}
                    onChangeText={setOtherPhone}
                    keyboardType="phone-pad"
                    maxLength={MAX_CONTRIBUTOR_PHONE_LENGTH}
                  />

                  <Text style={[styles.label, { color: colors.text, marginTop: 12 }]}>Contributing for</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="e.g. Food, God idol, Prasadam"
                    placeholderTextColor={colors.textMuted}
                    value={purposeLabel}
                    onChangeText={setPurposeLabel}
                    maxLength={MAX_PURPOSE_LABEL_LENGTH}
                  />
                  {/* Typing this at someone's door is the friction that stops
                      the entry being made at all. */}
                  <View style={styles.purposeChips}>
                    {SUGGESTED_PURPOSE_LABELS.map((suggestion) => (
                      <TouchableOpacity
                        key={suggestion}
                        style={[styles.purposeSuggestion, { borderColor: colors.border }]}
                        onPress={() => setPurposeLabel(suggestion)}
                        accessibilityRole="button"
                        accessibilityLabel={`Contributing for ${suggestion}`}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.purposeChipText, { color: colors.textMuted }]}>{suggestion}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : payerMode === 'sponsor' ? (
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
                  if (!existingTransaction) {
                    return <ActivityIndicator size="small" color={colors.primary} />;
                  }
                  const target = members.find((m) => m.flat_id === existingTransaction.contributor_flat_id);
                  const flatLabel = target ? target.flat_label : 'Flat not set';
                  return (
                    <>
                      <View style={[styles.memberRow, { backgroundColor: colors.card, borderColor: colors.border, opacity: 0.8 }]}>
                        <View style={styles.memberInfo}>
                          <Text style={[styles.memberName, { color: colors.text }]}>
                            {existingTransaction.contributor_name || 'Resident'}
                          </Text>
                          <Text style={[styles.memberMeta, { color: colors.textMuted }]}>
                            Flat {flatLabel}
                          </Text>
                        </View>
                        <View style={[styles.memberStatus, styles.memberStatusPaid]}>
                          <Text style={[styles.memberStatusText, styles.memberStatusTextPaid]}>PAID</Text>
                        </View>
                      </View>

                      <Text style={[styles.label, { color: colors.text, marginTop: 12 }]}>Payer name</Text>
                      <TextInput
                        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                        placeholder="Prefilled occupant name (editable)"
                        placeholderTextColor={colors.textMuted}
                        value={contributorName}
                        onChangeText={setContributorName}
                      />
                    </>
                  );
                })()
              ) : (
                <>
                  {/* Block Chips Selector */}
                  {blocks.length > 0 ? (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={[styles.label, { color: colors.text }]}>Choose block</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingVertical: 2 }}>
                        {blocks.map((b) => {
                          const isSelected = selectedBlockId === b.id;
                          return (
                            <TouchableOpacity
                              key={b.id}
                              style={{
                                borderColor: isSelected ? colors.primary : colors.border,
                                backgroundColor: isSelected ? colors.primary + '0c' : colors.card,
                                paddingHorizontal: 14,
                                paddingVertical: 8,
                                borderRadius: 9999,
                                borderWidth: isSelected ? 1.5 : 1,
                              }}
                              onPress={() => setSelectedBlockId(b.id)}
                              activeOpacity={0.8}
                            >
                              <Text style={{ color: isSelected ? colors.primary : colors.text, fontWeight: '600', fontSize: 12 }}>
                                {fund?.community?.block_label || 'Block'} {b.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  ) : null}

                  {/* Selected Target Banner */}
                  {selectedTarget && (
                    <View style={{ backgroundColor: colors.primary + '08', borderColor: colors.primary + '40', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 12, color: colors.textMuted }}>Selected Flat:</Text>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary, flex: 1 }}>
                          {selectedTarget.flat_label}
                        </Text>
                        <TouchableOpacity onPress={() => { setSelectedTarget(null); setContributorName(''); }} style={{ paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 12, color: colors.textMuted }}>Clear</Text>
                        </TouchableOpacity>
                      </View>
                      {selectedTarget.has_contributed ? (
                        <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
                          Already contributed ₹{Number(selectedTarget.contributed_amount ?? 0).toLocaleString('en-IN')}
                        </Text>
                      ) : null}
                    </View>
                  )}

                  {/* Search Input */}
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background, marginBottom: 8, height: 42, fontSize: 14 }]}
                    placeholder="Search by name or flat..."
                    placeholderTextColor={colors.textMuted}
                    value={searchMember}
                    onChangeText={setSearchMember}
                  />

                  {/* Flat grid grouped by floor */}
                  {groupedByFloor.length === 0 ? (
                    <View style={{ padding: 16, borderWidth: 0.5, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', marginBottom: 12 }}>
                      <Text style={{ color: colors.textMuted, fontSize: 13 }}>No matching flats found.</Text>
                    </View>
                  ) : (
                    <ScrollView style={{ maxHeight: 240, marginBottom: 12 }} nestedScrollEnabled={true}>
                      {groupedByFloor.map(([floorTitle, floorTargets]) => (
                        <View key={floorTitle} style={{ marginBottom: 12 }}>
                          <Text style={{ fontSize: 11, color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>{floorTitle}</Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {floorTargets.map((target) => {
                              const isPaid = target.has_contributed;
                              const isSelected = selectedTarget?.flat_id === target.flat_id;
                              return (
                                <TouchableOpacity
                                  key={target.flat_id}
                                  style={{
                                    borderColor: isSelected ? colors.primary : colors.border,
                                    backgroundColor: isSelected ? colors.primary + '08' : colors.card,
                                    opacity: isPaid ? 0.55 : 1,
                                    borderWidth: isSelected ? 1.5 : 1,
                                    paddingVertical: 8,
                                    paddingHorizontal: 12,
                                    borderRadius: 8,
                                    minWidth: 64,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                  onPress={() => {
                                    if (isPaid) {
                                      Toast.show({
                                        type: 'error',
                                        text1: 'Already paid',
                                        text2: 'This flat has already contributed. Record anything extra under Other contribution.',
                                      });
                                      return;
                                    }
                                    setSelectedTarget(target);
                                    setContributorName(target.resident_name ?? target.occupant_name ?? '');
                                  }}
                                  activeOpacity={0.8}
                                >
                                  <Text style={{ color: isSelected ? colors.primary : colors.text, fontWeight: '700', fontSize: 13 }}>
                                    {target.flat_number}
                                  </Text>
                                  {(target.resident_name || target.occupant_name) ? (
                                    <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 2, textAlign: 'center' }} numberOfLines={1}>
                                      {target.resident_name ?? target.occupant_name}
                                    </Text>
                                  ) : null}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  )}

                  {/* Payer name input - always visible and editable */}
                  <Text style={[styles.label, { color: colors.text, marginTop: 4 }]}>Payer name</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="Prefilled occupant name (editable)"
                    placeholderTextColor={colors.textMuted}
                    value={contributorName}
                    onChangeText={setContributorName}
                  />
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
  purposeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 2,
  },
  purposeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
  },
  purposeSuggestion: {
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  purposeChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  purposeHint: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 6,
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
