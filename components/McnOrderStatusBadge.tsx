import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';

interface McnOrderStatusBadgeProps {
  status: 'pending' | 'confirmed' | 'fulfilled' | 'cancelled' | string;
}

export const McnOrderStatusBadge = React.memo(({ status }: McnOrderStatusBadgeProps) => {
  const getStatusStyles = () => {
    switch (status) {
      case 'pending':
        return { bg: Verandah.cautionSoft, text: Verandah.caution, label: 'Pending' };
      case 'confirmed':
        return { bg: '#EFF6FF', text: '#2563EB', label: 'Confirmed' };
      case 'fulfilled':
        return { bg: Verandah.accentSoft, text: Verandah.green600, label: 'Delivered' };
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
});

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
