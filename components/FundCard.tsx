import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { Tables } from '../lib/database.types';
import { FundAccessRole, formatRole } from '../lib/fundRoles';

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
  const colors = Colors.light;
  const createdLabel = new Date(fund.created_at).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder, shadowColor: colors.primary }]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={styles.header}>
        <View style={styles.titleArea}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {fund.title}
          </Text>
          <View style={[styles.dateBadge, { backgroundColor: colors.primary + '12' }]}>
            <Text style={[styles.date, { color: colors.primary }]}>Created {createdLabel}</Text>
          </View>
        </View>
        <View style={[styles.rolePill, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <Text style={[styles.roleText, { color: colors.primary }]}>You: {formatRole(currentRole)}</Text>
        </View>
      </View>

      <View style={[styles.metaCard, { backgroundColor: colors.surface2 }]}>
        <View style={styles.metaRow}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Treasurers</Text>
          <Text style={[styles.metaValue, { color: colors.text }]} numberOfLines={1}>
            {treasurerNames.length > 0 ? treasurerNames.join(', ') : 'Not assigned'}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Collectors</Text>
          <Text style={[styles.metaValue, { color: colors.text }]}>{collectorCount}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Collected</Text>
          <Text style={[styles.statValue, { color: '#10B981' }]}>Rs {totals.income.toLocaleString()}</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Spent</Text>
          <Text style={[styles.statValue, { color: '#FF6B6B' }]}>Rs {totals.expense.toLocaleString()}</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Balance</Text>
          <Text style={[styles.statValue, { color: '#6C63FF' }]}>Rs {totals.balance.toLocaleString()}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.textMuted }]}>Open fund details</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.icon} />
      </View>
    </TouchableOpacity>
  );
};


const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    elevation: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  titleArea: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  dateBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
  },
  date: {
    fontSize: 12,
    fontWeight: '600',
  },
  rolePill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metaCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    gap: 10,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  metaValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  statDivider: {
    width: 1,
    height: '70%',
    alignSelf: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
