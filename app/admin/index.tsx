import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { Verandah } from '../../constants/Colors';
import { replaceTracked } from '../../lib/navigation';

export default function AdminRouteIndex() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.replace('/admin/index.html');
    } else {
      replaceTracked(router, '/admin-redirect' as any);
    }
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Verandah.primary} />
      <Text style={styles.loadingText}>Opening Platform Admin Dashboard...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F3732',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
});
