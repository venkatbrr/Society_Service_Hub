import { ArrowLeft } from '@untitledui/icons/ArrowLeft';
import React from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';

type HeaderBackButtonProps = {
  onPress: () => void;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export function HeaderBackButton({ onPress, color = '#1F2A28', style }: HeaderBackButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.button, style]} hitSlop={8}>
      <ArrowLeft size={21} color={color} aria-hidden="true" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
