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
 * Full-page navigation to the marketing home page. Web only — native has no
 * landing page, so callers must route to `/login` instead. Returns false when
 * there was nothing to navigate (native, or no `window`).
 */
export function goToLanding(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  window.location.replace(landingPath());
  return true;
}
