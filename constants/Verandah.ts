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
    android: 'serif',
    web: "'Instrument Serif', Georgia, serif",
    default: 'serif',
  }),
  sansFamily: Platform.select({
    ios: 'Plus Jakarta Sans',
    android: 'sans-serif',
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
    fontFamily: Platform.select({ ios: 'Instrument Serif', android: 'serif', web: "'Instrument Serif', Georgia, serif", default: 'serif' }),
    fontSize: 46,
    lineHeight: 50,
    letterSpacing: -0.4,
    fontWeight: '400' as const,
  },
  screenTitle: {
    fontFamily: Platform.select({ ios: 'Instrument Serif', android: 'serif', web: "'Instrument Serif', Georgia, serif", default: 'serif' }),
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.4,
    fontWeight: '400' as const,
  },
  cardTitle: {
    fontFamily: Platform.select({ ios: 'Instrument Serif', android: 'serif', web: "'Instrument Serif', Georgia, serif", default: 'serif' }),
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.3,
    fontWeight: '400' as const,
  },
  section: {
    fontFamily: Platform.select({ ios: 'Instrument Serif', android: 'serif', web: "'Instrument Serif', Georgia, serif", default: 'serif' }),
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.3,
    fontWeight: '400' as const,
  },
  display: {
    fontFamily: Platform.select({ ios: 'Instrument Serif', android: 'serif', web: "'Instrument Serif', Georgia, serif", default: 'serif' }),
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.4,
    fontWeight: '400' as const,
  },

  // UI / Body / Labels scale (Plus Jakarta Sans)
  title: {
    fontFamily: Platform.select({ ios: 'Plus Jakarta Sans', android: 'sans-serif', web: "'Plus Jakarta Sans', sans-serif", default: 'System' }),
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600' as const,
  },
  body: {
    fontFamily: Platform.select({ ios: 'Plus Jakarta Sans', android: 'sans-serif', web: "'Plus Jakarta Sans', sans-serif", default: 'System' }),
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400' as const,
  },
  bodyBold: {
    fontFamily: Platform.select({ ios: 'Plus Jakarta Sans', android: 'sans-serif', web: "'Plus Jakarta Sans', sans-serif", default: 'System' }),
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600' as const,
  },
  caption: {
    fontFamily: Platform.select({ ios: 'Plus Jakarta Sans', android: 'sans-serif', web: "'Plus Jakarta Sans', sans-serif", default: 'System' }),
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400' as const,
  },
  captionBold: {
    fontFamily: Platform.select({ ios: 'Plus Jakarta Sans', android: 'sans-serif', web: "'Plus Jakarta Sans', sans-serif", default: 'System' }),
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' as const,
  },
  meta: {
    fontFamily: Platform.select({ ios: 'Plus Jakarta Sans', android: 'sans-serif', web: "'Plus Jakarta Sans', sans-serif", default: 'System' }),
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '400' as const,
  },
  micro: {
    fontFamily: Platform.select({ ios: 'Plus Jakarta Sans', android: 'sans-serif', web: "'Plus Jakarta Sans', sans-serif", default: 'System' }),
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '500' as const,
  },
  navLabel: {
    fontFamily: Platform.select({ ios: 'Plus Jakarta Sans', android: 'sans-serif', web: "'Plus Jakarta Sans', sans-serif", default: 'System' }),
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '600' as const,
  },
  button: {
    fontFamily: Platform.select({ ios: 'Plus Jakarta Sans', android: 'sans-serif', web: "'Plus Jakarta Sans', sans-serif", default: 'System' }),
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700' as const,
  },

  // Section labels in small caps
  sectionLabel: {
    fontFamily: Platform.select({ ios: 'Plus Jakarta Sans', android: 'sans-serif', web: "'Plus Jakarta Sans', sans-serif", default: 'System' }),
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
 * Layout tokens that differ between native and web.
 * On native, screens need top padding for the status bar.
 * On web, there is no status bar.
 */
export const VerandahLayout = {
  screenPaddingTop: Platform.select({ web: 16, default: 60 }) as number,
  mcnHeaderToContentGap: 4,
};

/**
 * Shared height token for image-based network tiles
 * (used by Pre-order Food and Community Business cards) and for the hero photo
 * on the matching detail screens.
 *
 * The cover is 30% of the viewport height rather than a fixed pixel count, so a
 * food photo reads as the subject of the card on a phone instead of a thin
 * strip above the text. Clamped so it neither disappears on a short device nor
 * eats a whole tablet screen. Pass the live height from `useWindowDimensions()`
 * so the tile re-measures on rotation and on browser resize.
 */
export const getNetworkTileImageHeight = (windowHeight?: number): number => {
  const height = windowHeight ?? Dimensions.get('window').height;
  return Math.round(Math.min(280, Math.max(150, height * 0.3)));
};

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
