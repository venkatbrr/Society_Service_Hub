import { Car01 } from '@untitledui/icons/Car01';
import { ChevronDown } from '@untitledui/icons/ChevronDown';
import { ChevronUp } from '@untitledui/icons/ChevronUp';
import { Clock } from '@untitledui/icons/Clock';
import { Plus } from '@untitledui/icons/Plus';
import { SearchLg } from '@untitledui/icons/SearchLg';
import { User01 } from '@untitledui/icons/User01';
import { Users01 } from '@untitledui/icons/Users01';
import { XClose } from '@untitledui/icons/XClose';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { BaseCard } from '../../../components/BaseCard';
import { EmptyState } from '../../../components/EmptyState';
import { Rupees } from '../../../components/Rupees';
import { SegmentedSlider } from '../../../components/SegmentedSlider';
import { useWebPullToRefresh } from '../../../components/useWebPullToRefresh';
import { WebPullIndicator } from '../../../components/WebPullIndicator';
import { Verandah } from '../../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { Tables } from '../../../lib/database.types';
import { buildMcnHeaderOptions } from '../../../lib/mcnHeader';
import { goBackSmart } from '../../../lib/navigation';
import { supabase } from '../../../lib/supabase';

type Carpool = Tables<'mcn_carpools'> & {
  creator_profile?: {
    full_name: string | null;
    flat_number: string | null;
    phone_number: string | null;
  } | null;
  is_joined?: boolean;
};

type FilterTab = 'all' | 'offering' | 'seeking' | 'my';

export default function CarpoolListScreen() {
  const router = useRouter();
  const { user, communityId } = useAuth();
  const colors = Verandah;

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [carpools, setCarpools] = useState<Carpool[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Debounce search input by 300ms per CLAUDE.md conventions
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim().toLowerCase());
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchCarpools = useCallback(
    async (isRefresh = false) => {
      if (!communityId) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setLoadError(null);

      try {
        if (activeTab === 'my' && user) {
          // Fetch rides created by user OR joined by user
          const [createdRes, reqRes] = await Promise.all([
            supabase
              .from('mcn_carpools')
              .select(`
                *,
                creator_profile:profiles!mcn_carpools_created_by_fkey (
                  full_name,
                  flat_number,
                  phone_number
                )
              `)
              .eq('community_id', communityId)
              .eq('created_by', user.id)
              .neq('status', 'cancelled')
              .order('created_at', { ascending: false }),
            supabase
              .from('mcn_carpool_requests')
              .select('carpool_id, status')
              .eq('rider_id', user.id)
              .in('status', ['pending', 'accepted']),
          ]);

          if (createdRes.error) throw createdRes.error;
          if (reqRes.error) throw reqRes.error;

          const createdRides = (createdRes.data as Carpool[]) || [];
          const joinedCarpoolIds = (reqRes.data || [])
            .map((r) => r.carpool_id)
            .filter((id) => !createdRides.some((c) => c.id === id));

          let joinedRides: Carpool[] = [];
          if (joinedCarpoolIds.length > 0) {
            const { data: joinedData, error: joinedErr } = await supabase
              .from('mcn_carpools')
              .select(`
                *,
                creator_profile:profiles!mcn_carpools_created_by_fkey (
                  full_name,
                  flat_number,
                  phone_number
                )
              `)
              .eq('community_id', communityId)
              .in('id', joinedCarpoolIds)
              .neq('status', 'cancelled')
              .order('created_at', { ascending: false });

            if (joinedErr) throw joinedErr;
            joinedRides = ((joinedData as Carpool[]) || []).map((r) => ({ ...r, is_joined: true }));
          }

          setCarpools([...createdRides, ...joinedRides]);
        } else {
          let query = supabase
            .from('mcn_carpools')
            .select(`
              *,
              creator_profile:profiles!mcn_carpools_created_by_fkey (
                full_name,
                flat_number,
                phone_number
              )
            `)
            .eq('community_id', communityId)
            .order('created_at', { ascending: false });

          if (activeTab === 'offering') {
            query = query.eq('role_type', 'offering').eq('status', 'active');
          } else if (activeTab === 'seeking') {
            query = query.eq('role_type', 'seeking').eq('status', 'active');
          } else {
            // 'all' shows active and paused
            query = query.in('status', ['active', 'paused']);
          }

          const { data, error } = await query;
          if (error) throw error;
          setCarpools((data as Carpool[]) || []);
        }
      } catch (err: any) {
        console.error('Error fetching carpools:', err);
        setLoadError(err?.message || 'Could not load rides.');
        Toast.show({ type: 'error', text1: 'Could not load rides', text2: err?.message });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [communityId, activeTab, user]
  );

  useFocusEffect(
    useCallback(() => {
      fetchCarpools();
    }, [fetchCarpools])
  );

  const webPullProps = useWebPullToRefresh(() => fetchCarpools(true), refreshing);

  // Search covers title, start_point, end_point, vehicle_info, notes, and host name
  const filteredCarpools = carpools.filter((item) => {
    if (!debouncedQuery) return true;
    const q = debouncedQuery;
    return (
      item.title.toLowerCase().includes(q) ||
      item.start_point.toLowerCase().includes(q) ||
      item.end_point.toLowerCase().includes(q) ||
      (item.vehicle_info && item.vehicle_info.toLowerCase().includes(q)) ||
      (item.notes && item.notes.toLowerCase().includes(q)) ||
      (item.creator_profile?.full_name && item.creator_profile.full_name.toLowerCase().includes(q))
    );
  });

  // Paused and completed rides start collapsed — most residents only care about active ones.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(['paused', 'completed']));
  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const carpoolSections = useMemo(() => {
    const groups: { key: string; title: string; items: Carpool[] }[] = [
      { key: 'active', title: 'Active', items: [] },
      { key: 'paused', title: 'Paused', items: [] },
      { key: 'completed', title: 'Completed', items: [] },
    ];
    const byKey = new Map(groups.map((g) => [g.key, g]));
    filteredCarpools.forEach((item) => {
      byKey.get(item.status)?.items.push(item);
    });

    return groups
      .filter((g) => g.items.length > 0)
      .map((g) => ({
        key: g.key,
        title: g.title,
        count: g.items.length,
        data: collapsedGroups.has(g.key) ? [] : g.items,
      }));
  }, [filteredCarpools, collapsedGroups]);

  const renderStatusBadge = (status: Carpool['status']) => {
    switch (status) {
      case 'active':
        return (
          <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.badgeText, { color: colors.accent }]}>Active</Text>
          </View>
        );
      case 'paused':
        return (
          <View style={[styles.badge, { backgroundColor: colors.cautionSoft }]}>
            <Text style={[styles.badgeText, { color: colors.caution }]}>Paused</Text>
          </View>
        );
      case 'cancelled':
        return (
          <View style={[styles.badge, { backgroundColor: colors.dangerSoft }]}>
            <Text style={[styles.badgeText, { color: colors.danger }]}>Cancelled</Text>
          </View>
        );
      case 'completed':
        return (
          <View style={[styles.badge, { backgroundColor: colors.cardMuted }]}>
            <Text style={[styles.badgeText, { color: colors.textSecondary }]}>Completed</Text>
          </View>
        );
      default:
        return null;
    }
  };

  const handleBack = () => {
    goBackSmart(router, '/mcn/carpools');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: 'Community carpooling',
          onBack: handleBack,
        })}
      />

      {/* Header Info */}
      <View style={styles.header}>
        <Text style={[styles.subText, { color: colors.textSecondary }]}>
          Share daily office commutes, weekend intercity travel & outstation trips with society neighbors.
        </Text>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <SearchLg size={18} color={colors.textMuted} style={styles.searchIcon} aria-hidden={true} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Search by city, outstation destination, route, notes..."
          placeholderTextColor={colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <XClose size={18} color={colors.textMuted} aria-hidden={true} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <SegmentedSlider<'all' | 'offering' | 'seeking' | 'my'>
        value={activeTab}
        onChange={(tab) => setActiveTab(tab)}
        segments={[
          { key: 'all', label: 'All rides' },
          { key: 'offering', label: 'Offering seats' },
          { key: 'seeking', label: 'Seeking ride' },
          { key: 'my', label: 'My carpools' },
        ]}
        trackStyle={styles.tabsContainer}
        segmentStyle={styles.tabBtn}
        pillStyle={styles.tabBtnActive}
        activeTextStyle={styles.tabTextActive}
        inactiveTextStyle={styles.tabText}
      />

      {/* List */}
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <SectionList
          {...webPullProps.pullProps}
          sections={carpoolSections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={
            filteredCarpools.length === 0 ? styles.emptyList : styles.listContent
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchCarpools(true)}
              colors={[colors.primary]}
            />
          }
          ListHeaderComponent={
            <WebPullIndicator pullDistance={webPullProps.pullDistance} refreshing={refreshing} isPulling={webPullProps.isPulling} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="car-sport-outline"
              title={loadError ? 'Could not load rides' : 'No carpools found'}
              message={
                loadError
                  ? 'Something went wrong while fetching carpools. Please try again.'
                  : debouncedQuery
                  ? 'No routes match your search keyword.'
                  : 'Be the first resident to offer or request a carpool in your society!'
              }
              actionLabel={loadError ? 'Retry' : undefined}
              onAction={loadError ? () => fetchCarpools(true) : undefined}
            />
          }
          renderSectionHeader={({ section }) => {
            const isCollapsed = collapsedGroups.has(section.key);
            return (
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => toggleGroup(section.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.sectionHeaderText, { color: colors.textPrimary }]}>
                  {section.title} ({section.count})
                </Text>
                {isCollapsed ? (
                  <ChevronDown size={16} color={colors.textSecondary} aria-hidden={true} />
                ) : (
                  <ChevronUp size={16} color={colors.textSecondary} aria-hidden={true} />
                )}
              </TouchableOpacity>
            );
          }}
          renderItem={({ item }) => {
            const isOwner = user?.id === item.created_by;
            const isJoined = item.is_joined;

            const unitPrice =
              item.pricing_type === 'paid'
                ? item.price_per_seat_amount ?? parseFloat(item.price_per_seat?.replace(/[^0-9.]/g, '') || '0')
                : 0;

            return (
              <BaseCard
                padding={10}
                style={styles.card}
                onPress={() => router.push(`/mcn/carpools/${item.id}` as any)}
              >
                {/* Header Row */}
                <View style={styles.cardHeaderRow}>
                  <View
                    style={[
                      styles.roleBadge,
                      {
                        backgroundColor:
                          item.role_type === 'offering' ? colors.accentSoft : colors.cardMuted,
                      },
                    ]}
                  >
                    {item.role_type === 'offering' ? (
                      <Car01 size={14} color={colors.primary} aria-hidden={true} />
                    ) : (
                      <User01 size={14} color={colors.textPrimary} aria-hidden={true} />
                    )}
                    <Text
                      style={[
                        styles.roleBadgeText,
                        { color: item.role_type === 'offering' ? colors.primary : colors.textPrimary },
                      ]}
                    >
                      {item.role_type === 'offering' ? 'Offering seats' : 'Seeking ride'}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {item.role_type === 'offering' && (
                      item.pricing_type === 'paid' ? (
                        <View style={[styles.badge, { backgroundColor: colors.cardMuted }]}>
                          {unitPrice > 0 ? (
                            <Rupees amount={unitPrice} size="sm" tone="in" />
                          ) : (
                            <Text style={[styles.badgeText, { color: colors.primary }]}>Paid</Text>
                          )}
                        </View>
                      ) : (
                        <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
                          <Text style={[styles.badgeText, { color: colors.primary }]}>
                            Free ride
                          </Text>
                        </View>
                      )
                    )}

                    {renderStatusBadge(item.status)}

                    {isOwner && (
                      <View style={[styles.badge, { backgroundColor: colors.cardMuted }]}>
                        <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                          Mine
                        </Text>
                      </View>
                    )}

                    {isJoined && (
                      <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
                        <Text style={[styles.badgeText, { color: colors.primary }]}>
                          Joined
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Title */}
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                  {item.title}
                </Text>

                {/* Route Flow */}
                <View style={styles.routeContainer}>
                  <View style={styles.routePointRow}>
                    <View style={[styles.dotCircle, { backgroundColor: colors.primary }]} />
                    <Text style={[styles.routeLabel, { color: colors.textTertiary }]}>From:</Text>
                    <Text style={[styles.routeValue, { color: colors.textPrimary }]} numberOfLines={1}>
                      {item.start_point}
                    </Text>
                  </View>

                  <View style={styles.routeLine} />

                  <View style={styles.routePointRow}>
                    <View style={[styles.dotCircle, { backgroundColor: colors.danger }]} />
                    <Text style={[styles.routeLabel, { color: colors.textTertiary }]}>To:</Text>
                    <Text style={[styles.routeValue, { color: colors.textPrimary }]} numberOfLines={1}>
                      {item.end_point}
                    </Text>
                  </View>
                </View>

                {/* Details Meta */}
                <View style={[styles.metaRow, { borderColor: colors.borderHair }]}>
                  <View style={styles.metaItem}>
                    <Clock size={14} color={colors.textSecondary} aria-hidden={true} />
                    <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                      {item.trip_date ? `${new Date(item.trip_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ` : ''}
                      {item.departure_time}
                      {item.return_time ? ` (Return: ${item.return_time})` : ''}
                    </Text>
                  </View>

                  <View style={styles.metaItem}>
                    <Users01 size={14} color={colors.textSecondary} aria-hidden={true} />
                    <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                      {item.available_seats} {item.available_seats === 1 ? 'seat' : 'seats'}{' '}
                      {item.role_type === 'offering' ? 'capacity' : 'needed'}
                    </Text>
                  </View>
                </View>

                {/* Days tags */}
                {!item.trip_date && item.recurring_days && item.recurring_days.length > 0 && (
                  <View style={styles.daysRow}>
                    {item.recurring_days.map((day) => (
                      <View key={day} style={[styles.dayChip, { backgroundColor: colors.cardMuted }]}>
                        <Text style={[styles.dayChipText, { color: colors.textSecondary }]}>
                          {day}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Footer Host Info */}
                {item.creator_profile && (
                  <View style={styles.footerRow}>
                    <Text style={[styles.hostText, { color: colors.textTertiary }]}>
                      Posted by {item.creator_profile.full_name || 'Resident'}
                      {item.creator_profile.flat_number
                        ? ` (${item.creator_profile.flat_number})`
                        : ''}
                    </Text>
                    <Text style={[styles.viewDetailsLink, { color: colors.primary }]}>
                      Details →
                    </Text>
                  </View>
                )}
              </BaseCard>
            );
          }}
        />
      )}

      {/* Floating Action Button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        activeOpacity={0.8}
        onPress={() => router.push('/mcn/carpools/add' as any)}
      >
        <Plus size={24} color={colors.primaryFg} aria-hidden={true} />
        <Text style={[styles.fabText, { color: colors.primaryFg }]}>Offer / request</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: VerandahLayout.mcnHeaderToContentGap,
    paddingBottom: 2,
  },
  subText: {
    ...VerandahType.body,
    fontSize: 12,
    lineHeight: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 4,
    paddingHorizontal: 10,
    height: 36,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.borderStrong,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 4,
    backgroundColor: Verandah.cardMuted,
    borderRadius: VerandahRadius.pill,
    padding: 2,
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
    color: Verandah.primaryFg,
    fontWeight: '500',
  },
  loaderWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 80,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Verandah.paper,
    paddingVertical: 8,
  },
  sectionHeaderText: {
    ...VerandahType.captionBold,
    fontSize: 13,
  },
  card: {
    marginBottom: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: VerandahRadius.sm,
    gap: 4,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: VerandahRadius.pill,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '500',
  },
  cardTitle: {
    ...VerandahType.title,
    fontSize: 15,
    marginBottom: 4,
  },
  routeContainer: {
    backgroundColor: Verandah.cardMuted,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
  },
  routePointRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dotCircle: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  routeLine: {
    width: 1,
    height: 6,
    backgroundColor: Verandah.borderStrong,
    marginLeft: 3,
    marginVertical: 1,
  },
  routeLabel: {
    fontSize: 11,
    fontWeight: '500',
    width: 38,
  },
  routeValue: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTopWidth: 0.5,
    marginBottom: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    fontWeight: '500',
  },
  daysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 4,
  },
  dayChip: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: VerandahRadius.sm,
  },
  dayChipText: {
    fontSize: 10,
    fontWeight: '500',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  hostText: {
    fontSize: 11,
  },
  viewDetailsLink: {
    fontSize: 11,
    fontWeight: '500',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 22,
    gap: 6,
    borderWidth: 0.5,
    borderColor: Verandah.borderStrong,
  },
  fabText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
