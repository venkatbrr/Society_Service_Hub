import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { Verandah } from '../constants/Colors';

export default function RootIndexScreen() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.replace('/landing.html');
      return;
    }

    router.replace('/login');
  }, [router]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Verandah.surface,
      }}
    >
      <ActivityIndicator size="large" color={Verandah.accent} />
    </View>
  );
}
