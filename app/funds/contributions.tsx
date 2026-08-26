import { Pencil01 } from '@untitledui/icons/Pencil01';
import { PlusCircle } from '@untitledui/icons/PlusCircle';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { HeaderBackButton } from '../../components/HeaderBackButton';
import { Rupees } from '../../components/Rupees';
import { useFundLedger } from '../../components/useFundLedger';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout } from '../../constants/Verandah';
import { Tables } from '../../lib/database.types';
import {
    GENERAL_PURPOSE_LABEL,
    METHOD_FILTERS,
    MethodFilter,
    PurposeFilter,
    collectedByOf,
    contributorFlatIdOf,
    contributorFlatLabelOf,
    isGeneralContribution,
    countByMethod,
    formatCollectedBy,
    formatPaymentMethod,
    groupContributionsByBlock,
    matchesMethod,
    matchesPurpose,
    paymentMethodOf,
    purposeBucketKeyOf,
    purposeLabelOf,
    sponsorNameOf,
} from '../../lib/fundLedger';
import { goBackSmart } from '../../lib/navigation';

export default function FundContributionsScreen() {
  const { event_id } = useLocalSearchParams();
  const eventId = event_id as string | undefined;
  const router = useRouter();
  const backRoute = `/funds/contributions?event_id=${eventId ?? ''}`;
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
  const [purposeFilter, setPurposeFilter] = useState<PurposeFilter>('all');
  const {
    fund, income, flats, flatMeta, flatLabels,
    profileNames, profileFlats, permissions, loading,
  } = useFundLedger(eventId, backRoute);

  if (loading || !fund) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Verandah.primary} />
      </View>
    );
  }

  const visible = income.filter((t) => matchesMethod(t, methodFilter) && matchesPurpose(t, purposeFilter));
  const groups = groupContributionsByBlock(visible, flatMeta);
  const showGroupHeaders = groups.some((g) => g.isBlock);
  const counts = countByMethod(income);
  const isFiltered = methodFilter !== 'all' || purposeFilter !== 'all';
  const filterLabel = METHOD_FILTERS.find((f) => f.key === methodFilter)?.label ?? 'All';
  const visibleTotal = visible.reduce((sum, t) => sum + Number(t.amount), 0);

  /**
   * A chip per bucket the fund actually holds money in: the general
   * contribution first, then each free-text purpose. Derived from the rows
   * rather than a catalog, so the chips are exactly what was collected.
   */
  const purposeBuckets = income.reduce((acc, t) => {
    const key = purposeBucketKeyOf(t);
    const entry = acc.get(key);
    if (entry) entry.count += 1;
    else acc.set(key, { label: purposeLabelOf(t) ?? GENERAL_PURPOSE_LABEL, count: 1 });
    return acc;
  }, new Map<string, { label: string; count: number }>());
  const generalBucket = purposeBuckets.get('general');
  const purposeFilters: { key: PurposeFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: income.length },
    ...(generalBucket ? [{ key: 'general' as PurposeFilter, ...generalBucket }] : []),
    ...Array.from(purposeBuckets.entries())
      .filter(([key]) => key !== 'general')
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([key, bucket]) => ({ key: key as PurposeFilter, label: bucket.label, count: bucket.count })),
  ];
  // One bucket is not a choice — the chips only earn their row once the fund
  // is actually collecting for more than one thing.
  const showPurposeFilters = purposeFilters.length > 2;
  const flatsWithGeneral = new Set(
    income
      .filter((t) => isGeneralContribution(t) && contributorFlatIdOf(t))
      .map((t) => contributorFlatIdOf(t) as string)
  ).size;

  const renderRow = (transaction: Tables<'event_transactions'>) => {
    const sponsorName = sponsorNameOf(transaction);
    const canEditRow = sponsorName ? permissions.canManageTreasurers : permissions.canAddContribution;
    const flatId = contributorFlatIdOf(transaction);
    // An other contribution carries a free-text flat, if the collector noted
    // one at all — it never resolves against the flat inventory.
    const flatLabel = flatId
      ? flatLabels.get(flatId)
      : transaction.contributor_user_id
        ? profileFlats.get(transaction.contributor_user_id)
        : contributorFlatLabelOf(transaction);

    const purposeLabel = purposeLabelOf(transaction);

    const meta = [
      sponsorName ? 'Outside sponsor' : flatLabel ? `Flat ${flatLabel}` : null,
      // Only other contributions say what they were for; a flat's share is the
      // default and naming it on every row would be noise.
      purposeLabel ? `For ${purposeLabel}` : null,
      formatPaymentMethod(paymentMethodOf(transaction)) ?? 'Not recorded',
      formatCollectedBy(collectedByOf(transaction)),
      new Date(transaction.created_at ?? Date.now()).toLocaleDateString(),
    ].filter(Boolean).join(' · ');

    const content = (
      <>
        <View style={styles.avatar}>
          <PlusCircle size={16} color={Verandah.accent} />
        </View>
        <View style={styles.transMain}>
          <View style={styles.nameRow}>
            <Text style={styles.transName}>
              {sponsorName ??
                ((transaction as any).contributor_name ??
                  (transaction.contributor_user_id
                    ? profileNames.get(transaction.contributor_user_id) ?? 'Resident'
                    : transaction.title || 'Contribution'))}
            </Text>
            {canEditRow ? <Pencil01 size={13} color={Verandah.textSecondary} /> : null}
          </View>
          <Text style={styles.transDate}>{meta}</Text>
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
          {content}
        </TouchableOpacity>
      );
    }
    return <View key={transaction.id} style={styles.transactionRow}>{content}</View>;
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <HeaderBackButton onPress={() => goBackSmart(router, backRoute)} color={Verandah.primary} style={styles.iconButton} />
            <View style={{ flex: 1 }}>
              <Text style={styles.screenTitle}>Contributions</Text>
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

          {showPurposeFilters ? (
            <View style={styles.filterRow}>
              {purposeFilters.map((filter) => {
                const isActive = purposeFilter === filter.key;
                return (
                  <TouchableOpacity
                    key={String(filter.key)}
                    style={[styles.filterChip, isActive ? styles.filterChipActive : null]}
                    onPress={() => setPurposeFilter(filter.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}>
                      {filter.label} {filter.count}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          <View style={styles.tally}>
            <Text style={styles.tallyText}>
              {isFiltered
                ? `${visible.length} of ${income.length} shown`
                : `${flatsWithGeneral} of ${flats.length} flats collected`}
            </Text>
            <Rupees amount={visibleTotal} size="sm" tone="in" />
          </View>

          {groups.map((group) => (
            <View key={group.key}>
              {showGroupHeaders ? (
                <View style={styles.groupHeader}>
                  <Text style={styles.groupTitle}>{group.title}</Text>
                  <View style={styles.groupHeaderMeta}>
                    {/* Entries, not flats: one flat can now hold its general
                        contribution plus any number of offerings. */}
                    <Text style={styles.groupMeta}>
                      {group.rows.length} {group.rows.length === 1 ? 'entry' : 'entries'}
                    </Text>
                    <Rupees amount={group.total} size="sm" tone="in" />
                  </View>
                </View>
              ) : null}
              {group.rows.map(renderRow)}
            </View>
          ))}

          {visible.length === 0 ? (
            <Text style={styles.emptyNote}>
              {purposeFilter !== 'all'
                ? 'No collections match these filters.'
                : isFiltered
                  ? `No ${filterLabel.toLowerCase()} collections.`
                  : 'No collections logged yet.'}
            </Text>
          ) : null}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Verandah.surface },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Verandah.surface },
  header: {
    paddingTop: VerandahLayout.screenPaddingTop,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
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
  groupHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 6, marginBottom: 6, paddingHorizontal: 2,
  },
  groupHeaderMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupTitle: { fontSize: 13, fontWeight: '600', letterSpacing: -0.2, color: Verandah.textPrimary },
  groupMeta: { fontSize: 11, color: Verandah.textSecondary },
  transactionRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 5,
    backgroundColor: Verandah.card, padding: 6, paddingHorizontal: 10,
    borderRadius: 12, borderWidth: 1, borderColor: Verandah.border,
  },
  avatar: {
    width: 32, height: 32, borderRadius: 10, justifyContent: 'center',
    alignItems: 'center', marginRight: 10, backgroundColor: Verandah.accentSoft,
  },
  transMain: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  transName: { fontSize: 14, fontWeight: '600', color: Verandah.textPrimary },
  transDate: { fontSize: 11, marginTop: 1, color: Verandah.textSecondary },
  emptyNote: { fontSize: 13, fontStyle: 'italic', color: Verandah.textSecondary },
});
