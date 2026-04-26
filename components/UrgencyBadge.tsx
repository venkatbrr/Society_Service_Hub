import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/Colors';

interface UrgencyBadgeProps {
  daysUntilDue: number;
}

function getUrgencyConfig(days: number): { label: string; bg: string; text: string } {
  const colors = Colors.light;
  if (days < 0) {
    // Overdue
    return {
      label: `Overdue ${Math.abs(days)}d`,
      bg: colors.accent + '20',
      text: colors.accent,
    };
  }
  if (days === 0) {
    return { label: 'Due today', bg: colors.accent + '20', text: colors.accent };
  }
  if (days <= 7) {
    return {
      label: `Due in ${days}d`,
      bg: '#F59E0B20',
      text: '#B45309',
    };
  }
  if (days <= 30) {
    return {
      label: `Due in ${days}d`,
      bg: colors.secondary + '18',
      text: colors.secondary,
    };
  }
  return {
    label: `${days}d away`,
    bg: colors.border,
    text: colors.textMuted,
  };
}

export function UrgencyBadge({ daysUntilDue }: UrgencyBadgeProps) {
  const colors = Colors.light;
  const cfg = getUrgencyConfig(daysUntilDue);

  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg, borderColor: cfg.text + '40' }]}>
      <Text style={[styles.label, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
