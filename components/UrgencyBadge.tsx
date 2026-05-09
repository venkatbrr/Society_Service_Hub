import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';

interface UrgencyBadgeProps {
  daysUntilDue: number;
}

function getUrgencyConfig(days: number): { label: string; bg: string; text: string } {
  if (days < 0) {
    return {
      label: `Overdue ${Math.abs(days)}d`,
      bg: Verandah.dangerSoft,
      text: Verandah.danger,
    };
  }
  if (days === 0) {
    return { label: 'Due today', bg: Verandah.dangerSoft, text: Verandah.danger };
  }
  if (days <= 7) {
    return {
      label: `Due in ${days}d`,
      bg: Verandah.cautionSoft,
      text: Verandah.caution,
    };
  }
  if (days <= 30) {
    return {
      label: `Due in ${days}d`,
      bg: Verandah.accentSoft,
      text: Verandah.accent,
    };
  }
  return {
    label: `${days}d away`,
    bg: Verandah.cardMuted,
    text: Verandah.textMuted,
  };
}

export function UrgencyBadge({ daysUntilDue }: UrgencyBadgeProps) {
  const cfg = getUrgencyConfig(daysUntilDue);

  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.label, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: VerandahSpace.sm,
    paddingVertical: 3,
    borderRadius: VerandahRadius.pill,
    alignSelf: 'flex-start',
  },
  label: {
    ...VerandahType.micro,
    fontWeight: '500',
  },
});
