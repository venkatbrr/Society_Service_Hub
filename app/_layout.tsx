import { useEffect } from 'react';
import { Stack, useRouter, useSegments, Slot } from 'expo-router';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { configureGoogleSignIn } from '../lib/auth';
import Toast from 'react-native-toast-message';

function RootLayoutNav() {
  const { session, communityId, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Initialize Google Sign In when the layout mounts
  useEffect(() => {
    try {
      configureGoogleSignIn();
    } catch (e) {
      console.warn('Failed to configure Google Sign-In', e);
    }
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)' || segments[0] === 'login';

    if (!session) {
      // If the user isn't signed in and the initial segment is not anything in the auth group.
      router.replace('/login');
    } else if (session && !communityId && segments[0] !== 'community-select') {
      // If the user is signed in but hasn't selected a community
      router.replace('/community-select');
    } else if (session && communityId && (inAuthGroup || segments[0] === 'community-select')) {
      // If the user is signed in and has a community, and tries to visit login/community select
      router.replace('/(tabs)');
    }
  }, [session, communityId, isLoading, segments]);

  if (isLoading) {
    return null; // Or a splash screen
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
      <Toast />
    </AuthProvider>
  );
}
