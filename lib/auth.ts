import { Platform } from 'react-native';
import { supabase } from './supabase';
import { siteUrl } from './siteUrl';
import { AuthError } from '@supabase/supabase-js';

// Google Sign-In native module — only available on Android/iOS.
// On web, we use Supabase OAuth redirect flow instead.
let GoogleSignin: any = null;
if (Platform.OS !== 'web') {
  GoogleSignin = require('@react-native-google-signin/google-signin').GoogleSignin;
}

export function configureGoogleSignIn() {
  if (Platform.OS === 'web' || !GoogleSignin) return; // no-op on web

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

  if (!webClientId || !iosClientId) {
    throw new Error(
      'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID and EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must be configured in environment variables.'
    );
  }

  GoogleSignin.configure({
    webClientId,
    iosClientId,
  });
}

/**
 * Signs up a new user with email and password.
 * Optionally includes metadata like full_name.
 */
export const signUpWithEmail = async (email: string, password: string, fullName: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
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
 * Note: A real /reset-password route must be implemented before EMAIL_AUTH_UI_ENABLED is flipped on.
 */
export const resetPassword = async (email: string) => {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: siteUrl('/login'),
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
      return 'Please confirm your email first. Check your inbox for the confirmation link we sent you.';
    case 'Signup disabled':
      return 'Sign up is currently disabled. Please try again later.';
    default:
      return error.message || 'An unexpected error occurred. Please try again.';
  }
};
