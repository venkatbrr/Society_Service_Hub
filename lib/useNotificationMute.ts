import { useCallback, useEffect, useState } from 'react';
import Toast from 'react-native-toast-message';
import { useAuth } from '../context/AuthContext';
import { supabase } from './supabase';

export type MuteChannel = 'food_drops' | 'parent_corner';

export function useNotificationMute(channel: MuteChannel) {
  const { user } = useAuth();
  const userId = user?.id;
  const [muted, setMuted] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!userId) {
      setMuted(false);
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function loadPreference() {
      try {
        const { data, error } = await supabase
          .from('notification_preferences')
          .select('muted')
          .eq('user_id', userId!)
          .eq('channel', channel)
          .maybeSingle();

        if (error) {
          console.warn('[useNotificationMute] Error fetching preference:', error);
          return;
        }

        if (isMounted && data) {
          setMuted(Boolean(data.muted));
        }
      } catch (err) {
        console.warn('[useNotificationMute] Error:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadPreference();

    return () => {
      isMounted = false;
    };
  }, [channel, userId]);

  const toggle = useCallback(async () => {
    if (!userId) return;

    const previousMuted = muted;
    const nextMuted = !previousMuted;

    // Optimistic update
    setMuted(nextMuted);

    const channelLabel = channel === 'food_drops' ? 'Food drop' : 'Parent Corner';

    try {
      const { error } = await supabase.from('notification_preferences').upsert(
        {
          user_id: userId,
          channel,
          muted: nextMuted,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,channel' }
      );

      if (error) {
        throw error;
      }

      Toast.show({
        type: 'success',
        text1: nextMuted ? `${channelLabel} notifications muted` : `${channelLabel} notifications on`,
        text2: nextMuted
          ? `You won't receive community alerts for new ${channel === 'food_drops' ? 'drops' : 'posts'}.`
          : `You'll receive alerts when new ${channel === 'food_drops' ? 'drops are cooking' : 'posts are added'}.`,
      });
    } catch (err: any) {
      console.error('[useNotificationMute] Failed to update preference:', err);
      // Revert state on failure
      setMuted(previousMuted);
      Toast.show({
        type: 'error',
        text1: 'Could not update notification setting',
        text2: err?.message || 'Please try again.',
      });
    }
  }, [channel, muted, userId]);

  return {
    muted,
    loading,
    toggle,
  };
}
