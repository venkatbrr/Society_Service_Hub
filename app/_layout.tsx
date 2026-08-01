import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, LogBox, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { Verandah } from '../constants/Colors';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { NotificationProvider } from '../context/NotificationContext';
import { configureGoogleSignIn } from '../lib/auth';

// Notifications module — native only (Android/iOS).
let Notifications: typeof import('expo-notifications') | null = null;
if (Platform.OS !== 'web') {
  Notifications = require('expo-notifications');
}

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
  const savedTargetRouteRef = useRef<string | null>(null);

  // Initialize Google Sign In when the layout mounts
  useEffect(() => {
    try {
      configureGoogleSignIn();
    } catch (e) {
      console.warn('Failed to configure Google Sign-In', e);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const originalWarn = console.warn;
    console.warn = (...args: any[]) => {
      const first = args[0];
      if (
        typeof first === 'string' &&
        first.includes('props.pointerEvents is deprecated. Use style.pointerEvents')
      ) {
        return;
      }
      originalWarn(...args);
    };

    return () => {
      console.warn = originalWarn;
    };
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'login';
    const isWebRootPath = Platform.OS === 'web' && pathname === '/';
    const isPublicFoodDropRoute =
      pathname === '/network/drops' ||
      pathname.startsWith('/network/drops/');
    const currentRoute = String(segments[0] ?? '');
    const isOnTabsRoute = currentRoute === '(tabs)';
    const isOnAdminRedirect = currentRoute === 'admin-redirect';
    const isOnCommunityRequest = currentRoute === 'community-request';
    const isOnCommunityRequestSubmitted = currentRoute === 'community-request-submitted';
    const isOnCommunitySelect = currentRoute === 'community-select';

    let redirectTo: string | null = null;

    if (!session) {
      // No session → login
      if (!inAuthGroup && !isPublicFoodDropRoute && !isWebRootPath) {
        if (pathname && pathname !== '/' && pathname !== '/login') {
          savedTargetRouteRef.current = pathname;
        }
        redirectTo = '/login';
      }
    } else if (isPlatformAdmin) {
      // Platform admin on web → direct to full page web console
      if (Platform.OS === 'web' && typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin')) {
        window.location.replace('/admin/index.html');
        return;
      }
      if (!isOnAdminRedirect) {
        redirectTo = '/admin-redirect';
      }
    } else if (isOnAdminRedirect) {
      // Non-admin landed on admin-redirect route → redirect appropriately
      if (communityId) {
        redirectTo = savedTargetRouteRef.current || '/(tabs)';
        savedTargetRouteRef.current = null;
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
      // Has community → main app or saved target route
      redirectTo = savedTargetRouteRef.current || '/(tabs)';
      savedTargetRouteRef.current = null;
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
      (redirectTo === '/admin-redirect' && isOnAdminRedirect) ||
      (redirectTo !== '/(tabs)' && redirectTo !== '/admin-redirect' && pathname === redirectTo);

    if (!alreadyOnTarget) {
      lastRedirectRef.current = redirectTo;
      router.replace(redirectTo as any);
    }
  }, [
    session,
    communityId,
    activeCommunityRequest,
    isPlatformAdmin,
    isLoading,
    segments,
    pathname,
  ]);

  useEffect(() => {
    if (Platform.OS === 'web' || !Notifications) return;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = (response.notification.request.content.data ?? {}) as {
        kind?: string;
        provider_id?: string;
        hire_id?: string;
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
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Verandah.surface }}>
        <ActivityIndicator size="large" color={Verandah.accent} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Verandah.surface },
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
          <StatusBar style="dark" />
        </NotificationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
