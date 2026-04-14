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
import { ProviderWithInteraction } from '../../lib/database.types';
import Toast from 'react-native-toast-message';

export default function HomeScreen() {
  const [providers, setProviders] = useState<ProviderWithInteraction[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { user, communityId } = useAuth();
  const router = useRouter();

  const colors = Colors.light;

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

      const favoriteIds = new Set(favoritesData?.map(f => f.provider_id));

      const mergedData = providersData.map(provider => ({
        ...provider,
        is_favorite: favoriteIds.has(provider.id)
      }));

      setProviders(mergedData);
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load providers' });
    }
  }, [communityId, selectedCategory, searchQuery, user?.id]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProviders();
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

      <View style={styles.filterSection}>
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
    marginBottom: 8,
  },
  listContent: {
    padding: 20,
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
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
