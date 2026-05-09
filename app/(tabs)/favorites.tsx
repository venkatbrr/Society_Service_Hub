import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { EmptyState } from '../../components/EmptyState';
import { ProviderCard } from '../../components/ProviderCard';
import { Verandah } from '../../constants/Colors';
import { APP_EMOJIS } from '../../constants/emojis';
import { VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { ProviderWithInteraction } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';

export default function FavoritesScreen() {
  const [providers, setProviders] = useState<ProviderWithInteraction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

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
        .filter(p => !p.fraud_status || p.fraud_status === 'pass' || p.fraud_status === 'queued_low')
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
    <View style={styles.container}>
      <View style={styles.headerWrapper}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Saved</Text>
          <Text style={styles.headerSubtitle}>
            Your favorite providers
          </Text>
        </View>
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
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={8}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Verandah.accent} />
        }
        ListEmptyComponent={
          <EmptyState
            icon={APP_EMOJIS.favoritesEmpty}
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
    backgroundColor: Verandah.surface,
  },
  headerWrapper: {
    backgroundColor: Verandah.surface,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTitle: {
    ...VerandahType.display,
    color: Verandah.textPrimary,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    marginTop: 4,
    color: Verandah.textSecondary,
  },
  listContent: {
    padding: 16,
  },
});
