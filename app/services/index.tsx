import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { ServiceCard, ServiceCardItem } from '../../components/ServiceCard';
import { useWebPullToRefresh } from '../../components/useWebPullToRefresh';
import { WebPullIndicator } from '../../components/WebPullIndicator';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahRadius } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { goBackSmart } from '../../lib/navigation';
import { supabase } from '../../lib/supabase';

export default function ServicesListScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const colors = Verandah;
  const [services, setServices] = useState<ServiceCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchServices = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const { data, error } = await supabase.rpc('get_my_upcoming_services');
      if (error) throw error;
      setServices((data ?? []) as ServiceCardItem[]);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load services' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchServices();
    }, [fetchServices])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchServices();
  };

  const pullToRefresh = useWebPullToRefresh(onRefresh, refreshing);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => goBackSmart(router, '/services')}
          style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.75}
        >
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>My service reminders</Text>
        <TouchableOpacity
          onPress={() => router.push('/services/add')}
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          activeOpacity={0.82}
        >
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={services}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ServiceCard
              item={item}
              onPress={() => router.push({ pathname: '/services/[id]', params: { id: item.id } })}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          {...pullToRefresh.pullProps}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            <WebPullIndicator pullDistance={pullToRefresh.pullDistance} refreshing={refreshing} isPulling={pullToRefresh.isPulling} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="build-outline" size={44} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No service reminders yet</Text>
              <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
                Track your AC, RO, and other appliances so you never miss maintenance.
              </Text>
              <TouchableOpacity
                style={[styles.emptyButton, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/services/add')}
                activeOpacity={0.82}
              >
                <Text style={styles.emptyButtonText}>Add your first service</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: VerandahLayout.screenPaddingTop,
    paddingBottom: 6,
    gap: 10,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: VerandahRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  backIcon: { fontSize: 18, fontWeight: '500' },
  headerTitle: {
    flex: 1,
    fontSize: 19,
    fontWeight: '500',
    letterSpacing: -0.3,
  },
  addButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: VerandahRadius.md,
  },
  addButtonText: { color: Verandah.primaryFg, fontSize: 13, fontWeight: '500' },
  listContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: VerandahLayout.screenPaddingTop,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '500', textAlign: 'center' },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: VerandahRadius.md,
  },
  emptyButtonText: { color: Verandah.primaryFg, fontSize: 15, fontWeight: '500' },
});
