import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
import { Tables } from '../lib/database.types';
import { Rupees } from './Rupees';

type TransactionItemProps = {
  transaction: Tables<'event_transactions'>;
};

export const TransactionItem = ({ transaction }: TransactionItemProps) => {
  const isIncome = transaction.type === 'income';

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
    <View style={styles.container}>
      <View style={[styles.iconWrapper, { backgroundColor: isIncome ? Verandah.accentSoft : Verandah.cautionSoft }]}>
        <Ionicons 
          name={isIncome ? 'arrow-down' : 'arrow-up'} 
          size={18} 
          color={isIncome ? Verandah.accent : Verandah.caution} 
        />
      </View>
      
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.category} numberOfLines={1}>{transaction.category}</Text>
          <Rupees amount={transaction.amount} size="sm" tone={isIncome ? 'in' : 'out'} />
        </View>
        
        <View style={styles.bottomRow}>
          <Text style={styles.description} numberOfLines={1}>
            {transaction.description || 'General entry'}
          </Text>
          <Text style={styles.date}>{formatDate(transaction.created_at)}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: VerandahSpace.sm + 2,
    borderBottomWidth: 0.5,
    borderBottomColor: Verandah.border,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: VerandahSpace.md,
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
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
    flex: 1,
    marginRight: VerandahSpace.sm,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  description: {
    ...VerandahType.caption,
    color: Verandah.textTertiary,
    flex: 1,
    marginRight: VerandahSpace.sm,
  },
  date: {
    ...VerandahType.caption,
    fontWeight: '500',
    color: Verandah.textMuted,
  },
});
