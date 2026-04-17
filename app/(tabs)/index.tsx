import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { ActiveFundTeaser } from '../../components/ActiveFundTeaser';
import { CategoryFilter } from '../../components/CategoryFilter';
import { CommunityInsights } from '../../components/CommunityInsights';
import { EmptyState } from '../../components/EmptyState';
import { ProviderCard } from '../../components/ProviderCard';
import { SearchBar } from '../../components/SearchBar';
import { VisitCard } from '../../components/VisitCard';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { ProviderWithInteraction, VisitWithJoinerData } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';

const isMissingRelationError = (error: { code?: string; message?: string } | null) =>
  error?.code === 'PGRST205' ||
  error?.message?.includes("Could not find the table 'public.provider_hires'");

const VISIT_CATEGORIES = ['All', 'Cleaning', 'Repair', 'Pest Control', 'Electrician', 'Plumber', 'AC Service', 'Painting', 'Other'];

export default function HomeScreen() {
  const [activeSegment, setActiveSegment] = useState<'providers' | 'visits'>('providers');
  const [providers, setProviders] = useState<ProviderWithInteraction[]>([]);
  const [visits, setVisits] = useState<VisitWithJoinerData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [insights, setInsights] = useState<any[]>([]);
  const [activeFund, setActiveFund] = useState<any>(null);
  const { user, communityId } = useAuth();
  const router = useRouter();

  const { unreadCount } = useNotifications();
  const colors = Colors.light;

  const fetchCommunityStats = useCallback(async () => {
    if (!communityId) return;
    try {
      // Fetch insights and active fund in parallel
      const [insightsResult, fundResult] = await Promise.all([
        supabase.rpc('get_community_insights', { p_community_id: communityId }),
        supabase.from('events')
          .select('*, event_transactions(amount, type)')
          .eq('community_id', communityId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      if (!insightsResult.error && insightsResult.data) {
        setInsights([
          { title: 'Most hired', value: insightsResult.data.most_hired_category, icon: 'people', color: colors.secondary },
          { title: 'Spent this month', value: `₹${insightsResult.data.total_spent_month.toLocaleString()}`, icon: 'cash', color: colors.primary },
          { title: 'Contributions', value: `${insightsResult.data.contribution_percentage}%`, icon: 'checkmark-circle', color: colors.warning },
        ]);
      }

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

      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,category.ilike.%${searchQuery}%`);
      }

      // Fetch providers, favorites, and hire counts in parallel
      const [providersResult, favoritesResult, hiresResult] = await Promise.all([
        query,
        supabase.from('favorites')
          .select('provider_id')
          .eq('user_id', user?.id as string),
        supabase.from('provider_hires')
          .select('provider_id')
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

      const mergedData = providersResult.data.map(provider => ({
        ...provider,
        is_favorite: favoriteIds.has(provider.id),
        hire_count: hireCounts[provider.id] || 0
      }));

      setProviders(mergedData);
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load providers' });
    }
  }, [communityId, selectedCategory, searchQuery, user?.id]);

  const fetchVisits = useCallback(async () => {
    if (!communityId || !user?.id) return;

    try {
      const { data, error } = await supabase.rpc('get_community_visits', {
        p_community_id: communityId,
        p_user_id: user.id,
        p_status: 'upcoming,cancelled'
      });

      if (error) throw error;

      let processedData = data as VisitWithJoinerData[];

      // Client-side filtering for search and category (RPC already filters date)
      if (selectedCategory && selectedCategory !== 'All') {
        processedData = processedData.filter(v => v.category === selectedCategory);
      }

      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        processedData = processedData.filter(v =>
          v.title.toLowerCase().includes(query) ||
          v.provider_name.toLowerCase().includes(query) ||
          v.category.toLowerCase().includes(query)
        );
      }

      setVisits(processedData);
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load visits' });
    }
  }, [communityId, user?.id, searchQuery, selectedCategory]);

  // Fetch community stats once on mount / communityId change (not on every tab toggle)
  useEffect(() => {
    fetchCommunityStats();
  }, [fetchCommunityStats]);

  // Fetch tab-specific data when segment, filters, or search changes
  useEffect(() => {
    if (activeSegment === 'providers') {
      fetchProviders();
    } else {
      fetchVisits();
    }
  }, [activeSegment, communityId, selectedCategory, searchQuery]);

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
    router.push(`/visits/${visitId}`);
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
            <Text style={[styles.greeting, { color: colors.textMuted }]}>Tavern</Text>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Service Hub</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.headerButton, { backgroundColor: colors.glass, borderColor: colors.glassBorder, borderWidth: 1 }]}
              onPress={() => router.push('/notifications')}
            >
              <Ionicons name="notifications" size={20} color={colors.primary} />
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
              <Ionicons name="person" size={20} color={colors.primary} />
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
            <Text style={[styles.segmentText, { color: '#FFF' }]}>Visits</Text>
          </LinearGradient>
        ) : (
          <TouchableOpacity
            style={styles.segmentBtn}
            onPress={() => {
              setActiveSegment('visits');
              setSelectedCategory(null);
              setSearchQuery('');
            }}
          >
            <Text style={[styles.segmentText, { color: colors.textMuted }]}>Visits</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={activeSegment === 'providers' ? providers : visits}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          activeSegment === 'providers' ? (
            <ProviderCard
              provider={item as ProviderWithInteraction}
              onPress={() => router.push(`/provider/${item.id}`)}
              onToggleFavorite={handleToggleFavorite}
              isLightMode={true}
            />
          ) : (
            <VisitCard
              id={item.id}
              title={(item as VisitWithJoinerData).title}
              providerName={(item as VisitWithJoinerData).provider_name}
              hasProviderProfile={!!(item as VisitWithJoinerData).provider_id}
              category={(item as VisitWithJoinerData).category}
              visitDate={(item as VisitWithJoinerData).visit_date}
              visitTimeSlot={(item as VisitWithJoinerData).visit_time_slot}
              estimatedCost={(item as VisitWithJoinerData).estimated_cost || undefined}
              creatorName={(item as VisitWithJoinerData).creator_name || 'Neighbor'}
              creatorFlat={(item as VisitWithJoinerData).creator_flat || undefined}
              creatorAvatarUrl={(item as VisitWithJoinerData).creator_avatar_url || undefined}
              createdAt={(item as VisitWithJoinerData).created_at}
              isCreator={(item as VisitWithJoinerData).created_by === user?.id}
              joinerCount={Number((item as VisitWithJoinerData).joiner_count || 0)}
              maxJoiners={(item as VisitWithJoinerData).max_joiners || undefined}
              hasUserJoined={!!(item as VisitWithJoinerData).has_user_joined}
              status={(item as VisitWithJoinerData).status}
              onJoin={() => handleJoinVisit(item.id)}
              onUnjoin={() => router.push(`/visits/${item.id}`)}
              onPress={() => router.push(`/visits/${item.id}`)}
            />
          )
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <>
            {activeSegment === 'providers' && insights.length > 0 && <CommunityInsights insights={insights} />}

            {activeFund && activeFund.goal > 0 && (
              <ActiveFundTeaser
                title={activeFund.title}
                collected={activeFund.collected}
                goal={activeFund.goal}
                onPress={() => router.push(`/funds/${activeFund.id}`)}
              />
            )}

            <View style={styles.filterSection}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {activeSegment === 'providers' ? 'Find Trusted Help' : 'Upcoming Community Visits'}
              </Text>
              <SearchBar
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={activeSegment === 'providers' ? "Search help..." : "Search visits..."}
                isLightMode={true}
              />
              <CategoryFilter
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                categories={activeSegment === 'providers' ? undefined : VISIT_CATEGORIES}
                isLightMode={true}
              />
            </View>
          </>
        }
        ListEmptyComponent={
          <EmptyState
            icon={activeSegment === 'providers' ? "people" : "calendar"}
            title={activeSegment === 'providers' ? "No Providers Found" : "No Upcoming Visits"}
            message={searchQuery || selectedCategory ? "Try adjusting your filters" :
              (activeSegment === 'providers' ? "Be the first to add a trusted service provider!" : "Be the first to share when a provider is coming!")}
            isLightMode={true}
          />
        }
      />

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
          <Ionicons name="add" size={32} color="#FFF" />
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
  greeting: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
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
    paddingHorizontal: 24,
    marginTop: 10,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  listContent: {
    paddingBottom: 100,
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    elevation: 8,
    shadowColor: '#6C63FF',
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
});
