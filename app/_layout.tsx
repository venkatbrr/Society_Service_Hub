import * as Notifications from 'expo-notifications';
import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { NotificationProvider } from '../context/NotificationContext';
import { configureGoogleSignIn } from '../lib/auth';

LogBox.ignoreLogs([
  'AuthApiError: Invalid Refresh Token: Refresh Token Not Found',
  'AuthApiError',
]);

function RootLayoutNav() {
  const { session, communityId, activeCommunityRequest, isPlatformAdmin, isLoading } = useAuth();
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

    let redirectTo: string | null = null;

    if (!session) {
      // No session → login
      if (!inAuthGroup) {
        redirectTo = '/login';
      }
    } else if (isPlatformAdmin) {
      // Platform admin → platform console
      if (!isOnPlatformRoute) {
        redirectTo = '/platform/approvals';
      }
    } else if (isOnPlatformRoute) {
      // Non-admin landed on platform route → redirect appropriately
      if (communityId) {
        redirectTo = '/(tabs)';
      } else if (activeCommunityRequest) {
        redirectTo = '/community-request-submitted';
      } else {
        redirectTo = '/community-select';
      }
    } else if (!communityId && activeCommunityRequest && !isOnCommunityRequestSubmitted) {
      // Has pending request, show status screen
      redirectTo = '/community-request-submitted';
    } else if (!communityId && !activeCommunityRequest && !isOnCommunitySelect && !isOnCommunityRequest) {
      // No community, no request → select/request community
      redirectTo = '/community-select';
    } else if (
      communityId &&
      (inAuthGroup || isOnCommunitySelect || isOnCommunityRequest || isOnCommunityRequestSubmitted)
    ) {
      // Has community → main app
      redirectTo = '/(tabs)';
    }

    if (!redirectTo) {
      lastRedirectRef.current = null;
      return;
    }

    // Prevent re-entrant navigation
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
  }, [session, communityId, activeCommunityRequest, isPlatformAdmin, isLoading, segments]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = (response.notification.request.content.data ?? {}) as {
        kind?: string;
        hire_id?: string;
        provider_id?: string;
      };

      if (data.kind === 'hire_feedback' && data.hire_id) {
        router.push({
          pathname: '/hire-feedback/[hireId]',
          params: {
            hireId: String(data.hire_id),
            provider_id: data.provider_id ? String(data.provider_id) : undefined,
          },
        } as any);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

  if (isLoading) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#F0FDF4' },
        animation: 'slide_from_right',
      }}
    />
  );
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
