import { Platform } from 'react-native';

/**
 * Verandah Design Language — Non-Color Tokens
 *
 * Verandah is a calm, residentially-warm design language for an app
 * residents open with intent — to look up a phone number, check a fund,
 * log a service. Not for browsing. Not for engagement.
 */

export const VerandahType = {
  serifFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  sansFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),

  // Two weights only. Never go heavier than 500.
  weightRegular: '400' as const,
  weightBold: '500' as const,

  // Type scale
  display: { fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }), fontSize: 26, lineHeight: 30, letterSpacing: -0.3, fontWeight: '500' as const },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '500' as const },
  body: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  bodyBold: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
  captionBold: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '400' as const },

  // Section labels in small caps
  sectionLabel: {
    fontSize: 12,
    fontWeight: '500' as const,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
  },
};

export const VerandahSpace = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const VerandahRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
  frame: 32,
};
