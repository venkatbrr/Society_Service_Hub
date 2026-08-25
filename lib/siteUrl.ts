import { Platform } from 'react-native';

/**
 * The public origin of the current environment, with no trailing slash.
 *
 * On web this is always the origin actually being served, so preprod share
 * links stay on preprod and prod links stay on prod without any configuration.
 *
 * On native there is no origin to read, so it comes from EXPO_PUBLIC_SITE_URL,
 * set per EAS build profile (see eas.json). The fallback exists only so a
 * misconfigured build produces working links rather than broken ones.
 *
 * Points at the custom domain, which is not live yet — until DNS resolves,
 * native builds MUST set EXPO_PUBLIC_SITE_URL explicitly.
 */
const FALLBACK_SITE_URL = 'https://wooru.in';

export function getSiteUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }

  const configured = process.env.EXPO_PUBLIC_SITE_URL;
  const base = configured && configured.length > 0 ? configured : FALLBACK_SITE_URL;

  return base.replace(/\/+$/, '');
}

/** Builds an absolute URL for a path within this environment's site. */
export function siteUrl(pathname: string): string {
  const suffix = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${getSiteUrl()}${suffix}`;
}

/**
 * Where a signed-out web user belongs: the marketing home page.
 *
 * In a deployed build that is the bare origin — `build-admin.js` copies
 * `public/landing.html` over `dist/index.html` and moves the Expo shell to
 * `dist/app.html`, so `https://wooru.in/` *is* the landing page and the URL
 * stays clean.
 *
 * The Expo dev server has no such swap: `/` serves the SPA shell. Sending a
 * dev browser to `/` would load the app, which would find no session, redirect
 * to `/` again, and spin. Dev therefore keeps the explicit `/landing.html`,
 * which Expo serves straight out of `public/`.
 */
export function landingPath(): string {
  return __DEV__ ? '/landing.html' : '/';
}

/**
 * Per-tab marker that the app is running here, read by `public/landing.html`.
 *
 * The Providers screen lives at `/`, and in a deployed build `/` is the
 * marketing page (see `canReloadIntoApp()`), so a browser reload there is served
 * the landing page and ejects the signed-in user out of the app. Pull-to-refresh
 * could dodge that by declining to reload; the browser's own reload button
 * cannot be intercepted at all, so the recovery has to live on the landing page:
 * it forwards back into the app via `/providers`.
 *
 * It keys off this flag rather than the session alone so that only a *reload of
 * a tab that was already in the app* is forwarded. A signed-in resident who
 * deliberately opens wooru.in in a new tab still gets the marketing page,
 * because `sessionStorage` is per-tab and starts empty there.
 *
 * Keep the literal in sync with the copy in `public/landing.html` — that file is
 * static HTML Expo never processes, so it cannot import this one.
 */
const APP_RUNNING_KEY = 'wooru.inApp';

/** Web only; no-op elsewhere. Called once the app has a live session. */
export function markAppRunning(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(APP_RUNNING_KEY, '1');
  } catch {
    /* private mode / storage disabled — the landing page simply will not forward */
  }
}

/** Clears the marker, so the landing page stops forwarding this tab. */
export function clearAppRunning(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(APP_RUNNING_KEY);
  } catch {
    /* best effort */
  }
}

/**
 * Whether a full `window.location.reload()` at the current URL would come back
 * as the app rather than as the marketing page.
 *
 * In a deployed build `/` is NOT the app: `build-admin.js` copies
 * `public/landing.html` over `dist/index.html`, and Vercel resolves the
 * filesystem before the `/:path*` → `/app.html` rewrite, so an existing
 * `dist/index.html` always wins at the root. Every other path falls through the
 * rewrite and is served the SPA shell.
 *
 * The Providers screen lives at `/`, reachable only by client-side navigation.
 * Reloading there therefore fetched the landing page and threw the signed-in
 * user out of the app — which is what a long pull-to-refresh used to do.
 *
 * The Expo dev server has no such swap and serves the SPA at `/`, so this is a
 * production-only constraint.
 */
export function canReloadIntoApp(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  if (__DEV__) return true;
  return window.location.pathname !== '/';
}

/**
 * Full-page navigation to the marketing home page. Web only — native has no
 * landing page, so callers must route to `/login` instead. Returns false when
 * there was nothing to navigate (native, or no `window`).
 */
export function goToLanding(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  // Drop the marker first, or the landing page would forward this tab straight
  // back into the app — an immediate loop on sign-out.
  clearAppRunning();
  window.location.replace(landingPath());
  return true;
}
