import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, LogBox, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { GlobalBottomNav } from '../components/GlobalBottomNav';
import { WebDesktopFrame } from '../components/WebDesktopFrame';
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

import { consumeHistoryPop, replaceTracked, useSyncedBackNavigation } from '../lib/navigation';

function RootLayoutNav() {
  const { session, profile, communityId, activeCommunityRequest, isPlatformAdmin, isLoading } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const lastRedirectRef = useRef<string | null>(null);
  const savedTargetRouteRef = useRef<string | null>(null);

  const takeSavedRoute = () => {
    let target = savedTargetRouteRef.current;
    if (!target && Platform.OS === 'web' && typeof window !== 'undefined') {
      try { target = window.sessionStorage.getItem('wooru.pendingRoute'); } catch {}
    }
    savedTargetRouteRef.current = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try { window.sessionStorage.removeItem('wooru.pendingRoute'); } catch {}
    }
    return target;
  };

  // Synchronize browser back button and mobile back button to immediate parent routes
  useSyncedBackNavigation();

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
    // A session without a resolved profile is mid-hydration, not "signed in with no community"
    if (session && !profile && !isPlatformAdmin) return;

    const inAuthGroup = segments[0] === 'login';
    const isWebRootPath = Platform.OS === 'web' && pathname === '/';
    const isPublicFoodDropRoute =
      pathname === '/mcn/drops' ||
      pathname.startsWith('/mcn/drops/');
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
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            try { window.sessionStorage.setItem('wooru.pendingRoute', pathname); } catch {}
          }
        }
        redirectTo = '/login';
      } else if (isWebRootPath && typeof window !== 'undefined') {
        // Signed-out visitor at the web root gets the marketing page. This used
        // to live in `app/index.tsx`, which had to be deleted: it also resolved
        // to `/`, colliding with the Home tab at `app/(tabs)/index.tsx`. Two
        // route files on one URL is exactly what corrupts browser history, and
        // the redirect fired whenever back landed on `/` — including for
        // signed-in users on the Home tab, who were thrown to /landing.html.
        //
        // Skip it entirely when the user got here by pressing back, or we
        // recreate that trap.
        if (!consumeHistoryPop()) {
          window.location.replace('/landing.html');
        }
        return;
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
        redirectTo = takeSavedRoute() || '/(tabs)';
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
      // Signed in with a community, but sitting on a transitional screen
      // (login / community-select / request). Going forward, bounce into the
      // app. Going BACKWARD, do not: the user pressed back into a screen they
      // already passed through, and redirecting forward pins them in place —
      // browser back looks like it does nothing, or jumps to whatever tab was
      // last focused. Step further back instead and leave the saved route
      // untouched (takeSavedRoute() consumes it, so it must not run here).
      if (consumeHistoryPop()) {
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history.length > 1) {
          window.history.back();
        }
        return;
      }
      // Has community → main app or saved target route
      redirectTo = takeSavedRoute() || '/(tabs)';
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
      replaceTracked(router, redirectTo as any);
    }
  }, [
    session,
    profile,
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
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Verandah.surface },
          animation: 'slide_from_right',
        }}
      />
      <GlobalBottomNav />
    </View>
  );
}

import { PwaInstallBanner } from '../components/PwaInstallBanner';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificationProvider>
          <WebDesktopFrame>
            <PwaInstallBanner />
            <RootLayoutNav />
            <Toast />
            <StatusBar style="dark" />
          </WebDesktopFrame>
        </NotificationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
