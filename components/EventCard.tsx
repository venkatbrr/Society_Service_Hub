import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { Tables } from '../lib/database.types';

type EventCardProps = {
  event: Tables<'events'>;
  totals: {
    income: number;
    expense: number;
    balance: number;
  };
  onPress: () => void;
};

export const EventCard = ({ event, totals, onPress }: EventCardProps) => {
  const colors = Colors.light;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return {
      day: date.getDate(),
      month: date.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase(),
      year: date.getFullYear()
    };
  };

  const formattedDate = formatDate(event.event_date);

  return (
    <TouchableOpacity 
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} 
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.cardContent}>
        <View style={[styles.dateBlock, { backgroundColor: colors.surface2 }]}>
          <Text style={[styles.dateDay, { color: colors.primary }]}>{formattedDate.day}</Text>
          <Text style={[styles.dateMonth, { color: colors.textMuted }]}>{formattedDate.month}</Text>
        </View>

        <View style={styles.mainInfo}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {event.title}
          </Text>
          <Text style={[styles.description, { color: colors.textMuted }]} numberOfLines={1}>
            {event.description || 'No description provided'}
          </Text>
          
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <View style={[styles.dot, { backgroundColor: colors.secondary }]} />
              <Text style={[styles.statValue, { color: colors.text }]}>₹{totals.income.toLocaleString()}</Text>
            </View>
            <View style={styles.stat}>
              <View style={[styles.dot, { backgroundColor: colors.accent }]} />
              <Text style={[styles.statValue, { color: colors.text }]}>₹{totals.expense.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        <View style={styles.balanceContainer}>
          <Text style={[styles.balanceLabel, { color: colors.textMuted }]}>Balance</Text>
          <Text style={[styles.balanceValue, { color: colors.primary }]}>₹{totals.balance.toLocaleString()}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  cardContent: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateBlock: {
    width: 56,
    height: 64,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  dateDay: {
    fontSize: 20,
    fontWeight: '800',
  },
  dateMonth: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: -2,
  },
  mainInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
  },
  description: {
    fontSize: 13,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  balanceContainer: {
    alignItems: 'flex-end',
    paddingLeft: 10,
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceValue: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
});
