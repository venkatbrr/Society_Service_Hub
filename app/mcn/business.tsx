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
import { AppIcon } from '../../components/AppIcon';
import { EmptyState } from '../../components/EmptyState';
import { McnListingCard, McnListingItem } from '../../components/McnListingCard';
import { useWebPullToRefresh } from '../../components/useWebPullToRefresh';
import { WebPullIndicator } from '../../components/WebPullIndicator';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { buildMcnHeaderOptions } from '../../lib/mcnHeader';
import { goBackSmart } from '../../lib/navigation';
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

  const webPullProps = useWebPullToRefresh(() => fetchListings(true), refreshing);

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

  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchListings();
    fetchCategories();
  }, [communityId, fetchListings, fetchCategories]);

  useFocusEffect(
    useCallback(() => {
      fetchListings();
      fetchCategories();
    }, [fetchListings, fetchCategories])
  );

  const handleToggleCategory = (categoryId: string | null) => {
    setSelectedCategoryId((prev) => (prev === categoryId ? null : categoryId));
  };

  const toggleCategoryCollapse = (catName: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [catName]: !prev[catName],
    }));
  };

  // Group listings by category
  const groupedListings = React.useMemo(() => {
    const activeListings = listings.filter((l) => l.is_active);
    const inactiveListings = listings.filter((l) => !l.is_active);

    const groupsMap: Record<string, { categoryName: string; icon: 'store' | 'lock'; items: McnListingItem[] }> = {};

    activeListings.forEach((item) => {
      const catName = item.category?.name || 'Other Community Businesses';
      if (!groupsMap[catName]) {
        groupsMap[catName] = { categoryName: catName, icon: 'store', items: [] };
      }
      groupsMap[catName].items.push(item);
    });

    const groupsList = Object.values(groupsMap);

    if (inactiveListings.length > 0) {
      groupsList.push({
        categoryName: 'Inactive Businesses',
        icon: 'lock',
        items: inactiveListings,
      });
    }

    return groupsList;
  }, [listings]);

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
    goBackSmart(router, '/mcn/business');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: 'Community Business',
          onBack: handleBack,
        })}
      />

      {/* Top Section Switcher Toggle */}
      <View style={styles.masterToggleRow}>
        <TouchableOpacity
          style={styles.masterToggleBtn}
          // Sibling tab of this screen, not a child: replace so repeated
          // toggling does not pile up browser history entries.
          onPress={() => router.replace('/mcn/drops' as any)}
          activeOpacity={0.8}
        >
          <View style={styles.iconLabelRow}>
            <Ionicons name="restaurant-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.masterToggleText}>Pre-order Food</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.masterToggleBtn, styles.masterToggleBtnActive]}
          activeOpacity={0.9}
        >
          <View style={styles.iconLabelRow}>
            <AppIcon name="store" size={16} />
            <Text style={styles.masterToggleTextActive}>Community Businesses</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.headerSubtitleWrap}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Explore home bakers, daily essentials, & resident services
        </Text>
      </View>

      <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View style={styles.searchIconWrap}>
          <AppIcon name="search" size={14} />
        </View>
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
          <View style={styles.iconLabelRow}>
            <AppIcon name="store" size={14} />
            <Text
              style={[
                styles.categoryChipText,
                { color: colors.textSecondary },
                selectedCategoryId === null && { color: colors.accent },
              ]}
            >
              All
            </Text>
          </View>
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
                {category.name}
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
          {...webPullProps.pullProps}
          style={styles.list}
          data={groupedListings}
          keyExtractor={(group) => group.categoryName}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchListings(true)}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <WebPullIndicator pullDistance={webPullProps.pullDistance} refreshing={refreshing} isPulling={webPullProps.isPulling} />
          }
          alwaysBounceVertical
          contentContainerStyle={groupedListings.length === 0 ? styles.emptyList : styles.listContent}
          renderItem={({ item: group }) => {
            const isCollapsed = !!collapsedCategories[group.categoryName];

            return (
              <View style={{ marginBottom: 8 }}>
                {/* Collapsible Category Header */}
                <TouchableOpacity
                  style={styles.categorySectionHeader}
                  onPress={() => toggleCategoryCollapse(group.categoryName)}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <AppIcon name={group.icon} size={14} />
                    <Text style={styles.categoryHeaderTitle} numberOfLines={1}>
                      {group.categoryName}
                    </Text>
                    <View style={styles.categoryCountBadge}>
                      <Text style={styles.categoryCountBadgeText}>{group.items.length}</Text>
                    </View>
                  </View>
                  <Ionicons
                    name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                    size={18}
                    color={Verandah.textSecondary}
                  />
                </TouchableOpacity>

                {/* Listing Cards under Category */}
                {!isCollapsed ? (
                  <View style={{ marginTop: 4 }}>
                    {group.items.map((listing) => (
                      <McnListingCard
                        key={listing.id}
                        listing={listing}
                        currentUserId={user?.id || ''}
                        isCommunityLead={isCommunityLead}
                        onPress={(id) => router.push(`/mcn/listing/${id}` as any)}
                        onManage={(id) => router.push(`/mcn/listing/manage/${id}` as any)}
                        onRemove={handleRemoveListing}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          }}
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
        onPress={() => router.push('/mcn/listing-add' as any)}
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
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 4,
  },
  subtitle: {
    ...VerandahType.body,
    fontSize: 12,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 6,
    paddingHorizontal: 10,
    height: 38,
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
  },
  searchIconWrap: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  categoryChipsWrap: {
    maxHeight: 36,
    marginBottom: 4,
  },
  categoryChipsScroll: {
    paddingHorizontal: 16,
    gap: 6,
    alignItems: 'center',
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: VerandahRadius.pill,
    borderWidth: 1,
  },
  categoryChipText: {
    ...VerandahType.bodyBold,
    fontSize: 12,
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
    paddingHorizontal: 16,
    paddingBottom: 70,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  inactiveSectionHeader: {
    marginTop: 10,
    marginBottom: 6,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  inactiveSectionTitle: {
    ...VerandahType.sectionLabel,
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
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
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 2,
    gap: 8,
  },
  masterToggleBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: VerandahRadius.pill,
    backgroundColor: '#F3F4F6',
  },
  categorySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderWidth: 0.5,
    borderColor: '#E5E7EB',
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 2,
  },
  iconLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Verandah.textPrimary,
    flex: 1,
  },
  categoryCountBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: VerandahRadius.pill,
  },
  categoryCountBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Verandah.accent,
  },
  masterToggleBtnActive: {
    backgroundColor: Verandah.primary,
    borderWidth: 1,
    borderColor: Verandah.primary,
  },
  masterToggleText: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  masterToggleTextActive: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
