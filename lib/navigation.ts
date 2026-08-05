import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

const HISTORY_STORAGE_KEY = 'ssh_mcn_navigation_stack';

function getSessionStack(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setSessionStack(stack: string[]) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(stack.slice(-20)));
  } catch {
    // Ignore storage quota
  }
}

/**
 * Deterministic mapping of every sub-route to its immediate parent route.
 * This ensures that browser back buttons, hardware back buttons, and in-app
 * back arrows always navigate to the exact immediate parent screen.
 */
export function getImmediateParentRoute(pathname: string): string {
  const cleanPath = pathname.split('?')[0].split('#')[0].replace(/\/$/, '');

  // 1. Parent Corner sub-routes
  if (cleanPath === '/network/parents/add' || (cleanPath.startsWith('/network/parents/') && cleanPath !== '/network/parents')) {
    return '/network/parents';
  }
  if (cleanPath === '/network/parents') {
    return '/(tabs)/network';
  }

  // 2. Schools sub-routes
  if (
    cleanPath === '/network/schools/add' ||
    cleanPath === '/network/schools/compare' ||
    cleanPath === '/network/schools/review' ||
    (cleanPath.startsWith('/network/schools/') && cleanPath !== '/network/schools')
  ) {
    return '/network/schools';
  }
  if (cleanPath === '/network/schools') {
    return '/(tabs)/network';
  }

  // 3. Food Drops sub-routes
  if (cleanPath.startsWith('/network/drops/manage/')) {
    const dropId = cleanPath.replace('/network/drops/manage/', '');
    return `/network/drops/${dropId}`;
  }
  if (
    cleanPath === '/network/drops/add' ||
    (cleanPath.startsWith('/network/drops/') && cleanPath !== '/network/drops')
  ) {
    return '/network/drops';
  }
  if (cleanPath === '/network/drops') {
    return '/(tabs)/network';
  }

  // 4. Carpools sub-routes
  if (
    cleanPath === '/network/carpools/add' ||
    (cleanPath.startsWith('/network/carpools/') && cleanPath !== '/network/carpools')
  ) {
    return '/network/carpools';
  }
  if (cleanPath === '/network/carpools') {
    return '/(tabs)/network';
  }

  // 5. Business Listings sub-routes
  if (cleanPath.startsWith('/network/listing/manage/')) {
    const listingId = cleanPath.replace('/network/listing/manage/', '');
    return `/network/listing/${listingId}`;
  }
  if (cleanPath.startsWith('/network/listing/orders/')) {
    const listingId = cleanPath.replace('/network/listing/orders/', '');
    return `/network/listing/${listingId}`;
  }
  if (cleanPath.startsWith('/network/listing/') && cleanPath !== '/network/listing') {
    return '/network/business';
  }
  if (cleanPath === '/network/listing-add') {
    return '/network/business';
  }
  if (cleanPath === '/network/business') {
    return '/(tabs)/network';
  }

  // 6. General MCN sub-routes
  if (
    cleanPath === '/network/my-orders' ||
    cleanPath === '/network/my-posts' ||
    cleanPath === '/network/add'
  ) {
    return '/(tabs)/network';
  }

  // 7. Service Reminders sub-routes
  if (cleanPath === '/services/add' || (cleanPath.startsWith('/services/') && cleanPath !== '/services')) {
    return '/services';
  }
  if (cleanPath === '/services') {
    return '/(tabs)/profile';
  }

  // Default fallback
  return '/(tabs)/network';
}

/**
 * Reusable smart backward navigation function.
 * Use this in header back buttons or screen back handlers.
 */
export function goBackSmart(router: ReturnType<typeof useRouter>, currentPath: string) {
  const parent = getImmediateParentRoute(currentPath);
  router.replace(parent as any);
}

/**
 * Global hook to keep browser back button and mobile hardware back button
 * in 100% sync with the logical nested hierarchy of the app.
 */
export function useSyncedBackNavigation() {
  const router = useRouter();
  const pathname = usePathname();

  // 1. Maintain in-memory and sessionStorage route stack
  useEffect(() => {
    if (!pathname || Platform.OS !== 'web' || typeof window === 'undefined') return;

    const currentFull = window.location.pathname + window.location.search;
    const stack = getSessionStack();

    // If returning to root MCN tab, reset stack
    if (currentFull === '/network' || currentFull === '/(tabs)/network') {
      setSessionStack(['/(tabs)/network']);
    } else {
      if (stack.length === 0 || stack[stack.length - 1] !== currentFull) {
        stack.push(currentFull);
        setSessionStack(stack);
      }
    }
  }, [pathname]);

  // 2. Handle Browser Back (popstate) and Android Back Button
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      let isNavigating = false;

      const handlePopState = (e: PopStateEvent) => {
        if (isNavigating) return;

        const stack = getSessionStack();
        const currentWebPath = window.location.pathname.split('?')[0].split('#')[0];

        // Pop current top screen
        const poppedRoute = stack.pop();
        setSessionStack(stack);

        const previousRouteInStack = stack[stack.length - 1];

        if (poppedRoute && poppedRoute.startsWith('/network/') && poppedRoute !== '/network') {
          let target = currentWebPath;

          if (currentWebPath === '/network' || currentWebPath === '/' || currentWebPath.startsWith('/(tabs)')) {
            target = previousRouteInStack && previousRouteInStack !== '/network' && previousRouteInStack !== '/(tabs)/network'
              ? previousRouteInStack
              : getImmediateParentRoute(poppedRoute);
          }

          if (target) {
            isNavigating = true;
            router.replace(target as any);

            setTimeout(() => {
              isNavigating = false;
            }, 150);
          }
        }
      };

      window.addEventListener('popstate', handlePopState);
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }

    if (Platform.OS === 'android') {
      const onBackPress = () => {
        if (pathname.startsWith('/network/') || pathname === '/network') {
          const parent = getImmediateParentRoute(pathname);
          router.replace(parent as any);
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }
  }, [router, pathname]);
}
