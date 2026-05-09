import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';

interface VisitStatusBadgeProps {
  status: 'upcoming' | 'in_progress' | 'completed' | 'cancelled';
}

export const VisitStatusBadge = ({ status }: VisitStatusBadgeProps) => {
  const getStatusStyles = () => {
    switch (status) {
      case 'upcoming':
        return { bg: Verandah.accentSoft, text: Verandah.accent, label: 'Upcoming' };
      case 'in_progress':
        return { bg: Verandah.cautionSoft, text: Verandah.caution, label: 'In progress' };
      case 'completed':
        return { bg: Verandah.cardMuted, text: Verandah.textSecondary, label: 'Completed' };
      case 'cancelled':
        return { bg: Verandah.dangerSoft, text: Verandah.danger, label: 'Cancelled' };
      default:
        return { bg: Verandah.cardMuted, text: Verandah.textSecondary, label: status };
    }
  };

  const styles_config = getStatusStyles();

  return (
    <View style={[styles.badge, { backgroundColor: styles_config.bg }]}>
      <Text style={[styles.text, { color: styles_config.text }]}>{styles_config.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: VerandahSpace.sm,
    paddingVertical: 3,
    borderRadius: VerandahRadius.pill,
    alignSelf: 'flex-start',
  },
  text: {
    ...VerandahType.micro,
    fontWeight: '500',
  },
});
