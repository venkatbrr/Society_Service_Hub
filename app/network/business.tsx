import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { EmptyState } from '../../components/EmptyState';
import { McnListingCard, McnListingItem } from '../../components/McnListingCard';
import { useWebPullToRefresh } from '../../components/useWebPullToRefresh';
import { Verandah } from '../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../constants/Verandah';
import { APP_EMOJIS } from '../../constants/emojis';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

type McnCategory = { id: string; name: string; emoji: string; sort_order: number };

export default function BusinessListingsScreen() {
  const router = useRouter();
  const { communityId, user, isCommunityLead } = useAuth();
  const colors = Verandah;

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [listings, setListings] = useState<McnListingItem[]>([]);
  const [categories, setCategories] = useState<McnCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const webPullProps = useWebPullToRefresh(() => fetchListings(true));

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchCategories = useCallback(async () => {
    if (!communityId) return;
    try {
      const { data, error } = await supabase
        .from('mcn_business_categories')
        .select('id, name, emoji, sort_order')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      setCategories((data || []) as McnCategory[]);
    } catch (error) {
      console.error('Error fetching MCN categories:', error);
      Toast.show({ type: 'error', text1: 'Failed to load business categories' });
    }
  }, [communityId]);

  const fetchListings = useCallback(
    async (isRefresh = false) => {
      if (!communityId) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        let query = supabase
          .from('mcn_listings')
          .select(`
            id, name, description, contact_phone, image_url, is_active, owner_id, created_at,
            category:mcn_business_categories(name, emoji),
            profiles!owner_id(full_name, flat_number),
            mcn_products(id, name, unit, price, is_available, item_type),
            ratings(rating)
          `)
          .eq('community_id', communityId);

        if (selectedCategoryId) {
          query = query.eq('category_id', selectedCategoryId);
        }

        if (debouncedSearch.trim()) {
          query = query.ilike('name', `%${debouncedSearch.trim()}%`);
        }

        const { data, error } = await query
          .order('is_active', { ascending: false })
          .order('created_at', { ascending: false });
        if (error) throw error;

        const normalizedListings = (data || []).map((item: any) => ({
          ...item,
          category: Array.isArray(item.category) ? item.category[0] || null : item.category || null,
        }));
        setListings(normalizedListings as McnListingItem[]);
      } catch (error) {
        console.error('Error fetching MCN listings:', error);
        Toast.show({ type: 'error', text1: 'Failed to load businesses' });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [communityId, debouncedSearch, selectedCategoryId]
  );

  useFocusEffect(
    useCallback(() => {
      fetchListings();
      fetchCategories();
    }, [fetchListings, fetchCategories])
  );

  const handleToggleCategory = (categoryId: string | null) => {
    setSelectedCategoryId((prev) => (prev === categoryId ? null : categoryId));
  };

  const firstInactiveBusinessIndex = listings.findIndex((listing) => !listing.is_active);

  const handleRemoveListing = async (id: string) => {
    Alert.alert(
      'Remove listing',
      'Are you sure you want to permanently remove this business listing?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('mcn_listings')
                .delete()
                .eq('id', id)
                .eq('community_id', communityId || '');
              if (error) throw error;
              Toast.show({ type: 'success', text1: 'Listing removed' });
              fetchListings();
            } catch (error) {
              console.error(error);
              Toast.show({ type: 'error', text1: 'Error removing listing' });
            }
          },
        },
      ]
    );
  };

  const handleBack = () => {
    router.replace('/(tabs)/network' as any);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Stack.Screen
        options={{
          headerTitle: 'Community Business',
          headerTitleStyle: { fontWeight: '500', fontSize: 17, color: colors.textPrimary },
          headerLeft: () => (
            <TouchableOpacity onPress={handleBack} style={{ marginRight: 12 }}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Top Section Switcher Toggle */}
      <View style={styles.masterToggleRow}>
        <TouchableOpacity
          style={styles.masterToggleBtn}
          onPress={() => router.replace('/network/drops' as any)}
          activeOpacity={0.8}
        >
          <Text style={styles.masterToggleText}>🍲 Pre-order Food</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.masterToggleBtn, styles.masterToggleBtnActive]}
          activeOpacity={0.9}
        >
          <Text style={styles.masterToggleTextActive}>🏪 Community Businesses</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.headerSubtitleWrap}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Explore home bakers, daily essentials, & resident services
        </Text>
      </View>

      <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={styles.searchIcon}>{APP_EMOJIS.search}</Text>
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Search businesses..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={{ padding: 4 }}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryChipsWrap}
        contentContainerStyle={styles.categoryChipsScroll}
      >
        <TouchableOpacity
          style={[
            styles.categoryChip,
            { borderColor: colors.border, backgroundColor: colors.card },
            selectedCategoryId === null && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
          ]}
          onPress={() => handleToggleCategory(null)}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.categoryChipText,
              { color: colors.textSecondary },
              selectedCategoryId === null && { color: colors.accent },
            ]}
          >
            🏪 All
          </Text>
        </TouchableOpacity>

        {categories.map((category) => {
          const isActive = selectedCategoryId === category.id;
          return (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.categoryChip,
                { borderColor: colors.border, backgroundColor: colors.card },
                isActive && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
              ]}
              onPress={() => handleToggleCategory(category.id)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  { color: colors.textSecondary },
                  isActive && { color: colors.accent },
                ]}
              >
                {category.emoji} {category.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          {...webPullProps}
          style={styles.list}
          data={listings}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchListings(true)}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          alwaysBounceVertical
          contentContainerStyle={listings.length === 0 ? styles.emptyList : styles.listContent}
          renderItem={({ item, index }) => (
            <>
              {index === firstInactiveBusinessIndex ? (
                <View style={[styles.inactiveSectionHeader, { borderColor: colors.border }]}>
                  <Text style={[styles.inactiveSectionTitle, { color: colors.textSecondary }]}>
                    Inactive businesses
                  </Text>
                </View>
              ) : null}
              <McnListingCard
                listing={item}
                currentUserId={user?.id || ''}
                isCommunityLead={isCommunityLead}
                onPress={(id) => router.push(`/network/listing/${id}` as any)}
                onManage={(id) => router.push(`/network/listing/manage/${id}` as any)}
                onRemove={handleRemoveListing}
              />
            </>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="storefront-outline"
              title="No businesses found"
              message="No local businesses listed yet. Be the first to share what you offer!"
            />
          }
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        activeOpacity={0.8}
        onPress={() => router.push('/network/listing-add' as any)}
      >
        <Ionicons name="add" size={28} color={colors.primaryFg} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSubtitleWrap: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  subtitle: {
    ...VerandahType.body,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
  },
  searchIcon: {
    marginRight: 8,
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  categoryChipsWrap: {
    maxHeight: 44,
    marginBottom: 8,
  },
  categoryChipsScroll: {
    paddingHorizontal: 20,
    gap: 8,
    alignItems: 'center',
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: VerandahRadius.pill,
    borderWidth: 1,
  },
  categoryChipText: {
    ...VerandahType.bodyBold,
    fontSize: 13,
  },
  loaderWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 88,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  inactiveSectionHeader: {
    marginTop: 16,
    marginBottom: 8,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  inactiveSectionTitle: {
    ...VerandahType.sectionLabel,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  masterToggleRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
    gap: 10,
  },
  masterToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: VerandahRadius.pill,
    backgroundColor: '#F3F4F6',
  },
  masterToggleBtnActive: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  masterToggleText: {
    fontSize: 13,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  masterToggleTextActive: {
    fontSize: 13,
    fontWeight: '700',
    color: Verandah.accent,
  },
});
