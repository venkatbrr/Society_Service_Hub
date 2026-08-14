import React from 'react';
import { Platform, StyleSheet, TouchableOpacity, TouchableOpacityProps, View, ViewProps } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahBorder, VerandahRadius } from '../constants/Verandah';
import { MotionWrapper } from './MotionWrapper';

interface BaseCardProps extends ViewProps {
  onPress?: () => void;
  isLightMode?: boolean;
  padding?: number;
}

export const BaseCard = React.memo(({ children, onPress, isLightMode = true, style, padding = 12, ...rest }: BaseCardProps) => {
  const cardStyle = [
    styles.card,
    { padding },
    style
  ];

  const flattenedStyle = StyleSheet.flatten(cardStyle);

  if (onPress) {
    if (Platform.OS === 'web') {
      return (
        <MotionWrapper
          enableHoverEffect={true}
          enableTapEffect={true}
          onClick={onPress}
          style={flattenedStyle}
        >
          {children}
        </MotionWrapper>
      );
    }

    return (
      <TouchableOpacity
        style={cardStyle}
        onPress={onPress}
        activeOpacity={0.88}
        {...(rest as TouchableOpacityProps)}
      >
        {children}
      </TouchableOpacity>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <MotionWrapper
        enableHoverEffect={false}
        enableTapEffect={false}
        style={flattenedStyle}
      >
        {children}
      </MotionWrapper>
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
    borderRadius: VerandahRadius.card, // 18px
    marginBottom: 8,
    borderWidth: VerandahBorder.tile,
    borderColor: Verandah.borderHair,
    borderStyle: 'solid',
    overflow: 'hidden',
    ...Verandah.shadowCard,
  },
});
