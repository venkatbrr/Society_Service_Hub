import React from 'react';
import { Text, TextStyle } from 'react-native';

type NetworkTileIconKind = 'food' | 'carpool' | 'parents' | 'schools' | 'borrow';

interface NetworkTileIconProps {
  kind: NetworkTileIconKind;
  size?: number;
  style?: TextStyle;
}

const EMOJI_BY_KIND: Record<NetworkTileIconKind, string> = {
  food: '🍲',
  carpool: '🚘',
  parents: '👨‍👩‍👧‍👦',
  schools: '🏫',
  borrow: '🤝',
};

export function NetworkTileIcon({ kind, size = 22, style }: NetworkTileIconProps) {
  return (
    <Text style={[{ fontSize: size, lineHeight: size + 2 }, style]}>
      {EMOJI_BY_KIND[kind]}
    </Text>
  );
}
