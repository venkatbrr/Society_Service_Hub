import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Deterministic mapping of every sub-route to its immediate parent route.
 * This ensures that browser back buttons, hardware back buttons, and in-app
 * back arrows always navigate to the exact immediate parent screen.
 */
export function getImmediateParentRoute(pathname: string): string {
  const cleanPath = pathname.split('?')[0].split('#')[0].replace(/\/$/, '');

  // 1. Parent Corner sub-routes
  if (cleanPath === '/network/parents/add' || cleanPath.startsWith('/network/parents/')) {
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
  if (
    cleanPath === '/network/drops/add' ||
    cleanPath.startsWith('/network/drops/manage') ||
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

  // 5. General MCN sub-routes
  if (
    cleanPath === '/network/my-orders' ||
    cleanPath === '/network/my-posts' ||
    cleanPath === '/network/business' ||
    cleanPath === '/network/add' ||
    cleanPath === '/network/listing-add'
  ) {
    return '/(tabs)/network';
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

  useEffect(() => {
    // A. Web Browser Back Button Sync
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      let isNavigating = false;

      const handlePopState = (e: PopStateEvent) => {
        if (isNavigating) return;

        const currentWebPath = window.location.pathname;

        // If we are on an MCN sub-route, enforce immediate parent fallback
        if (currentWebPath.startsWith('/network/') || currentWebPath === '/network') {
          const expectedParent = getImmediateParentRoute(currentWebPath);
          
          // Perform controlled replace to the immediate parent
          isNavigating = true;
          router.replace(expectedParent as any);

          setTimeout(() => {
            isNavigating = false;
          }, 150);
        }
      };

      window.addEventListener('popstate', handlePopState);
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }

    // B. Native Mobile Android Back Button Sync
    if (Platform.OS === 'android') {
      const onBackPress = () => {
        if (pathname.startsWith('/network/') || pathname === '/network') {
          const parent = getImmediateParentRoute(pathname);
          router.replace(parent as any);
          return true; // Handled
        }
        return false; // Default behavior
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }
  }, [router, pathname]);
}
