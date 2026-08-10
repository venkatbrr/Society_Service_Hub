import { ChevronRight } from '@untitledui/icons/ChevronRight';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
import { Tables } from '../lib/database.types';
import { FundAccessRole, formatRole } from '../lib/fundRoles';
import { BaseCard } from './BaseCard';
import { Rupees } from './Rupees';

type FundCardProps = {
  fund: Tables<'events'>;
  totals: {
    income: number;
    expense: number;
    balance: number;
  };
  currentRole: FundAccessRole;
  treasurerNames: string[];
  collectorCount: number;
  onPress: () => void;
};

export const FundCard = ({ fund, totals, currentRole, treasurerNames, collectorCount, onPress }: FundCardProps) => {
  const createdLabel = new Date(fund.created_at ?? Date.now()).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <BaseCard padding={12} onPress={onPress}>
      <View style={styles.header}>
        <View style={styles.titleArea}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.title} numberOfLines={1}>
              {fund.title}
            </Text>
            {fund.is_closed ? (
              <View style={{ backgroundColor: Verandah.cardMuted, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ fontSize: 10, color: Verandah.textSecondary, fontWeight: 'bold', textTransform: 'uppercase' }}>Closed</Text>
              </View>
            ) : (
              <View style={{ backgroundColor: Verandah.accentSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ fontSize: 10, color: Verandah.accent, fontWeight: 'bold', textTransform: 'uppercase' }}>Active</Text>
              </View>
            )}
          </View>
          <Text style={styles.date}>Created {createdLabel}{treasurerNames.length > 0 ? ` · Treasurer: ${treasurerNames[0]}` : ''}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Collected</Text>
          <Rupees amount={totals.income} size="sm" tone="in" />
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Spent</Text>
          <Rupees amount={totals.expense} size="sm" tone="out" />
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Balance</Text>
          <Rupees amount={totals.balance} size="sm" tone="in" />
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Open fund details</Text>
        <ChevronRight size={14} color={Verandah.textTertiary} aria-hidden={true} />
      </View>
    </BaseCard>
  );
};


const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  titleArea: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  date: {
    fontSize: 11,
    color: Verandah.textTertiary,
    marginTop: 2,
  },
  rolePill: {
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Verandah.cardMuted,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: Verandah.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statDivider: {
    width: 0.5,
    backgroundColor: Verandah.border,
    alignSelf: 'stretch',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: Verandah.border,
    paddingTop: 6,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  footerIcon: {
    fontSize: 14,
    lineHeight: 16,
    color: Verandah.textTertiary,
  },
});
