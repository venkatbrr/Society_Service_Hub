import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { Tables } from '../lib/database.types';

type TransactionItemProps = {
  transaction: Tables<'event_transactions'>;
};

export const TransactionItem = ({ transaction }: TransactionItemProps) => {
  const isIncome = transaction.type === 'income';
  const colors = Colors.light;

  const formatDate = (dateString: string | null) => {
    if (!dateString) {
      return 'Today';
    }

    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={[styles.iconWrapper, { backgroundColor: isIncome ? colors.secondary + '18' : colors.accent + '18', borderColor: isIncome ? colors.secondary + '35' : colors.accent + '35' }]}>
        <Ionicons 
          name={isIncome ? 'chevron-down-circle' : 'chevron-up-circle'} 
          size={24} 
          color={isIncome ? colors.secondary : colors.accent} 
        />
      </View>
      
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={[styles.category, { color: colors.text }]}>{transaction.category}</Text>
          <Text style={[styles.amount, { color: isIncome ? colors.secondary : colors.accent }]}>
            {isIncome ? '+' : '-'} ₹{transaction.amount.toLocaleString()}
          </Text>
        </View>
        
        <View style={styles.bottomRow}>
          <Text style={[styles.description, { color: colors.textMuted }]} numberOfLines={1}>
            {transaction.description || 'General entry'}
          </Text>
          <Text style={[styles.date, { color: colors.textMuted }]}>{formatDate(transaction.created_at)}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  category: {
    fontSize: 15,
    fontWeight: '700',
  },
  amount: {
    fontSize: 15,
    fontWeight: '800',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  description: {
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },
  date: {
    fontSize: 11,
    fontWeight: '600',
  },
});
