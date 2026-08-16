import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Stack, useGlobalSearchParams, usePathname, useRouter, useSegments } from 'expo-router';
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
import { goToLanding } from '../lib/siteUrl';

// Prevent splash screen from auto hiding until fonts are loaded
SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore error if splash screen was already prevented or running in non-supported env
});

// Notifications module — native only (Android/iOS).
let Notifications: typeof import('expo-notifications') | null = null;
if (Platform.OS !== 'web') {
  Notifications = require('expo-notifications');
}

LogBox.ignoreLogs([
  'AuthApiError: Invalid Refresh Token: Refresh Token Not Found',
  'AuthApiError',
]);

import { consumeHistoryPop, POST_AUTH_LANDING_ROUTE, replaceTracked, useSyncedBackNavigation } from '../lib/navigation';

function RootLayoutNav() {
  const { session, profile, communityId, flatId, blocksEnabled, blockLabel, activeCommunityRequest, isPlatformAdmin, isLoading } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams<{ code?: string }>();
  const router = useRouter();
  const lastRedirectRef = useRef<string | null>(null);
  const savedTargetRouteRef = useRef<string | null>(null);
  // Holds a community invite code seen on a route visited while signed out (e.g.
  // `/community-select?code=X`), since `pathname` above never carries the query
  // string. Reapplied once the user has authenticated and needs to join a community.
  const pendingCommunityCodeRef = useRef<string | null>(null);
  // Flipped by the first completed auth resolution of this launch / page load, so
  // the "land on MCN" rule below fires once and never hijacks a later visit to `/`.
  const hasResolvedInitialLandingRef = useRef(false);

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

  const takeSavedCommunityCode = () => {
    let code = pendingCommunityCodeRef.current;
    if (!code && Platform.OS === 'web' && typeof window !== 'undefined') {
      try { code = window.sessionStorage.getItem('wooru.pendingCommunityCode'); } catch {}
    }
    pendingCommunityCodeRef.current = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try { window.sessionStorage.removeItem('wooru.pendingCommunityCode'); } catch {}
    }
    return code;
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

    const inAuthGroup = segments[0] === 'login' || segments[0] === 'login-phone' || segments[0] === 'forgot-password';
    const isWebRootPath = Platform.OS === 'web' && pathname === '/';
    const isPublicFoodDropRoute =
      pathname === '/mcn/drops' ||
      pathname.startsWith('/mcn/drops/');
    const isPublicLegalRoute =
      segments[0] === 'legal' ||
      pathname === '/legal' ||
      pathname.startsWith('/legal?');
    const currentRoute = String(segments[0] ?? '');
    const isOnAdminRedirect = currentRoute === 'admin-redirect';
    const isOnCommunityRequest = currentRoute === 'community-request';
    const isOnCommunityRequestSubmitted = currentRoute === 'community-request-submitted';
    const isOnCommunitySelect = currentRoute === 'community-select';
    const isOnCommunityJoinBlock = currentRoute === 'community-join-block';

    let redirectTo: string | null = null;

    if (!session) {
      // No session → login (except for public / auth routes)
      if (!inAuthGroup && !isPublicLegalRoute && !isPublicFoodDropRoute && !isWebRootPath) {
        if (pathname && pathname !== '/' && pathname !== '/login' && pathname !== '/login-phone') {
          savedTargetRouteRef.current = pathname;
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            try { window.sessionStorage.setItem('wooru.pendingRoute', pathname); } catch {}
          }
        }
        const inviteCode = typeof globalParams.code === 'string' ? globalParams.code.trim() : '';
        if (inviteCode) {
          pendingCommunityCodeRef.current = inviteCode;
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            try { window.sessionStorage.setItem('wooru.pendingCommunityCode', inviteCode); } catch {}
          }
        }
        redirectTo = '/login';
      } else if (isWebRootPath && typeof window !== 'undefined') {
        if (!consumeHistoryPop()) {
          goToLanding();
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
        if (blocksEnabled && !flatId) {
          redirectTo = '/community-join-block';
        } else {
          redirectTo = takeSavedRoute() || POST_AUTH_LANDING_ROUTE;
        }
      } else if (activeCommunityRequest) {
        redirectTo = '/community-request-submitted';
      } else {
        const pendingCode = takeSavedCommunityCode();
        redirectTo = pendingCode ? `/community-select?code=${encodeURIComponent(pendingCode)}` : '/community-select';
      }
    } else if (!communityId && activeCommunityRequest && !isOnCommunityRequestSubmitted) {
      // Has pending request, show status screen
      redirectTo = '/community-request-submitted';
    } else if (!communityId && !activeCommunityRequest && !isOnCommunitySelect && !isOnCommunityRequest) {
      // No community, no request → select/request community
      const pendingCode = takeSavedCommunityCode();
      redirectTo = pendingCode ? `/community-select?code=${encodeURIComponent(pendingCode)}` : '/community-select';
    } else if (communityId) {
      const needsFlatSelection = Boolean(blocksEnabled && !flatId);

      if (needsFlatSelection) {
        // In block-enabled community without flat selected → route to flat picker
        if (!isOnCommunityJoinBlock) {
          redirectTo = '/community-join-block';
        }
      } else {
        // Flat selected or no blocks enabled
        if (isOnCommunityJoinBlock) {
          redirectTo = POST_AUTH_LANDING_ROUTE;
        } else if (inAuthGroup || isOnCommunitySelect || isOnCommunityRequest || isOnCommunityRequestSubmitted) {
          if (consumeHistoryPop()) {
            if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history.length > 1) {
              window.history.back();
            }
            return;
          }
          redirectTo = takeSavedRoute() || POST_AUTH_LANDING_ROUTE;
        } else if (!hasResolvedInitialLandingRef.current && pathname === '/') {
          // Cold start / page load with a live session: `/` here is the framework's
          // initial route, not a screen the user chose, so send them to the MCN hub
          // too. One-shot — tapping Help later still opens `/` normally.
          redirectTo = takeSavedRoute() || POST_AUTH_LANDING_ROUTE;
        }
      }
    }

    hasResolvedInitialLandingRef.current = true;

    if (!redirectTo) {
      lastRedirectRef.current = null;
      return;
    }

    // Prevent re-entrant navigation
    if (lastRedirectRef.current === redirectTo) {
      return;
    }

    const alreadyOnTarget =
      (redirectTo === '/admin-redirect' && isOnAdminRedirect) ||
      (redirectTo !== '/admin-redirect' && pathname === redirectTo);

    if (!alreadyOnTarget) {
      lastRedirectRef.current = redirectTo;
      replaceTracked(router, redirectTo as any);
    }
  }, [
    session,
    profile,
    communityId,
    flatId,
    blocksEnabled,
    blockLabel,
    activeCommunityRequest,
    isPlatformAdmin,
    isLoading,
    segments,
    pathname,
    globalParams.code,
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
import { NotificationPermissionBanner } from '../components/NotificationPermissionBanner';
import { IosInstallBanner } from '../components/IosInstallBanner';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Instrument Serif': require('../assets/fonts/InstrumentSerif-Regular.ttf'),
    'InstrumentSerif-Regular': require('../assets/fonts/InstrumentSerif-Regular.ttf'),
    'InstrumentSerif-Italic': require('../assets/fonts/InstrumentSerif-Italic.ttf'),
    'Plus Jakarta Sans': require('../assets/fonts/PlusJakartaSans-Regular.ttf'),
    'PlusJakartaSans-Regular': require('../assets/fonts/PlusJakartaSans-Regular.ttf'),
    'PlusJakartaSans-Medium': require('../assets/fonts/PlusJakartaSans-Medium.ttf'),
    'PlusJakartaSans-SemiBold': require('../assets/fonts/PlusJakartaSans-SemiBold.ttf'),
    'PlusJakartaSans-Bold': require('../assets/fonts/PlusJakartaSans-Bold.ttf'),
    'PlusJakartaSans-ExtraBold': require('../assets/fonts/PlusJakartaSans-ExtraBold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificationProvider>
          <WebDesktopFrame>
            <PwaInstallBanner />
            <IosInstallBanner />
            <NotificationPermissionBanner />
            <RootLayoutNav />
            <Toast />
            <StatusBar style="dark" />
          </WebDesktopFrame>
        </NotificationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
