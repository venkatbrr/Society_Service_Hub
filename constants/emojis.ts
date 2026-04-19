export const APP_EMOJIS = {
  home: '🏠',
  favoritesFilled: '❤️',
  favoritesEmpty: '🤍',
  funds: '💰',
  profile: '👤',
  back: '←',
  search: '🔍',
  settings: '⚙️',
  notifications: '🔔',
  chevronRight: '→',
  add: '+',
  close: '✕',
  call: '📞',
  whatsapp: '💬',
  verified: '✅',
  starFilled: '★',
  starHalf: '⯨',
  starEmpty: '☆',
  photo: '📷',
  share: '📤',
  contribution: '💚',
  expense: '📤',
  wallet: '💰',
  fundActive: '🟢',
  community: '🏘️',
  house: '🏡',
  members: '👥',
  admin: '🛡️',
  treasurer: '💼',
  collector: '📋',
  resident: '🏠',
  success: '✅',
  warning: '⚠️',
  error: '❌',
  info: 'ℹ️',
  loading: '⏳',
  mail: '✉️',
  lock: '🔒',
  visible: '👁️',
  hidden: '🙈',
  google: 'G',
} as const;

const SERVICE_CATEGORY_EMOJIS: Record<string, string> = {
  plumber: '🔧',
  electrician: '⚡',
  carpenter: '🪵',
  carpentry: '🪵',
  cleaner: '🧹',
  cleaning: '🧹',
  maid: '🧹',
  painter: '🎨',
  painting: '🎨',
  cctv: '📷',
  camera: '📷',
  'ac repair': '❄️',
  'ac technician': '❄️',
  'ac service': '❄️',
};

export const getServiceCategoryEmoji = (category?: string | null) => {
  if (!category) {
    return '🛠️';
  }

  const normalized = category.trim().toLowerCase();
  return SERVICE_CATEGORY_EMOJIS[normalized] ?? '🛠️';
};