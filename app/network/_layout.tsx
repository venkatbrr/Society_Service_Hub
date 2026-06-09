import { Stack } from 'expo-router';
import { Verandah } from '../../constants/Colors';

export default function NetworkLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Verandah.surface },
        headerTintColor: Verandah.textPrimary,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '500', fontSize: 17 },
      }}
    />
  );
}
