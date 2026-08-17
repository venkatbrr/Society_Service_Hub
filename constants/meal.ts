/**
 * Meal slot for a pre-order menu (`mcn_preorder_drops.meal_type`).
 *
 * Stored, not derived. An earlier version bucketed it off `fulfillment_time`,
 * which is right most of the time and wrong exactly where it matters — a
 * midnight-snack drop delivering at 20:00, a brunch at 11:30. The host knows
 * which meal they are cooking; the clock only guesses.
 *
 * `suggestMealFromTime()` keeps the old bucketing as a *starting* value in the
 * publish form, so the host usually only confirms it.
 */
export type MealType = 'breakfast' | 'lunch' | 'snacks' | 'dinner';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'snacks', 'dinner'];

export const MEAL_META: Record<MealType, { label: string; hint: string }> = {
  breakfast: { label: 'Breakfast', hint: 'Morning' },
  lunch: { label: 'Lunch', hint: 'Midday' },
  snacks: { label: 'Snacks / Tea', hint: 'Evening' },
  dinner: { label: 'Dinner', hint: 'Night' },
};

/** Pre-fills the publish form from the delivery time the host already picked. */
export function suggestMealFromTime(time: string | null | undefined): MealType {
  const [h, m] = String(time || '').split(':');
  const mins = (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
  if (mins < 11 * 60) return 'breakfast';
  if (mins < 15 * 60 + 30) return 'lunch';
  if (mins < 19 * 60) return 'snacks';
  return 'dinner';
}
