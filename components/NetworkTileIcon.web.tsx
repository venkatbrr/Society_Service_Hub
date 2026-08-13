import { Car01 } from '@untitledui/icons/Car01';
import { GraduationHat02 } from '@untitledui/icons/GraduationHat02';
import { ShoppingBag01 } from '@untitledui/icons/ShoppingBag01';
import { SwitchHorizontal01 } from '@untitledui/icons/SwitchHorizontal01';
import React from 'react';
import { ParentChildIcon } from './ParentChildIcon';

export type NetworkTileIconKind = 'food' | 'carpool' | 'parents' | 'schools' | 'borrow';

interface NetworkTileIconProps {
  kind: NetworkTileIconKind;
  size?: number;
  color?: string;
}

const ICON_BY_KIND: Record<NetworkTileIconKind, React.ComponentType<{ size?: number; color?: string; 'aria-hidden'?: boolean }>> = {
  food: ShoppingBag01,
  carpool: Car01,
  // Bespoke — Untitled UI's Users* are all same-height adults. See ParentChildIcon.
  parents: ParentChildIcon,
  schools: GraduationHat02,
  borrow: SwitchHorizontal01,
};

export function NetworkTileIcon({ kind, size = 20, color = 'currentColor' }: NetworkTileIconProps) {
  const Icon = ICON_BY_KIND[kind] ?? ShoppingBag01;
  return <Icon size={size} color={color} aria-hidden={true} />;
}
