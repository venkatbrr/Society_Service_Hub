import { Slot, usePathname, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { NotificationProvider } from '../context/NotificationContext';
import { configureGoogleSignIn } from '../lib/auth';

function RootLayoutNav() {
  const { session, communityId, approvalStatus, activeCommunityRequest, isPlatformAdmin, isLoading } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const lastRedirectRef = useRef<string | null>(null);

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
    const currentRoute = String(segments[0] ?? '');
    const isOnTabsRoute = currentRoute === '(tabs)';
    const isOnPlatformRoute = currentRoute === 'platform';
    const isOnCommunityRequest = currentRoute === 'community-request';
    const isOnCommunityRequestSubmitted = currentRoute === 'community-request-submitted';
    const isOnCommunitySelect = currentRoute === 'community-select';
    const isOnPending = currentRoute === 'pending';
    const isOnRejected = currentRoute === 'rejected';

    let redirectTo: string | null = null;

    if (!session) {
      if (!inAuthGroup) {
        redirectTo = '/login';
      }
    } else if (isPlatformAdmin) {
      if (!isOnPlatformRoute) {
        redirectTo = '/platform/approvals';
      }
    } else if (isOnPlatformRoute) {
      if (communityId && approvalStatus === 'approved') {
        redirectTo = '/(tabs)';
      } else if (!communityId && activeCommunityRequest) {
        redirectTo = '/community-request-submitted';
      } else {
        redirectTo = '/community-select';
      }
    } else if (!communityId && activeCommunityRequest && !isOnCommunityRequestSubmitted) {
      redirectTo = '/community-request-submitted';
    } else if (!communityId && !activeCommunityRequest && !isOnCommunitySelect && !isOnCommunityRequest) {
      redirectTo = '/community-select';
    } else if (communityId && approvalStatus === 'pending' && !isOnPending) {
      redirectTo = '/pending';
    } else if (
      communityId &&
      approvalStatus === 'rejected' &&
      !isOnRejected &&
      !isOnCommunityRequest &&
      !isOnCommunityRequestSubmitted
    ) {
      redirectTo = '/rejected';
    } else if (
      communityId &&
      approvalStatus === 'approved' &&
      (inAuthGroup || isOnCommunitySelect || isOnPending || isOnRejected || isOnCommunityRequest || isOnCommunityRequestSubmitted)
    ) {
      redirectTo = '/(tabs)';
    }

    if (!redirectTo) {
      lastRedirectRef.current = null;
      return;
    }

    // Prevent re-entrant navigation: if we already issued this redirect, skip
    if (lastRedirectRef.current === redirectTo) {
      return;
    }

    const alreadyOnTarget =
      (redirectTo === '/(tabs)' && isOnTabsRoute) ||
      (redirectTo === '/platform/approvals' && pathname?.startsWith('/platform')) ||
      (redirectTo !== '/(tabs)' && redirectTo !== '/platform/approvals' && pathname === redirectTo);

    if (!alreadyOnTarget) {
      lastRedirectRef.current = redirectTo;
      router.replace(redirectTo as any);
    }
  }, [session, communityId, approvalStatus, activeCommunityRequest, isPlatformAdmin, isLoading, segments]);

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
