import { Plus } from '@untitledui/icons/Plus';
import { Tool01 } from '@untitledui/icons/Tool01';
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
import { HeaderBackButton } from '../../components/HeaderBackButton';
import { ServiceCard, ServiceCardItem } from '../../components/ServiceCard';
import { useWebPullToRefresh } from '../../components/useWebPullToRefresh';
import { WebPullIndicator } from '../../components/WebPullIndicator';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../constants/Verandah';
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
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => goBackSmart(router, '/services')} />
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>My service reminders</Text>
        <TouchableOpacity
          onPress={() => router.push('/services/add')}
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          activeOpacity={0.82}
        >
          <Plus size={14} color={Verandah.primaryFg} aria-hidden={true} />
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
          ListHeaderComponent={
            <WebPullIndicator pullDistance={pullToRefresh.pullDistance} refreshing={refreshing} isPulling={pullToRefresh.isPulling} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconWrapper, { backgroundColor: Verandah.cardMuted, borderColor: Verandah.borderHair }]}>
                <Tool01 size={40} color={colors.textSecondary} aria-hidden={true} />
              </View>
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
  container: { flex: 1, backgroundColor: Verandah.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: VerandahLayout.screenPaddingTop,
    paddingBottom: 10,
    gap: 12,
    backgroundColor: Verandah.paper,
  },
  headerTitle: {
    flex: 1,
    fontFamily: VerandahType.serifFamily,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '400',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: VerandahRadius.button,
  },
  addButtonText: {
    color: Verandah.primaryFg,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: VerandahType.sansFamily,
  },
  listContent: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 24, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    marginBottom: 8,
  },
  emptyTitle: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 22,
    fontWeight: '400',
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 19,
    fontFamily: VerandahType.sansFamily,
  },
  emptyButton: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: VerandahRadius.button,
  },
  emptyButtonText: {
    color: Verandah.primaryFg,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: VerandahType.sansFamily,
  },
});
