import { Bookmark } from '@untitledui/icons/Bookmark';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { EmptyState } from '../../components/EmptyState';
import { ProviderCard } from '../../components/ProviderCard';
import { useWebPullToRefresh } from '../../components/useWebPullToRefresh';
import { WebPullIndicator } from '../../components/WebPullIndicator';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahType } from '../../constants/Verandah';
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

  const pullToRefresh = useWebPullToRefresh(onRefresh, refreshing);

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
            Your saved service providers
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
        // Same defaults as the Providers list — see the note there. The tuned-down
        // window stopped this list at roughly one screenful too.
        initialNumToRender={12}
        {...pullToRefresh.pullProps}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Verandah.accent} />
        }
        ListHeaderComponent={
          <WebPullIndicator pullDistance={pullToRefresh.pullDistance} refreshing={refreshing} isPulling={pullToRefresh.isPulling} />
        }
        ListEmptyComponent={
          <EmptyState
            IconComponent={Bookmark}
            title="No Saved Providers"
            message="Tap the bookmark icon on a service provider to save them here."
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
    backgroundColor: Verandah.paper,
  },
  headerWrapper: {
    backgroundColor: Verandah.paper,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: VerandahLayout.screenPaddingTop,
    paddingBottom: 14,
  },
  headerTitle: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '400',
    color: Verandah.textPrimary,
    marginTop: 10,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 4,
    color: Verandah.textSecondary,
    fontFamily: VerandahType.sansFamily,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 12,
  },
});
