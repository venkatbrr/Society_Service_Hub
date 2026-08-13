/**
 * Community events — pure helpers. No network calls.
 *
 * NAMING TRAP: public.events (the funds table) already exists and means a
 * FUND, not a community event. This module is deliberately named lib/events
 * for "community events" only because there is no collision at the file
 * level — never import this alongside anything from the funds module under
 * a shared `events` identifier.
 */

import type React from 'react';
import { CalendarDate } from '@untitledui/icons/CalendarDate';
import { MusicNote01 } from '@untitledui/icons/MusicNote01';
import { Star01 } from '@untitledui/icons/Star01';
import { Tool01 } from '@untitledui/icons/Tool01';
import { Trophy01 } from '@untitledui/icons/Trophy01';
import { Users01 } from '@untitledui/icons/Users01';
import { Verandah } from '../constants/Colors';

export type EventCategory = 'cultural' | 'sports' | 'festival' | 'meeting' | 'workshop' | 'other';

type IconCmp = React.ComponentType<{ size?: number; color?: string; 'aria-hidden'?: boolean }>;

interface CategoryMeta {
  label: string;
  Icon: IconCmp;
  tint: string;
  tintSoft: string;
}

const CATEGORY_META: Record<EventCategory, CategoryMeta> = {
  cultural: { label: 'Cultural', Icon: MusicNote01, tint: Verandah.accent, tintSoft: Verandah.accentSoft },
  sports: { label: 'Sports', Icon: Trophy01, tint: Verandah.goldInk, tintSoft: Verandah.sand },
  festival: { label: 'Festival', Icon: Star01, tint: Verandah.goldInk, tintSoft: Verandah.sand },
  meeting: { label: 'Meeting', Icon: Users01, tint: Verandah.primary, tintSoft: Verandah.cardMuted },
  workshop: { label: 'Workshop', Icon: Tool01, tint: Verandah.primary, tintSoft: Verandah.cardMuted },
  other: { label: 'Other', Icon: CalendarDate, tint: Verandah.textSecondary, tintSoft: Verandah.cardMuted },
};

export const EVENT_CATEGORIES: EventCategory[] = ['cultural', 'sports', 'festival', 'meeting', 'workshop', 'other'];

export function eventCategoryMeta(category: string | null | undefined): CategoryMeta {
  return CATEGORY_META[(category as EventCategory) ?? 'cultural'] ?? CATEGORY_META.other;
}

/** Half-hour options from 6 AM to 11 PM, for the start/end time chip rows. */
export const EVENT_TIME_OPTIONS: string[] = (() => {
  const options: string[] = [];
  for (let hour = 6; hour <= 23; hour++) {
    options.push(`${String(hour).padStart(2, '0')}:00`);
    if (hour < 23) options.push(`${String(hour).padStart(2, '0')}:30`);
  }
  return options;
})();

export function formatEventTime(timeStr: string | null | undefined): string {
  if (!timeStr) return '';
  const [hourStr, minuteStr] = timeStr.split(':');
  let hour = parseInt(hourStr, 10);
  if (isNaN(hour)) return timeStr;
  const minute = (minuteStr ?? '00').slice(0, 2);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return minute === '00' ? `${hour} ${ampm}` : `${hour}:${minute} ${ampm}`;
}

/** Local calendar-date parse — event_date is a plain YYYY-MM-DD, never a timestamp. */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** "Sat, 14 Sep · 6:00 PM" or "Sat, 14 Sep" when there's no start time. */
export function formatEventWhen(eventDate: string, startTime?: string | null): string {
  const dateLabel = parseLocalDate(eventDate).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const timeLabel = startTime ? formatEventTime(startTime) : '';
  return timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel;
}

export function formatEventDateShort(eventDate: string): { day: string; month: string } {
  const d = parseLocalDate(eventDate);
  return {
    day: String(d.getDate()).padStart(2, '0'),
    month: d.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase(),
  };
}

/** True while registration is still open, i.e. today <= registration_last_date. */
export function isRegistrationOpen(registrationLastDate: string | null | undefined, today: Date = new Date()): boolean {
  if (!registrationLastDate) return false;
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return todayStr <= registrationLastDate;
}

export function isEventPast(eventDate: string, today: Date = new Date()): boolean {
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return eventDate < todayStr;
}
