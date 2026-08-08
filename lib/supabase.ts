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

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be configured in environment variables.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(storageAdapter ? { storage: storageAdapter } : {}),
    autoRefreshToken: true,
    persistSession: true,
    flowType: 'pkce',
    detectSessionInUrl: Platform.OS === 'web',
  },
});
