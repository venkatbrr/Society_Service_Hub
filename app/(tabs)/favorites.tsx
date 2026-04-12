import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/Colors';
import { ProviderCard } from '../../components/ProviderCard';
import { EmptyState } from '../../components/EmptyState';
import { ProviderWithInteraction } from '../../lib/database.types';
import Toast from 'react-native-toast-message';

export default function FavoritesScreen() {
  const [providers, setProviders] = useState<ProviderWithInteraction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  const colors = Colors.light;

  const fetchFavorites = useCallback(async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('favorites')
        .select(`
          provider_id,
          service_providers (*)
        `)
        .eq('user_id', user.id);

      if (error) throw error;

      const formattedData = data
        .map(item => item.service_providers as unknown as ProviderWithInteraction)
        .filter(Boolean)
        .map(p => ({ ...p, is_favorite: true }));

      setProviders(formattedData);
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load favorites' });
    }
  }, [user]);

  // Use focus effect to refresh favorites when arriving on the tab
  useFocusEffect(
    useCallback(() => {
      fetchFavorites();
    }, [fetchFavorites])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchFavorites();
    setRefreshing(false);
  };

  const handleToggleFavorite = async (providerId: string, isCurrentlyFavorite: boolean) => {
    // For the favorites screen, toggling off should remove it from the list
    setProviders(current => current.filter(p => p.id !== providerId));

    try {
      if (isCurrentlyFavorite) {
        await supabase
          .from('favorites')
          .delete()
          .match({ user_id: user?.id, provider_id: providerId });
      }
    } catch (error) {
      // Refresh to restore state on error
      await fetchFavorites();
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to update favorites' });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
            icon="heart-outline" 
            title="No Favorites Yet" 
            message="Tap the heart icon on a service provider to save them here."
            isLightMode={true}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
});
