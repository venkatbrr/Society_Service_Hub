export type ReminderImage = {
  title: string;
  url: string;
};

export type ReminderImageDraft = {
  title: string;
  url: string | null;
};

/**
 * Parses raw notes text to extract stored [ReminderImage:Title|URL] tags
 * and legacy [Receipt: URL] tags, returning clean user notes and an array of images.
 */
export const parseNotesAndImages = (
  rawNotes: string | null | undefined,
  primaryImageUrl?: string | null
): { cleanNotes: string; images: ReminderImage[] } => {
  if (!rawNotes && !primaryImageUrl) {
    return { cleanNotes: '', images: [] };
  }

  const text = rawNotes || '';
  const images: ReminderImage[] = [];

  // Match all [ReminderImage:Title|URL] tags
  const tagRegex = /\[ReminderImage:([^|\]]+)\|([^\]]+)\]/g;
  let match;
  while ((match = tagRegex.exec(text)) !== null) {
    const rawTitle = match[1];
    const url = match[2].trim();
    let title = rawTitle;
    try {
      title = decodeURIComponent(rawTitle);
    } catch {
      title = rawTitle;
    }
    if (url) {
      images.push({ title: title.trim(), url });
    }
  }

  // Support legacy [Receipt: URL] tag if present
  if (images.length === 0) {
    const legacyMatch = text.match(/\[Receipt:\s*(https?:\/\/[^\]]+)\]/i);
    if (legacyMatch && legacyMatch[1]) {
      images.push({ title: 'Receipt / Warranty Card', url: legacyMatch[1].trim() });
    }
  }

  // Support fallback primaryImageUrl column if no tag images parsed
  if (images.length === 0 && primaryImageUrl) {
    images.push({ title: 'Receipt / Warranty Card', url: primaryImageUrl });
  }

  // Clean notes by removing all [ReminderImage:...] and [Receipt:...] tags
  const cleanNotes = text
    .replace(/\[ReminderImage:[^\]]+\]/gi, '')
    .replace(/\[Receipt:[^\]]+\]/gi, '')
    .trim();

  return { cleanNotes, images };
};

/**
 * Serializes user notes text and up to 3 reminder images with titles into a combined string.
 */
export const serializeNotesAndImages = (
  userNotes: string,
  drafts: ReminderImageDraft[]
): string | null => {
  const cleanNotes = userNotes.trim();
  const validImages = drafts.filter(
    (item): item is ReminderImageDraft & { url: string } => !!item.url && item.title.trim().length > 0
  );

  const tags = validImages
    .map((img) => `[ReminderImage:${encodeURIComponent(img.title.trim())}|${img.url.trim()}]`)
    .join('\n');

  const combined = [cleanNotes, tags].filter(Boolean).join('\n');
  return combined || null;
};

/**
 * Converts image drafts into a clean array of up to 3 valid ReminderImage objects for the jsonb column.
 */
export const toImagesJson = (drafts: ReminderImageDraft[]): ReminderImage[] => {
  return drafts
    .filter(
      (item): item is ReminderImageDraft & { url: string } =>
        !!item.url && item.title.trim().length > 0
    )
    .slice(0, 3)
    .map((item) => ({
      title: item.title.trim(),
      url: item.url.trim(),
    }));
};

