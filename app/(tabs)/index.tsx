import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
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
      <SearchBar 
        value={searchQuery} 
        onChangeText={setSearchQuery} 
        isLightMode={true} 
      />
      
      <View>
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState 
            icon="people-outline" 
            title="No Providers Found" 
            message={searchQuery || selectedCategory ? "Try adjusting your filters" : "Be the first to add a trusted service provider!"}
            isLightMode={true}
          />
        }
      />

      <TouchableOpacity 
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => router.push('/provider/add')}
      >
        <Ionicons name="add" size={24} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 80, // Space for FAB
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
});
