import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/Colors';
import { SearchBar } from '../../components/SearchBar';
import { CategoryFilter } from '../../components/CategoryFilter';
import { EmptyState } from '../../components/EmptyState';
import { BusinessCard } from '../../components/BusinessCard';
import { BusinessWithInteraction } from '../../lib/database.types';
import Toast from 'react-native-toast-message';

const BUSINESS_CATEGORIES = ['All', 'Food', 'Baked Goods', 'Crafts', 'Beauty', 'Tailoring', 'Tutoring', 'Other'];

export default function BusinessBrowseScreen() {
  const { user, communityId } = useAuth();
  const router = useRouter();
  const colors = Colors.light;

  const [businesses, setBusinesses] = useState<BusinessWithInteraction[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchBusinesses = useCallback(async () => {
    if (!communityId) return;
    
    try {
      // Fetch businesses and favorites in parallel
      const [bizResult, favoritesResult] = await Promise.all([
        supabase.rpc('get_community_businesses', {
          p_community_id: communityId
        }),
        supabase.from('favorites')
          .select('business_id')
          .eq('user_id', user?.id as string)
          .not('business_id', 'is', null)
      ]);

      if (bizResult.error) throw bizResult.error;
      if (favoritesResult.error) throw favoritesResult.error;

      const favoriteIds = new Set(favoritesResult.data?.map(f => f.business_id));

      let processedData = (bizResult.data as BusinessWithInteraction[]).map(biz => ({
        ...biz,
        is_favorite: favoriteIds.has(biz.id)
      }));

      // Client-side filtering for search and category
      if (selectedCategory && selectedCategory !== 'All') {
        processedData = processedData.filter(biz => biz.category === selectedCategory);
      }

      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        processedData = processedData.filter(biz => 
          biz.name.toLowerCase().includes(query) || 
          biz.description?.toLowerCase().includes(query) ||
          biz.category.toLowerCase().includes(query)
        );
      }

      setBusinesses(processedData);
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load businesses' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [communityId, user?.id, searchQuery, selectedCategory]);

  useEffect(() => {
    fetchBusinesses();
  }, [fetchBusinesses]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBusinesses();
  };

  const handleToggleFavorite = async (businessId: string, isCurrentlyFavorite: boolean) => {
    // Optimistic UI update
    setBusinesses(current => 
      current.map(b => b.id === businessId ? { ...b, is_favorite: !isCurrentlyFavorite } : b)
    );

    try {
      if (isCurrentlyFavorite) {
        await supabase
          .from('favorites')
          .delete()
          .match({ user_id: user?.id, business_id: businessId });
      } else {
        await supabase
          .from('favorites')
          .insert({ user_id: user?.id as string, business_id: businessId });
      }
    } catch (error) {
      // Revert on error
      setBusinesses(current => 
        current.map(b => b.id === businessId ? { ...b, is_favorite: isCurrentlyFavorite } : b)
      );
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to update favorites' });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: colors.textMuted }]}>Made in Community</Text>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Resident Business</Text>
        </View>
        <TouchableOpacity 
          style={[styles.profileButton, { backgroundColor: colors.surface2 }]}
          onPress={() => router.push('/(tabs)/profile')}
        >
          <Ionicons name="person" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={businesses}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <BusinessCard 
            id={item.id}
            name={item.name}
            category={item.category}
            coverPhotoUrl={item.cover_photo_url}
            ownerName={item.owner_name || 'Resident'}
            ownerFlat={item.owner_flat}
            avgRating={Number(item.avg_rating || 0)}
            ratingCount={Number(item.rating_count || 0)}
            isAcceptingOrders={item.is_accepting_orders}
            operatingHours={item.operating_hours}
            orderCutoff={item.order_cutoff}
            isFavorited={!!item.is_favorite}
            onToggleFavorite={() => handleToggleFavorite(item.id, !!item.is_favorite)}
            onPress={() => router.push(`/business/${item.id}`)}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View style={styles.filterSection}>
            <Text style={styles.sectionTitle}>Home businesses by your neighbors</Text>
            <SearchBar 
              value={searchQuery} 
              onChangeText={setSearchQuery} 
              placeholder="Search products or businesses..."
              isLightMode={true} 
            />
            <CategoryFilter 
              selectedCategory={selectedCategory} 
              onSelectCategory={setSelectedCategory} 
              categories={BUSINESS_CATEGORIES}
              isLightMode={true} 
            />
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState 
              icon="storefront-outline" 
              title="No Businesses Found" 
              message={searchQuery || selectedCategory ? "Try adjusting your filters" : "Be the first to start a home business in your community!"}
              isLightMode={true}
            />
          ) : null
        }
      />

      <TouchableOpacity 
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => router.push('/business/add')}
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
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    letterSpacing: -0.2,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  fab: {
    position: 'absolute',
    bottom: 32,
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
    zIndex: 10,
  },
});
