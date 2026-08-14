import { CheckCircle } from '@untitledui/icons/CheckCircle';
import { ChevronDown } from '@untitledui/icons/ChevronDown';
import { ChevronUp } from '@untitledui/icons/ChevronUp';
import { Plus } from '@untitledui/icons/Plus';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackSmart, replaceTracked } from '../../../lib/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { SegmentedSlider } from '../../../components/SegmentedSlider';
import { ChipRowSlider } from '../../../components/ChipRowSlider';
import { useWebPullToRefresh } from '../../../components/useWebPullToRefresh';
import { WebPullIndicator } from '../../../components/WebPullIndicator';
import { Verandah } from '../../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { buildMcnHeaderOptions } from '../../../lib/mcnHeader';
import { supabase } from '../../../lib/supabase';

export default function FoodDropsCatalogScreen() {
  const router = useRouter();
  const { id: targetDropId, tab: initialTab } = useLocalSearchParams<{ id?: string; tab?: string }>();
  const { user, communityId } = useAuth();
  const colors = Verandah;
  const redirectedRef = React.useRef<string | null>(null);

  const [drops, setDrops] = useState<PreorderDropItem[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'closed' | 'my_drops'>('active');
  const [preparingCollapsed, setPreparingCollapsed] = useState(false);
  const [completedCollapsed, setCompletedCollapsed] = useState(false);

  useEffect(() => {
    if (initialTab && (initialTab === 'active' || initialTab === 'closed' || initialTab === 'my_drops')) {
      setActiveTab(initialTab as any);
    }
  }, [initialTab]);

  // Share links use the `/mcn/drops?id=<uuid>` bridge form. Redirect with
  // replace(), not push(), so the bridge URL does not keep its own history
  // entry — otherwise browser-back lands on it and it immediately forwards to
  // the detail screen again, trapping the user in a back loop.
  useEffect(() => {
    if (targetDropId && redirectedRef.current !== targetDropId) {
      redirectedRef.current = targetDropId;
      replaceTracked(router, `/mcn/drops/${targetDropId}` as any);
    }
  }, [targetDropId, router]);
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
            const { data: hostRows } = await supabase.rpc('get_public_host_profiles', {
              p_user_ids: creatorIds,
            });

            // The RPC is the anon-safe path. Signed-in residents can still read
            // host profiles directly via profiles_select_public_hosts, so fall
            // back to that when the RPC yields nothing (e.g. not yet deployed).
            let hostProfiles: any[] = hostRows || [];
            if (hostProfiles.length === 0 && user?.id) {
              const { data: directRows } = await supabase
                .from('profiles')
                .select('id, full_name, flat_number')
                .in('id', creatorIds);
              hostProfiles = directRows || [];
            }

            hostProfiles.forEach((profile: any) => {
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

  const listRows = useMemo(() => {
    if (activeTab !== 'closed') {
      return drops.map((drop) => ({ type: 'drop' as const, drop }));
    }

    const isDeliveryPassed = (d: PreorderDropItem): boolean => {
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

    const preparing = drops.filter((d) => !isDeliveryPassed(d));
    const completed = drops.filter((d) => isDeliveryPassed(d));

    const rows: (
      | { type: 'header'; section: 'preparing' | 'completed'; count: number }
      | { type: 'drop'; drop: PreorderDropItem }
    )[] = [];

    if (preparing.length > 0) {
      rows.push({ type: 'header', section: 'preparing', count: preparing.length });
      if (!preparingCollapsed) {
        preparing.forEach((drop) => rows.push({ type: 'drop', drop }));
      }
    }

    if (completed.length > 0) {
      rows.push({ type: 'header', section: 'completed', count: completed.length });
      if (!completedCollapsed) {
        completed.forEach((drop) => rows.push({ type: 'drop', drop }));
      }
    }

    return rows;
  }, [drops, activeTab, preparingCollapsed, completedCollapsed]);

  const handleBack = () => {
    goBackSmart(router, '/mcn/drops');
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
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: 'Pre-order Food',
          onBack: handleBack,
        })}
      />

      {/* Top Section Switcher Toggle */}
      <SegmentedSlider<'drops' | 'business'>
        value="drops"
        enterFromIndex={1}
        onChange={(val) => {
          if (val === 'business') {
            replaceTracked(router, '/mcn/business' as any);
          }
        }}
        segments={[
          { key: 'drops', label: 'Pre-order Food' },
          { key: 'business', label: 'Businesses' },
        ]}
        trackStyle={styles.masterToggleRow}
        segmentStyle={styles.masterToggleBtn}
        pillStyle={styles.masterToggleBtnActive}
        activeTextStyle={styles.masterToggleTextActive}
        inactiveTextStyle={styles.masterToggleText}
      />

      {/* Filter Pills */}
      <ChipRowSlider<'active' | 'closed' | 'my_drops'>
        value={activeTab}
        onChange={(val) => {
          if (val === 'my_drops' && !user?.id) {
            requireLoginForAction();
            return;
          }
          setActiveTab(val);
        }}
        chips={[
          { key: 'active', label: 'Open' },
          { key: 'closed', label: 'Past' },
          { key: 'my_drops', label: 'Mine' },
        ]}
        scrollable={false}
        containerStyle={styles.tabsRow}
        chipStyle={styles.tabBtn}
        inactiveChipStyle={{ backgroundColor: Verandah.card, borderWidth: 0.5, borderColor: Verandah.borderHair }}
        pillStyle={styles.tabBtnActive}
        activeColor={Verandah.primaryFg}
        inactiveColor={Verandah.textPrimary}
        textStyle={styles.tabText}
        activeTextStyle={styles.tabTextActive}
      />

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
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          {...webPullProps.pullProps}
          data={listRows}
          keyExtractor={(row) => (row.type === 'header' ? `header-${row.section}` : row.drop.id)}
          contentContainerStyle={
            drops.length === 0 ? styles.emptyList : styles.listContent
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchDrops(true)}
              colors={[colors.primary]}
            />
          }
          ListHeaderComponent={
            <WebPullIndicator pullDistance={webPullProps.pullDistance} refreshing={refreshing} isPulling={webPullProps.isPulling} />
          }
          renderItem={({ item: row }) => {
            if (row.type === 'header') {
              const isPreparing = row.section === 'preparing';
              const collapsed = isPreparing ? preparingCollapsed : completedCollapsed;
              const toggle = () =>
                isPreparing
                  ? setPreparingCollapsed((v) => !v)
                  : setCompletedCollapsed((v) => !v);

              return (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={toggle}
                  style={isPreparing ? styles.sectionHeaderPreparing : styles.sectionHeaderCompleted}
                >
                  <View style={[styles.iconLabelRow, { flex: 1 }]}>
                    {isPreparing ? (
                      <AppIcon name="chef" size={14} />
                    ) : (
                      <CheckCircle size={16} color={Verandah.green600} aria-hidden={true} />
                    )}
                    <Text style={isPreparing ? styles.sectionHeaderTextPreparing : styles.sectionHeaderTextCompleted}>
                      {isPreparing ? 'Kitchen Preparing' : 'Past Completed & Delivered Drops'} ({row.count})
                    </Text>
                  </View>
                  {collapsed ? (
                    <ChevronDown size={16} color={isPreparing ? '#92400E' : '#065F46'} aria-hidden={true} />
                  ) : (
                    <ChevronUp size={16} color={isPreparing ? '#92400E' : '#065F46'} aria-hidden={true} />
                  )}
                </TouchableOpacity>
              );
            }

            const item = row.drop;
            return (
              <PreorderDropCard
                drop={item}
                isCreator={item.created_by === user?.id}
                onPress={() => router.push(`/mcn/drops/${item.id}` as any)}
              />
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
          onPress={() => router.push('/mcn/drops/add' as any)}
          activeOpacity={0.85}
        >
          <Plus size={24} color={Verandah.primaryFg} aria-hidden={true} />
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
    marginTop: 12,
    marginBottom: 12,
    gap: 8,
  },
  iconLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabBtn: {
    paddingVertical: 7,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderRadius: VerandahRadius.pill,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.card,
  },
  tabBtnActive: {
    backgroundColor: Verandah.primary,
    borderColor: Verandah.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Verandah.textPrimary,
    fontFamily: VerandahType.sansFamily,
  },
  tabTextActive: {
    fontWeight: '700',
    color: Verandah.primaryFg,
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
    justifyContent: 'space-between',
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
    backgroundColor: Verandah.accentSoft,
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderTextCompleted: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  revenueCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: Verandah.accentSoft,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: VerandahRadius.lg,
    padding: 10,
    ...Verandah.shadowCard,
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
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: Verandah.cream,
    borderRadius: VerandahRadius.segmented,
    padding: 4,
    gap: 4,
  },
  masterToggleBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: VerandahRadius.segmentedInner,
  },
  masterToggleBtnActive: {
    backgroundColor: Verandah.primary,
  },
  masterToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: Verandah.textSecondary,
    fontFamily: VerandahType.sansFamily,
  },
  masterToggleTextActive: {
    fontSize: 14,
    fontWeight: '700',
    color: Verandah.primaryFg,
    fontFamily: VerandahType.sansFamily,
  },
});
