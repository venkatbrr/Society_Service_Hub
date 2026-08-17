import { Platform } from 'react-native';
import { ResidentProfile } from './database.types';

/**
 * Last-known-good snapshot of the resolved auth state, persisted locally.
 *
 * Cold start used to be gated on the network: nothing rendered until
 * `getSession()` → `getUser()` → the `profiles` read had all come back, so on a
 * slow connection the user stared at a spinner for the whole round trip even
 * though the answer had not changed since the last launch. This snapshot lets
 * the app paint the real screen from the previous session immediately and
 * revalidate behind it.
 *
 * It is a **cache, never the source of truth** — every launch still loads the
 * profile from Supabase and overwrites this. It is keyed by user id, so a
 * different account can never read the previous one's state, and it is cleared
 * on sign-out. Treat a stale field the way you would treat `fundsEnabled` on
 * first render: correct within a moment, not authoritative on frame one.
 */
export type AuthSnapshot = {
  version: number;
  userId: string;
  profile: ResidentProfile;
  communityId: string | null;
  myBlockId: string | null;
  flatId: string | null;
  fundsEnabled: boolean;
  blocksEnabled: boolean;
  blockLabel: string;
  communityHasLead: boolean;
  isEventOrganizer: boolean;
};

// Bump when the shape above changes — an old snapshot is then simply ignored.
const SNAPSHOT_VERSION = 1;
const STORAGE_KEY = 'wooru.authSnapshot';

// Native has no synchronous storage, so the snapshot is read with AsyncStorage
// there (still far cheaper than the network round trip it replaces). Web reads
// localStorage synchronously, which is why `readAuthSnapshotSync` exists.
let AsyncStorage: any = null;
if (Platform.OS !== 'web') {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
}

const parse = (raw: string | null): AuthSnapshot | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthSnapshot;
    if (!parsed || parsed.version !== SNAPSHOT_VERSION || !parsed.userId || !parsed.profile) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

/** Web-only synchronous read. Returns `null` on native — use `readAuthSnapshot`. */
export function readAuthSnapshotSync(): AuthSnapshot | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    return parse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export async function readAuthSnapshot(): Promise<AuthSnapshot | null> {
  if (Platform.OS === 'web') return readAuthSnapshotSync();
  try {
    return parse(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeAuthSnapshot(snapshot: Omit<AuthSnapshot, 'version'>): void {
  const payload = JSON.stringify({ ...snapshot, version: SNAPSHOT_VERSION });
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, payload);
    } else {
      void AsyncStorage.setItem(STORAGE_KEY, payload).catch(() => { });
    }
  } catch {
    /* a full or unavailable store just means no warm start next launch */
  }
}

export function clearAuthSnapshot(): void {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
    } else {
      void AsyncStorage.removeItem(STORAGE_KEY).catch(() => { });
    }
  } catch {
    /* best effort */
  }
}
