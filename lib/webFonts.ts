import { Platform } from 'react-native';

/**
 * Guarantees the Verandah families exist on web without blocking first paint.
 *
 * On native, `expo-font`'s `useFonts()` is mandatory — naming a family in a
 * style without loading its asset silently falls back to the system font. On
 * web it is pure cost: the shipped shell already links the Google Fonts
 * stylesheet (`APP_SHELL_HEAD` in `build-admin.js`), which serves the same two
 * families as woff2 with `display=swap`, while `useFonts()` additionally pulled
 * ~440 KB of local TTFs **and held the whole React tree behind them** — the app
 * rendered nothing at all until the last one arrived.
 *
 * The dev server serves Expo's own boilerplate shell and never runs
 * `build-admin.js`, so the stylesheet is injected here when it is missing.
 * Idempotent: it checks for an existing fonts.googleapis.com link first.
 */
const FONT_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';

export function ensureWebFonts(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  const alreadyLinked = Array.from(
    document.querySelectorAll('link[rel="stylesheet"]')
  ).some((link) => (link as HTMLLinkElement).href.includes('fonts.googleapis.com'));

  if (alreadyLinked) return;

  const preconnect = document.createElement('link');
  preconnect.rel = 'preconnect';
  preconnect.href = 'https://fonts.gstatic.com';
  preconnect.crossOrigin = 'anonymous';
  document.head.appendChild(preconnect);

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = FONT_CSS_URL;
  document.head.appendChild(stylesheet);
}
