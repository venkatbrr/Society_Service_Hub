import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/Colors';

interface BusinessStatusBadgeProps {
  isAcceptingOrders: boolean;
}

export const BusinessStatusBadge = ({ isAcceptingOrders }: BusinessStatusBadgeProps) => {
  const colors = Colors.light;
  
  return (
    <View style={[
      styles.badge, 
      { backgroundColor: isAcceptingOrders ? '#10B98115' : '#EF444415' }
    ]}>
      <View style={[
        styles.dot, 
        { backgroundColor: isAcceptingOrders ? '#10B981' : '#EF4444' }
      ]} />
      <Text style={[
        styles.text, 
        { color: isAcceptingOrders ? '#10B981' : '#EF4444' }
      ]}>
        {isAcceptingOrders ? 'Accepting Orders' : 'Currently Closed'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
