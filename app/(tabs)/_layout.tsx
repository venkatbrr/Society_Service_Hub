import { useFocusEffect } from '@react-navigation/native';
import { Tabs } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { APP_EMOJIS } from '../../constants/emojis';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function TabLayout() {
  const colors = Colors.light;
  const insets = useSafeAreaInsets();
  const { appRole, communityId } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      async function loadPendingCount() {
        if (appRole !== 'community_admin' || !communityId) {
          setPendingCount(0);
          return;
        }

        const { count, error } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('community_id', communityId)
          .eq('approval_status', 'pending');

        if (error) {
          console.error('Error loading pending approval count:', error);
          return;
        }

        setPendingCount(count ?? 0);
      }

      loadPendingCount();
    }, [appRole, communityId])
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          borderTopColor: 'rgba(108, 99, 255, 0.06)',
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 8,
          elevation: 0,
          shadowColor: '#16A34A',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.06,
          shadowRadius: 16,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.icon,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Help',
          tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.45 }}>{APP_EMOJIS.home}</Text>,
        }}
      />
      <Tabs.Screen
        name="business"
        options={{
          href: null, // Hidden — business feature deferred
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: 'Saved',
          tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.45 }}>{APP_EMOJIS.favoritesFilled}</Text>,
        }}
      />
      <Tabs.Screen
        name="funds"
        options={{
          title: 'Funds',
          tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.45 }}>{APP_EMOJIS.funds}</Text>,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarBadge: appRole === 'community_admin' && pendingCount > 0 ? pendingCount : undefined,
          tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.45 }}>{APP_EMOJIS.profile}</Text>,
        }}
      />
    </Tabs>
  );
}
