import { Platform } from 'react-native';
import { supabase } from './supabase';
import { AuthError } from '@supabase/supabase-js';

// Google Sign-In native module — only available on Android/iOS.
// On web, we use Supabase OAuth redirect flow instead.
let GoogleSignin: any = null;
if (Platform.OS !== 'web') {
  GoogleSignin = require('@react-native-google-signin/google-signin').GoogleSignin;
}

export function configureGoogleSignIn() {
  if (Platform.OS === 'web' || !GoogleSignin) return; // no-op on web
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || 'dummy-web-client-id',
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || 'dummy-ios-client-id',
  });
}

/**
 * Signs up a new user with email and password.
 * Optionally includes metadata like full_name.
 */
export const signUpWithEmail = async (email: string, password: string, fullName: string, flatNumber?: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        flat_number: flatNumber || null,
      },
    },
  });
  return { data, error };
};

/**
 * Signs in an existing user with email and password.
 */
export const signInWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
};

/**
 * Sends a password reset email.
 */
export const resetPassword = async (email: string) => {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'wooru://reset-password',
  });
  return { data, error };
};

/**
 * Helper to get a user-friendly error message from Supabase Auth errors.
 */
export const getAuthErrorMessage = (error: AuthError) => {
  switch (error.message) {
    case 'Invalid login credentials':
      return 'Invalid email or password. Please try again.';
    case 'User already registered':
      return 'An account with this email already exists.';
    case 'Email not confirmed':
      return 'Account setup incomplete. If you just signed up, please try signing in again.';
    case 'Signup disabled':
      return 'Signups are currently disabled.';
    default:
      return error.message;
  }
};
