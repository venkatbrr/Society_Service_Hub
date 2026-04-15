import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/Colors';
import { ProviderCard } from '../../components/ProviderCard';
import { SearchBar } from '../../components/SearchBar';
import { CategoryFilter } from '../../components/CategoryFilter';
import { EmptyState } from '../../components/EmptyState';
import { CommunityInsights } from '../../components/CommunityInsights';
import { ActiveFundTeaser } from '../../components/ActiveFundTeaser';
import { ProviderWithInteraction } from '../../lib/database.types';
import Toast from 'react-native-toast-message';

const isMissingRelationError = (error: { code?: string; message?: string } | null) =>
  error?.code === 'PGRST205' ||
  error?.message?.includes("Could not find the table 'public.provider_hires'");

export default function HomeScreen() {
  const [providers, setProviders] = useState<ProviderWithInteraction[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [insights, setInsights] = useState<any[]>([]);
  const [activeFund, setActiveFund] = useState<any>(null);
  const { user, communityId } = useAuth();
  const router = useRouter();

  const colors = Colors.light;

  const fetchCommunityStats = useCallback(async () => {
    if (!communityId) return;
    try {
      // 1. Fetch Insights
      const { data: insightsData, error: insightsError } = await supabase
        .rpc('get_community_insights', { p_community_id: communityId });
      
      if (!insightsError && insightsData) {
        setInsights([
          { title: 'Most hired', value: insightsData.most_hired_category, icon: 'people', color: '#10B981' },
          { title: 'Spent this month', value: `₹${insightsData.total_spent_month.toLocaleString()}`, icon: 'cash', color: '#3B82F6' },
          { title: 'Contributions', value: `${insightsData.contribution_percentage}%`, icon: 'checkmark-circle', color: '#F59E0B' },
        ]);
      }

      // 2. Fetch Active Fund (most recent event with a goal)
      const { data: fundData } = await supabase
        .from('events')
        .select('*, event_transactions(amount, type)')
        .eq('community_id', communityId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fundData) {
        const collected = fundData.event_transactions
          ?.filter((t: any) => t.type === 'income')
          .reduce((sum: number, t: any) => sum + Number(t.amount), 0) || 0;
        
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
      // 1. Fetch providers
      let query = supabase
        .from('service_providers')
        .select('*')
        .eq('community_id', communityId)
        .order('avg_rating', { ascending: false });

      if (selectedCategory) {
        query = query.eq('category', selectedCategory);
      }

      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,category.ilike.%${searchQuery}%`);
      }

      const { data: providersData, error: providersError } = await query;
      if (providersError) throw providersError;

      // 2. Fetch user's favorites
      const { data: favoritesData, error: favoritesError } = await supabase
        .from('favorites')
        .select('provider_id')
        .eq('user_id', user?.id as string);

      if (favoritesError) throw favoritesError;

      // 3. Fetch hire counts for all providers in this community
      const { data: hiresData, error: hiresError } = await supabase
        .from('provider_hires')
        .select('provider_id');

      if (hiresError && !isMissingRelationError(hiresError)) throw hiresError;

      const hireCounts: Record<string, number> = {};
      (hiresData ?? []).forEach(h => {
        hireCounts[h.provider_id] = (hireCounts[h.provider_id] || 0) + 1;
      });

      const favoriteIds = new Set(favoritesData?.map(f => f.provider_id));

      const mergedData = providersData.map(provider => ({
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

  useEffect(() => {
    fetchProviders();
    fetchCommunityStats();
  }, [fetchProviders, fetchCommunityStats]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchProviders(), fetchCommunityStats()]);
    setRefreshing(false);
  };

  const handleToggleFavorite = async (providerId: string, isCurrentlyFavorite: boolean) => {
    // Optimistic UI update
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
      // Revert on error
      setProviders(current => 
        current.map(p => p.id === providerId ? { ...p, is_favorite: isCurrentlyFavorite } : p)
      );
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to update favorites' });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: colors.textMuted }]}>Tavern</Text>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Service Hub</Text>
        </View>
        <TouchableOpacity 
          style={[styles.profileButton, { backgroundColor: colors.surface2 }]}
          onPress={() => router.push('/(tabs)/profile')}
        >
          <Ionicons name="person" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={providers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ProviderCard 
            provider={item} 
            onPress={() => router.push(`/provider/${item.id}`)}
            onToggleFavorite={handleToggleFavorite}
            isLightMode={true}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <>
            {insights.length > 0 && <CommunityInsights insights={insights} />}
            
            {activeFund && activeFund.goal > 0 && (
              <ActiveFundTeaser 
                title={activeFund.title}
                collected={activeFund.collected}
                goal={activeFund.goal}
                onPress={() => router.push(`/funds/${activeFund.id}`)}
              />
            )}

            <View style={styles.filterSection}>
              <Text style={styles.sectionTitle}>Find Trusted Help</Text>
              <SearchBar 
                value={searchQuery} 
                onChangeText={setSearchQuery} 
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
            icon="people" 
            title="No Providers Found" 
            message={searchQuery || selectedCategory ? "Try adjusting your filters" : "Be the first to add a trusted service provider!"}
            isLightMode={true}
          />
        }
      />

      <TouchableOpacity 
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => router.push('/provider/add')}
        activeOpacity={0.9}
      >
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
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
    bottom: 24,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
