import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { EmptyState } from '../../components/EmptyState';
import { McnListingCard, McnListingItem } from '../../components/McnListingCard';
import { McnPostCard, McnPostWithProfile } from '../../components/McnPostCard';
import { useWebPullToRefresh } from '../../components/useWebPullToRefresh';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahType } from '../../constants/Verandah';
import { APP_EMOJIS } from '../../constants/emojis';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

type Kind = 'business' | 'borrow' | 'schools';
type McnCategory = { id: string; name: string; emoji: string; sort_order: number };

const LEVEL_MAP = {
  pre_school: 'Pre-school',
  primary: 'Primary (1-5)',
  high_school: 'High (1-12)',
  all_in_one: 'K-12',
};

export default function NetworkScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { communityId, user, isCommunityLead } = useAuth();
  const colors = Verandah;

  const [activeSegment] = useState<Kind>('business');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [posts, setPosts] = useState<McnPostWithProfile[]>([]);
  const [listings, setListings] = useState<McnListingItem[]>([]);
  const [categories, setCategories] = useState<McnCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [schools, setSchools] = useState<any[]>([]);
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const webPullProps = useWebPullToRefresh(() => fetchPosts(true));

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

  const fetchPosts = useCallback(async (isRefresh = false) => {
    if (!communityId) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      if (activeSegment === 'business') {
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
      } else if (activeSegment === 'borrow') {
        let query = supabase
          .from('mcn_posts')
          .select('*, profiles!mcn_posts_user_id_fkey(full_name, flat_number)')
          .eq('community_id', communityId)
          .eq('kind', activeSegment)
          .eq('is_available', true);

        if (debouncedSearch.trim()) {
          query = query.ilike('title', `%${debouncedSearch.trim()}%`);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        setPosts(data as McnPostWithProfile[]);
      } else if (activeSegment === 'schools') {
        let query = supabase
          .from('schools')
          .select('*')
          .eq('community_id', communityId);

        if (debouncedSearch.trim()) {
          query = query.ilike('name', `%${debouncedSearch.trim()}%`);
        }

        const { data, error } = await query.order('name', { ascending: true });
        if (error) throw error;
        setSchools(data || []);
      }
    } catch (error) {
      console.error('Error fetching MCN posts/listings/schools:', error);
      Toast.show({ type: 'error', text1: 'Failed to load feed' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [communityId, activeSegment, debouncedSearch, selectedCategoryId]);

  useFocusEffect(
    useCallback(() => {
      fetchPosts();
      fetchCategories();
    }, [fetchPosts, fetchCategories])
  );

  const handleToggleCategory = (categoryId: string | null) => {
    setSelectedCategoryId((prev) => (prev === categoryId ? null : categoryId));
  };

  const handleMarkUnavailable = async (id: string) => {
    try {
      const { error } = await supabase
        .from('mcn_posts')
        .update({ is_available: false })
        .eq('id', id);
      if (error) throw error;
      Toast.show({ type: 'success', text1: 'Post marked as unavailable' });
      fetchPosts();
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error updating post' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('mcn_posts')
        .delete()
        .eq('id', id);
      if (error) throw error;
      Toast.show({ type: 'success', text1: 'Post deleted' });
      fetchPosts();
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error deleting post' });
    }
  };

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
              fetchPosts();
            } catch (error) {
              console.error(error);
              Toast.show({ type: 'error', text1: 'Error removing listing' });
            }
          }
        }
      ]
    );
  };

  const handleToggleSelectSchool = (schoolId: string) => {
    setSelectedSchoolIds((prev) => {
      if (prev.includes(schoolId)) {
        return prev.filter((id) => id !== schoolId);
      }
      if (prev.length >= 3) {
        Toast.show({ type: 'info', text1: 'You can compare up to 3 schools' });
        return prev;
      }
      return [...prev, schoolId];
    });
  };

  const renderSchoolCard = (school: any) => {
    const isSelected = selectedSchoolIds.includes(school.id);
    return (
      <View style={[styles.schoolCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <TouchableOpacity
          style={styles.schoolCardMain}
          onPress={() => router.push(`/network/schools/${school.id}` as any)}
          activeOpacity={0.7}
        >
          <Text style={[styles.schoolCardName, { color: colors.textPrimary }]}>{school.name}</Text>
          <Text style={[styles.schoolCardMeta, { color: colors.textSecondary }]}>
            {LEVEL_MAP[school.level as keyof typeof LEVEL_MAP] || school.level} · {school.syllabus}
          </Text>
          <View style={styles.schoolCardGrid}>
            <View style={styles.schoolCardGridItem}>
              <Ionicons name="navigate-outline" size={14} color={colors.accent} />
              <Text style={[styles.schoolCardGridText, { color: colors.textSecondary }]}>{school.distance} km</Text>
            </View>
            <View style={styles.schoolCardGridItem}>
              <Ionicons name="cash-outline" size={14} color={colors.accent} />
              <Text style={[styles.schoolCardGridText, { color: colors.textSecondary }]} numberOfLines={1}>
                {school.fee_range}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleToggleSelectSchool(school.id)}
          style={[styles.schoolCardCompareBtn, { borderColor: colors.border }, isSelected && { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
        >
          <Ionicons
            name={isSelected ? 'checkbox' : 'square-outline'}
            size={18}
            color={isSelected ? colors.accent : colors.textMuted}
          />
          <Text style={[styles.schoolCardCompareBtnText, { color: isSelected ? colors.accent : colors.textSecondary }]}>
            Compare
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>My Community Network</Text>
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
      </View>

      {activeSegment === 'business' ? (
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
      ) : null}

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          {...webPullProps}
          style={styles.list}
          data={
            activeSegment === 'business'
              ? listings
              : activeSegment === 'borrow'
              ? posts
              : schools
          }
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchPosts(true)}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          alwaysBounceVertical
          contentContainerStyle={
            (activeSegment === 'business'
              ? listings.length
              : activeSegment === 'borrow'
              ? posts.length
              : schools.length) === 0
              ? styles.emptyList
              : styles.listContent
          }
          refreshing={refreshing}
          onRefresh={() => fetchPosts(true)}
          renderItem={({ item }) => {
            if (activeSegment === 'business') {
              return (
                <McnListingCard
                  listing={item as any as McnListingItem}
                  currentUserId={user?.id || ''}
                  isCommunityLead={isCommunityLead}
                  onPress={(id) => router.push(`/network/listing/${id}` as any)}
                  onManage={(id) => router.push(`/network/listing/manage/${id}` as any)}
                  onRemove={handleRemoveListing}
                />
              );
            } else if (activeSegment === 'borrow') {
              return (
                <McnPostCard
                  post={item as any as McnPostWithProfile}
                  currentUserId={user?.id || ''}
                  isCommunityLead={isCommunityLead}
                  onMarkUnavailable={handleMarkUnavailable}
                  onDelete={handleDelete}
                />
              );
            } else {
              return renderSchoolCard(item);
            }
          }}
          ListEmptyComponent={
            <EmptyState
              icon={
                activeSegment === 'business'
                  ? 'storefront-outline'
                  : activeSegment === 'borrow'
                  ? 'swap-horizontal-outline'
                  : 'school-outline'
              }
              title={
                activeSegment === 'business'
                  ? 'No businesses found'
                  : activeSegment === 'borrow'
                  ? 'Nothing to borrow'
                  : 'No schools found'
              }
              message={
                activeSegment === 'business'
                  ? 'No local businesses listed yet. Be the first to share what you offer!'
                  : activeSegment === 'borrow'
                  ? 'Nothing available to borrow right now. Got something to share?'
                  : 'No schools cataloged for this community yet. Share details to help parents!'
              }
            />
          }
        />
      )}

      {/* Comparison Drawer */}
      {activeSegment === 'schools' && selectedSchoolIds.length >= 2 && (
        <View style={[styles.compareBar, { bottom: 70 + insets.bottom, backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.compareBarText, { color: colors.textPrimary }]}>
            {selectedSchoolIds.length} school(s) selected
          </Text>
          <View style={styles.compareBarActions}>
            <TouchableOpacity onPress={() => setSelectedSchoolIds([])} style={styles.clearBtn}>
              <Text style={[styles.clearBtnText, { color: colors.textSecondary }]}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push(`/network/schools/compare?ids=${selectedSchoolIds.join(',')}` as any)}
              style={[styles.compareBtn, { backgroundColor: colors.accent }]}
            >
              <Text style={[styles.compareBtnText, { color: colors.surface }]}>Compare</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        activeOpacity={0.8}
        onPress={() => {
          router.push('/network/listing-add');
        }}
      >
        <Ionicons name="add" size={28} color={colors.primaryFg} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: VerandahLayout.screenPaddingTop,
  },
  header: {
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  title: {
    ...VerandahType.display,
  },
  segmentContainer: {
    flexDirection: 'row',
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: Verandah.cardMuted,
    borderRadius: VerandahRadius.pill,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: VerandahRadius.pill,
  },
  segmentActive: {
    backgroundColor: Verandah.card,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  segmentTextActive: {
    color: Verandah.textPrimary,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: VerandahRadius.lg,
    paddingHorizontal: 14,
    height: 48,
    marginHorizontal: 24,
    marginBottom: 16,
  },
  searchIcon: {
    fontSize: 16,
    lineHeight: 18,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  categoryChipsWrap: {
    marginBottom: 14,
    maxHeight: 44,
  },
  categoryChipsScroll: {
    paddingHorizontal: 24,
    paddingRight: 24,
    alignItems: 'center',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 14,
    height: 34,
    marginRight: 8,
  },
  categoryChipText: {
    ...VerandahType.caption,
    fontSize: 12,
    lineHeight: 16,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 120,
  },
  list: {
    flex: 1,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  // School-specific cards and drawer styles
  schoolCard: {
    borderWidth: 0.5,
    borderRadius: VerandahRadius.lg,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  schoolCardMain: {
    flex: 1,
    marginRight: 12,
  },
  schoolCardName: {
    ...VerandahType.bodyBold,
    marginBottom: 4,
  },
  schoolCardMeta: {
    ...VerandahType.caption,
    marginBottom: 8,
  },
  schoolCardGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  schoolCardGridItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  schoolCardGridText: {
    fontSize: 12,
    fontWeight: '400',
  },
  schoolCardCompareBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: VerandahRadius.md,
    borderWidth: 0.5,
    alignItems: 'center',
    gap: 4,
    minWidth: 72,
  },
  schoolCardCompareBtnText: {
    fontSize: 10,
    fontWeight: '600',
  },
  compareBar: {
    position: 'absolute',
    left: 24,
    right: 24,
    borderWidth: 0.5,
    borderRadius: VerandahRadius.lg,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  compareBarText: {
    fontSize: 14,
    fontWeight: '600',
  },
  compareBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
  compareBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: VerandahRadius.pill,
  },
  compareBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
