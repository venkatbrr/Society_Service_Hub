import { Stack } from 'expo-router';
import React from 'react';
import { Verandah } from '../../../constants/Colors';

export default function ParentsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Verandah.surface },
        headerTintColor: Verandah.textPrimary,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '500', fontSize: 17 },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="add" />
    </Stack>
  );
}
