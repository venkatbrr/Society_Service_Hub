import React from 'react';
import { StyleSheet, TouchableOpacity, TouchableOpacityProps, View, ViewProps } from 'react-native';
import { Colors } from '../constants/Colors';

interface BaseCardProps extends ViewProps {
  onPress?: () => void;
  isLightMode?: boolean;
  padding?: number;
}

export const BaseCard = React.memo(({ children, onPress, isLightMode = true, style, padding = 20, ...rest }: BaseCardProps) => {
  const colors = isLightMode ? Colors.light : Colors.dark;

  const cardStyle = [
    styles.card,
    {
      padding,
      backgroundColor: colors.glass,
      borderColor: colors.border,
      shadowColor: colors.primary,
    },
    style
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        style={cardStyle}
        onPress={onPress}
        activeOpacity={0.9}
        {...(rest as TouchableOpacityProps)}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View style={cardStyle} {...rest}>
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    // Modern soft shadow
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 2,
  },
});
