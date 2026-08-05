import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackSmart } from '../../../lib/navigation';
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
import { AppIcon } from '../../../components/AppIcon';
import { EmptyState } from '../../../components/EmptyState';
import { PreorderDropCard, PreorderDropItem } from '../../../components/PreorderDropCard';
import { Rupees } from '../../../components/Rupees';
import { useWebPullToRefresh } from '../../../components/useWebPullToRefresh';
import { WebPullIndicator } from '../../../components/WebPullIndicator';
import { Verandah } from '../../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { buildMcnHeaderOptions } from '../../../lib/mcnHeader';
import { supabase } from '../../../lib/supabase';

export default function FoodDropsCatalogScreen() {
  const router = useRouter();
  const { tab: initialTab } = useLocalSearchParams<{ tab?: string }>();
  const { user, communityId } = useAuth();
  const colors = Verandah;

  const [drops, setDrops] = useState<PreorderDropItem[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'closed' | 'my_drops'>('active');

  useEffect(() => {
    if (initialTab && (initialTab === 'active' || initialTab === 'closed' || initialTab === 'my_drops')) {
      setActiveTab(initialTab as any);
    }
  }, [initialTab]);
  const [myMetrics, setMyMetrics] = useState<{
    totalRevenue: number;
    completedRevenue: number;
    totalOrders: number;
  }>({ totalRevenue: 0, completedRevenue: 0, totalOrders: 0 });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDrops = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const isAnonymousView = !user?.id;
        let query = supabase.from('mcn_preorder_drops').select('*').order('cutoff_at', { ascending: true });

        if (communityId) {
          query = query.eq('community_id', communityId);
        }

        if (activeTab === 'my_drops' && user?.id) {
          query = query.eq('created_by', user?.id);
        }

        if (activeTab === 'active' && isAnonymousView) {
          query = query.eq('status', 'open');
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data) {
          // Fetch order counts and revenue metrics per drop
          const dropIds = data.map((d: any) => d.id);
          let orderCounts: Record<string, number> = {};
          let itemCounts: Record<string, number> = {};
          let profileMap: Record<string, { full_name: string | null; flat_number: string | null }> = {};
          let listingMap: Record<string, { name: string; image_url: string | null }> = {};
          let totRev = 0;
          let compRev = 0;
          let totOrd = 0;

          if (dropIds.length > 0 && user?.id) {
            const { data: orderData } = await supabase
              .from('mcn_preorder_orders')
              .select('drop_id, total_amount, status, mcn_preorder_order_items(quantity)')
              .in('drop_id', dropIds);

            if (orderData) {
              const dropStatusMap: Record<string, string> = {};
              data.forEach((d: any) => {
                dropStatusMap[d.id] = d.status;
              });

              orderData.forEach((row: any) => {
                if (row.status !== 'cancelled') {
                  orderCounts[row.drop_id] = (orderCounts[row.drop_id] || 0) + 1;
                  const rowItems = Array.isArray(row.mcn_preorder_order_items)
                    ? row.mcn_preorder_order_items
                    : [];
                  const qtySum = rowItems.reduce((sum: number, line: any) => {
                    const quantity = typeof line?.quantity === 'number'
                      ? line.quantity
                      : parseFloat(String(line?.quantity || 0));
                    return sum + (isNaN(quantity) ? 0 : quantity);
                  }, 0);
                  itemCounts[row.drop_id] = (itemCounts[row.drop_id] || 0) + qtySum;
                  totOrd += 1;
                  const amt = parseFloat(row.total_amount || 0);
                  totRev += amt;
                  if (dropStatusMap[row.drop_id] === 'completed' || row.status === 'fulfilled') {
                    compRev += amt;
                  }
                }
              });
            }
          }

          const creatorIds = Array.from(
            new Set(data.map((d: any) => d.created_by).filter(Boolean))
          );

          if (creatorIds.length > 0) {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('id, full_name, flat_number')
              .in('id', creatorIds);

            (profileData || []).forEach((profile: any) => {
              profileMap[profile.id] = {
                full_name: profile.full_name || null,
                flat_number: profile.flat_number || null,
              };
            });
          }

          const listingIds = Array.from(
            new Set(data.map((d: any) => d.listing_id).filter(Boolean))
          );

          if (listingIds.length > 0) {
            const { data: listingData } = await supabase
              .from('mcn_listings')
              .select('id, name, image_url')
              .in('id', listingIds);

            (listingData || []).forEach((listing: any) => {
              listingMap[listing.id] = {
                name: listing.name,
                image_url: listing.image_url || null,
              };
            });
          }

          setMyMetrics({
            totalRevenue: totRev,
            completedRevenue: compRev,
            totalOrders: totOrd,
          });

          const now = new Date();
          const formatted: PreorderDropItem[] = data.map((d: any) => ({
            ...d,
            order_count: orderCounts[d.id] || 0,
            item_count: itemCounts[d.id] || 0,
            profiles: profileMap[d.created_by] || null,
            mcn_listings: d.listing_id ? listingMap[d.listing_id] || null : null,
          }));

          const isDeliveryPassed = (d: PreorderDropItem): boolean => {
            if (d.status === 'completed' || d.status === 'cancelled') return true;
            if (!d.fulfillment_date) return false;
            const timeStr = d.fulfillment_time || '23:59';
            const fulfillDateTime = new Date(`${d.fulfillment_date}T${timeStr}:00`);
            if (isNaN(fulfillDateTime.getTime())) {
              const fulfillDateOnly = new Date(`${d.fulfillment_date}T23:59:59`);
              return now > fulfillDateOnly;
            }
            return now > fulfillDateTime;
          };

          // Filter by active vs closed tab if not in my_drops
          let filtered = formatted;
          if (activeTab === 'active') {
            filtered = formatted.filter(
              (d) => d.status === 'open' && new Date(d.cutoff_at) > now
            );
          } else if (activeTab === 'closed') {
            const preparing = formatted.filter(
              (d) => d.status !== 'completed' && d.status !== 'cancelled' && (d.status === 'closed' || new Date(d.cutoff_at) <= now) && !isDeliveryPassed(d)
            );
            const completed = formatted.filter(
              (d) => d.status === 'completed' || d.status === 'cancelled' || isDeliveryPassed(d)
            );
            filtered = [...preparing, ...completed];
          }

          setDrops(filtered);
        } else {
          setDrops([]);
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

  useEffect(() => {
    fetchDrops();
  }, [communityId, activeTab]);

  useFocusEffect(
    useCallback(() => {
      fetchDrops();
    }, [fetchDrops])
  );

  const webPullProps = useWebPullToRefresh(() => fetchDrops(true), refreshing);

  const handleBack = () => {
    goBackSmart(router, '/network/drops');
  };

  const requireLoginForAction = () => {
    if (user?.id) return true;
    Toast.show({
      type: 'info',
      text1: 'Login required',
      text2: 'You can browse drops now. Please login to host or manage orders.',
    });
    router.push('/login' as any);
    return false;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: 'Pre-Order Food',
          onBack: handleBack,
        })}
      />

      {/* Top Section Switcher Toggle */}
      <View style={styles.masterToggleRow}>
        <TouchableOpacity
          style={[styles.masterToggleBtn, styles.masterToggleBtnActive]}
          activeOpacity={0.9}
        >
          <View style={styles.iconLabelRow}>
            <Ionicons name="restaurant-outline" size={16} color="#FFFFFF" />
            <Text style={styles.masterToggleTextActive}>Pre-order Food</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.masterToggleBtn}
          onPress={() => router.push('/network/business' as any)}
          activeOpacity={0.8}
        >
          <View style={styles.iconLabelRow}>
            <AppIcon name="store" size={16} color={colors.textSecondary} />
            <Text style={styles.masterToggleText}>Community Businesses</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Subtitle Banner */}
      <View style={styles.headerBanner}>
        <Text style={styles.bannerSub}>
          Browse fresh weekend specials, home-baked items, and neighborhood food pop-ups before cut-off deadlines.
        </Text>
      </View>

      {/* Filter Segment Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'active' && styles.tabBtnActive]}
          onPress={() => setActiveTab('active')}
        >
          <View style={styles.iconLabelRow}>
            <Ionicons name="restaurant-outline" size={14} color={activeTab === 'active' ? '#FFFFFF' : Verandah.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>Open Pre-orders</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'closed' && styles.tabBtnActive]}
          onPress={() => setActiveTab('closed')}
        >
          <View style={styles.iconLabelRow}>
            <AppIcon name="lock" size={14} color={activeTab === 'closed' ? '#FFFFFF' : Verandah.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'closed' && styles.tabTextActive]}>Past / Preparing</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'my_drops' && styles.tabBtnActive]}
          onPress={() => {
            if (!user?.id) {
              requireLoginForAction();
              return;
            }
            setActiveTab('my_drops');
          }}
        >
          <View style={styles.iconLabelRow}>
            <AppIcon name="chef" size={14} color={activeTab === 'my_drops' ? '#FFFFFF' : Verandah.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'my_drops' && styles.tabTextActive]}>My Pre-order Food</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* My Food Drops Revenue & Earnings Card */}
      {activeTab === 'my_drops' && !loading ? (
        <View style={styles.revenueCard}>
          <View style={styles.iconLabelRow}>
            <AppIcon name="money" size={16} />
            <Text style={styles.revenueCardTitle}>My Pre-order Food Performance & Revenue</Text>
          </View>
          <View style={styles.revenueRow}>
            <View style={styles.revenueCol}>
              <Text style={styles.revenueSub}>Drops Hosted</Text>
              <Text style={styles.revenueValText}>{drops.length}</Text>
            </View>
            <View style={styles.revenueDivider} />
            <View style={styles.revenueCol}>
              <Text style={styles.revenueSub}>Total Orders</Text>
              <Text style={styles.revenueValText}>{myMetrics.totalOrders}</Text>
            </View>
            <View style={styles.revenueDivider} />
            <View style={styles.revenueCol}>
              <Text style={styles.revenueSub}>Total Revenue</Text>
              <Rupees amount={myMetrics.totalRevenue} size="md" tone="in" />
            </View>
            <View style={styles.revenueDivider} />
            <View style={styles.revenueCol}>
              <Text style={styles.revenueSub}>Delivered</Text>
              <Rupees amount={myMetrics.completedRevenue} size="md" tone="in" />
            </View>
          </View>
        </View>
      ) : null}

      {/* Content List */}
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          {...webPullProps.pullProps}
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
          ListHeaderComponent={
            <WebPullIndicator pullDistance={webPullProps.pullDistance} refreshing={refreshing} isPulling={webPullProps.isPulling} />
          }
          renderItem={({ item, index }) => {
            const isItemDeliveryPassed = (d: PreorderDropItem): boolean => {
              if (d.status === 'completed' || d.status === 'cancelled') return true;
              if (!d.fulfillment_date) return false;
              const timeStr = d.fulfillment_time || '23:59';
              const fulfillDateTime = new Date(`${d.fulfillment_date}T${timeStr}:00`);
              const now = new Date();
              if (isNaN(fulfillDateTime.getTime())) {
                const fulfillDateOnly = new Date(`${d.fulfillment_date}T23:59:59`);
                return now > fulfillDateOnly;
              }
              return now > fulfillDateTime;
            };

            const firstPreparingIdx = drops.findIndex(
              (d) => d.status !== 'completed' && d.status !== 'cancelled' && !isItemDeliveryPassed(d)
            );
            const isFirstPreparing =
              activeTab === 'closed' &&
              firstPreparingIdx !== -1 &&
              index === firstPreparingIdx;

            const firstCompletedIdx = drops.findIndex(
              (d) => d.status === 'completed' || d.status === 'cancelled' || isItemDeliveryPassed(d)
            );
            const isFirstCompleted =
              activeTab === 'closed' &&
              firstCompletedIdx !== -1 &&
              index === firstCompletedIdx;

            return (
              <View>
                {isFirstPreparing ? (
                  <View style={styles.sectionHeaderPreparing}>
                    <View style={styles.iconLabelRow}>
                      <AppIcon name="chef" size={14} />
                      <Text style={styles.sectionHeaderTextPreparing}>Kitchen Preparing</Text>
                    </View>
                  </View>
                ) : null}

                {isFirstCompleted ? (
                  <View style={styles.sectionHeaderCompleted}>
                    <Ionicons name="checkmark-circle" size={16} color="#059669" />
                    <Text style={styles.sectionHeaderTextCompleted}>Past Completed & Delivered Drops</Text>
                  </View>
                ) : null}

                <PreorderDropCard
                  drop={item}
                  isCreator={item.created_by === user?.id}
                  onPress={() => router.push(`/network/drops/${item.id}` as any)}
                  onManage={() => {
                    if (!requireLoginForAction()) return;
                    router.push(`/network/drops/manage/${item.id}` as any);
                  }}
                />
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="restaurant-outline"
              title={
                activeTab === 'active'
                  ? 'No active pre-order drops'
                  : activeTab === 'my_drops'
                  ? 'You haven’t published any pre-order food'
                  : 'No past pre-order food'
              }
              message={
                activeTab === 'active'
                  ? 'No local pre-order food open right now. Check back soon or host your own food pop-up!'
                  : 'Publish a pre-order drop to let neighbors order your weekend specials!'
              }
            />
          }
        />
      )}

      {/* Floating Add FAB */}
      {user?.id ? (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/network/drops/add' as any)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
          <Text style={styles.fabText}>Host Food Drop</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBanner: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  bannerTitle: {
    ...VerandahType.title,
    fontSize: 15,
    color: Verandah.textPrimary,
    marginBottom: 2,
  },
  bannerSub: {
    ...VerandahType.body,
    fontSize: 12,
    color: Verandah.textSecondary,
    lineHeight: 16,
  },
  tabsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: VerandahRadius.pill,
    padding: 2,
  },
  iconLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 5,
    alignItems: 'center',
    borderRadius: VerandahRadius.pill,
  },
  tabBtnActive: {
    backgroundColor: Verandah.primary,
    borderWidth: 1,
    borderColor: Verandah.primary,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  tabTextActive: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 70,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Verandah.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
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
  sectionHeaderPreparing: {
    marginTop: 8,
    marginBottom: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#FEF3C7',
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    borderColor: '#FDE68A',
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionHeaderTextPreparing: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
  },
  sectionHeaderCompleted: {
    marginTop: 10,
    marginBottom: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#ECFDF5',
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionHeaderTextCompleted: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  revenueCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: VerandahRadius.lg,
    padding: 10,
  },
  revenueCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
    marginBottom: 6,
  },
  revenueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  revenueCol: {
    flex: 1,
    alignItems: 'center',
  },
  revenueSub: {
    fontSize: 10,
    fontWeight: '500',
    color: '#047857',
    marginBottom: 2,
    textAlign: 'center',
  },
  revenueDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#A7F3D0',
  },
  revenueValText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#065F46',
  },
  masterToggleRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 2,
    gap: 8,
  },
  masterToggleBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: VerandahRadius.pill,
    backgroundColor: '#F3F4F6',
  },
  masterToggleBtnActive: {
    backgroundColor: Verandah.primary,
    borderWidth: 1,
    borderColor: Verandah.primary,
  },
  masterToggleText: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  masterToggleTextActive: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
