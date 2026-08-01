import { Car01 } from '@untitledui/icons/Car01';
import { GraduationHat02 } from '@untitledui/icons/GraduationHat02';
import { RefreshCw01 } from '@untitledui/icons/RefreshCw01';
import { ShoppingBag03 } from '@untitledui/icons/ShoppingBag03';
import { Users01 } from '@untitledui/icons/Users01';
import React from 'react';

type NetworkTileIconKind = 'food' | 'carpool' | 'parents' | 'schools' | 'borrow';

interface NetworkTileIconProps {
  kind: NetworkTileIconKind;
  size?: number;
}

const ICON_BY_KIND: Record<NetworkTileIconKind, React.ComponentType<{ size?: number; color?: string }>> = {
  food: ShoppingBag03,
  carpool: Car01,
  parents: Users01,
  schools: GraduationHat02,
  borrow: RefreshCw01,
};

export function NetworkTileIcon({ kind, size = 20 }: NetworkTileIconProps) {
  const Icon = ICON_BY_KIND[kind];
  return <Icon size={size} color="currentColor" aria-hidden="true" />;
}
