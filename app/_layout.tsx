import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { NotificationProvider } from '../context/NotificationContext';
import { configureGoogleSignIn } from '../lib/auth';

function RootLayoutNav() {
  const { session, communityId, approvalStatus, activeCommunityRequest, isLoading } = useAuth();
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

    const inAuthGroup = segments[0] === 'login';
    const currentRoute = segments[0] ?? '';
    const isOnCommunityRequest = currentRoute === 'community-request';
    const isOnCommunityRequestSubmitted = currentRoute === 'community-request-submitted';
    const isOnCommunitySelect = currentRoute === 'community-select';
    const isOnPending = currentRoute === 'pending';
    const isOnRejected = currentRoute === 'rejected';

    if (!session) {
      if (!inAuthGroup) {
        router.replace('/login');
      }
    } else if (!communityId && activeCommunityRequest && !isOnCommunityRequestSubmitted) {
      router.replace('/community-request-submitted');
    } else if (!communityId && !activeCommunityRequest && !isOnCommunitySelect && !isOnCommunityRequest) {
      router.replace('/community-select');
    } else if (communityId && approvalStatus === 'pending' && !isOnPending) {
      router.replace('/pending');
    } else if (
      communityId &&
      approvalStatus === 'rejected' &&
      !isOnRejected &&
      !isOnCommunityRequest &&
      !isOnCommunityRequestSubmitted
    ) {
      router.replace('/rejected');
    } else if (
      communityId &&
      approvalStatus === 'approved' &&
      (inAuthGroup || isOnCommunitySelect || isOnPending || isOnRejected || isOnCommunityRequest || isOnCommunityRequestSubmitted)
    ) {
      router.replace('/(tabs)');
    }
  }, [session, communityId, approvalStatus, activeCommunityRequest, isLoading, segments]);

  if (isLoading) {
    return null; // Or a splash screen
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificationProvider>
          <RootLayoutNav />
          <Toast />
        </NotificationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
