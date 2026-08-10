export const Colors = {
  light: {
    // Core palette — Fresh Green
    text: '#14532D',
    textMuted: '#52775C',
    background: '#F0FDF4',
    surface: '#FFFFFF',
    surface2: '#DCFCE7',
    primary: '#16A34A',
    secondary: '#059669',
    accent: '#F59E0B',
    warning: '#EF4444',
    border: '#BBF7D0',
    tint: '#16A34A',
    icon: '#86EFAC',
    tabIconDefault: '#86EFAC',
    tabIconSelected: '#16A34A',
    card: 'rgba(255, 255, 255, 0.85)',
    overlay: 'rgba(22, 163, 74, 0.04)',

    // Glassmorphism
    glass: 'rgba(255, 255, 255, 0.72)',
    glassBorder: 'rgba(187, 247, 208, 0.5)',

    // Gradients
    gradientStart: '#16A34A',
    gradientEnd: '#4ADE80',
  },
  dark: {
    text: '#F7FAFC',
    textMuted: '#A0AEC0',
    background: '#091E14',
    surface: '#14532D',
    surface2: '#166534',
    primary: '#4ADE80',
    secondary: '#34D399',
    accent: '#F59E0B',
    warning: '#EF4444',
    border: '#166534',
    tint: '#FFFFFF',
    icon: '#4ADE80',
    tabIconDefault: '#4ADE80',
    tabIconSelected: '#FFFFFF',
    card: '#14532D',
    overlay: 'rgba(255, 255, 255, 0.05)',

    glass: 'rgba(20, 83, 45, 0.72)',
    glassBorder: 'rgba(255, 255, 255, 0.1)',

    gradientStart: '#16A34A',
    gradientEnd: '#4ADE80',
  },
};

/**
 * Verandah Design Language — Color & Shadow Tokens (Turn 1 "Verandah")
 *
 * Warm, restrained palette for residential community utility.
 * Single source of truth across every screen.
 */
export const Verandah = {
  // Brand
  teal900: '#0F3732',
  green600: '#0F6E56',
  secondary: '#0F6E56',

  // Surfaces & Backgrounds
  paper: '#FAF8F4',
  surface: '#FAF8F4',
  cream: '#F0EDE3',
  creamSoft: '#EFEBE1',
  card: '#FFFFFF',
  cardMuted: '#F0EDE3',

  // Primary & Secondary Actions
  primary: '#0F3732',
  primaryFg: '#F0EDE3',
  accent: '#0F6E56',
  accentSoft: '#E1F5EE',

  // Gold Accents
  gold: '#DDA94A',      // Gold accent on dark
  goldInk: '#854F0B',   // Gold accent on light (ratings, emphasis)
  caution: '#854F0B',
  cautionSoft: '#FAEEDA',
  sand: '#FBEAD0',      // Warm chip / avatar tint bg

  // Semantic
  danger: '#A32D2D',
  dangerSoft: '#FCEBEB',

  // Typography Tokens
  textInk: '#1F2A28',
  textPrimary: '#1F2A28',
  textSecondary: '#6B6F6D',
  textMuted: '#6B6F6D',
  textSubtle: '#888780',
  textTertiary: '#888780',
  textFaint: '#A9A498',
  textDisabled: '#9A988F',

  // Borders
  border: 'rgba(15, 55, 50, 0.08)',
  borderHair: 'rgba(15, 55, 50, 0.10)',
  borderSoft: 'rgba(15, 55, 50, 0.08)',
  borderStrong: 'rgba(15, 55, 50, 0.14)',

  // Mock / Bezel
  phoneBezel: '#111614',

  // Shadows
  shadowCard: {
    shadowColor: '#0F3732',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  shadowRaised: {
    shadowColor: '#0F3732',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 4,
  },
  shadowDevice: {
    shadowColor: '#0F3732',
    shadowOffset: { width: 0, height: 40 },
    shadowOpacity: 0.28,
    shadowRadius: 80,
    elevation: 12,
  },

  // Avatar tinted backgrounds
  avatarTints: [
    { bg: '#E1F5EE', fg: '#0F6E56' },  // teal
    { bg: '#FBEAD0', fg: '#854F0B' },  // sand / amber
    { bg: '#EEEDFE', fg: '#3C3489' },  // purple
    { bg: '#FBEAF0', fg: '#993556' },  // pink
    { bg: '#E6F1FB', fg: '#185FA5' },  // blue
  ],
};
