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
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { BaseCard } from '../../../components/BaseCard';
import { EmptyState } from '../../../components/EmptyState';
import { useWebPullToRefresh } from '../../../components/useWebPullToRefresh';
import { Verandah } from '../../../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { Tables } from '../../../lib/database.types';
import { supabase } from '../../../lib/supabase';

type Carpool = Tables<'mcn_carpools'> & {
  creator_profile?: {
    full_name: string | null;
    flat_number: string | null;
    phone_number: string | null;
  } | null;
};

type FilterTab = 'all' | 'offering' | 'seeking' | 'my';

export default function CarpoolListScreen() {
  const router = useRouter();
  const { user, communityId } = useAuth();
  const colors = Verandah;

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [carpools, setCarpools] = useState<Carpool[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCarpools = useCallback(
    async (isRefresh = false) => {
      if (!communityId) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
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
        } else if (activeTab === 'my') {
          if (user) {
            query = query.eq('created_by', user.id);
          }
        } else {
          // 'all' shows active and paused
          query = query.in('status', ['active', 'paused']);
        }

        const { data, error } = await query;
        if (error) throw error;
        setCarpools((data as Carpool[]) || []);
      } catch (err) {
        console.error('Error fetching carpools:', err);
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

  const webPullProps = useWebPullToRefresh(() => fetchCarpools(true));

  const filteredCarpools = carpools.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.start_point.toLowerCase().includes(q) ||
      item.end_point.toLowerCase().includes(q) ||
      (item.vehicle_info && item.vehicle_info.toLowerCase().includes(q))
    );
  });

  const renderStatusBadge = (status: Carpool['status']) => {
    switch (status) {
      case 'active':
        return (
          <View style={[styles.badge, { backgroundColor: '#D1FAE5' }]}>
            <Text style={[styles.badgeText, { color: '#059669' }]}>Active</Text>
          </View>
        );
      case 'paused':
        return (
          <View style={[styles.badge, { backgroundColor: '#FEF3C7' }]}>
            <Text style={[styles.badgeText, { color: '#D97706' }]}>Paused</Text>
          </View>
        );
      case 'cancelled':
        return (
          <View style={[styles.badge, { backgroundColor: '#FEE2E2' }]}>
            <Text style={[styles.badgeText, { color: '#DC2626' }]}>Cancelled</Text>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top Header Bar with Back Button */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(tabs)/network' as any);
            }
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Community Carpooling 🚘</Text>
      </View>

      {/* Header Info */}
      <View style={styles.header}>
        <Text style={[styles.subText, { color: colors.textSecondary }]}>
          Share daily office commutes, weekend intercity travel & outstation trips with society neighbors.
        </Text>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Search by city, outstation destination or office location..."
          placeholderTextColor={colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'all' && styles.tabBtnActive]}
          onPress={() => setActiveTab('all')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
            All Rides
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'offering' && styles.tabBtnActive]}
          onPress={() => setActiveTab('offering')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'offering' && styles.tabTextActive]}>
            Offering Seat
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'seeking' && styles.tabBtnActive]}
          onPress={() => setActiveTab('seeking')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'seeking' && styles.tabTextActive]}>
            Seeking Ride
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'my' && styles.tabBtnActive]}
          onPress={() => setActiveTab('my')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'my' && styles.tabTextActive]}>
            My Carpools
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          {...webPullProps}
          data={filteredCarpools}
          keyExtractor={(item) => item.id}
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
          ListEmptyComponent={
            <EmptyState
              icon="car-sport-outline"
              title="No carpools found"
              message={
                searchQuery
                  ? 'No routes match your search keyword.'
                  : 'Be the first resident to offer or request a carpool in your society!'
              }
            />
          }
          renderItem={({ item }) => {
            const isOwner = user?.id === item.created_by;
            return (
              <BaseCard
                padding={10}
                style={styles.card}
                onPress={() => router.push(`/network/carpools/${item.id}` as any)}
              >
                {/* Header Row */}
                <View style={styles.cardHeaderRow}>
                  <View
                    style={[
                      styles.roleBadge,
                      {
                        backgroundColor:
                          item.role_type === 'offering' ? colors.primary + '18' : '#DBEAFE',
                      },
                    ]}
                  >
                    <Ionicons
                      name={item.role_type === 'offering' ? 'car-outline' : 'person-outline'}
                      size={14}
                      color={item.role_type === 'offering' ? colors.primary : '#1D4ED8'}
                    />
                    <Text
                      style={[
                        styles.roleBadgeText,
                        { color: item.role_type === 'offering' ? colors.primary : '#1D4ED8' },
                      ]}
                    >
                      {item.role_type === 'offering' ? 'Offering Seats' : 'Seeking Ride'}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {(item as any).pricing_type === 'paid' ? (
                      <View style={[styles.badge, { backgroundColor: '#FEF3C7' }]}>
                        <Text style={[styles.badgeText, { color: '#D97706' }]}>
                          {(item as any).price_per_seat || 'Paid'}
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.badge, { backgroundColor: '#D1FAE5' }]}>
                        <Text style={[styles.badgeText, { color: '#059669' }]}>
                          Free Ride
                        </Text>
                      </View>
                    )}
                    {renderStatusBadge(item.status)}
                    {isOwner && (
                      <View style={[styles.badge, { backgroundColor: colors.borderStrong }]}>
                        <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                          Mine
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
                    <View style={[styles.dotCircle, { backgroundColor: '#10B981' }]} />
                    <Text style={[styles.routeLabel, { color: colors.textTertiary }]}>From:</Text>
                    <Text style={[styles.routeValue, { color: colors.textPrimary }]} numberOfLines={1}>
                      {item.start_point}
                    </Text>
                  </View>

                  <View style={styles.routeLine} />

                  <View style={styles.routePointRow}>
                    <View style={[styles.dotCircle, { backgroundColor: '#EF4444' }]} />
                    <Text style={[styles.routeLabel, { color: colors.textTertiary }]}>To:</Text>
                    <Text style={[styles.routeValue, { color: colors.textPrimary }]} numberOfLines={1}>
                      {item.end_point}
                    </Text>
                  </View>
                </View>

                {/* Details Meta */}
                <View style={[styles.metaRow, { borderColor: colors.border }]}>
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                    <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                      {item.departure_time}
                      {item.return_time ? ` (Return: ${item.return_time})` : ''}
                    </Text>
                  </View>

                  <View style={styles.metaItem}>
                    <Ionicons name="people-outline" size={14} color={colors.textSecondary} />
                    <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                      {item.available_seats} {item.available_seats === 1 ? 'seat' : 'seats'}{' '}
                      {item.role_type === 'offering' ? 'avail' : 'needed'}
                    </Text>
                  </View>
                </View>

                {/* Days tags */}
                {item.recurring_days && item.recurring_days.length > 0 && (
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
                    <Text style={[styles.viewDetailsLink, { color: colors.accent }]}>
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
        onPress={() => router.push('/network/carpools/add' as any)}
      >
        <Ionicons name="add" size={24} color={colors.primaryFg} />
        <Text style={[styles.fabText, { color: colors.primaryFg }]}>Offer / Request</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 2,
    gap: 12,
  },
  backBtn: {
    padding: 4,
    borderRadius: VerandahRadius.pill,
  },
  headerTitle: {
    ...VerandahType.title,
    fontSize: 18,
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 2,
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
    color: '#FFFFFF',
    fontWeight: '700',
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
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: VerandahRadius.pill,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
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
    fontWeight: '600',
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
    fontWeight: '600',
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
    fontWeight: '600',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  fabText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
