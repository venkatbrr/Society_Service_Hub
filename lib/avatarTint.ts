import { Verandah } from '../constants/Colors';

/**
 * Deterministic avatar tint assignment.
 *
 * Given a stable string (user id or full name), hashes to one of five
 * tints. The same person always gets the same tint. The tints are
 * non-random and non-branded — they feel personal without implying
 * hierarchy or affiliation.
 */
export function getAvatarTint(seed: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % Verandah.avatarTints.length;
  return Verandah.avatarTints[index];
}
