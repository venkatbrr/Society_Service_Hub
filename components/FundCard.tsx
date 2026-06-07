import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
import { APP_EMOJIS } from '../constants/emojis';
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
    <BaseCard padding={16} onPress={onPress}>
      <View style={styles.header}>
        <View style={styles.titleArea}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.title} numberOfLines={1}>
              {fund.title}
            </Text>
            {fund.is_closed && (
              <View style={{ backgroundColor: Verandah.cardMuted, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ fontSize: 10, color: Verandah.textSecondary, fontWeight: 'bold', textTransform: 'uppercase' }}>Closed</Text>
              </View>
            )}
          </View>
          <Text style={styles.date}>Created {createdLabel}</Text>
        </View>
        <View style={styles.rolePill}>
          <Text style={styles.roleText}>{formatRole(currentRole)}</Text>
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
        <Text style={styles.footerIcon}>{APP_EMOJIS.chevronRight}</Text>
      </View>
    </BaseCard>
  );
};


const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: VerandahSpace.lg,
  },
  titleArea: {
    flex: 1,
    marginRight: VerandahSpace.md,
  },
  title: {
    ...VerandahType.title,
    color: Verandah.textPrimary,
  },
  date: {
    ...VerandahType.caption,
    color: Verandah.textTertiary,
    marginTop: VerandahSpace.xs,
  },
  rolePill: {
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: VerandahSpace.md,
    paddingVertical: VerandahSpace.xs + 2,
    backgroundColor: Verandah.cardMuted,
  },
  roleText: {
    ...VerandahType.micro,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: VerandahSpace.lg,
    marginBottom: VerandahSpace.lg,
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    ...VerandahType.sectionLabel,
    fontSize: 10,
    color: Verandah.textTertiary,
    marginBottom: VerandahSpace.xs,
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
    paddingTop: VerandahSpace.md,
  },
  footerText: {
    ...VerandahType.caption,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  footerIcon: {
    fontSize: 16,
    lineHeight: 18,
    color: Verandah.textTertiary,
  },
});
