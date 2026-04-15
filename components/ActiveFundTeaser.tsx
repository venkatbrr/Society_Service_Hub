import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

type ActiveFundTeaserProps = {
  title: string;
  collected: number;
  goal: number;
  onPress: () => void;
};

export const ActiveFundTeaser = ({ title, collected, goal, onPress }: ActiveFundTeaserProps) => {
  const colors = Colors.light;
  const progress = goal > 0 ? Math.min(collected / goal, 1) : 0;

  return (
    <TouchableOpacity 
      style={[styles.container, { backgroundColor: '#FFF', shadowColor: '#000' }]} 
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={styles.header}>
        <View style={styles.titleArea}>
           <Text style={[styles.label, { color: colors.primary }]}>Active Fund</Text>
           <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        </View>
        <View style={[styles.iconContainer, { backgroundColor: colors.primary + '15' }]}>
           <Ionicons name="wallet-outline" size={20} color={colors.primary} />
        </View>
      </View>

      <View style={styles.statsRow}>
         <Text style={[styles.amount, { color: colors.text }]}>₹{collected.toLocaleString()}</Text>
         <Text style={[styles.goal, { color: colors.textMuted }]}>of ₹{goal.toLocaleString()}</Text>
      </View>

      <View style={[styles.progressBg, { backgroundColor: colors.surface2 }]}>
         <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${progress * 100}%` }]} />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 20,
    padding: 20,
    borderRadius: 24,
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
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 12,
  },
  amount: {
    fontSize: 22,
    fontWeight: '800',
  },
  goal: {
    fontSize: 14,
    fontWeight: '500',
  },
  progressBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
});
