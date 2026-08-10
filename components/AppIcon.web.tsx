import { Bell01 } from '@untitledui/icons/Bell01';
import { BookClosed } from '@untitledui/icons/BookClosed';
import { Brush01 } from '@untitledui/icons/Brush01';
import { Building05 } from '@untitledui/icons/Building05';
import { Calendar } from '@untitledui/icons/Calendar';
import { Car01 } from '@untitledui/icons/Car01';
import { CheckVerified01 } from '@untitledui/icons/CheckVerified01';
import { Clock } from '@untitledui/icons/Clock';
import { GraduationHat02 } from '@untitledui/icons/GraduationHat02';
import { Home02 } from '@untitledui/icons/Home02';
import { Lock01 } from '@untitledui/icons/Lock01';
import { MarkerPin01 } from '@untitledui/icons/MarkerPin01';
import { RefreshCw01 } from '@untitledui/icons/RefreshCw01';
import { SearchLg } from '@untitledui/icons/SearchLg';
import { Share07 } from '@untitledui/icons/Share07';
import { ShoppingBag01 } from '@untitledui/icons/ShoppingBag01';
import { Star01 } from '@untitledui/icons/Star01';
import { Tool01 } from '@untitledui/icons/Tool01';
import { User01 } from '@untitledui/icons/User01';
import { Users01 } from '@untitledui/icons/Users01';
import { Wallet02 } from '@untitledui/icons/Wallet02';
import { Zap } from '@untitledui/icons/Zap';
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
  | 'tool'
  | 'brush'
  | 'bell'
  | 'pin'
  | 'star'
  | 'verified'
  | 'share'
  | 'calendar';

interface AppIconProps {
  name: AppIconName;
  size?: number;
  color?: string;
  fill?: string;
}

type IconCmp = React.ComponentType<{ size?: number; color?: string; fill?: string; 'aria-hidden'?: boolean }>;

const MAP: Record<AppIconName, IconCmp> = {
  food: ShoppingBag01,
  store: Building05,
  fire: Zap,
  lock: Lock01,
  chef: User01,
  money: Wallet02,
  car: Car01,
  search: SearchLg,
  book: BookClosed,
  school: Building05,
  graduation: GraduationHat02,
  baby: User01,
  backpack: ShoppingBag01,
  home: Home02,
  clock: Clock,
  users: Users01,
  refresh: RefreshCw01,
  tool: Tool01,
  brush: Brush01,
  bell: Bell01,
  pin: MarkerPin01,
  star: Star01,
  verified: CheckVerified01,
  share: Share07,
  calendar: Calendar,
};

export function AppIcon({ name, size = 16, color, fill }: AppIconProps) {
  const Icon = MAP[name] ?? Tool01;
  return <Icon size={size} color={color || 'currentColor'} fill={fill} aria-hidden={true} />;
}
