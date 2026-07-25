import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { EmptyState } from '../../../components/EmptyState';
import { PreorderDropCard, PreorderDropItem } from '../../../components/PreorderDropCard';
import { useWebPullToRefresh } from '../../../components/useWebPullToRefresh';
import { Verandah } from '../../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';

export default function FoodDropsCatalogScreen() {
  const router = useRouter();
  const { user, communityId } = useAuth();
  const colors = Verandah;

  const [drops, setDrops] = useState<PreorderDropItem[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'closed' | 'my_drops'>('active');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDrops = useCallback(
    async (isRefresh = false) => {
      if (!communityId) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        let query = supabase
          .from('mcn_preorder_drops')
          .select('*, profiles(full_name, flat_number), mcn_listings(name, image_url)')
          .eq('community_id', communityId)
          .order('cutoff_at', { ascending: true });

        if (activeTab === 'my_drops') {
          query = query.eq('created_by', user?.id);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data) {
          // Fetch order counts per drop
          const dropIds = data.map((d: any) => d.id);
          let orderCounts: Record<string, number> = {};

          if (dropIds.length > 0) {
            const { data: orderData } = await supabase
              .from('mcn_preorder_orders')
              .select('drop_id');
            if (orderData) {
              orderData.forEach((row: any) => {
                orderCounts[row.drop_id] = (orderCounts[row.drop_id] || 0) + 1;
              });
            }
          }

          const now = new Date();
          const formatted: PreorderDropItem[] = data.map((d: any) => ({
            ...d,
            order_count: orderCounts[d.id] || 0,
          }));

          // Filter by active vs closed tab if not in my_drops
          let filtered = formatted;
          if (activeTab === 'active') {
            filtered = formatted.filter(
              (d) => d.status === 'open' && new Date(d.cutoff_at) > now
            );
          } else if (activeTab === 'closed') {
            filtered = formatted.filter(
              (d) => d.status !== 'open' || new Date(d.cutoff_at) <= now
            );
          }

          setDrops(filtered);
        }
      } catch (err) {
        console.error('Error fetching preorder drops:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [communityId, activeTab, user?.id]
  );

  useFocusEffect(
    useCallback(() => {
      fetchDrops();
    }, [fetchDrops])
  );

  const webPullProps = useWebPullToRefresh(() => fetchDrops(true));

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Stack.Screen
        options={{
          headerTitle: 'Food Pre-Orders & Flash Drops',
          headerTitleStyle: { fontWeight: '500', fontSize: 16, color: colors.textPrimary },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/network/drops/add' as any)}
              style={{ marginRight: 6 }}
            >
              <Ionicons name="add-circle-outline" size={24} color={colors.accent} />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Subtitle Banner */}
      <View style={styles.headerBanner}>
        <Text style={styles.bannerTitle}>🍕 Pre-Orders & Food Pop-Ups</Text>
        <Text style={styles.bannerSub}>
          Order fresh weekend pizzas, home-baked cakes, or special festival menus before cut-off deadlines.
        </Text>
      </View>

      {/* Filter Segment Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'active' && styles.tabBtnActive]}
          onPress={() => setActiveTab('active')}
        >
          <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>
            🔥 Open Drops
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'closed' && styles.tabBtnActive]}
          onPress={() => setActiveTab('closed')}
        >
          <Text style={[styles.tabText, activeTab === 'closed' && styles.tabTextActive]}>
            🔒 Past / Preparing
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'my_drops' && styles.tabBtnActive]}
          onPress={() => setActiveTab('my_drops')}
        >
          <Text style={[styles.tabText, activeTab === 'my_drops' && styles.tabTextActive]}>
            👩‍🍳 My Food Drops
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content List */}
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          {...webPullProps}
          data={drops}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            drops.length === 0 ? styles.emptyList : styles.listContent
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchDrops(true)}
              colors={[colors.accent]}
            />
          }
          renderItem={({ item }) => (
            <PreorderDropCard
              drop={item}
              isCreator={item.created_by === user?.id}
              onPress={() => router.push(`/network/drops/${item.id}` as any)}
              onManage={() => router.push(`/network/drops/manage/${item.id}` as any)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="restaurant-outline"
              title={
                activeTab === 'active'
                  ? 'No active pre-order drops'
                  : activeTab === 'my_drops'
                  ? 'You haven’t published any food drops'
                  : 'No past food drops'
              }
              message={
                activeTab === 'active'
                  ? 'No local food drops open right now. Check back soon or host your own food pop-up!'
                  : 'Publish a pre-order drop to let neighbors order your weekend specials!'
              }
            />
          }
        />
      )}

      {/* Floating Add FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/network/drops/add' as any)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={24} color="#FFFFFF" />
        <Text style={styles.fabText}>Host Food Drop</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBanner: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  bannerTitle: {
    ...VerandahType.title,
    fontSize: 16,
    color: Verandah.textPrimary,
    marginBottom: 2,
  },
  bannerSub: {
    ...VerandahType.body,
    fontSize: 12,
    color: Verandah.textSecondary,
    lineHeight: 17,
  },
  tabsRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: VerandahRadius.pill,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: VerandahRadius.pill,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 0.5,
    borderColor: '#E5E7EB',
  },
  tabText: {
    fontSize: 11,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  tabTextActive: {
    fontWeight: '600',
    color: Verandah.accent,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 90,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Verandah.accent,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: VerandahRadius.pill,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
