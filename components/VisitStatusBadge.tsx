import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface VisitStatusBadgeProps {
  status: 'upcoming' | 'in_progress' | 'completed' | 'cancelled';
}

export const VisitStatusBadge = ({ status }: VisitStatusBadgeProps) => {
  const getStatusStyles = () => {
    switch (status) {
      case 'upcoming':
        return { bg: '#E1F9F1', text: '#10B981', label: 'Upcoming' };
      case 'in_progress':
        return { bg: '#FEF3C7', text: '#F59E0B', label: 'In Progress' };
      case 'completed':
        return { bg: '#F3F4F6', text: '#6B7280', label: 'Completed' };
      case 'cancelled':
        return { bg: '#FEE2E2', text: '#EF4444', label: 'Cancelled' };
      default:
        return { bg: '#F3F4F6', text: '#6B7280', label: status };
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
