import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Verandah } from '../../../../constants/Colors';
import { replaceTracked } from '../../../../lib/navigation';

export default function ManageDropRedirectScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  useEffect(() => {
    if (id) {
      replaceTracked(router, `/mcn/drops/manage/${id}` as any);
      return;
    }

    replaceTracked(router, '/mcn/drops' as any);
  }, [id, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Verandah.surface }}>
      <ActivityIndicator color={Verandah.accent} />
    </View>
  );
}
