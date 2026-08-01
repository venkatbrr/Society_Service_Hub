import { BookClosed } from '@untitledui/icons/BookClosed';
import { Building05 } from '@untitledui/icons/Building05';
import { Bus } from '@untitledui/icons/Bus';
import { Coins01 } from '@untitledui/icons/Coins01';
import { FaceSmile } from '@untitledui/icons/FaceSmile';
import { Shield01 } from '@untitledui/icons/Shield01';
import { Trophy01 } from '@untitledui/icons/Trophy01';
import { User01 } from '@untitledui/icons/User01';
import React from 'react';
import { AspectKey } from '../constants/schoolReviewAspects';

type IconCmp = React.ComponentType<{ size?: number; color?: string; 'aria-hidden'?: boolean }>;

const ICON_BY_ASPECT: Record<AspectKey, IconCmp> = {
  academics: BookClosed,
  teachers: User01,
  infrastructure: Building05,
  sports_activities: Trophy01,
  safety: Shield01,
  transport: Bus,
  value: Coins01,
  happiness: FaceSmile,
};

interface SchoolAspectIconProps {
  aspectKey: AspectKey;
  size?: number;
}

export function SchoolAspectIcon({ aspectKey, size = 16 }: SchoolAspectIconProps) {
  const Icon = ICON_BY_ASPECT[aspectKey];
  return <Icon size={size} color="currentColor" aria-hidden="true" />;
}
