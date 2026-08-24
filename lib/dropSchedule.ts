/**
 * The one implementation of a food drop's schedule: how its date and time
 * strings are parsed and formatted, and what makes a cut-off / delivery pair
 * publishable.
 *
 * Extracted from `app/mcn/drops/add.tsx` (2026-08-24) when republishing gave
 * the rules a second caller. A drop published past its own cut-off is dead on
 * arrival — `place_mcn_preorder` rejects every order once `cutoff_at <= now()`
 * — so a second, hand-written copy of these checks that drifted from this one
 * would silently ship un-orderable menus.
 *
 * Dates are local calendar days (`YYYY-MM-DD`), never `toISOString()` slices:
 * the UTC day trails the IST day before 05:30, which would seed a cut-off date
 * that is already in the past.
 */

/** `YYYY-MM-DD` → Date at local midnight. Empty string → today. */
export function parseDateStr(str: string): Date {
  if (!str) return new Date();
  const parts = str.split('-');
  if (parts.length === 3) {
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }
  return new Date();
}

/** Date → `YYYY-MM-DD` in the local calendar. */
export function formatDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** `HH:mm` → today's date at that time. */
export function parseTimeStr(str: string): Date {
  const d = new Date();
  if (!str) return d;
  const parts = str.split(':');
  if (parts.length >= 2) {
    d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
  }
  return d;
}

/** Date → `HH:mm`. */
export function formatTimeStr(d: Date): string {
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${mins}`;
}

/**
 * `mcn_preorder_drops.fulfillment_time` is TEXT and predates the time picker,
 * so early rows hold free text like "1:00 PM - 3:00 PM". Normalize to `HH:mm`,
 * falling back to 13:00 for anything unreadable.
 */
export function normalizeFulfillmentTime(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const twelveHour = trimmed.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (twelveHour) {
    const hourRaw = parseInt(twelveHour[1], 10);
    const minuteRaw = parseInt(twelveHour[2], 10);
    const meridiem = twelveHour[3].toUpperCase();
    let hour24 = hourRaw % 12;
    if (meridiem === 'PM') {
      hour24 += 12;
    }
    return `${String(hour24).padStart(2, '0')}:${String(minuteRaw).padStart(2, '0')}`;
  }

  return '13:00';
}

/** `HH:mm` → "1:00 pm", for display only. */
export function formatDisplayTime(timeStr: string): string {
  const parsed = parseTimeStr(timeStr);
  return parsed.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/** Today's local calendar day — the floor for every date picker on a drop form. */
export function todayDateStr(): string {
  return formatDateStr(new Date());
}

/** The schedule a drop was loaded with, in edit mode. */
export interface LoadedDropSchedule {
  cutoffDate: string;
  cutoffTime: string;
  fulfillmentDate: string;
  fulfillmentTime: string;
}

export interface DropScheduleInput {
  cutoffDate: string;
  cutoffTime: string;
  fulfillmentDate: string;
  fulfillmentTime: string;
  /**
   * Only set when editing an existing drop. A drop left open past its own
   * cut-off must stay editable — the host may only want to fix a typo — so the
   * "not in the past" rule is enforced against the values they actually
   * changed. **Pass `null` for create, duplicate and republish**: a fresh drop
   * that inherited a loaded schedule could be published into the past.
   */
  loadedSchedule?: LoadedDropSchedule | null;
}

export type DropScheduleResult =
  | { ok: true; cutoffAt: Date; fulfillAt: Date }
  | {
      ok: false;
      /** Merge into the form's `fieldErrors` to light up the offending inputs. */
      fieldErrors: Record<string, boolean>;
      text1: string;
      text2?: string;
    };

/**
 * The publishable-schedule rule, in order:
 *   1. all four parts present
 *   2. both timestamps parse
 *   3. cut-off is in the future  (exempt if unchanged in edit mode)
 *   4. delivery is in the future (exempt if unchanged in edit mode)
 *   5. delivery is strictly after cut-off
 */
export function validateDropSchedule(input: DropScheduleInput): DropScheduleResult {
  const { cutoffDate, cutoffTime, fulfillmentDate, fulfillmentTime, loadedSchedule } = input;

  const missing: Record<string, boolean> = {};
  if (!fulfillmentDate) missing.fulfillmentDate = true;
  if (!fulfillmentTime) missing.fulfillmentTime = true;
  if (!cutoffDate) missing.cutoffDate = true;
  if (!cutoffTime) missing.cutoffTime = true;

  if (missing.fulfillmentDate || missing.fulfillmentTime) {
    return { ok: false, fieldErrors: missing, text1: 'Please set delivery date & time' };
  }
  if (missing.cutoffDate || missing.cutoffTime) {
    return { ok: false, fieldErrors: missing, text1: 'Please set pre-order cut-off date & time' };
  }

  const cutoffAt = new Date(`${cutoffDate}T${cutoffTime}:00`);
  const fulfillAt = new Date(`${fulfillmentDate}T${fulfillmentTime}:00`);

  if (isNaN(cutoffAt.getTime())) {
    return {
      ok: false,
      fieldErrors: { cutoffDate: true, cutoffTime: true },
      text1: 'Invalid cut-off deadline timestamp',
    };
  }
  if (isNaN(fulfillAt.getTime())) {
    return {
      ok: false,
      fieldErrors: { fulfillmentDate: true, fulfillmentTime: true },
      text1: 'Invalid delivery time timestamp',
    };
  }

  const now = new Date();

  const cutoffChanged =
    !loadedSchedule ||
    loadedSchedule.cutoffDate !== cutoffDate ||
    loadedSchedule.cutoffTime !== cutoffTime;

  if (cutoffChanged && cutoffAt <= now) {
    return {
      ok: false,
      fieldErrors: { cutoffDate: true, cutoffTime: true },
      text1: 'Cut-off must be in the future',
      text2: 'Pick a date and time from now onwards — neighbors need time to order.',
    };
  }

  const fulfillmentChanged =
    !loadedSchedule ||
    loadedSchedule.fulfillmentDate !== fulfillmentDate ||
    loadedSchedule.fulfillmentTime !== fulfillmentTime;

  if (fulfillmentChanged && fulfillAt <= now) {
    return {
      ok: false,
      fieldErrors: { fulfillmentDate: true, fulfillmentTime: true },
      text1: 'Delivery time must be in the future',
      text2: 'Pick a date and time from now onwards.',
    };
  }

  if (fulfillAt <= cutoffAt) {
    return {
      ok: false,
      fieldErrors: {
        fulfillmentDate: true,
        fulfillmentTime: true,
        cutoffDate: true,
        cutoffTime: true,
      },
      text1: 'Delivery time must be after cut-off deadline',
      text2: 'Pre-orders must close before delivery begins.',
    };
  }

  return { ok: true, cutoffAt, fulfillAt };
}
