import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { Colors } from '../../constants/Colors';

const TabIcon = ({ emoji, size = 22 }: { emoji: string; size?: number }) => (
  <Text style={{ fontSize: size, lineHeight: size + 4 }}>{emoji}</Text>
);

export default function PlatformLayout() {
  const colors = Colors.light;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          borderTopColor: 'rgba(108, 99, 255, 0.06)',
          borderTopWidth: 1,
          height: 72,
          paddingBottom: 10,
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
        name="approvals"
        options={{
          title: 'Approvals',
          tabBarIcon: ({ color }) => <TabIcon emoji="📋" />,
        }}
      />
      <Tabs.Screen
        name="communities"
        options={{
          title: 'Communities',
          tabBarIcon: ({ color }) => <TabIcon emoji="🏘️" />,
        }}
      />
      <Tabs.Screen
        name="funds-requests"
        options={{
          title: 'Funds requests',
          tabBarIcon: ({ color }) => <TabIcon emoji="💰" />,
        }}
      />
      <Tabs.Screen
        name="community/[id]"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="funds-access/[requestId]"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
