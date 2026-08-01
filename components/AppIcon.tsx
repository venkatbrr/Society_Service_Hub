import React from 'react';
import { Text, TextStyle } from 'react-native';

export type AppIconName =
  | 'food'
  | 'store'
  | 'fire'
  | 'lock'
  | 'chef'
  | 'money'
  | 'car'
  | 'search'
  | 'book'
  | 'school'
  | 'graduation'
  | 'baby'
  | 'backpack'
  | 'home'
  | 'clock'
  | 'users'
  | 'refresh'
  | 'tool';

interface AppIconProps {
  name: AppIconName;
  size?: number;
  color?: string;
  style?: TextStyle;
}

const EMOJI_MAP: Record<AppIconName, string> = {
  food: '🍲',
  store: '🏪',
  fire: '🔥',
  lock: '🔒',
  chef: '👩‍🍳',
  money: '💰',
  car: '🚘',
  search: '🔍',
  book: '📚',
  school: '🏫',
  graduation: '🎓',
  baby: '👶',
  backpack: '🎒',
  home: '🏠',
  clock: '🕒',
  users: '👥',
  refresh: '🔄',
  tool: '🔧',
};

export function AppIcon({ name, size = 16, color, style }: AppIconProps) {
  return <Text style={[{ fontSize: size, lineHeight: size + 2, color }, style]}>{EMOJI_MAP[name]}</Text>;
}
