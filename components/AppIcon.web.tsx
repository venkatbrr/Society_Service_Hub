import { BookClosed } from '@untitledui/icons/BookClosed';
import { Building05 } from '@untitledui/icons/Building05';
import { Car01 } from '@untitledui/icons/Car01';
import { Clock } from '@untitledui/icons/Clock';
import { Coins01 } from '@untitledui/icons/Coins01';
import { GraduationHat02 } from '@untitledui/icons/GraduationHat02';
import { Home02 } from '@untitledui/icons/Home02';
import { Lock01 } from '@untitledui/icons/Lock01';
import { RefreshCw01 } from '@untitledui/icons/RefreshCw01';
import { SearchMd } from '@untitledui/icons/SearchMd';
import { ShoppingBag03 } from '@untitledui/icons/ShoppingBag03';
import { Tool02 } from '@untitledui/icons/Tool02';
import { Trophy01 } from '@untitledui/icons/Trophy01';
import { User01 } from '@untitledui/icons/User01';
import { Users01 } from '@untitledui/icons/Users01';
import React from 'react';

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
}

type IconCmp = React.ComponentType<{ size?: number; color?: string; 'aria-hidden'?: boolean }>;

const MAP: Record<AppIconName, IconCmp> = {
  food: ShoppingBag03,
  store: Building05,
  fire: Trophy01,
  lock: Lock01,
  chef: User01,
  money: Coins01,
  car: Car01,
  search: SearchMd,
  book: BookClosed,
  school: Building05,
  graduation: GraduationHat02,
  baby: User01,
  backpack: ShoppingBag03,
  home: Home02,
  clock: Clock,
  users: Users01,
  refresh: RefreshCw01,
  tool: Tool02,
};

export function AppIcon({ name, size = 16, color }: AppIconProps) {
  const Icon = MAP[name];
  return <Icon size={size} color={color || 'currentColor'} aria-hidden={true} />;
}
