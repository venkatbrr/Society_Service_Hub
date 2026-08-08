import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Navigation model
 * ================
 *
 * There are two different, both-valid meanings of "back", and this module keeps
 * them separate:
 *
 *   1. CHRONOLOGICAL back — the browser back button and the Android hardware
 *      back button. This means "the screen I was on before". expo-router and
 *      React Navigation already implement this correctly, so we do NOT intercept
 *      it. We only step in when there is nothing to pop (deep link / fresh tab),
 *      where the alternative would be leaving the app.
 *
 *   2. HIERARCHICAL up — the header back arrow inside the app. This means "the
 *      logical parent of this screen", which is not always where the user came
 *      from (e.g. My Orders -> drop detail; the parent is the drops catalog).
 *      `goBackSmart()` implements this.
 *
 * The invariant that makes both work:
 *
 *   Forward navigation always uses router.push(), so every screen owns exactly
 *   one browser history entry. Back navigation must therefore POP that entry
 *   (router.back()), never replace it.
 *
 *   router.replace() overwrites the current history entry rather than removing
 *   it, which leaves the browser's back stack one level shallower than the
 *   visual navigation depth and destroys the forward button. Using replace() for
 *   back navigation is what previously made browser-back skip straight to the
 *   MCN hub. We now only replace() when jumping across branches or when there is
 *   genuinely no history to pop.
 */

const STACK_STORAGE_KEY = 'wooru_navigation_stack';
const MAX_TRACKED_ROUTES = 25;

/** Native has no sessionStorage; an in-memory stack is enough there. */
let memoryStack: string[] = [];

const canUseSessionStorage = () =>
  Platform.OS === 'web' && typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';

/**
 * Canonical form of a route for identity comparisons.
 *
 * Strips the query string, the hash, any trailing slash, and expo-router group
 * segments. Groups matter because `/(tabs)/network` and `/network` are the same
 * screen: the group never appears in `window.location.pathname`, but our route
 * literals include it.
 */
export function normalizeRoute(route: string): string {
  if (!route) return '';
  const withoutQuery = route.split('?')[0].split('#')[0];
  const withoutGroups = withoutQuery.replace(/\/\([^)]*\)/g, '');
  const trimmed = withoutGroups.replace(/\/+$/, '');
  return trimmed || '/';
}

function readStack(): string[] {
  if (!canUseSessionStorage()) return memoryStack;
  try {
    const raw = sessionStorage.getItem(STACK_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStack(stack: string[]) {
  const capped = stack.slice(-MAX_TRACKED_ROUTES);
  memoryStack = capped;
  if (!canUseSessionStorage()) return;
  try {
    sessionStorage.setItem(STACK_STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // Ignore quota / private-mode failures — the in-memory copy still works.
  }
}

/**
 * Reconcile the tracked stack with the route we just landed on.
 *
 * If the route is already in the stack the user moved BACK (or jumped sideways
 * to an ancestor), so we truncate to that position. Otherwise it is a forward
 * navigation and we push.
 *
 * This truncate-or-push rule is what keeps the stack self-healing. The previous
 * implementation pushed unconditionally, so every back navigation *grew* the
 * stack and its contents stopped corresponding to real history after the first
 * back press.
 */
function syncNavigationStack(pathname: string): string[] {
  const route = normalizeRoute(pathname);
  if (!route) return readStack();

  const stack = readStack();
  const existingIndex = stack.lastIndexOf(route);

  const next = existingIndex >= 0 ? stack.slice(0, existingIndex + 1) : [...stack, route];

  writeStack(next);
  return next;
}

/** The route the user was on immediately before the current one, if we know it. */
export function getPreviousRoute(): string | null {
  const stack = readStack();
  return stack.length >= 2 ? stack[stack.length - 2] : null;
}

/**
 * Deterministic mapping of every sub-route to its immediate logical parent.
 *
 * Accepts a full path, optionally including a query string, because a few
 * screens have a context-dependent parent (a school report card belongs to the
 * school it reviews; a borrow post opened from My Submissions belongs there).
 */
export function getImmediateParentRoute(pathname: string): string {
  const cleanPath = normalizeRoute(pathname);
  const query = pathname.includes('?') ? pathname.slice(pathname.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query);

  // 1. Parent Corner
  if (cleanPath.startsWith('/mcn/parents/')) return '/mcn/parents';
  if (cleanPath === '/mcn/parents') return '/network';

  // 2. Schools
  if (cleanPath === '/mcn/schools/review') {
    // A report card is written against one school — go back to that school.
    const schoolId = params.get('schoolId');
    return schoolId ? `/mcn/schools/${schoolId}` : '/mcn/schools';
  }
  if (cleanPath.startsWith('/mcn/schools/')) return '/mcn/schools';
  if (cleanPath === '/mcn/schools') return '/network';

  // 3. Food drops
  if (cleanPath.startsWith('/mcn/drops/manage/')) {
    const dropId = cleanPath.replace('/mcn/drops/manage/', '');
    return dropId ? `/mcn/drops/${dropId}` : '/mcn/drops';
  }
  if (cleanPath === '/mcn/drops/manage') return '/mcn/drops';
  if (cleanPath.startsWith('/mcn/drops/')) return '/mcn/drops';
  if (cleanPath === '/mcn/drops') return '/network';

  // 4. Carpools
  if (cleanPath.startsWith('/mcn/carpools/')) return '/mcn/carpools';
  if (cleanPath === '/mcn/carpools') return '/network';

  // 5. Business listings
  if (cleanPath.startsWith('/mcn/listing/manage/')) {
    const listingId = cleanPath.replace('/mcn/listing/manage/', '');
    return listingId ? `/mcn/listing/${listingId}` : '/mcn/business';
  }
  if (cleanPath.startsWith('/mcn/listing/orders/')) {
    const listingId = cleanPath.replace('/mcn/listing/orders/', '');
    return listingId ? `/mcn/listing/${listingId}` : '/mcn/business';
  }
  if (cleanPath.startsWith('/mcn/listing/')) return '/mcn/business';
  if (cleanPath === '/mcn/listing-add') return '/mcn/business';
  // Business listings and food drops are sibling tabs of one hub card, not
  // parent and child — both go up to the MCN hub.
  if (cleanPath === '/mcn/business') return '/network';

  // 6. General MCN
  if (cleanPath === '/mcn/add') {
    // The post composer is reachable from the hub and from My Submissions.
    return params.get('source') === 'my-posts' ? '/mcn/my-posts' : '/network';
  }
  if (cleanPath === '/mcn/my-orders' || cleanPath === '/mcn/my-posts') return '/network';

  // 7. Personal service reminders
  if (cleanPath.startsWith('/services/')) return '/services';
  if (cleanPath === '/services') return '/profile';

  // 7b. Providers & visits (Help tab)
  if (cleanPath === '/provider/add') return '/';
  if (cleanPath.startsWith('/provider/')) return '/';
  if (cleanPath === '/visits/add') return '/';
  if (cleanPath.startsWith('/visits/')) return '/';

  // 8. Community funds
  if (cleanPath === '/funds/add-transaction') {
    const eventId = params.get('event_id');
    return eventId ? `/funds/${eventId}` : '/funds';
  }
  if (cleanPath === '/funds/add') return '/funds';
  if (cleanPath.startsWith('/funds/')) return '/funds';
  if (cleanPath === '/funds') return '/community';

  // Default: the MCN hub.
  return '/network';
}

/**
 * Hierarchical "up" navigation for header back buttons.
 *
 * Pops the history entry when the previous screen already IS the logical parent
 * (the overwhelmingly common case), which keeps browser history, the forward
 * button, and app state in sync. Falls back to replace() only when the parent is
 * somewhere else in the hierarchy, or when there is no history to pop because
 * the screen was opened from a deep link or a fresh tab.
 */
export function goBackSmart(router: ReturnType<typeof useRouter>, currentPath: string) {
  const parent = getImmediateParentRoute(currentPath);
  const normalizedParent = normalizeRoute(parent);
  const previousRoute = getPreviousRoute();

  const canPop = typeof router.canGoBack === 'function' ? router.canGoBack() : false;

  if (canPop && previousRoute && previousRoute === normalizedParent) {
    router.back();
    return;
  }

  // Cross-branch jump or deep-link entry: replace so we do not leave a dangling
  // forward entry pointing at the screen the user just dismissed.
  router.replace(parent as any);
}

/**
 * Keeps the tracked route stack current, and stops Android hardware back from
 * dropping the user out of the app when they deep-linked into a nested screen.
 *
 * Deliberately does NOT intercept the browser's popstate event. expo-router
 * already rebuilds navigation state from the URL on popstate; the previous
 * implementation raced it with its own router.replace() call, which is what
 * corrupted browser back navigation.
 */
export function useSyncedBackNavigation() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    syncNavigationStack(pathname);
  }, [pathname]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !pathname) return;

    const onBackPress = () => {
      // Let React Navigation pop normally whenever it has somewhere to pop to.
      if (typeof router.canGoBack === 'function' && router.canGoBack()) {
        return false;
      }

      // Nothing to pop: the user deep-linked straight into a nested screen.
      // Walk up the hierarchy instead of exiting the app.
      const parent = getImmediateParentRoute(pathname);
      if (parent && normalizeRoute(parent) !== normalizeRoute(pathname)) {
        router.replace(parent as any);
        return true;
      }

      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [router, pathname]);
}
