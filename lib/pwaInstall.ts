/** Check if the app is already running as an installed PWA */
export function isRunningAsInstalledPwa(): boolean {
  if (typeof window === 'undefined') return false;
  // Check display-mode standalone (Chrome / Edge)
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // Check iOS standalone mode
  if ((window.navigator as any).standalone === true) return true;
  return false;
}

/**
 * iPadOS 13+ reports itself as `MacIntel`, so the user agent alone misses
 * iPads — a "Mac" that also reports touch points is actually an iPad.
 */
function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * True only for Safari on iOS/iPadOS — the one iOS browser whose "Add to
 * Home Screen" flow this app's install nudges are written for.
 *
 * Every iOS browser is WebKit under the hood, but only Safari's user agent
 * lacks a vendor marker: Chrome is `CriOS`, Firefox `FxiOS`, Edge `EdgiOS`,
 * Opera `OPiOS`. Their Add to Home Screen flow differs (or is unavailable),
 * so instructions written for Safari would be wrong there — gate to Safari
 * rather than show a mismatched prompt.
 *
 * Duplicated in `public/landing.html` (search `isIOSSafari`) — that file is
 * static and outside the bundle, so it cannot import this. Keep both in sync;
 * each carries a comment pointing at the other, matching how `build-admin.js`
 * documents its own `APP_SHELL_HEAD` duplication.
 */
export function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return isIOSDevice() && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}
