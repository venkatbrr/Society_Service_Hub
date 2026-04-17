import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface VisitStatusBadgeProps {
  status: 'upcoming' | 'in_progress' | 'completed' | 'cancelled';
}

export const VisitStatusBadge = ({ status }: VisitStatusBadgeProps) => {
  const getStatusStyles = () => {
    switch (status) {
      case 'upcoming':
        return { bg: '#10B98112', text: '#10B981', label: 'Upcoming' };
      case 'in_progress':
        return { bg: '#FFB34712', text: '#FFB347', label: 'In Progress' };
      case 'completed':
        return { bg: '#E8E5F5', text: '#8B87B0', label: 'Completed' };
      case 'cancelled':
        return { bg: '#FF6B6B12', text: '#FF6B6B', label: 'Cancelled' };
      default:
        return { bg: '#E8E5F5', text: '#8B87B0', label: status };
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
