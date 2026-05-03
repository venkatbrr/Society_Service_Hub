import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { ActiveFundTeaser } from '../../components/ActiveFundTeaser';
import { CategoryFilter } from '../../components/CategoryFilter';
import { EmptyState } from '../../components/EmptyState';
import { ProviderCard } from '../../components/ProviderCard';
import { SearchBar } from '../../components/SearchBar';
import { UpcomingServicesCard } from '../../components/UpcomingServicesCard';
import { VisitCard } from '../../components/VisitCard';
import { CATEGORY_COLORS } from '../../constants/categories';
import { Colors } from '../../constants/Colors';
import { APP_EMOJIS, getServiceCategoryEmoji } from '../../constants/emojis';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { ProviderWithInteraction, VisitWithJoinerData } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';

const isMissingRelationError = (error: { code?: string; message?: string } | null) =>
  error?.code === 'PGRST205' ||
  error?.message?.includes("Could not find the table 'public.provider_hires'");


function groupVisitsByCategory(visitList: VisitWithJoinerData[]) {
  const grouped: Record<string, VisitWithJoinerData[]> = {};
  visitList.forEach(v => {
    const cat = v.category || 'Other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(v);
  });
  return Object.entries(grouped)
    .map(([title, data]) => ({ title, data }))
    .sort((a, b) => b.data.length - a.data.length);
}

export default function HomeScreen() {
  const { segment, visitTab: visitTabParam } = useLocalSearchParams<{ segment?: string; visitTab?: 'upcoming' | 'past' }>();
  const [activeSegment, setActiveSegment] = useState<'providers' | 'visits'>('providers');
  const [providers, setProviders] = useState<ProviderWithInteraction[]>([]);
  const [visits, setVisits] = useState<VisitWithJoinerData[]>([]);
  const [pastVisits, setPastVisits] = useState<VisitWithJoinerData[]>([]);
  const [visitTab, setVisitTab] = useState<'upcoming' | 'past'>('upcoming');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFund, setActiveFund] = useState<any>(null);
  const { user, communityId } = useAuth();
  const router = useRouter();

  const { unreadCount } = useNotifications();
  const colors = Colors.light;

  const fetchCommunityStats = useCallback(async () => {
    if (!communityId) return;
    try {
      // Fetch active fund
      const fundResult = await supabase.from('events')
        .select('*, event_transactions(amount, type)')
        .eq('community_id', communityId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const fundData = fundResult.data;
      if (fundData) {
        const collected = (fundData.event_transactions ?? [])
          .filter((t: any) => t.type === 'income')
          .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

        setActiveFund({
          id: fundData.id,
          title: fundData.title,
          collected: collected,
          goal: fundData.goal_amount || 0
        });
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }, [communityId]);

  const fetchProviders = useCallback(async () => {
    if (!communityId) return;

    try {
      let query = supabase
        .from('service_providers')
        .select('*')
        .eq('community_id', communityId)
        .order('avg_rating', { ascending: false });

      if (selectedCategory && selectedCategory !== 'All') {
        query = query.eq('category', selectedCategory);
      }

      if (debouncedSearchQuery) {
        query = query.or(`name.ilike.%${debouncedSearchQuery}%,category.ilike.%${debouncedSearchQuery}%`);
      }

      // Fetch providers, favorites, and hire counts in parallel
      const [providersResult, favoritesResult, hiresResult] = await Promise.all([
        query,
        supabase.from('favorites')
          .select('provider_id')
          .eq('user_id', user?.id as string),
        supabase.from('provider_hires')
          .select('provider_id')
          .eq('community_id', communityId)
      ]);

      if (providersResult.error) throw providersResult.error;
      if (favoritesResult.error) throw favoritesResult.error;

      const hireCounts: Record<string, number> = {};
      if (!isMissingRelationError(hiresResult.error)) {
        (hiresResult.data ?? []).forEach(h => {
          hireCounts[h.provider_id] = (hireCounts[h.provider_id] || 0) + 1;
        });
      }

      const favoriteIds = new Set(favoritesResult.data?.map(f => f.provider_id));

      const mergedData = providersResult.data
        .filter((provider: any) => {
          // Client-side fraud filter — works before and after migration
          const status = provider.fraud_status;
          return !status || status === 'pass' || status === 'queued_low';
        })
        .map((provider: any) => ({
          ...provider,
          is_favorite: favoriteIds.has(provider.id),
          hire_count: hireCounts[provider.id] || 0
        }));

      setProviders(mergedData);
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load providers' });
    }
  }, [communityId, selectedCategory, debouncedSearchQuery, user?.id]);

  const fetchVisits = useCallback(async () => {
    if (!communityId || !user?.id) return;

    try {
      // Fetch visits and user's joined visits in parallel
      const [visitsResult, joinersResult] = await Promise.all([
        supabase
          .from('service_visits')
          .select('*')
          .eq('community_id', communityId)
          .order('visit_date', { ascending: true }),
        supabase
          .from('visit_joiners')
          .select('visit_id, user_id')
          .eq('user_id', user.id),
      ]);

      if (visitsResult.error) throw visitsResult.error;

      const visits = visitsResult.data || [];
      if (visits.length === 0) {
        setVisits([]);
        setPastVisits([]);
        return;
      }

      // Batch-fetch creator profiles
      const creatorIds = [...new Set(visits.map((v: any) => v.created_by))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, flat_number, avatar_url')
        .in('id', creatorIds);

      const profileMap: Record<string, any> = {};
      (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

      // Count joiners only for the currently fetched visits to avoid scanning the full table
      const visitIds = visits.map((v: any) => v.id);
      const { data: joinerCounts } = await supabase
        .from('visit_joiners')
        .select('visit_id')
        .in('visit_id', visitIds);

      const joinerCountMap: Record<string, number> = {};
      (joinerCounts || []).forEach((j: any) => {
        joinerCountMap[j.visit_id] = (joinerCountMap[j.visit_id] || 0) + 1;
      });

      const userJoinedSet = new Set(
        (joinersResult.data || []).map((j: any) => j.visit_id)
      );

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const allVisits: VisitWithJoinerData[] = visits.map((sv: any) => {
        const creator = profileMap[sv.created_by] || {};
        
        let adjustedStatus = sv.status;
        const visitDate = new Date(sv.visit_date);
        visitDate.setHours(0, 0, 0, 0);
        if (visitDate < today && adjustedStatus === 'upcoming') {
          adjustedStatus = 'completed';
        }

        return {
          ...sv,
          status: adjustedStatus,
          creator_name: creator.full_name || 'Neighbor',
          creator_flat: creator.flat_number || undefined,
          creator_avatar_url: creator.avatar_url || undefined,
          joiner_count: joinerCountMap[sv.id] || 0,
          has_user_joined: userJoinedSet.has(sv.id),
        };
      });

      // Split into upcoming (date >= today) and past (date < today)
      let upcomingData = allVisits.filter(v => {
        const visitDate = new Date(v.visit_date);
        visitDate.setHours(0, 0, 0, 0);
        return visitDate >= today && (v.status === 'upcoming' || v.status === 'cancelled');
      });

      let pastData = allVisits.filter(v => {
        const visitDate = new Date(v.visit_date);
        visitDate.setHours(0, 0, 0, 0);
        return visitDate < today;
      });

      // Sort: upcoming ASC, past DESC
      upcomingData.sort((a, b) => new Date(a.visit_date).getTime() - new Date(b.visit_date).getTime());
      pastData.sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());

      // Client-side filtering for search
      if (debouncedSearchQuery) {
        const query = debouncedSearchQuery.toLowerCase();
        const filterFn = (v: VisitWithJoinerData) =>
          v.title.toLowerCase().includes(query) ||
          v.provider_name.toLowerCase().includes(query) ||
          v.category.toLowerCase().includes(query);
        upcomingData = upcomingData.filter(filterFn);
        pastData = pastData.filter(filterFn);
      }

      setVisits(upcomingData);
      setPastVisits(pastData);
    } catch (error: any) {
      console.error('fetchVisits error:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load visits' });
    }
  }, [communityId, user?.id, debouncedSearchQuery]);

  // Fetch community stats once on mount / communityId change (not on every tab toggle)
  useEffect(() => {
    fetchCommunityStats();
  }, [fetchCommunityStats]);

  // Debounce free-text search so we don't fire heavy data fetches on every keystroke
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchQuery]);

  // Fetch tab-specific data when segment, filters, or search changes
  useEffect(() => {
    if (segment === 'providers' || segment === 'visits') {
      setActiveSegment(segment);
    }

    if (visitTabParam === 'upcoming' || visitTabParam === 'past') {
      setVisitTab(visitTabParam);
    }
  }, [segment, visitTabParam]);

  useEffect(() => {
    if (activeSegment === 'providers') {
      fetchProviders();
    } else {
      fetchVisits();
    }
  }, [activeSegment, communityId, selectedCategory, debouncedSearchQuery]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (activeSegment === 'providers') {
      await Promise.all([fetchProviders(), fetchCommunityStats()]);
    } else {
      await Promise.all([fetchVisits(), fetchCommunityStats()]);
    }
    setRefreshing(false);
  };

  const handleToggleFavorite = async (providerId: string, isCurrentlyFavorite: boolean) => {
    setProviders(current =>
      current.map(p => p.id === providerId ? { ...p, is_favorite: !isCurrentlyFavorite } : p)
    );

    try {
      if (isCurrentlyFavorite) {
        await supabase
          .from('favorites')
          .delete()
          .match({ user_id: user?.id, provider_id: providerId });
      } else {
        await supabase
          .from('favorites')
          .insert({ user_id: user?.id as string, provider_id: providerId });
      }
    } catch (error) {
      setProviders(current =>
        current.map(p => p.id === providerId ? { ...p, is_favorite: isCurrentlyFavorite } : p)
      );
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to update favorites' });
    }
  };

  const handleJoinVisit = async (visitId: string) => {
    // Navigate to detail for the join flow or handle a quick join if needed.
    // Spec says Join button on card keep friction low, so maybe a quick join modal later.
    // For now, let's navigate to detail or show a toast.
    router.push({
      pathname: '/visits/[id]',
      params: { id: visitId, returnTo: 'visits', visitTab },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.background, colors.surface2, colors.background]}
        locations={[0, 0.5, 1]}
        style={styles.headerGradient}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Service Hub</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.headerButton, { backgroundColor: colors.glass, borderColor: colors.glassBorder, borderWidth: 1 }]}
              onPress={() => router.push('/notifications')}
            >
              <Text style={styles.headerIcon}>{APP_EMOJIS.notifications}</Text>
              {unreadCount > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                  <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerButton, { backgroundColor: colors.glass, borderColor: colors.glassBorder, borderWidth: 1 }]}
              onPress={() => router.push('/(tabs)/profile')}
            >
              <Text style={styles.headerIcon}>{APP_EMOJIS.profile}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      <View style={[styles.segmentedControl, { backgroundColor: colors.glass, borderColor: colors.glassBorder, borderWidth: 1 }]}>
        {activeSegment === 'providers' ? (
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.segmentBtn, styles.segmentBtnActive]}
          >
            <Text style={[styles.segmentText, { color: '#FFF' }]}>Providers</Text>
          </LinearGradient>
        ) : (
          <TouchableOpacity
            style={styles.segmentBtn}
            onPress={() => {
              setActiveSegment('providers');
              setSelectedCategory(null);
              setSearchQuery('');
            }}
          >
            <Text style={[styles.segmentText, { color: colors.textMuted }]}>Providers</Text>
          </TouchableOpacity>
        )}
        {activeSegment === 'visits' ? (
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.segmentBtn, styles.segmentBtnActive]}
          >
            <Text style={[styles.segmentText, { color: '#FFF' }]}>Service Visits</Text>
          </LinearGradient>
        ) : (
          <TouchableOpacity
            style={styles.segmentBtn}
            onPress={() => {
              setActiveSegment('visits');
              setSelectedCategory(null);
              setSearchQuery('');
              setVisitTab('upcoming');
            }}
          >
            <Text style={[styles.segmentText, { color: colors.textMuted }]}>Service Visits</Text>
          </TouchableOpacity>
        )}
      </View>

      {activeSegment === 'providers' ? (
        <FlatList
          data={providers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ProviderCard
              provider={item as ProviderWithInteraction}
              onPress={() => router.push(`/provider/${item.id}`)}
              onToggleFavorite={handleToggleFavorite}
              isLightMode={true}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={8}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            <>
              <UpcomingServicesCard />
              {activeFund && activeFund.goal > 0 && (
                <ActiveFundTeaser
                  title={activeFund.title}
                  collected={activeFund.collected}
                  goal={activeFund.goal}
                  onPress={() => router.push(`/funds/${activeFund.id}`)}
                />
              )}

              <View style={styles.filterSection}>
                <SearchBar
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search help..."
                  isLightMode={true}
                />
                <CategoryFilter
                  selectedCategory={selectedCategory}
                  onSelectCategory={setSelectedCategory}
                  isLightMode={true}
                />
              </View>
            </>
          }
          ListEmptyComponent={
            <EmptyState
              icon={APP_EMOJIS.members}
              title="No Providers Found"
              message={searchQuery || selectedCategory ? "Try adjusting your filters" : "Be the first to add a trusted service provider!"}
              isLightMode={true}
            />
          }
        />
      ) : (
        <SectionList
          sections={groupVisitsByCategory(visitTab === 'upcoming' ? visits : pastVisits)}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const displayStatus =
              visitTab === 'past' && item.status === 'upcoming'
                ? 'completed'
                : (item.status as 'upcoming' | 'in_progress' | 'completed' | 'cancelled');
            return (
              <VisitCard
                id={item.id}
                title={item.title}
                providerName={item.provider_name}
                hasProviderProfile={!!item.provider_id}
                category={item.category}
                visitDate={item.visit_date}
                visitTimeSlot={item.visit_time_slot}
                estimatedCost={item.estimated_cost || undefined}
                creatorName={item.creator_name || 'Neighbor'}
                creatorFlat={item.creator_flat || undefined}
                creatorAvatarUrl={item.creator_avatar_url || undefined}
                createdAt={item.created_at ?? new Date().toISOString()}
                isCreator={item.created_by === user?.id}
                joinerCount={Number(item.joiner_count || 0)}
                maxJoiners={item.max_joiners || undefined}
                hasUserJoined={!!item.has_user_joined}
                status={displayStatus}
                onJoin={() => handleJoinVisit(item.id)}
                onUnjoin={() =>
                  router.push({
                    pathname: '/visits/[id]',
                    params: { id: item.id, returnTo: 'visits', visitTab },
                  })
                }
                onPress={() =>
                  router.push({
                    pathname: '/visits/[id]',
                    params: { id: item.id, returnTo: 'visits', visitTab },
                  })
                }
              />
            );
          }}
          renderSectionHeader={({ section }) => (
            <View style={styles.categoryHeader}>
              <View style={[styles.categoryHeaderAccent, { backgroundColor: CATEGORY_COLORS[section.title] || '#A0AEC0' }]} />
              <Text style={styles.categoryHeaderEmoji}>
                {getServiceCategoryEmoji(section.title)}
              </Text>
              <Text style={[styles.categoryHeaderTitle, { color: colors.text }]}>
                {section.title}
              </Text>
              <View style={[styles.categoryCountBadge, { backgroundColor: (CATEGORY_COLORS[section.title] || '#A0AEC0') + '22' }]}>
                <Text style={[styles.categoryCountText, { color: CATEGORY_COLORS[section.title] || '#A0AEC0' }]}>
                  {section.data.length}
                </Text>
              </View>
            </View>
          )}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            <>
              <UpcomingServicesCard />
              {activeFund && activeFund.goal > 0 && (
                <ActiveFundTeaser
                  title={activeFund.title}
                  collected={activeFund.collected}
                  goal={activeFund.goal}
                  onPress={() => router.push(`/funds/${activeFund.id}`)}
                />
              )}
              <View style={styles.filterSection}>
                <View style={[styles.subTabControl, { backgroundColor: colors.glass, borderColor: colors.glassBorder, borderWidth: 1 }]}>
                  <TouchableOpacity
                    style={[styles.subTabBtn, visitTab === 'upcoming' && { backgroundColor: colors.primary + '15' }]}
                    onPress={() => setVisitTab('upcoming')}
                  >
                    <Text style={[styles.subTabText, visitTab === 'upcoming' ? { color: colors.primary, fontWeight: '700' } : { color: colors.textMuted }]}>
                      Upcoming ({visits.length})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.subTabBtn, visitTab === 'past' && { backgroundColor: colors.primary + '15' }]}
                    onPress={() => setVisitTab('past')}
                  >
                    <Text style={[styles.subTabText, visitTab === 'past' ? { color: colors.primary, fontWeight: '700' } : { color: colors.textMuted }]}>
                      Past ({pastVisits.length})
                    </Text>
                  </TouchableOpacity>
                </View>
                <SearchBar
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search visits..."
                  isLightMode={true}
                />
              </View>
            </>
          }
          ListEmptyComponent={
            visitTab === 'upcoming' ? (
              <EmptyState
                icon={APP_EMOJIS.community}
                title="No Upcoming Visits"
                message={searchQuery ? 'No visits match your search' : 'Be the first to share when a provider is coming!'}
                isLightMode={true}
              />
            ) : (
              <EmptyState
                icon={APP_EMOJIS.loading}
                title="No Past Visits"
                message={searchQuery ? 'No visits match your search' : 'Completed and expired visits will appear here'}
                isLightMode={true}
              />
            )
          }
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push(activeSegment === 'providers' ? '/provider/add' : '/visits/add')}
        activeOpacity={0.9}
      >
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Text style={styles.fabIcon}>{APP_EMOJIS.add}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerGradient: {
    paddingHorizontal: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  headerIcon: {
    fontSize: 20,
    lineHeight: 24,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  segmentedControl: {
    flexDirection: 'row',
    marginHorizontal: 24,
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 11,
  },
  segmentBtnActive: {
    borderRadius: 11,
    overflow: 'hidden',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
  },
  filterSection: {
    marginTop: 8,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  listContent: {
    paddingBottom: 100,
    paddingHorizontal: 24,
  },
  subTabControl: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
  },
  subTabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginTop: 8,
    marginBottom: 4,
    gap: 8,
  },
  categoryHeaderAccent: {
    width: 4,
    height: 22,
    borderRadius: 2,
  },
  categoryHeaderEmoji: {
    fontSize: 18,
    lineHeight: 22,
  },
  categoryHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    letterSpacing: -0.2,
  },
  categoryCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  categoryCountText: {
    fontSize: 13,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    elevation: 0,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    zIndex: 10,
  },
  fabGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabIcon: {
    fontSize: 32,
    lineHeight: 34,
    color: '#FFF',
  },
});
