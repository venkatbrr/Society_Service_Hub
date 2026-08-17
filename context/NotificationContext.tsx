import Constants from 'expo-constants';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { ensureWebPushSubscription } from '../lib/webPush';
import { useAuth } from './AuthContext';

// expo-notifications is native-only (Android/iOS).
// On web, we import nothing and all push-notification code is a no-op.
let Notifications: typeof import('expo-notifications') | null = null;
if (Platform.OS !== 'web') {
  Notifications = require('expo-notifications');
  Notifications!.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: any;
  is_read: boolean;
  created_at: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // Every callback and the subscription effect below key off the id, never the
  // `user` object: Supabase hands back a fresh object on each auth event
  // (including the hourly token refresh), and depending on its identity tore
  // down and rebuilt the realtime channel and refetched the whole notification
  // list each time.
  const userId = user?.id;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const lastForegroundFetchRef = useRef<number>(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const registerForPushNotifications = useCallback(async () => {
    if (!userId) {
      return;
    }

    if (Platform.OS === 'web') {
      await ensureWebPushSubscription(userId);
      return;
    }


    try {
      if (Platform.OS === 'android') {
        await Notifications!.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications!.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#6C63FF',
        });
      }

      const isPhysicalDevice = Boolean((Constants as any).isDevice ?? true);
      if (!isPhysicalDevice) {
        // Expo push token registration is not supported on emulators/simulators.
        console.log('Skipping push token registration: not a physical device.');
        return;
      }

      const { status: existingStatus } = await Notifications!.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications!.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('Push notification permission not granted');
        return;
      }

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;

      if (!projectId) {
        console.warn('Missing EAS projectId; cannot register Expo push token');
        return;
      }

      const { data: token } = await Notifications!.getExpoPushTokenAsync({ projectId });

      const { error } = await supabase
        .from('profiles')
        .update({ expo_push_token: token })
        .eq('id', userId);

      if (error) {
        console.error('Error saving expo push token:', error);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Expected in unsupported local setups (emulator/simulator, missing native push wiring).
      if (
        /physical device|firebaseapp|fcm|projectid|project id|not initialized/i.test(message)
      ) {
        console.warn('Skipping Expo push token registration:', message);
        return;
      }

      console.error('Error registering for push notifications:', error);
    }
  }, [userId]);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      
      setNotifications(data || []);
      setUnreadCount((data || []).filter(n => !n.is_read).length);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const markAsRead = async (id: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);

      if (error) throw error;

      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    if (!userId) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) throw error;

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  };

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    void registerForPushNotifications();
    fetchNotifications();

    // Subscribe to new notifications
    const channel = supabase
      .channel(`user_notifications_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          setNotifications(prev => [newNotification, ...prev]);
          setUnreadCount(prev => prev + 1);

          // Optional: Local in-app notification trigger
          if (Platform.OS !== 'web' && Notifications) {
            void Notifications.scheduleNotificationAsync(
              Platform.OS === 'android'
                ? {
                    content: {
                      title: newNotification.title,
                      body: newNotification.body,
                      data: newNotification.data,
                      sound: 'default',
                    },
                    trigger: {
                      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                      seconds: 1,
                      repeats: false,
                      channelId: 'default',
                    },
                  }
                : {
                    content: {
                      title: newNotification.title,
                      body: newNotification.body,
                      data: newNotification.data,
                      sound: 'default',
                    },
                    trigger: null,
                  }
            );
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchNotifications, registerForPushNotifications, userId]);

  // Foreground resync effect: debounced at most once every 30s
  useEffect(() => {
    if (!userId) return;

    const handleForegroundResync = () => {
      const now = Date.now();
      if (now - lastForegroundFetchRef.current > 30_000) {
        lastForegroundFetchRef.current = now;
        void fetchNotifications();
      }
      if (channelRef.current && (channelRef.current.state === 'closed' || channelRef.current.state === 'errored')) {
        channelRef.current.subscribe();
      }
    };

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          handleForegroundResync();
        }
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
      return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    } else {
      const subscription = AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active') {
          handleForegroundResync();
        }
      });
      return () => subscription.remove();
    }
  }, [fetchNotifications, userId]);

  return (
    <NotificationContext.Provider 
      value={{ 

        notifications, 
        unreadCount, 
        loading, 
        fetchNotifications, 
        markAsRead, 
        markAllAsRead 
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
