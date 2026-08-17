import { Platform } from 'react-native';

/**
 * The community join code carried by an invite link, held across the sign-in
 * detour.
 *
 * An invited neighbour lands on `/community-select?code=ABC123` while signed
 * out, so the root layout bounces them to `/login` and the query string is gone
 * by the time they come back from Google. This module parks the code in
 * sessionStorage (survives the OAuth round trip in the same tab, dies with the
 * tab) so the join screen can prefill it afterwards.
 *
 * Deliberately peek/clear rather than a single take(): the root layout reads it
 * on every redirect pass and expo-router can run that effect more than once
 * before `pathname` catches up. A consuming read would empty the slot on the
 * first pass and hand a bare `/community-select` to the second, which is
 * exactly how the prefill was being lost.
 */
const STORAGE_KEY = 'wooru.pendingCommunityCode';

/** Native has no sessionStorage; a module-level value covers the same launch. */
let memoryCode: string | null = null;

const canUseSessionStorage = () =>
  Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';

/**
 * Community codes are exactly six upper-case alphanumerics. The strictness is
 * load-bearing, not cosmetic: Supabase's PKCE flow returns the browser to
 * `/login?code=<long opaque token>`, and a lenient parser would happily store
 * that token as an "invite code" and prefill the join box with garbage.
 */
export function normalizeInviteCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toUpperCase();
  return /^[A-Z0-9]{6}$/.test(cleaned) ? cleaned : null;
}

/** Reads `?code=` straight off the address bar (web only). */
export function readInviteCodeFromUrl(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    return normalizeInviteCode(new URLSearchParams(window.location.search).get('code'));
  } catch {
    return null;
  }
}

/** Parks a code for later. Ignores anything that is not a valid code. */
export function rememberInviteCode(raw: unknown): void {
  const code = normalizeInviteCode(raw);
  if (!code) return;

  memoryCode = code;
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Private mode — the in-memory copy still covers a same-tab flow.
  }
}

/** Returns the parked code without consuming it. */
export function peekInviteCode(): string | null {
  if (memoryCode) return memoryCode;
  if (!canUseSessionStorage()) return null;
  try {
    return normalizeInviteCode(window.sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Drops the parked code once the join screen has actually used it. */
export function clearInviteCode(): void {
  memoryCode = null;
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing was stored.
  }
}
