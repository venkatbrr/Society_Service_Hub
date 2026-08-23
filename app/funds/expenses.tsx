import { MinusCircle } from '@untitledui/icons/MinusCircle';
import { Paperclip } from '@untitledui/icons/Paperclip';
import { XClose } from '@untitledui/icons/XClose';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { HeaderBackButton } from '../../components/HeaderBackButton';
import { Rupees } from '../../components/Rupees';
import { useFundLedger } from '../../components/useFundLedger';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout } from '../../constants/Verandah';
import { cloudinaryUrl } from '../../lib/cloudinary';
import { Tables } from '../../lib/database.types';
import {
    METHOD_FILTERS,
    MethodFilter,
    countByMethod,
    formatPaymentMethod,
    getCreatedAtTime,
    matchesMethod,
    paymentMethodOf,
} from '../../lib/fundLedger';
import { goBackSmart } from '../../lib/navigation';

/** Receipts were stored inline in the description before `image_url` existed. */
const receiptUrlOf = (transaction: Tables<'event_transactions'>) =>
  ((transaction as any).image_url || null) ||
  (() => {
    const description = transaction.description || '';
    const match =
      description.match(/\[Receipt:\s*(https?:\/\/[^\]]+)\]/i) ||
      description.match(/(https:\/\/res\.cloudinary\.com\/[^\s]+)/i);
    return match ? match[1] : null;
  })();

const cleanDescriptionOf = (transaction: Tables<'event_transactions'>) =>
  (transaction.description || '').replace(/\[Receipt:\s*https?:\/\/[^\]]+\]/gi, '').trim();

export default function FundExpensesScreen() {
  const { event_id } = useLocalSearchParams();
  const eventId = event_id as string | undefined;
  const router = useRouter();
  const backRoute = `/funds/expenses?event_id=${eventId ?? ''}`;
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
  const [selectedExpense, setSelectedExpense] = useState<Tables<'event_transactions'> | null>(null);
  const { fund, expenses, loading } = useFundLedger(eventId, backRoute);

  if (loading || !fund) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Verandah.primary} />
      </View>
    );
  }

  const visible = expenses
    .filter((t) => matchesMethod(t, methodFilter))
    .sort((a, b) => getCreatedAtTime(b.created_at) - getCreatedAtTime(a.created_at));
  const counts = countByMethod(expenses);
  const isFiltered = methodFilter !== 'all';
  const filterLabel = METHOD_FILTERS.find((f) => f.key === methodFilter)?.label ?? 'All';
  const visibleTotal = visible.reduce((sum, t) => sum + Number(t.amount), 0);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <HeaderBackButton onPress={() => goBackSmart(router, backRoute)} color={Verandah.primary} style={styles.iconButton} />
            <View style={{ flex: 1 }}>
              <Text style={styles.screenTitle}>Expenses</Text>
              <Text style={styles.headerLabel}>{fund.title}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.filterRow}>
            {METHOD_FILTERS.map((filter) => {
              const isActive = methodFilter === filter.key;
              return (
                <TouchableOpacity
                  key={filter.key}
                  style={[styles.filterChip, isActive ? styles.filterChipActive : null]}
                  onPress={() => setMethodFilter(filter.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}>
                    {filter.label} {counts[filter.key]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.tally}>
            <Text style={styles.tallyText}>
              {isFiltered ? `${visible.length} of ${expenses.length} shown` : `${expenses.length} entries`}
            </Text>
            <Rupees amount={visibleTotal} size="sm" tone="out" />
          </View>

          {visible.map((transaction) => {
            const receiptUrl = receiptUrlOf(transaction);
            const description = cleanDescriptionOf(transaction);
            const meta = [
              description || null,
              formatPaymentMethod(paymentMethodOf(transaction)) ?? 'Not recorded',
              new Date(transaction.created_at ?? Date.now()).toLocaleDateString(),
            ].filter(Boolean).join(' · ');

            return (
              <TouchableOpacity
                key={transaction.id}
                style={styles.transactionRow}
                onPress={() => setSelectedExpense(transaction)}
                activeOpacity={0.75}
              >
                <View style={styles.avatar}>
                  <MinusCircle size={16} color={Verandah.danger} />
                </View>
                <View style={styles.transMain}>
                  <View style={styles.nameRow}>
                    <Text style={styles.transName}>{transaction.title || 'Expense'}</Text>
                    {receiptUrl ? <Paperclip size={14} color={Verandah.primary} /> : null}
                  </View>
                  <Text style={styles.transDate}>{meta}</Text>
                </View>
                <Rupees amount={Number(transaction.amount)} size="sm" tone="out" />
              </TouchableOpacity>
            );
          })}

          {visible.length === 0 ? (
            <Text style={styles.emptyNote}>
              {isFiltered ? `No ${filterLabel.toLowerCase()} expenses.` : 'No expenses logged yet.'}
            </Text>
          ) : null}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <Modal visible={!!selectedExpense} transparent animationType="slide" onRequestClose={() => setSelectedExpense(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {selectedExpense ? (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Expense Details</Text>
                  <TouchableOpacity onPress={() => setSelectedExpense(null)} style={{ padding: 4 }}>
                    <XClose size={22} color={Verandah.textSecondary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalBody}>
                  <Text style={styles.modalLabel}>Expense Name</Text>
                  <Text style={styles.modalValue}>{selectedExpense.title || 'Expense'}</Text>

                  <Text style={styles.modalLabel}>Amount Spent</Text>
                  <Rupees amount={Number(selectedExpense.amount)} size="md" tone="out" />

                  <Text style={[styles.modalLabel, { marginTop: 10 }]}>Payment method</Text>
                  <Text style={styles.modalValueSmall}>
                    {formatPaymentMethod(paymentMethodOf(selectedExpense)) ?? 'Not recorded'}
                  </Text>

                  {cleanDescriptionOf(selectedExpense) ? (
                    <>
                      <Text style={[styles.modalLabel, { marginTop: 10 }]}>Notes</Text>
                      <Text style={styles.modalValueSmall}>{cleanDescriptionOf(selectedExpense)}</Text>
                    </>
                  ) : null}

                  <Text style={[styles.modalLabel, { marginTop: 10 }]}>Logged on</Text>
                  <Text style={styles.modalValueSmall}>
                    {new Date(selectedExpense.created_at ?? Date.now()).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </Text>
                </View>

                {receiptUrlOf(selectedExpense) ? (
                  <Image
                    source={{ uri: cloudinaryUrl(receiptUrlOf(selectedExpense) as string, { width: 600 }) }}
                    style={styles.receipt}
                    contentFit="cover"
                    contentPosition="top"
                  />
                ) : null}
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Verandah.surface },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Verandah.surface },
  header: { paddingTop: VerandahLayout.screenPaddingTop, paddingBottom: 12, paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Verandah.cardMuted,
    justifyContent: 'center', alignItems: 'center',
  },
  screenTitle: { fontSize: 20, fontWeight: '600', color: Verandah.textPrimary, lineHeight: 24 },
  headerLabel: {
    color: Verandah.textSecondary, fontSize: 11, fontWeight: '500',
    textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 1,
  },
  section: { paddingHorizontal: 16 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  filterChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    borderWidth: 1, borderColor: Verandah.border, backgroundColor: Verandah.card,
  },
  filterChipActive: { backgroundColor: Verandah.accentSoft, borderColor: Verandah.accent },
  filterChipText: { fontSize: 12, fontWeight: '500', color: Verandah.textSecondary },
  filterChipTextActive: { color: Verandah.accent, fontWeight: '600' },
  tally: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 6, paddingHorizontal: 2,
  },
  tallyText: { fontSize: 12, color: Verandah.textSecondary },
  transactionRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 5,
    backgroundColor: Verandah.card, padding: 6, paddingHorizontal: 10,
    borderRadius: 12, borderWidth: 1, borderColor: Verandah.border,
  },
  avatar: {
    width: 32, height: 32, borderRadius: 10, justifyContent: 'center',
    alignItems: 'center', marginRight: 10, backgroundColor: Verandah.dangerSoft,
  },
  transMain: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  transName: { fontSize: 14, fontWeight: '600', color: Verandah.textPrimary },
  transDate: { fontSize: 11, marginTop: 1, color: Verandah.textSecondary },
  emptyNote: { fontSize: 13, fontStyle: 'italic', color: Verandah.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: Verandah.borderStrong, justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Verandah.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, gap: 12,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '600', color: Verandah.textPrimary },
  modalBody: {
    backgroundColor: Verandah.card, padding: 14, borderRadius: 14,
    borderWidth: 1, borderColor: Verandah.border,
  },
  modalLabel: {
    fontSize: 12, color: Verandah.textSecondary, textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 2,
  },
  modalValue: { fontSize: 17, fontWeight: '600', color: Verandah.textPrimary, marginBottom: 12 },
  modalValueSmall: { fontSize: 14, color: Verandah.textPrimary },
  receipt: { width: '100%', height: 220, borderRadius: 14 },
});
