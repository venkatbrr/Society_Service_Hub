import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { Verandah } from '../../constants/Colors';

const TabIcon = ({ emoji, size = 22 }: { emoji: string; size?: number }) => (
  <Text style={{ fontSize: size, lineHeight: size + 4 }}>{emoji}</Text>
);

export default function PlatformLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Verandah.card,
          borderTopColor: Verandah.border,
          borderTopWidth: 0.5,
          height: 68,
          paddingBottom: 10,
          paddingTop: 10,
          elevation: 0,
        },
        tabBarActiveTintColor: Verandah.accent,
        tabBarInactiveTintColor: Verandah.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          letterSpacing: 0.1,
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
