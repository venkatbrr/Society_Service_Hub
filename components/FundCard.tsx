import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
      style={[styles.card, { backgroundColor: colors.card, shadowColor: '#000' }]} 
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={styles.header}>
        <View style={styles.titleArea}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {fund.title}
          </Text>
          <Text style={[styles.date, { color: colors.textMuted }]}>Created {createdLabel}</Text>
        </View>
        <View style={[styles.rolePill, { backgroundColor: colors.surface2 }]}>
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
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Spent</Text>
          <Text style={[styles.statValue, { color: '#F43F5E' }]}>Rs {totals.expense.toLocaleString()}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Balance</Text>
          <Text style={[styles.statValue, { color: colors.primary }]}>Rs {totals.balance.toLocaleString()}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.textMuted }]}>Open fund details</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.border} />
      </View>
    </TouchableOpacity>
  );
};


const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    elevation: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
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
  date: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  rolePill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    backgroundColor: '#F3F4F6',
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
