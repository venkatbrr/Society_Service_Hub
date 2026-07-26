import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// --- Platform-aware auth storage ---
// Web: use the browser's built-in localStorage (Supabase JS default).
// Native: use AsyncStorage to bypass Android's SecureStore 2048-byte limit.
let storageAdapter: any = undefined; // undefined → Supabase uses localStorage on web

if (Platform.OS !== 'web') {
  // Only import the polyfill and AsyncStorage on native platforms.
  require('react-native-url-polyfill/auto');
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  storageAdapter = {
    getItem: (key: string) => AsyncStorage.getItem(key),
    setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
    removeItem: (key: string) => AsyncStorage.removeItem(key),
  };
}

// Placeholders for now. You will need to replace these with your actual Supabase project URL and anon key.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://xyzcompany.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'public-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(storageAdapter ? { storage: storageAdapter } : {}),
    autoRefreshToken: true,
    persistSession: true,
    // On web, detect OAuth tokens in the URL hash after redirect (e.g. Google Sign-In).
    // On native, the ID-token flow doesn't use URL redirects.
    detectSessionInUrl: Platform.OS === 'web',
  },
});

/**
 * Checks whether an error is a PostgREST/Supabase authentication or JWT expiration error.
 */
export function isAuthOrSessionError(error: any): boolean {
  if (!error) return false;
  const message = String(error.message || error.details || '').toLowerCase();
  const code = String(error.code || '');
  return (
    code === 'PGRST301' ||
    code === '401' ||
    message.includes('jwt expired') ||
    message.includes('invalid JWT') ||
    message.includes('invalid_claim') ||
    message.includes('token expired')
  );
}

/**
 * Executes a Supabase operation with automatic token refresh retry if a 401/JWT error occurs.
 */
export async function executeWithSessionCheck<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    if (isAuthOrSessionError(error)) {
      console.warn('Authentication token expired during operation. Attempting session refresh...');
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && data.session) {
        return await operation();
      }
    }
    throw error;
  }
}

