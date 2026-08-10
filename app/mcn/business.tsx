import { ChevronDown } from '@untitledui/icons/ChevronDown';
import { ChevronUp } from '@untitledui/icons/ChevronUp';
import { Plus } from '@untitledui/icons/Plus';
import { XClose } from '@untitledui/icons/XClose';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
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
import { SegmentedSlider } from '../../components/SegmentedSlider';
import { ChipRowSlider } from '../../components/ChipRowSlider';
import { useWebPullToRefresh } from '../../components/useWebPullToRefresh';
import { WebPullIndicator } from '../../components/WebPullIndicator';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { buildMcnHeaderOptions } from '../../lib/mcnHeader';
import { goBackSmart, replaceTracked } from '../../lib/navigation';
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

  const handleBack = () => {
    goBackSmart(router, '/mcn/business');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: 'Community Business',
          onBack: handleBack,
        })}
      />

      {/* Top Section Switcher Toggle */}
      <SegmentedSlider<'drops' | 'business'>
        value="business"
        enterFromIndex={0}
        onChange={(val) => {
          if (val === 'drops') {
            replaceTracked(router, '/mcn/drops' as any);
          }
        }}
        segments={[
          { key: 'drops', label: 'Pre-order Food' },
          { key: 'business', label: 'Businesses' },
        ]}
        trackStyle={styles.masterToggleRow}
        segmentStyle={styles.masterToggleBtn}
        pillStyle={styles.masterToggleBtnActive}
        activeTextStyle={styles.masterToggleTextActive}
        inactiveTextStyle={styles.masterToggleText}
      />

      <View style={styles.headerSubtitleWrap}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Explore home bakers, daily essentials, & resident services
        </Text>
      </View>

      <View style={[styles.searchWrap, { borderColor: colors.borderHair, backgroundColor: colors.card }]}>
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
            <XClose size={18} color={colors.textMuted} aria-hidden={true} />
          </TouchableOpacity>
        )}
      </View>

      <ChipRowSlider<string>
        chips={[
          { key: 'all', label: 'All', icon: <AppIcon name="store" size={14} /> },
          ...categories.map((cat) => ({ key: cat.id, label: cat.name })),
        ]}
        value={selectedCategoryId ?? 'all'}
        onChange={(key) => handleToggleCategory(key === 'all' ? null : key)}
        scrollable={true}
        containerStyle={styles.categoryChipsWrap}
        contentContainerStyle={styles.categoryChipsScroll}
        chipStyle={styles.categoryChip}
        inactiveChipStyle={{ borderColor: colors.borderHair, backgroundColor: colors.card }}
        pillStyle={{ borderColor: colors.primary, backgroundColor: colors.accentSoft }}
        activeColor={colors.primary}
        inactiveColor={colors.textSecondary}
        textStyle={styles.categoryChipText}
      />

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
                  {isCollapsed ? (
                    <ChevronDown size={18} color={Verandah.textSecondary} aria-hidden={true} />
                  ) : (
                    <ChevronUp size={18} color={Verandah.textSecondary} aria-hidden={true} />
                  )}
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
        <Plus size={28} color={colors.primaryFg} aria-hidden={true} />
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
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: Verandah.cream,
    borderRadius: VerandahRadius.segmented,
    padding: 4,
    gap: 4,
  },
  masterToggleBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: VerandahRadius.segmentedInner,
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
  },
  masterToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: Verandah.textSecondary,
    fontFamily: VerandahType.sansFamily,
  },
  masterToggleTextActive: {
    fontSize: 14,
    fontWeight: '700',
    color: Verandah.primaryFg,
    fontFamily: VerandahType.sansFamily,
  },
});
