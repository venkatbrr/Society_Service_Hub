import { Dimensions, Platform } from 'react-native';

/**
 * Verandah Design Language — Non-Color Tokens
 *
 * Verandah is a calm, residentially-warm design language for an app
 * residents open with intent — to look up a phone number, check a fund,
 * log a service. Not for browsing. Not for engagement.
 */

export const VerandahType = {
  serifFamily: Platform.select({
    ios: 'Instrument Serif',
    android: 'Instrument Serif',
    web: "'Instrument Serif', Georgia, serif",
    default: 'serif',
  }),
  sansFamily: Platform.select({
    ios: 'Plus Jakarta Sans',
    android: 'Plus Jakarta Sans',
    web: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    default: 'System',
  }),

  // Font weights
  weightRegular: '400' as const,
  weightMedium: '500' as const,
  weightSemiBold: '600' as const,
  weightBold: '700' as const,
  weightExtraBold: '800' as const,

  // Display & Heading scale (Instrument Serif)
  hero: {
    fontFamily: Platform.select({ ios: 'Instrument Serif', android: 'Instrument Serif', web: "'Instrument Serif', Georgia, serif", default: 'serif' }),
    fontSize: 46,
    lineHeight: 50,
    letterSpacing: -0.4,
    fontWeight: '400' as const,
  },
  screenTitle: {
    fontFamily: Platform.select({ ios: 'Instrument Serif', android: 'Instrument Serif', web: "'Instrument Serif', Georgia, serif", default: 'serif' }),
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.4,
    fontWeight: '400' as const,
  },
  cardTitle: {
    fontFamily: Platform.select({ ios: 'Instrument Serif', android: 'Instrument Serif', web: "'Instrument Serif', Georgia, serif", default: 'serif' }),
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.3,
    fontWeight: '400' as const,
  },
  section: {
    fontFamily: Platform.select({ ios: 'Instrument Serif', android: 'Instrument Serif', web: "'Instrument Serif', Georgia, serif", default: 'serif' }),
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.3,
    fontWeight: '400' as const,
  },
  display: {
    fontFamily: Platform.select({ ios: 'Instrument Serif', android: 'Instrument Serif', web: "'Instrument Serif', Georgia, serif", default: 'serif' }),
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.4,
    fontWeight: '400' as const,
  },

  // UI / Body / Labels scale (Plus Jakarta Sans)
  title: {
    fontFamily: Platform.select({ ios: 'Plus Jakarta Sans', android: 'Plus Jakarta Sans', web: "'Plus Jakarta Sans', sans-serif", default: 'System' }),
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600' as const,
  },
  /**
   * Title of a **repeated feed tile** — the food drop, event, or listing card
   * in a scrolling list.
   *
   * Deliberately sans, and that is the whole point of the token existing.
   * These titles were `serifFamily` at 18/400 until 2026-08-17. Instrument
   * Serif is a high-contrast *display* face drawn for 40px+ headlines: at 18px
   * its hairline strokes fall under a device pixel and anti-alias to grey, and
   * its small x-height left the card's own subject ("Batter") reading lighter
   * than the 11.5px "Home kitchen" caption directly above it. There is also no
   * heavier cut to reach for — the family ships weight 400 only, so a synthetic
   * bold is all `fontWeight` can produce on web.
   *
   * Verandah's serif rule already covers this: serif is for the single largest
   * title anchor on a screen, and a title that repeats once per card is not
   * that anchor. The 22px stack header above the list is.
   *
   * 15/700 sits one step above `bodyBold` (14/600), which is what keeps the
   * title outranking the host name beneath it. Keep serif at >= 22px.
   */
  tileTitle: {
    fontFamily: Platform.select({ ios: 'Plus Jakarta Sans', android: 'Plus Jakarta Sans', web: "'Plus Jakarta Sans', sans-serif", default: 'System' }),
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.1,
    fontWeight: '700' as const,
  },
  body: {
    fontFamily: Platform.select({ ios: 'Plus Jakarta Sans', android: 'Plus Jakarta Sans', web: "'Plus Jakarta Sans', sans-serif", default: 'System' }),
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400' as const,
  },
  bodyBold: {
    fontFamily: Platform.select({ ios: 'Plus Jakarta Sans', android: 'Plus Jakarta Sans', web: "'Plus Jakarta Sans', sans-serif", default: 'System' }),
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600' as const,
  },
  caption: {
    fontFamily: Platform.select({ ios: 'Plus Jakarta Sans', android: 'Plus Jakarta Sans', web: "'Plus Jakarta Sans', sans-serif", default: 'System' }),
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400' as const,
  },
  captionBold: {
    fontFamily: Platform.select({ ios: 'Plus Jakarta Sans', android: 'Plus Jakarta Sans', web: "'Plus Jakarta Sans', sans-serif", default: 'System' }),
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' as const,
  },
  meta: {
    fontFamily: Platform.select({ ios: 'Plus Jakarta Sans', android: 'Plus Jakarta Sans', web: "'Plus Jakarta Sans', sans-serif", default: 'System' }),
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '400' as const,
  },
  micro: {
    fontFamily: Platform.select({ ios: 'Plus Jakarta Sans', android: 'Plus Jakarta Sans', web: "'Plus Jakarta Sans', sans-serif", default: 'System' }),
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '500' as const,
  },
  navLabel: {
    fontFamily: Platform.select({ ios: 'Plus Jakarta Sans', android: 'Plus Jakarta Sans', web: "'Plus Jakarta Sans', sans-serif", default: 'System' }),
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '600' as const,
  },
  button: {
    fontFamily: Platform.select({ ios: 'Plus Jakarta Sans', android: 'Plus Jakarta Sans', web: "'Plus Jakarta Sans', sans-serif", default: 'System' }),
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700' as const,
  },

  // Section labels in small caps
  sectionLabel: {
    fontFamily: Platform.select({ ios: 'Plus Jakarta Sans', android: 'Plus Jakarta Sans', web: "'Plus Jakarta Sans', sans-serif", default: 'System' }),
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
};

export const VerandahSpace = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  xxl: 20,
  xxxl: 28,
  sectionGap: 12,
  cardPadding: 12,
  cardPaddingPromo: 14,
  listRowPadding: 10,
  dividerMargin: 10,
  searchGap: 10,
  chipsGap: 12,
};

export const VerandahRadius = {
  button: 16,
  card: 18,
  search: 13,
  segmented: 12,
  segmentedInner: 9,
  pill: 999,
  chip: 999,
  avatarRound: 999,
  avatarSquare: 14,
  tag: 8,
  tagSm: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 18,
  frame: 28,
};

/**
 * Border widths.
 *
 * `tile` is the single source of truth for the outline of any card/tile
 * surface — feed cards, section panels, grid tiles, stacked list rows. It was
 * `0.5` until 2026-08-14; against the paper/cream background that read as
 * barely-there, so a stack of tiles blurred into one another with no clear
 * edge between the card above and the card below. Every tile uses this value
 * so the stack reads as separate cards, not one continuous surface.
 *
 * `control` stays hairline-thin: chips, badges, inputs, icon buttons and
 * segmented tracks sit *inside* a tile and must not compete with its outline.
 */
export const VerandahBorder = {
  tile: 1,
  control: 0.5,
};

/**
 * Layout tokens that differ between native and web.
 * On native, screens need top padding for the status bar.
 * On web, there is no status bar.
 */
export const VerandahLayout = {
  screenPaddingTop: Platform.select({ web: 16, default: 60 }) as number,
  mcnHeaderToContentGap: 4,
};

const viewportHeight = (windowHeight?: number): number =>
  windowHeight ?? Dimensions.get('window').height;

/**
 * Cover-photo height on a **feed tile** — Pre-order Food, Community Business,
 * and Community Events cards.
 *
 * Sized backwards from a hard requirement: **at least three tiles visible at
 * once**. Screen chrome above and below the list (header, segmented control,
 * chip row, bottom nav) costs a roughly fixed ~270px, so on a phone the list
 * viewport is about `H - 270` and each tile gets `(H - 270) / 3` — around 195px
 * on a 853px screen, including its 10px gap. Whatever the card body does not
 * spend, the photo gets.
 *
 * That makes the photo height a *consequence of the body*, not a free dial.
 * The body was cut to ~72px (host row + one-line title; the timing chips moved
 * onto the photo as an overlay, and the description and the redundant CTA
 * button were dropped) which is what pays for ~14% of viewport here. Growing
 * the photo further now costs a tile: every ~65px added drops one card off the
 * fold. The detail screen is where the photo gets real room — see
 * `getMediaHeroHeight()`.
 *
 * Pass the live height from `useWindowDimensions()` so the tile re-measures on
 * rotation and on browser resize — the no-argument form reads `Dimensions` once
 * and will not update.
 */
export const getNetworkTileImageHeight = (windowHeight?: number): number =>
  Math.round(Math.min(130, Math.max(84, viewportHeight(windowHeight) * 0.115)));

/**
 * Cover-photo height on a **detail screen** hero — the same photo after the
 * resident has chosen to open it.
 *
 * Deliberately much taller than the tile (30% vs ~9%): a tile is competing with
 * the two below it for the fold, a detail screen is the thing you came to look
 * at and has nothing to compete with.
 * Every hero using this must be tappable and paired with `ImageViewer`, since
 * `contentFit="cover"` still crops.
 */
export const getMediaHeroHeight = (windowHeight?: number): number =>
  Math.round(Math.min(280, Math.max(150, viewportHeight(windowHeight) * 0.3)));

/**
 * Formats a 24-hour time string (e.g. "13:00", "09:30")
 * into 12-hour AM/PM format (e.g. "01:00 pm", "09:30 am").
 */
export const format12HourTime = (timeStr: string | null | undefined): string => {
  if (!timeStr) return '';
  const trimmed = timeStr.trim();
  if (/am|pm/i.test(trimmed)) return trimmed;

  const parts = trimmed.split(':');
  if (parts.length >= 2) {
    let hour = parseInt(parts[0], 10);
    const minute = parts[1].slice(0, 2);
    if (isNaN(hour)) return trimmed;
    const ampm = hour >= 12 ? 'pm' : 'am';
    hour = hour % 12;
    if (hour === 0) hour = 12;
    const padHour = String(hour).padStart(2, '0');
    return `${padHour}:${minute} ${ampm}`;
  }
  return trimmed;
};
