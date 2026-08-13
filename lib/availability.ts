/**
 * Maid/Cook "when are they free" helpers.
 *
 * Availability is stored as two well-known keys inside the existing
 * `service_providers.details` JSONB (see constants/providerDetails.ts):
 *  - `freeSlots: string[]`  — chip labels from AVAILABILITY_SLOTS the provider is free during
 *  - `weeklyOff: string`    — a day name, or 'None'
 *
 * Neighbour-reported, not a booking system — treat as a rough signal, not a guarantee.
 */

export interface AvailabilitySlot {
  /** Also the exact chip option string stored in `details.freeSlots`. */
  label: string;
  startHour: number;
  /** Exclusive. */
  endHour: number;
}

export const AVAILABILITY_SLOTS: AvailabilitySlot[] = [
  { label: 'Early morning (5–8am)', startHour: 5, endHour: 8 },
  { label: 'Morning (8–11am)', startHour: 8, endHour: 11 },
  { label: 'Midday (11am–2pm)', startHour: 11, endHour: 14 },
  { label: 'Afternoon (2–5pm)', startHour: 14, endHour: 17 },
  { label: 'Evening (5–8pm)', startHour: 17, endHour: 20 },
  { label: 'Night (8–10pm)', startHour: 20, endHour: 22 },
];

export const AVAILABILITY_SLOT_OPTIONS = AVAILABILITY_SLOTS.map((s) => s.label);

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const WEEKLY_OFF_OPTIONS = [...WEEKDAY_NAMES, 'None'];

/** A short display form, e.g. "5–8am", for the "Free from …" badge copy. */
function shortSlotTime(slot: AvailabilitySlot): string {
  const match = slot.label.match(/\(([^)]+)\)/);
  return match ? match[1] : slot.label;
}

export function getCurrentSlot(now: Date = new Date()): AvailabilitySlot | null {
  const hour = now.getHours();
  return AVAILABILITY_SLOTS.find((s) => hour >= s.startHour && hour < s.endHour) ?? null;
}

interface AvailabilityDetails {
  freeSlots?: string[];
  weeklyOff?: string;
}

export function isTodayWeeklyOff(details: AvailabilityDetails | null | undefined, now: Date = new Date()): boolean {
  if (!details?.weeklyOff || details.weeklyOff === 'None') return false;
  return WEEKDAY_NAMES[now.getDay()] === details.weeklyOff;
}

/** True when the provider has reported themselves free for the current time band. */
export function isFreeNow(details: AvailabilityDetails | null | undefined, now: Date = new Date()): boolean {
  if (!details?.freeSlots?.length) return false;
  if (isTodayWeeklyOff(details, now)) return false;
  const current = getCurrentSlot(now);
  return current ? details.freeSlots.includes(current.label) : false;
}

/**
 * Short badge copy: "Free now", "Free from 5–8pm" (today, later), or null when
 * there's nothing to say (no availability reported, weekly off, or nothing
 * left today).
 */
export function getAvailabilityBadge(details: AvailabilityDetails | null | undefined, now: Date = new Date()): string | null {
  if (!details?.freeSlots?.length) return null;
  if (isTodayWeeklyOff(details, now)) return null;

  if (isFreeNow(details, now)) return 'Free now';

  const hour = now.getHours();
  const nextSlot = AVAILABILITY_SLOTS.find((s) => s.startHour > hour && details.freeSlots!.includes(s.label));
  return nextSlot ? `Free from ${shortSlotTime(nextSlot)}` : null;
}
