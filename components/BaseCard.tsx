import React from 'react';
import { StyleSheet, TouchableOpacity, TouchableOpacityProps, View, ViewProps } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace } from '../constants/Verandah';

interface BaseCardProps extends ViewProps {
  onPress?: () => void;
  isLightMode?: boolean;
  padding?: number;
}

export const BaseCard = React.memo(({ children, onPress, isLightMode = true, style, padding = 16, ...rest }: BaseCardProps) => {
  const cardStyle = [
    styles.card,
    { padding },
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
    backgroundColor: Verandah.card,
    borderRadius: VerandahRadius.lg,
    marginBottom: VerandahSpace.sm + 2,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    overflow: 'hidden',
  },
});
