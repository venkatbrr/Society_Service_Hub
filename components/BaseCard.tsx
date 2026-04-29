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
    marginBottom: 10,
    borderWidth: 1,
    overflow: 'hidden',
    // iOS-only soft shadow (Android elevation causes white rectangle artifacts)
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 0,
  },
});
