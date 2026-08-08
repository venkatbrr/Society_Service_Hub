import { Platform } from 'react-native';

/**
 * The public origin of the current environment, with no trailing slash.
 *
 * On web this is always the origin actually being served, so preprod share
 * links stay on preprod and prod links stay on prod without any configuration.
 *
 * On native there is no origin to read, so it comes from EXPO_PUBLIC_SITE_URL,
 * set per EAS build profile (see eas.json). The fallback is the live prod host
 * and exists only so a misconfigured build produces working links rather than
 * broken ones — update it when the custom domain is live.
 */
const FALLBACK_SITE_URL = 'https://commloom.vercel.app';

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
