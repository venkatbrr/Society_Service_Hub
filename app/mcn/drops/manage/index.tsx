import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Verandah } from '../../../../constants/Colors';

export default function ManageDropRedirectScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  useEffect(() => {
    if (id) {
      router.replace(`/network/drops/manage/${id}` as any);
      return;
    }

    router.replace('/network/drops' as any);
  }, [id, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Verandah.surface }}>
      <ActivityIndicator color={Verandah.accent} />
    </View>
  );
}
