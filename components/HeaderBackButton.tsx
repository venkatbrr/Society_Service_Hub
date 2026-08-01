import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';

type HeaderBackButtonProps = {
  onPress: () => void;
  color?: string;
  style?: ViewStyle;
};

export function HeaderBackButton({ onPress, color = '#1F2A28', style }: HeaderBackButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.button, style]} hitSlop={8}>
      <Ionicons name="arrow-back" size={21} color={color} />
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
