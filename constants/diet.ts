import { Verandah } from './Colors';

/**
 * Diet labelling for pre-order food menu items (`mcn_preorder_items.diet_type`).
 *
 * Held per item, not per drop: a single drop's menu is routinely mixed — a veg
 * curry sold alongside a chicken biryani — so a drop-level label would be a lie
 * on half the listings. The catalog filter rolls these up (a drop matches "Veg"
 * when it has at least one veg item).
 *
 * The column defaults to `veg`, which means items published before the column
 * existed all read as veg until their host edits them. Drops are short-lived,
 * so that backfill ages out on its own.
 */
export type DietType = 'veg' | 'egg' | 'non_veg';

export const DIET_TYPES: DietType[] = ['veg', 'egg', 'non_veg'];

export const DIET_META: Record<DietType, { label: string; short: string; color: string }> = {
  veg: { label: 'Veg', short: 'Veg', color: Verandah.green600 },
  // Amber rather than a third arbitrary hue — it reads as "between the two",
  // which is exactly what egg is to the people who filter on this.
  egg: { label: 'Egg', short: 'Egg', color: '#B45309' },
  non_veg: { label: 'Non-veg', short: 'Non-veg', color: Verandah.danger },
};

/** Falls back to veg for anything unrecognised, matching the column default. */
export function dietMeta(value: string | null | undefined) {
  return DIET_META[(value as DietType) ?? 'veg'] ?? DIET_META.veg;
}
