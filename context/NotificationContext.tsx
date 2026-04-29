import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const registerForPushNotifications = useCallback(async () => {
    if (!user || Platform.OS === 'web') {
      return;
    }

    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.HIGH,
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

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
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

      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

      const { error } = await supabase
        .from('profiles')
        .update({ expo_push_token: token })
        .eq('id', user.id);

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
  }, [user]);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
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
  }, [user]);

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
    if (!user) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  };

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    void registerForPushNotifications();
    fetchNotifications();

    // Subscribe to new notifications
    const channel = supabase
      .channel(`user_notifications_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          setNotifications(prev => [newNotification, ...prev]);
          setUnreadCount(prev => prev + 1);

          // Optional: Local in-app notification trigger
          if (Platform.OS !== 'web') {
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

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchNotifications, registerForPushNotifications, user]);

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
