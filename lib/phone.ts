export function extractDigits(value: string): string {
  return (value || '').replace(/\D/g, '');
}

export function toLast10Digits(value: string): string {
  const digits = extractDigits(value);
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function isValidIndianMobile(value: string): boolean {
  const last10 = toLast10Digits(value);
  return /^[6-9]\d{9}$/.test(last10);
}

export function normalizeIndianMobile(value: string): string | null {
  const last10 = toLast10Digits(value);
  return isValidIndianMobile(last10) ? last10 : null;
}

/**
 * wa.me works on native and web; the whatsapp:// scheme is native-only and
 * silently fails in the PWA. Returns null when the number isn't usable.
 */
export function buildWhatsAppUrl(phone: string | null | undefined, text: string): string | null {
  const last10 = toLast10Digits(phone || '');
  if (last10.length !== 10) return null;
  return `https://wa.me/91${last10}?text=${encodeURIComponent(text)}`;
}

