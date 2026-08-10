// Service categories for Personal Service Reminders feature.
// These are stored as text in the DB; this file is the single source of truth
// for display labels, emoji icons, default frequencies, and provider category mapping.
// Ordered by relevance to gated community flat residents.

export type ServiceCategory =
  | 'ac'
  | 'ro_water_purifier'
  | 'geyser'
  | 'washing_machine'
  | 'refrigerator'
  | 'chimney'
  | 'pest_control'
  | 'car'
  | 'bike'
  | 'inverter_battery'
  | 'other';

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  'ac',
  'ro_water_purifier',
  'geyser',
  'washing_machine',
  'refrigerator',
  'chimney',
  'pest_control',
  'car',
  'bike',
  'inverter_battery',
  'other',
];

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  ac: 'AC / Air Conditioner',
  ro_water_purifier: 'RO Water Purifier',
  geyser: 'Geyser / Water Heater',
  washing_machine: 'Washing Machine',
  refrigerator: 'Refrigerator',
  chimney: 'Kitchen Chimney',
  pest_control: 'Pest Control',
  car: 'Car Service',
  bike: 'Bike Service',
  inverter_battery: 'Inverter / Battery',
  other: 'Other',
};

export const SERVICE_CATEGORY_EMOJI: Record<ServiceCategory, string> = {
  ac: '❄️',
  ro_water_purifier: '💧',
  geyser: '♨️',
  washing_machine: '🫧',
  refrigerator: '🧊',
  chimney: '🔥',
  pest_control: '🐜',
  car: '🚗',
  bike: '🏍️',
  inverter_battery: '🔋',
  other: '🔧',
};

import { BatteryCharging01 } from '@untitledui/icons/BatteryCharging01';
import { Car01 } from '@untitledui/icons/Car01';
import { Droplets01 } from '@untitledui/icons/Droplets01';
import { RefreshCw01 } from '@untitledui/icons/RefreshCw01';
import { Snowflake01 } from '@untitledui/icons/Snowflake01';
import { Speedometer01 } from '@untitledui/icons/Speedometer01';
import { ThermometerCold } from '@untitledui/icons/ThermometerCold';
import { ThermometerWarm } from '@untitledui/icons/ThermometerWarm';
import { Tool01 } from '@untitledui/icons/Tool01';
import { Virus } from '@untitledui/icons/Virus';
import { Wind01 } from '@untitledui/icons/Wind01';
import React from 'react';

export const SERVICE_CATEGORY_UNTITLED_ICONS: Record<
  ServiceCategory,
  React.ComponentType<{ size?: number; color?: string; style?: any; 'aria-hidden'?: boolean }>
> = {
  ac: Snowflake01,
  ro_water_purifier: Droplets01,
  geyser: ThermometerWarm,
  washing_machine: RefreshCw01,
  refrigerator: ThermometerCold,
  chimney: Wind01,
  pest_control: Virus,
  car: Car01,
  bike: Speedometer01,
  inverter_battery: BatteryCharging01,
  other: Tool01,
};

export function getServiceCategoryIcon(
  category: string | null | undefined
): React.ComponentType<{ size?: number; color?: string; style?: any; 'aria-hidden'?: boolean }> {
  if (!category) return Tool01;
  return SERVICE_CATEGORY_UNTITLED_ICONS[category as ServiceCategory] ?? Tool01;
}

/** Default service frequency in months, prefilled when user selects a category. */
export const SERVICE_CATEGORY_DEFAULT_FREQUENCY: Record<ServiceCategory, number> = {
  ac: 6,
  ro_water_purifier: 3,
  geyser: 12,
  washing_machine: 12,
  refrigerator: 12,
  chimney: 12,
  pest_control: 3,
  car: 6,
  bike: 6,
  inverter_battery: 6,
  other: 6,
};

/**
 * Maps a user_services category to the closest matching provider category
 * from constants/categories.ts (CATEGORIES list).
 * Used for the "Find technicians" deep-link filter.
 * Note: 'Tutor / Home Teacher' was renamed to 'Teaching'.
 */
export function mapServiceCategoryToProviderCategory(category: ServiceCategory): string {
  const mapping: Record<ServiceCategory, string> = {
    ac: 'AC Technician',
    ro_water_purifier: 'Plumber',
    geyser: 'Electrician',
    washing_machine: 'Electrician',
    refrigerator: 'Electrician',
    chimney: 'Electrician',
    pest_control: 'Pest Control',
    car: 'Other',
    bike: 'Other',
    inverter_battery: 'Electrician',
    other: 'Other',
  };
  return mapping[category] ?? 'Other';
}
