import * as Clipboard from 'expo-clipboard';
import { Platform, Share } from 'react-native';
import Toast from 'react-native-toast-message';

interface ShareOptions {
  title?: string;
  message: string;
}

/**
 * `Share.share` rejects on desktop web when `navigator.share` is absent
 * (docs/CLAUDE.md §9). Route every in-app share through here instead of
 * calling `Share.share` directly.
 */
export async function shareOrCopy({ title, message }: ShareOptions): Promise<'shared' | 'copied' | 'cancelled'> {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({ title, text: message });
        return 'shared';
      }
      await Clipboard.setStringAsync(message);
      Toast.show({ type: 'success', text1: 'Link copied', text2: 'Paste it anywhere to share.' });
      return 'copied';
    }

    await Share.share({ message, title });
    return 'shared';
  } catch (error) {
    const err = error as any;
    if (err && (err.name === 'AbortError' || err.message?.includes('abort') || err.message?.includes('cancel'))) {
      return 'cancelled';
    }
    Toast.show({ type: 'error', text1: 'Share failed', text2: 'Could not open share options.' });
    return 'cancelled';
  }
}
