import { Car01 } from '@untitledui/icons/Car01';
import { DotsHorizontal } from '@untitledui/icons/DotsHorizontal';
import { Lock01 } from '@untitledui/icons/Lock01';
import { MedicalCross } from '@untitledui/icons/MedicalCross';
import { Phone01 } from '@untitledui/icons/Phone01';
import { ShieldTick } from '@untitledui/icons/ShieldTick';
import { Zap } from '@untitledui/icons/Zap';
import React from 'react';

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const BLOOD_GROUP_FILTERS = ['All', ...BLOOD_GROUPS] as const;

export type EmergencyCategory =
  | 'hospital'
  | 'ambulance'
  | 'police'
  | 'fire'
  | 'security'
  | 'helpline'
  | 'other';

export const EMERGENCY_CATEGORY_META: Record<
  EmergencyCategory,
  { label: string; IconComponent: React.ComponentType<any> }
> = {
  hospital: { label: 'Hospitals', IconComponent: MedicalCross },
  ambulance: { label: 'Ambulance', IconComponent: Car01 },
  police: { label: 'Police', IconComponent: ShieldTick },
  fire: { label: 'Fire', IconComponent: Zap },
  security: { label: 'Security', IconComponent: Lock01 },
  helpline: { label: 'Helplines', IconComponent: Phone01 },
  other: { label: 'Other', IconComponent: DotsHorizontal },
};

export const EMERGENCY_CATEGORY_ORDER: EmergencyCategory[] = [
  'security',
  'hospital',
  'ambulance',
  'police',
  'fire',
  'helpline',
  'other',
];
