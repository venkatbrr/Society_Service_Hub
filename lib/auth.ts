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
 * Completes phone OTP sign-in by sending the MSG91 access_token to the
 * verify-phone-otp Edge Function and setting the resulting Supabase session.
 */
export const signInWithPhoneAccessToken = async (phone: string, accessToken: string) => {
  const { data, error } = await supabase.functions.invoke('verify-phone-otp', {
    body: {
      phone,
      access_token: accessToken,
    },
  });

  if (error) {
    throw error;
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  if (!data?.session) {
    throw new Error('No session returned from authentication server.');
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });

  if (sessionError) {
    throw sessionError;
  }

  return data;
};

/**
 * Links a Google account to the currently authenticated user session.
 * Requires "Enable manual linking" in Supabase Auth settings.
 */
export const linkGoogleIdentity = async () => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const redirectUrl = origin ? `${origin}/profile` : undefined;

  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      queryParams: {
        prompt: 'select_account',
      },
    },
  });

  return { data, error };
};

/**
 * Helper to get a user-friendly error message from Supabase Auth errors.
 */
export const getAuthErrorMessage = (error: AuthError | any) => {
  if (!error) return 'An unexpected error occurred. Please try again.';
  const msg = error.message || String(error);
  switch (msg) {
    case 'Invalid login credentials':
      return 'Invalid email or password. Please try again.';
    case 'User already registered':
      return 'An account with this email already exists.';
    case 'Email not confirmed':
      return 'Please confirm your email first. Check your inbox for the confirmation link we sent you.';
    case 'Signup disabled':
      return 'Sign up is currently disabled. Please try again later.';
    default:
      return msg || 'An unexpected error occurred. Please try again.';
  }
};

