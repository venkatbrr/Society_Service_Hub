import { Tabs } from 'expo-router';
import React from 'react';

// The visible bottom bar is GlobalBottomNav, rendered once at the root layout
// so it stays on screen outside this (tabs) group too (funds, mcn/*, services,
// etc.). This Tabs navigator still owns routing between the five tab screens —
// its own bar is just hidden.
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="favorites" />
      <Tabs.Screen name="network" />
      <Tabs.Screen name="community" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
