import { Bell01 } from '@untitledui/icons/Bell01';
import { Calendar } from '@untitledui/icons/Calendar';
import { Plus } from '@untitledui/icons/Plus';
import { Tool01 } from '@untitledui/icons/Tool01';
import { UserPlus01 } from '@untitledui/icons/UserPlus01';
import { Users01 } from '@untitledui/icons/Users01';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, RefreshControl, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { CategoryFilter } from '../../components/CategoryFilter';
import { EmptyState } from '../../components/EmptyState';
import { ProviderCard } from '../../components/ProviderCard';
import { SearchBar } from '../../components/SearchBar';
import { UpcomingServicesCard } from '../../components/UpcomingServicesCard';
import { VisitCard } from '../../components/VisitCard';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { ProviderWithInteraction, VisitWithJoinerData } from '../../lib/database.types';
import { SegmentedSlider } from '../../components/SegmentedSlider';
import { shareOrCopy } from '../../lib/share';
import { siteUrl } from '../../lib/siteUrl';
import { supabase } from '../../lib/supabase';
import { useWebPullToRefresh } from '../../components/useWebPullToRefresh';
import { WebPullIndicator } from '../../components/WebPullIndicator';


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

const parseLocalDateOnly = (dateStr: string) => {
  const [year, month, day] = dateStr.split('-').map((part) => Number(part));
  if (!year || !month || !day) return new Date(dateStr);
  return new Date(year, month - 1, day);
};

const normalizeVisitStatus = (status: unknown) => String(status ?? '').trim().toLowerCase();

export default function HomeScreen() {
  const { segment, visitTab: visitTabParam } = useLocalSearchParams<{ segment?: string; visitTab?: 'upcoming' | 'past' | 'archived' }>();
  const [activeSegment, setActiveSegment] = useState<'providers' | 'visits'>('providers');
  const [providers, setProviders] = useState<ProviderWithInteraction[]>([]);
  const [visits, setVisits] = useState<VisitWithJoinerData[]>([]);
  const [pastVisits, setPastVisits] = useState<VisitWithJoinerData[]>([]);
  const [visitTab, setVisitTab] = useState<'upcoming' | 'past'>('upcoming');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedGroupCategories, setSelectedGroupCategories] = useState<string[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersLoadError, setProvidersLoadError] = useState<string | null>(null);
  const [visitsLoading, setVisitsLoading] = useState(true);
  const [visitsLoadError, setVisitsLoadError] = useState<string | null>(null);
  const [activeFund, setActiveFund] = useState<any>(null);
  const [communityInvite, setCommunityInvite] = useState<{ name: string; code: string | null; address: string | null } | null>(null);
  const { user, communityId } = useAuth();
  const router = useRouter();

  const { unreadCount } = useNotifications();

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
        });
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }, [communityId]);

  useEffect(() => {
    async function fetchCommunityInvite() {
      if (!communityId) {
        setCommunityInvite(null);
        return;
      }

      const { data, error } = await supabase
        .from('communities')
        .select('name, code, address')
        .eq('id', communityId)
        .maybeSingle();

      if (error) {
        console.error('Error loading invite code:', error);
        return;
      }

      if (data) {
        setCommunityInvite({ name: data.name, code: data.code, address: data.address });
      }
    }

    fetchCommunityInvite();
  }, [communityId]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const firstName = useMemo(() => {
    const full = String(user?.user_metadata?.full_name || '').trim();
    return full ? full.split(/\s+/)[0] : 'there';
  }, [user?.user_metadata?.full_name]);

  const handleInviteNeighbors = useCallback(async () => {
    if (!communityInvite?.code) {
      Toast.show({ type: 'error', text1: 'Invite code unavailable', text2: 'Community code is not ready yet.' });
      return;
    }

    const shareUrl = communityId
      ? siteUrl(`/api/share-community?id=${communityId}&code=${encodeURIComponent(communityInvite.code)}`)
      : null;
    const message = [
      `Join my community on Wooru!`,
      communityInvite.name ? `Community: ${communityInvite.name}` : null,
      `Code: ${communityInvite.code}`,
      shareUrl,
    ]
      .filter(Boolean)
      .join('\n');

    await shareOrCopy({ message });
  }, [communityInvite, communityId]);

  const fetchProviders = useCallback(async () => {
    if (!communityId) return;

    setProvidersLoading(true);
    setProvidersLoadError(null);
    try {
      let query = supabase
        .from('service_providers')
        .select('*')
        .eq('community_id', communityId)
        .order('avg_rating', { ascending: false })
        .limit(100);

      if (selectedCategory && selectedCategory !== 'All') {
        query = query.eq('category', selectedCategory);
      } else if (selectedGroupCategories && selectedGroupCategories.length > 0) {
        query = query.in('category', selectedGroupCategories);
      }

      if (debouncedSearchQuery) {
        const safe = debouncedSearchQuery.replace(/[,()%\\.]/g, ' ').trim();
        const digits = debouncedSearchQuery.replace(/\D/g, '');
        if (safe || digits) {
          const clauses: string[] = [];
          if (safe) clauses.push(`name.ilike.%${safe}%`, `category.ilike.%${safe}%`);
          if (digits) clauses.push(`phone.ilike.%${digits}%`);
          query = query.or(clauses.join(','));
        }
      }

      // Fetch providers, favorites, and hire counts in parallel
      const [providersResult, favoritesResult, hiresResult] = await Promise.all([
        query,
        supabase.from('favorites')
          .select('provider_id')
          .eq('user_id', user?.id as string),
        supabase.from('provider_hires')
          .select('provider_id, user_id')
      ]);

      if (providersResult.error) throw providersResult.error;
      if (favoritesResult.error) throw favoritesResult.error;

      const userSetPerProvider: Record<string, Set<string>> = {};
      if (hiresResult.error && !isMissingRelationError(hiresResult.error)) {
        console.warn('Failed to load hire counts:', hiresResult.error.message);
      } else if (hiresResult.data) {
        hiresResult.data.forEach((h: any) => {
          if (h.provider_id && h.user_id) {
            if (!userSetPerProvider[h.provider_id]) {
              userSetPerProvider[h.provider_id] = new Set();
            }
            userSetPerProvider[h.provider_id].add(h.user_id);
          }
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
          hire_count: userSetPerProvider[provider.id]?.size || 0
        }));

      setProviders(mergedData);
    } catch (error: any) {
      console.error(error);
      setProvidersLoadError('Failed to load providers');
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load providers' });
    } finally {
      setProvidersLoading(false);
    }
  }, [communityId, selectedCategory, selectedGroupCategories, debouncedSearchQuery, user?.id]);

  const fetchVisits = useCallback(async () => {
    if (!communityId || !user?.id) return;

    setVisitsLoading(true);
    setVisitsLoadError(null);
    try {
      // Fetch visits and user's joined visits in parallel
      const [visitsResult, joinersResult] = await Promise.all([
        supabase
          .from('service_visits')
          .select('*')
          .eq('community_id', communityId)
          .order('visit_date', { ascending: true })
          .limit(100),
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

        let adjustedStatus = normalizeVisitStatus(sv.status);
        const visitDate = parseLocalDateOnly(sv.visit_date);
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

      // Split into upcoming and past buckets.
      // Completed and cancelled visits move to past immediately, regardless of date.
      let upcomingData = allVisits.filter(v => {
        const visitDate = parseLocalDateOnly(v.visit_date);
        visitDate.setHours(0, 0, 0, 0);
        const status = normalizeVisitStatus(v.status);
        return visitDate >= today && status === 'upcoming';
      });

      let pastData = allVisits.filter(v => {
        const visitDate = parseLocalDateOnly(v.visit_date);
        visitDate.setHours(0, 0, 0, 0);
        const status = normalizeVisitStatus(v.status);
        return visitDate < today || status === 'completed' || status === 'cancelled';
      });

      // Sort: upcoming ASC, past DESC
      upcomingData.sort((a, b) => parseLocalDateOnly(a.visit_date).getTime() - parseLocalDateOnly(b.visit_date).getTime());
      pastData.sort((a, b) => parseLocalDateOnly(b.visit_date).getTime() - parseLocalDateOnly(a.visit_date).getTime());

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
      console.error(error);
      setVisitsLoadError('Failed to load visits');
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load visits' });
    } finally {
      setVisitsLoading(false);
    }
  }, [communityId, user?.id, searchQuery]);

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
    } else if (visitTabParam === 'archived') {
      // Archived was merged into Past — map old deep links onto it.
      setVisitTab('past');
    }
  }, [segment, visitTabParam]);

  useFocusEffect(
    useCallback(() => {
      if (activeSegment === 'providers') {
        fetchProviders();
      } else {
        fetchVisits();
      }
    }, [activeSegment, fetchProviders, fetchVisits])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    if (activeSegment === 'providers') {
      await Promise.all([fetchProviders(), fetchCommunityStats()]);
    } else {
      await Promise.all([fetchVisits(), fetchCommunityStats()]);
    }
    setRefreshing(false);
  };

  const pullToRefresh = useWebPullToRefresh(onRefresh, refreshing);

  const handleToggleFavorite = async (providerId: string, isCurrentlyFavorite: boolean) => {
    setProviders(current =>
      current.map(p => p.id === providerId ? { ...p, is_favorite: !isCurrentlyFavorite } : p)
    );

    const { error } = isCurrentlyFavorite
      ? await supabase.from('favorites').delete().match({ user_id: user?.id, provider_id: providerId })
      : await supabase.from('favorites').insert({ user_id: user?.id as string, provider_id: providerId });

    if (error) {
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
    <View style={styles.container}>
      <View style={styles.headerWrapper}>
        {/* Brand row: app mark + wordmark, then bell and avatar */}
        <View style={styles.brandRow}>
          <View style={styles.brandLeft}>
            <View style={styles.logoMark}>
              <Image
                source={require('../../assets/images/icon.png')}
                style={styles.logoImage}
                resizeMode="cover"
              />
            </View>
            <Text style={styles.wordmark}>Wooru</Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerButtonWithText}
              onPress={handleInviteNeighbors}
              activeOpacity={0.8}
            >
              <UserPlus01 size={15} color={Verandah.accent} aria-hidden={true} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => router.push('/notifications')}
            >
              <Bell01 size={18} color={Verandah.primary} aria-hidden={true} />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Greeting */}
        <View style={styles.greetingBlock}>
          <Text style={styles.greetingText}>{greeting}, {firstName}</Text>
        </View>
      </View>

      <SegmentedSlider<'providers' | 'visits'>
        value={activeSegment}
        onChange={(seg) => {
          setActiveSegment(seg);
          setSelectedCategory(null);
          setSelectedGroupCategories(null);
          setSearchQuery('');
          if (seg === 'visits') {
            setVisitTab('upcoming');
          }
        }}
        segments={[
          { key: 'providers', label: 'Providers' },
          { key: 'visits', label: 'Visits' },
        ]}
        trackStyle={styles.segmentedControl}
        segmentStyle={styles.segmentBtn}
        pillStyle={styles.segmentBtnActive}
        activeTextStyle={{ color: Verandah.primary, fontWeight: '700' }}
        inactiveTextStyle={{ color: Verandah.textMuted }}
      />

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
          {...pullToRefresh.pullProps}
          refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Verandah.accent} />
          }
          ListHeaderComponent={
            <>
              <WebPullIndicator pullDistance={pullToRefresh.pullDistance} refreshing={refreshing} isPulling={pullToRefresh.isPulling} />
              <UpcomingServicesCard />

              <View style={styles.filterSection}>
                <SearchBar
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search by name or phone number..."
                  isLightMode={true}
                />
                <CategoryFilter
                  selectedCategory={selectedCategory}
                  onSelectCategory={setSelectedCategory}
                  onSelectGroupCategories={setSelectedGroupCategories}
                  isLightMode={true}
                />
              </View>
            </>
          }
          ListEmptyComponent={
            providersLoading ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={Verandah.accent} />
              </View>
            ) : providersLoadError ? (
              <EmptyState
                IconComponent={Users01}
                title="Couldn't Load Providers"
                message="Check your connection and pull down to retry."
                isLightMode={true}
              />
            ) : (
              <EmptyState
                IconComponent={Users01}
                title="No Providers Found"
                message={searchQuery || selectedCategory ? "Try adjusting your filters" : "Be the first to add a trusted service provider!"}
                isLightMode={true}
              />
            )
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
              <View style={[styles.categoryHeaderAccent, { backgroundColor: Verandah.accent }]} />
              <Tool01 size={14} color={Verandah.accent} aria-hidden={true} />
              <Text style={[styles.categoryHeaderTitle, { color: Verandah.textPrimary }]}>
                {section.title}
              </Text>
              <View style={[styles.categoryCountBadge, { backgroundColor: Verandah.accentSoft }]}>
                <Text style={[styles.categoryCountText, { color: Verandah.accent }]}>
                  {section.data.length}
                </Text>
              </View>
            </View>
          )}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          {...pullToRefresh.pullProps}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Verandah.accent} />
          }
          ListHeaderComponent={
            <>
              <WebPullIndicator pullDistance={pullToRefresh.pullDistance} refreshing={refreshing} isPulling={pullToRefresh.isPulling} />
              <UpcomingServicesCard />

              <View style={styles.filterSection}>
                <SegmentedSlider<'upcoming' | 'past'>
                  value={visitTab}
                  onChange={(tab) => setVisitTab(tab)}
                  segments={[
                    { key: 'upcoming', label: `Upcoming (${visits.length})` },
                    { key: 'past', label: `Past (${pastVisits.length})` },
                  ]}
                  trackStyle={styles.subTabControl}
                  segmentStyle={styles.subTabBtn}
                  pillStyle={{ backgroundColor: Verandah.card, ...Verandah.shadowCard }}
                  activeTextStyle={{ color: Verandah.primary, fontWeight: '700' }}
                  inactiveTextStyle={{ color: Verandah.textMuted }}
                />
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
            visitsLoading ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={Verandah.accent} />
              </View>
            ) : visitsLoadError ? (
              <EmptyState
                IconComponent={Users01}
                title="Couldn't Load Visits"
                message="Check your connection and pull down to retry."
                isLightMode={true}
              />
            ) : visitTab === 'upcoming' ? (
              <EmptyState
                IconComponent={Calendar}
                title="No Upcoming Visits"
                message={searchQuery ? 'No visits match your search' : 'Be the first to share when a provider is coming!'}
                isLightMode={true}
              />
            ) : (
              <EmptyState
                IconComponent={Calendar}
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
        <View style={styles.fabInner}>
          <Plus size={24} color={Verandah.primaryFg} aria-hidden={true} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Verandah.paper,
  },
  headerWrapper: {
    backgroundColor: Verandah.paper,
    paddingHorizontal: 24,
    paddingTop: VerandahLayout.screenPaddingTop,
    paddingBottom: 4,
  },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  logoMark: {
    width: 32,
    height: 32,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: Verandah.teal900,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  wordmark: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '400',
    letterSpacing: -0.3,
    color: Verandah.textPrimary,
  },
  greetingBlock: {
    marginTop: 10,
  },
  greetingText: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '400',
    letterSpacing: -0.4,
    color: Verandah.textPrimary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  locationText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 12.5,
    lineHeight: 17,
    color: Verandah.textSecondary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: VerandahLayout.screenPaddingTop,
    paddingBottom: 4,
  },
  headerTitle: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '400',
    color: Verandah.textPrimary,
    marginTop: 10,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  headerButtonWithText: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Verandah.accent,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 2,
    borderColor: Verandah.paper,
  },
  badgeText: {
    color: Verandah.primaryFg,
    fontSize: 9,
    fontWeight: '700',
    fontFamily: VerandahType.sansFamily,
  },
  segmentedControl: {
    flexDirection: 'row',
    marginHorizontal: 24,
    borderRadius: VerandahRadius.segmented, // 12px
    padding: 3,
    marginBottom: 8,
    backgroundColor: Verandah.cardMuted,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: VerandahRadius.segmentedInner, // 9px
  },
  segmentBtnActive: {
    backgroundColor: Verandah.card,
    ...Verandah.shadowCard,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: VerandahType.sansFamily,
  },
  filterSection: {
    marginTop: 2,
    marginBottom: 2,
  },
  listContent: {
    paddingBottom: 100,
    paddingHorizontal: 24,
    paddingTop: 2,
  },
  subTabControl: {
    flexDirection: 'row',
    borderRadius: VerandahRadius.segmented,
    padding: 3,
    marginBottom: 10,
    backgroundColor: Verandah.cardMuted,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
  },
  subTabBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: VerandahRadius.segmentedInner,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTabText: {
    fontSize: 12.5,
    fontWeight: '500',
    fontFamily: VerandahType.sansFamily,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginTop: 6,
    marginBottom: 4,
    gap: 8,
  },
  categoryHeaderAccent: {
    width: 3,
    height: 16,
    borderRadius: 2,
  },
  categoryHeaderTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    letterSpacing: -0.2,
    fontFamily: VerandahType.sansFamily,
  },
  categoryCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  categoryCountText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: VerandahType.sansFamily,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    zIndex: 10,
    ...Verandah.shadowRaised,
  },
  fabInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Verandah.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
