import { Stack } from 'expo-router';
import React from 'react';
import { Verandah } from '../../constants/Colors';

export default function NetworkLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Verandah.surface },
      }}
    />
  );
}
