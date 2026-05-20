import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Verandah } from '../../constants/Colors';
import { VerandahType } from '../../constants/Verandah';

const TabIcon = ({ name, color }: { name: keyof typeof Ionicons.glyphMap; color: string }) => (
  <Ionicons name={name} size={20} color={color} />
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
          height: 76,
          paddingBottom: 18,
          paddingTop: 10,
        },
        tabBarActiveTintColor: Verandah.accent,
        tabBarInactiveTintColor: Verandah.textMuted,
        tabBarLabelStyle: {
          ...VerandahType.micro,
          fontWeight: VerandahType.weightBold,
          letterSpacing: 0.1,
        },
      }}
    >
      <Tabs.Screen
        name="approvals"
        options={{
          title: 'Approvals',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'document-text' : 'document-text-outline'} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="communities"
        options={{
          title: 'Communities',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'business' : 'business-outline'} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="funds-requests"
        options={{
          title: 'Funds requests',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'wallet' : 'wallet-outline'} color={color} />
          ),
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
