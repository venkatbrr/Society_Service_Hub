import { Ionicons } from '@expo/vector-icons';
import { ComponentProps } from 'react';

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
  { label: string; icon: ComponentProps<typeof Ionicons>['name'] }
> = {
  hospital: { label: 'Hospitals', icon: 'medical-outline' },
  ambulance: { label: 'Ambulance', icon: 'car-outline' },
  police: { label: 'Police', icon: 'shield-checkmark-outline' },
  fire: { label: 'Fire', icon: 'flame-outline' },
  security: { label: 'Security', icon: 'lock-closed-outline' },
  helpline: { label: 'Helplines', icon: 'call-outline' },
  other: { label: 'Other', icon: 'ellipsis-horizontal-circle-outline' },
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
