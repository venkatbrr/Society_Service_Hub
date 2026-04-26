// Service categories for Personal Service Reminders feature.
// These are stored as text in the DB; this file is the single source of truth
// for display labels, emoji icons, default frequencies, and provider category mapping.

export type ServiceCategory =
  | 'ac'
  | 'ro_water_purifier'
  | 'pest_control'
  | 'chimney'
  | 'water_tank_cleaning'
  | 'washing_machine'
  | 'refrigerator'
  | 'geyser'
  | 'car'
  | 'inverter_battery'
  | 'other';

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  'ac',
  'ro_water_purifier',
  'pest_control',
  'chimney',
  'water_tank_cleaning',
  'washing_machine',
  'refrigerator',
  'geyser',
  'car',
  'inverter_battery',
  'other',
];

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  ac: 'AC / Air Conditioner',
  ro_water_purifier: 'RO Water Purifier',
  pest_control: 'Pest Control',
  chimney: 'Kitchen Chimney',
  water_tank_cleaning: 'Water Tank Cleaning',
  washing_machine: 'Washing Machine',
  refrigerator: 'Refrigerator',
  geyser: 'Geyser / Water Heater',
  car: 'Car Service',
  inverter_battery: 'Inverter / Battery',
  other: 'Other',
};

export const SERVICE_CATEGORY_EMOJI: Record<ServiceCategory, string> = {
  ac: '❄️',
  ro_water_purifier: '💧',
  pest_control: '🐜',
  chimney: '🔥',
  water_tank_cleaning: '🪣',
  washing_machine: '🫧',
  refrigerator: '🧊',
  geyser: '♨️',
  car: '🚗',
  inverter_battery: '🔋',
  other: '🔧',
};

/** Default service frequency in months, prefilled when user selects a category. */
export const SERVICE_CATEGORY_DEFAULT_FREQUENCY: Record<ServiceCategory, number> = {
  ac: 6,
  ro_water_purifier: 3,
  pest_control: 3,
  chimney: 12,
  water_tank_cleaning: 6,
  washing_machine: 12,
  refrigerator: 12,
  geyser: 12,
  car: 6,
  inverter_battery: 6,
  other: 6,
};

/**
 * Maps a user_services category to the closest matching provider category
 * from constants/categories.ts (CATEGORIES list).
 * Used for the "Find technicians" deep-link filter.
 */
export function mapServiceCategoryToProviderCategory(category: ServiceCategory): string {
  const mapping: Record<ServiceCategory, string> = {
    ac: 'AC Technician',
    ro_water_purifier: 'Plumber',
    pest_control: 'Pest Control',
    chimney: 'Electrician',
    water_tank_cleaning: 'Water Supply',
    washing_machine: 'Electrician',
    refrigerator: 'Electrician',
    geyser: 'Electrician',
    car: 'Other',
    inverter_battery: 'Electrician',
    other: 'Other',
  };
  return mapping[category] ?? 'Other';
}
