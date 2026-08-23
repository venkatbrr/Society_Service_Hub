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

/**
 * Where a signed-in resident lands when no more specific destination applies:
 * after login, after joining a community, and after picking a flat.
 *
 * The MCN hub, not the Help tab at `/` — MCN is the app's centre of gravity and
 * is already the default parent in `getImmediateParentRoute()`. Written without
 * the `(tabs)` group so it compares equal to `usePathname()`, which never
 * includes group segments. A saved deep link (`wooru.pendingRoute`) still wins
 * over this.
 */
export const POST_AUTH_LANDING_ROUTE = '/network';

/**
 * Browser back/forward arrival detection.
 *
 * Redirect-only routes (the auth/community guard in `app/_layout.tsx`) navigate
 * away the instant they mount. That is right when the user arrives going
 * FORWARD, but it makes them unreachable going BACKWARD: browser-back lands on
 * the guarded route, the guard fires `replace()`, and the user is thrown forward
 * again — so back appears to jump several screens or to bounce to a redirect
 * target. A guard that knows the direction can step further back instead.
 *
 * This only OBSERVES popstate. It never calls preventDefault and never
 * navigates — expo-router owns popstate handling, and racing it is what
 * corrupted browser history before (see the module header).
 */
let sawPopStateAt = 0;
const POP_ARRIVAL_WINDOW_MS = 700;

/**
 * Monotonic popstate counter, read only by the stack sync.
 *
 * Deliberately separate from `sawPopStateAt`: the redirect guard consumes that
 * flag via `consumeHistoryPop()`, and effects in `app/_layout.tsx` may run
 * before ours. Sharing one flag would mean whichever effect ran first ate the
 * signal and the other silently misread the navigation as a forward push.
 */
let popStateSeq = 0;

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    sawPopStateAt = Date.now();
    popStateSeq += 1;
  });
}

/**
 * Tell the tracker that the popstate it just observed belonged to a UI overlay
 * (see `components/ImageViewer.tsx`), not to a route change.
 *
 * An overlay that wants the browser back button to dismiss it has to own a real
 * history entry, so popping that entry fires a genuine `popstate` at the SAME
 * url. The listener above cannot tell that apart from a route pop, and because
 * the pathname never changes, `syncNavigationStack` never runs to re-sync
 * `lastSeenPopSeq`. Left alone, the counter stays permanently ahead: the next
 * undeclared `router.push()` resolves as `locate` instead of `push`, and a push
 * to a route already in the stack then truncates it — the exact desync class
 * documented in `docs/CLAUDE.md`.
 *
 * Call this from the overlay's own popstate handler, i.e. AFTER the listener
 * above has already counted the event.
 */
export function noteOverlayHistoryPop() {
  lastSeenPopSeq = popStateSeq;
  sawPopStateAt = 0;
}

/** True when the current route was reached via browser back/forward. */
export function arrivedViaHistoryPop(): boolean {
  return sawPopStateAt !== 0 && Date.now() - sawPopStateAt < POP_ARRIVAL_WINDOW_MS;
}

/**
 * `arrivedViaHistoryPop()`, but clears the flag so only the first caller after a
 * pop sees it. Consuming matters: the redirect guard re-runs on unrelated state
 * changes too, and a sticky flag would suppress legitimate forward redirects.
 */
export function consumeHistoryPop(): boolean {
  const popped = arrivedViaHistoryPop();
  sawPopStateAt = 0;
  return popped;
}

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
 * A fresh document load starts React Navigation with an empty stack, but
 * sessionStorage survives reloads — so without this the tracked stack claims a
 * depth the app cannot actually pop through. `goBackSmart` would then read a
 * `previousRoute` that no longer exists in this document and pop into it.
 *
 * Runs once per document load (module init), NOT on client-side navigation.
 */
if (canUseSessionStorage()) {
  writeStack([normalizeRoute(window.location.pathname)]);
}

/**
 * What kind of navigation produced the route we just landed on.
 *
 * The stack must be TOLD this. It cannot be inferred from the pathname, because
 * "navigate to a route that is already in the stack" and "go back to that route"
 * are the same observation with opposite effects on history:
 *
 *   stack [N, B, L, M], replace(B)  ->  real [N, B, L, B]  (4 entries, M gone)
 *   stack [N, B, L, B], back()      ->  real [N, B, L]     (3 entries)
 *
 * The old implementation guessed "already in the stack means back" and truncated
 * to [N, B] for both. After a post-delete replace the tracked stack claimed depth
 * 2 while the browser held 4, so `goBackSmart` believed a pop would land on the
 * parent and called `router.back()` — which popped to the record the user had
 * just deleted. Every wrong-destination and dead-back-button report traces to
 * this one ambiguity.
 */
type NavIntent = 'push' | 'replace' | 'back';

let pendingIntent: NavIntent | null = null;

/**
 * Declare the next navigation's kind. Called by the tracked helpers below; the
 * flag is consumed by the very next `syncNavigationStack` and never persists.
 */
export function setNavIntent(intent: NavIntent) {
  pendingIntent = intent;
}

let lastSeenPopSeq = 0;

/**
 * Route we just correctly landed on via a genuine browser-back, and when.
 * Armed by the reducer's `locate`-with-truncation case (a real pop), read by
 * the spurious-drift guard below, and cleared by any subsequent explicit
 * navigation. See that guard for why this exists.
 */
let lastPopLandedRoute: string | null = null;
let lastPopLandedAt = 0;

/**
 * How long after a genuine pop we still treat an unexplained jump to
 * `POST_AUTH_LANDING_ROUTE` as the drift bug below, rather than a real user
 * navigation. Measured drift lands ~180ms after the popstate in local
 * testing (three `history.replaceState` calls back to back); this leaves
 * headroom for slower devices while staying well under normal human
 * click-reaction time, so a deliberate tap of the Network tab right after
 * pressing back is very unlikely to be swallowed by this guard.
 */
const SPURIOUS_DRIFT_WINDOW_MS = 600;

/**
 * Resolve how we arrived, preferring hard signals over guesses:
 *
 *   1. An explicit intent from `pushTracked`/`replaceTracked`/`backTracked`.
 *      Every `router.replace()` in the app routes through `replaceTracked`, so
 *      a replace is ALWAYS explicit — nothing below has to detect one.
 *   2. Web — a popstate since the last sync means the browser's own back or
 *      forward button moved us. Direction is unknown, so this is the one case
 *      where locating the route in the stack is right: back truncates to it,
 *      forward re-appends it.
 *   3. Web, no popstate — a plain `router.push()`. Appending is correct even
 *      when the route is already in the stack (tab bar Home → Network → Home
 *      genuinely grows history), which is exactly what the old lastIndexOf
 *      inference got wrong.
 *   4. Native has no History API and no popstate. A pop always lands on the
 *      entry directly beneath the current one, so that check identifies raw
 *      `router.back()`, hardware back, and swipe-back; anything else is a push.
 *
 * `window.history.length` looks like a tempting push-vs-replace signal and is
 * not one: after a back, a push DROPS the forward entries, so the length can
 * shrink on a push. Explicit intents make it unnecessary anyway.
 */
function resolveIntent(route: string, stack: string[]): NavIntent | 'locate' {
  const explicit = pendingIntent;
  pendingIntent = null;
  if (explicit) return explicit;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (popStateSeq !== lastSeenPopSeq) {
      lastSeenPopSeq = popStateSeq;
      return 'locate';
    }
    return 'push';
  }

  if (stack.length >= 2 && stack[stack.length - 2] === route) return 'back';
  return 'push';
}

/**
 * Reconcile the tracked stack with the route we just landed on, applying the
 * resolved intent rather than guessing from the pathname.
 *
 * `router` is optional only so the function stays callable without one; pass
 * it (as `useSyncedBackNavigation` does) to enable the spurious-drift guard
 * below. Without it, that guard is inert and everything else is unchanged.
 */
function syncNavigationStack(pathname: string, router?: ReturnType<typeof useRouter>): string[] {
  const route = normalizeRoute(pathname);
  if (!route) return readStack();

  const stack = readStack();

  // First route of the session.
  if (!stack.length) {
    lastSeenPopSeq = popStateSeq;
    pendingIntent = null;
    lastPopLandedRoute = null;
    writeStack([route]);
    return [route];
  }

  // Re-render on the same route: nothing moved, and consuming the intent here
  // would eat a signal meant for the navigation that follows.
  if (stack[stack.length - 1] === route) return stack;

  const hadExplicitIntent = pendingIntent !== null;
  const intent = resolveIntent(route, stack);

  // Spurious post-pop drift guard (web only — confirmed upstream expo-router
  // bug, see docs/CLAUDE.md known traps: "browser-back from a nested /mcn/*
  // screen"). A genuine browser-back can resolve the URL correctly for one
  // render and then, ~180ms later with no new popstate and nothing in this
  // app declaring a navigation, expo-router's own web history sync
  // independently re-resolves to POST_AUTH_LANDING_ROUTE on its own. That
  // fingerprint — unexplained, un-popstated, lands specifically on the
  // default landing route, shortly after a real pop to somewhere else — is
  // narrow enough to safely reverse. This does not race expo-router mid-pop
  // the way the historical popstate-interception bug did: it only acts once
  // expo-router's own (wrong) resolution has already fully committed.
  if (
    router &&
    Platform.OS === 'web' &&
    !hadExplicitIntent &&
    intent === 'push' &&
    lastPopLandedRoute &&
    route === normalizeRoute(POST_AUTH_LANDING_ROUTE) &&
    route !== lastPopLandedRoute &&
    Date.now() - lastPopLandedAt < SPURIOUS_DRIFT_WINDOW_MS
  ) {
    const correctTo = lastPopLandedRoute;
    lastPopLandedRoute = null;
    replaceTracked(router, correctTo as any);
    return stack;
  }

  let next: string[];
  switch (intent) {
    case 'replace':
      lastPopLandedRoute = null;
      next = [...stack.slice(0, -1), route];
      break;
    case 'back':
      lastPopLandedRoute = null;
      next = stack.slice(0, -1);
      // Defensive: if we popped to something other than expected, trust the URL.
      if (next[next.length - 1] !== route) next = [...next.slice(0, -1), route];
      break;
    case 'locate': {
      const existingIndex = stack.lastIndexOf(route);
      if (existingIndex >= 0) {
        lastPopLandedRoute = route;
        lastPopLandedAt = Date.now();
      } else {
        lastPopLandedRoute = null;
      }
      next = existingIndex >= 0 ? stack.slice(0, existingIndex + 1) : [...stack, route];
      break;
    }
    case 'push':
    default:
      lastPopLandedRoute = null;
      next = [...stack, route];
      break;
  }

  writeStack(next);
  return next;
}

/** The route the user was on immediately before the current one, if we know it. */
export function getPreviousRoute(): string | null {
  const stack = readStack();
  return stack.length >= 2 ? stack[stack.length - 2] : null;
}

/**
 * `router.replace()` that tells the stack what it did.
 *
 * replace() overwrites the current history entry, so the outgoing route leaves
 * real history while the incoming one takes its slot — depth is unchanged. On
 * web `resolveIntent` can see that from `history.length`, so an un-converted
 * `router.replace()` is no longer a correctness bug there. On native there is no
 * such signal, so prefer this everywhere.
 */
export function replaceTracked(
  router: ReturnType<typeof useRouter>,
  route: Parameters<ReturnType<typeof useRouter>['replace']>[0]
) {
  setNavIntent('replace');
  router.replace(route);
}

/** `router.push()` that tells the stack what it did. */
export function pushTracked(
  router: ReturnType<typeof useRouter>,
  route: Parameters<ReturnType<typeof useRouter>['push']>[0]
) {
  setNavIntent('push');
  router.push(route);
}

/**
 * `router.back()` that tells the stack what it did.
 *
 * On web this is belt-and-braces — programmatic back fires popstate, which the
 * sync would catch anyway. On native it is required: nothing else distinguishes
 * a pop from a push.
 */
export function backTracked(router: ReturnType<typeof useRouter>) {
  setNavIntent('back');
  router.back();
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

  // 3. Menus
  if (cleanPath.startsWith('/mcn/drops/manage/')) {
    const dropId = cleanPath.replace('/mcn/drops/manage/', '');
    return dropId ? `/mcn/drops/${dropId}` : '/mcn/drops';
  }
  if (cleanPath === '/mcn/drops/manage') return '/mcn/drops';
  if (cleanPath.startsWith('/mcn/drops/')) return '/mcn/drops';
  if (cleanPath === '/mcn/drops') return '/network';

  // 4. Carpools
  if (cleanPath === '/mcn/carpools/add') {
    // Editing an existing ride belongs to that ride; creating belongs to the list.
    const rideId = params.get('id');
    return rideId ? `/mcn/carpools/${rideId}` : '/mcn/carpools';
  }
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
  // Business listings and menus are sibling tabs of one hub card, not
  // parent and child — both go up to the MCN hub.
  if (cleanPath === '/mcn/business') return '/network';

  // 6. General MCN
  if (cleanPath === '/mcn/add') {
    // The post composer is reachable from the hub and from My Submissions.
    return params.get('source') === 'my-posts' ? '/mcn/my-posts' : '/network';
  }
  if (cleanPath === '/mcn/my-orders' || cleanPath === '/mcn/my-posts') return '/network';

  // 7. Personal service reminders & Legal
  if (cleanPath.startsWith('/services/')) return '/services';
  if (cleanPath === '/services') return '/profile';
  if (cleanPath === '/legal') {
    return params.get('returnTo') === 'login' ? '/login' : '/profile';
  }
  if (cleanPath === '/feedback') {
    return '/profile';
  }

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
  // The two ledger screens split out of the fund detail. Both must resolve to
  // their fund, not to the fund list — the catch-all below would send a
  // deep-linked visitor a level too far up.
  if (cleanPath === '/funds/contributions' || cleanPath === '/funds/expenses') {
    const eventId = params.get('event_id');
    return eventId ? `/funds/${eventId}` : '/funds';
  }
  if (cleanPath === '/funds/add') return '/funds';
  if (cleanPath.startsWith('/funds/')) return '/funds';
  if (cleanPath === '/funds') return '/community';

  // 9. Emergency & blood donors (SOS)
  if (cleanPath.startsWith('/sos/')) return '/sos';
  if (cleanPath === '/sos') return '/community';

  // 10. Community blocks/flats management
  if (cleanPath === '/community/blocks' || cleanPath === '/community/flats') return '/community';

  // 11. Community events
  if (cleanPath === '/events/add') {
    const eventId = params.get('id');
    return eventId ? `/events/${eventId}` : '/events';
  }
  if (cleanPath === '/events/coordinators') return '/community';
  if (cleanPath.startsWith('/events/')) return '/events';
  if (cleanPath === '/events') return '/community';

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
    backTracked(router);
    return;
  }

  // Cross-branch jump or deep-link entry: replace so we do not leave a dangling
  // forward entry pointing at the screen the user just dismissed.
  replaceTracked(router, parent as any);
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
    syncNavigationStack(pathname, router);
  }, [pathname, router]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !pathname) return;

    const onBackPress = () => {
      // Drive the pop ourselves and swallow the event (`return true`) instead
      // of deferring to React Navigation's own hardwareBackPress listener
      // (`return false`). `/mcn` is a Stack nested under the root Stack — a
      // shape React Navigation's hardware-back handling has a known bug with
      // (github.com/expo/expo/issues/33489): deferring can pop the wrong
      // navigator and drop straight to the root instead of the previous
      // nested screen. Handling it explicitly here sidesteps that.
      if (typeof router.canGoBack === 'function' && router.canGoBack()) {
        backTracked(router);
        return true;
      }

      // Nothing to pop: the user deep-linked straight into a nested screen.
      // Walk up the hierarchy instead of exiting the app.
      const parent = getImmediateParentRoute(pathname);
      if (parent && normalizeRoute(parent) !== normalizeRoute(pathname)) {
        replaceTracked(router, parent as any);
        return true;
      }

      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [router, pathname]);
}
