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
 * Verandah Design Language — Color Tokens
 *
 * Warm, restrained palette for a residential utility app.
 * Every screen reads from these tokens — no hardcoded hex values.
 */
export const Verandah = {
  // Surface — warm off-white, the canvas everything sits on
  surface: '#FAF8F4',
  card: '#FFFFFF',
  cardMuted: '#F1EFE8',

  // Primary — deep teal, used for primary CTA backgrounds and brand moments
  primary: '#0F3732',
  primaryFg: '#F0EDE3',

  // Accent — mid teal, used for confirmations, verified badges, active tab, links
  accent: '#0F6E56',
  accentSoft: '#E1F5EE',

  // Caution — warm amber, friendly nudges, never alarms
  caution: '#854F0B',
  cautionSoft: '#FAEEDA',

  // Semantic but rare — destructive only, used sparingly
  danger: '#A32D2D',
  dangerSoft: '#FCEBEB',

  // Text
  textPrimary: '#1F2A28',
  textSecondary: '#6B6F6D',
  textTertiary: '#888780',
  textMuted: '#B4B2A9',

  // Borders
  border: 'rgba(15, 55, 50, 0.08)',
  borderStrong: 'rgba(15, 55, 50, 0.15)',

  // Avatar tinted backgrounds
  avatarTints: [
    { bg: '#E1F5EE', fg: '#0F6E56' },  // teal
    { bg: '#FAEEDA', fg: '#854F0B' },  // amber
    { bg: '#EEEDFE', fg: '#3C3489' },  // purple
    { bg: '#FBEAF0', fg: '#993556' },  // pink
    { bg: '#E6F1FB', fg: '#185FA5' },  // blue
  ],
};
