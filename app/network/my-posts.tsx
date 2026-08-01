import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackSmart } from '../../lib/navigation';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { EmptyState } from '../../components/EmptyState';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { Tables } from '../../lib/database.types';
import { buildMcnHeaderOptions } from '../../lib/mcnHeader';
import { supabase } from '../../lib/supabase';

type Post = Tables<'mcn_posts'>;
type Listing = Tables<'mcn_listings'>;

export default function MyPostsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ segment?: string; source?: string }>();
  const { user, communityId, isCommunityLead } = useAuth();
  const colors = Verandah;
  const borrowOnlyView = false;

  const [activeSegment, setActiveSegment] = useState<'business' | 'borrow'>('business');
  const [listings, setListings] = useState<Listing[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPosts = useCallback(async (isRefresh = false) => {
    if (!user) {
      setPosts([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (borrowOnlyView && !communityId) {
      setPosts([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      let query = supabase
        .from('mcn_posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (borrowOnlyView) {
        query = query
          .eq('community_id', communityId || '')
          .eq('kind', 'borrow');
      } else {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setPosts(data as Post[]);
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to load posts' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [borrowOnlyView, communityId, user]);

  const fetchListings = useCallback(async (isRefresh = false) => {
    if (!user) {
      setListings([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabase
        .from('mcn_listings')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setListings(data as Listing[]);
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to load business listings' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (borrowOnlyView) {
        fetchPosts();
      } else if (activeSegment === 'business') {
        fetchListings();
      } else {
        fetchPosts();
      }
    }, [activeSegment, borrowOnlyView, fetchListings, fetchPosts])
  );

  const handleClose = async (id: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('mcn_posts')
        .update({ is_available: false })
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
      Toast.show({ type: 'success', text1: 'Post closed' });
      fetchPosts();
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to close post' });
    }
  };

  const handleDelete = (id: string, postUserId: string) => {
    if (!user) return;
    const deletingOwnPost = postUserId === user.id;
    const canModerateAsLead = !!isCommunityLead && !deletingOwnPost;

    Alert.alert('Delete post?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            let deleteQuery = supabase
              .from('mcn_posts')
              .delete()
              .eq('id', id);

            if (canModerateAsLead) {
              deleteQuery = deleteQuery.eq('community_id', communityId || '');
            } else {
              deleteQuery = deleteQuery.eq('user_id', user.id);
            }

            const { data, error } = await deleteQuery.select('id').maybeSingle();
            if (error) throw error;
            if (!data) {
              Toast.show({ type: 'error', text1: 'Delete failed', text2: 'You can delete only your own post.' });
              return;
            }
            Toast.show({ type: 'success', text1: 'Post deleted' });
            fetchPosts();
          } catch (error) {
            console.error(error);
            Toast.show({ type: 'error', text1: 'Failed to delete post' });
          }
        },
      },
    ]);
  };

  const handleToggleListingActive = async (id: string, currentVal: boolean) => {
    try {
      const { error } = await supabase
        .from('mcn_listings')
        .update({ is_active: !currentVal })
        .eq('id', id);

      if (error) throw error;
      Toast.show({
        type: 'success',
        text1: !currentVal ? 'Listing is now active' : 'Listing is now paused',
      });
      fetchListings();
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to update status' });
    }
  };

  const handleDeleteListing = (id: string) => {
    Alert.alert(
      'Delete business listing?',
      'This will permanently remove your business and all its items. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('mcn_listings')
                .delete()
                .eq('id', id);
              if (error) throw error;
              Toast.show({ type: 'success', text1: 'Listing deleted' });
              fetchListings();
            } catch (error) {
              console.error(error);
              Toast.show({ type: 'error', text1: 'Failed to delete listing' });
            }
          },
        },
      ]
    );
  };

  const visiblePosts = borrowOnlyView ? posts : posts;
  const activePosts = visiblePosts.filter((p) => p.is_available);
  const closedPosts = visiblePosts.filter((p) => !p.is_available);

  const sections = [];
  if (activePosts.length > 0) sections.push({ title: 'Active', data: activePosts });
  if (closedPosts.length > 0) sections.push({ title: 'Closed', data: closedPosts });

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.surface }]}>
        <Stack.Screen options={{ title: 'My community posts' }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const handleBack = () => {
    goBackSmart(router, '/network/my-posts');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: borrowOnlyView ? 'Borrow & Share' : 'My community posts',
          onBack: handleBack,
        })}
      />

      {/* Tab Switched Header */}
      {borrowOnlyView ? (
        <View style={styles.borrowOnlyHeader}>
          <Text style={[styles.borrowOnlyTitle, { color: colors.textPrimary }]}>Borrow & Share</Text>
          <Text style={[styles.borrowOnlySubtitle, { color: colors.textSecondary }]}>Community borrow posts in your society</Text>
        </View>
      ) : (
        <View style={styles.segmentContainer}>
          <TouchableOpacity
            style={[styles.segmentBtn, styles.segmentActive]}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons
                name="storefront-outline"
                size={15}
                color={colors.textPrimary}
              />
              <Text style={[styles.segmentText, styles.segmentTextActive]}>
                Local businesses
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {!borrowOnlyView && activeSegment === 'business' ? (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={listings.length === 0 ? styles.emptyList : styles.listContent}
          refreshing={refreshing}
          onRefresh={() => fetchListings(true)}
          ListEmptyComponent={
            <EmptyState
              icon="storefront-outline"
              title="No businesses listed"
              message="You haven't added any business listings yet."
            />
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleWrap}>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: item.is_active ? colors.accentSoft : colors.borderStrong }]}>
                    <Text style={[styles.badgeText, { color: item.is_active ? colors.accent : colors.textMuted }]}>
                      {item.is_active ? 'Active' : 'Paused'}
                    </Text>
                  </View>
                </View>
                {item.description ? (
                  <Text style={[styles.descText, { color: colors.textSecondary }]} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
                {item.contact_phone ? (
                  <Text style={[styles.phoneText, { color: colors.textTertiary }]}>
                    WhatsApp / Phone: {item.contact_phone}
                  </Text>
                ) : null}
              </View>

              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => router.push(`/network/listing/manage/${item.id}` as any)}
                >
                  <Ionicons name="pencil-outline" size={14} color={colors.primary} />
                  <Text style={[styles.actionText, { color: colors.primary }]}>Manage</Text>
                </TouchableOpacity>
                <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => router.push(`/network/listing/orders/${item.id}` as any)}
                >
                  <Ionicons name="receipt-outline" size={14} color={colors.accent} />
                  <Text style={[styles.actionText, { color: colors.accent }]}>Orders</Text>
                </TouchableOpacity>
                <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleToggleListingActive(item.id, item.is_active)}
                >
                  <Ionicons
                    name={item.is_active ? "pause-circle-outline" : "play-circle-outline"}
                    size={14}
                    color={colors.textPrimary}
                  />
                  <Text style={[styles.actionText, { color: colors.textPrimary }]}>
                    {item.is_active ? 'Pause' : 'Activate'}
                  </Text>
                </TouchableOpacity>
                <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleDeleteListing(item.id)}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.danger} />
                  <Text style={[styles.actionText, { color: colors.danger }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={visiblePosts.length === 0 ? styles.emptyList : styles.listContent}
          refreshing={refreshing}
          onRefresh={() => fetchPosts(true)}
          ListEmptyComponent={
            <EmptyState
              icon="document-text-outline"
              title="No posts found"
              message={borrowOnlyView ? 'No borrow posts in your community yet.' : "You haven't shared anything yet."}
            />
          }
          renderSectionHeader={({ section: { title } }) => (
            <Text style={[styles.sectionHeader, { color: colors.textPrimary }]}>{title}</Text>
          )}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {(() => {
                const isOwner = item.user_id === user?.id;
                const canDeletePost = isOwner || !!isCommunityLead;
                return (
                  <>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleWrap}>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: item.kind === 'business' ? colors.accentSoft : colors.primary + '20' }]}>
                    <Text style={[styles.badgeText, { color: item.kind === 'business' ? colors.accent : colors.primary }]}>
                      {item.kind === 'business' ? 'Business' : 'Borrow'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.dateText, { color: colors.textTertiary }]}>
                  {new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </Text>
                {item.contact_hint ? (
                  <Text style={[styles.phoneText, { color: colors.textSecondary }]}>Contact: {item.contact_hint}</Text>
                ) : null}
              </View>

              {(!borrowOnlyView || isOwner || canDeletePost) ? (
                <View style={styles.cardActions}>
                  {item.is_available && isOwner ? (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleClose(item.id)}>
                      <Ionicons name="close-circle-outline" size={14} color={colors.textPrimary} />
                      <Text style={[styles.actionText, { color: colors.textPrimary }]}>Close</Text>
                    </TouchableOpacity>
                  ) : item.is_available ? (
                    <View style={styles.actionBtn}>
                      <Ionicons name="checkmark-circle-outline" size={14} color={colors.accent} />
                      <Text style={[styles.actionText, { color: colors.accent }]}>Active</Text>
                    </View>
                  ) : (
                    <View style={styles.actionBtn}>
                      <Ionicons name="checkmark-circle-outline" size={14} color={colors.textMuted} />
                      <Text style={[styles.actionText, { color: colors.textMuted }]}>Closed</Text>
                    </View>
                  )}
                  <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleDelete(item.id, item.user_id)}
                    disabled={!canDeletePost}
                  >
                    <Ionicons name="trash-outline" size={14} color={colors.danger} />
                    <Text style={[styles.actionText, { color: canDeletePost ? colors.danger : colors.textMuted }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
                  </>
                );
              })()}
            </View>
          )}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        activeOpacity={0.8}
        onPress={() => {
          if (borrowOnlyView || activeSegment === 'borrow') {
            router.push('/network/add?kind=borrow&source=my-posts' as any);
            return;
          }
          router.push('/network/listing-add' as any);
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
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentContainer: {
    flexDirection: 'row',
    marginHorizontal: 24,
    marginTop: VerandahLayout.mcnHeaderToContentGap,
    marginBottom: 8,
    backgroundColor: Verandah.cardMuted,
    borderRadius: VerandahRadius.pill,
    padding: 4,
  },
  borrowOnlyHeader: {
    marginHorizontal: 24,
    marginTop: VerandahLayout.mcnHeaderToContentGap,
    marginBottom: 6,
  },
  borrowOnlyTitle: {
    ...VerandahType.title,
    fontSize: 17,
  },
  borrowOnlySubtitle: {
    ...VerandahType.caption,
    marginTop: 0,
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
    fontSize: 14,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  segmentTextActive: {
    color: Verandah.textPrimary,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 40,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 6,
  },
  card: {
    borderRadius: VerandahRadius.lg,
    borderWidth: 0.5,
    padding: 12,
    marginBottom: 8,
  },
  cardHeader: {
    marginBottom: 8,
  },
  cardTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
    gap: 8,
  },
  cardTitle: {
    ...VerandahType.bodyBold,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  descText: {
    ...VerandahType.caption,
    marginTop: 6,
  },
  phoneText: {
    ...VerandahType.caption,
    marginTop: 4,
  },
  dateText: {
    ...VerandahType.caption,
  },
  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderTopColor: Verandah.border,
    paddingTop: 8,
    marginTop: 2,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '500',
  },
  actionDivider: {
    width: 0.5,
    height: '100%',
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    elevation: 5,
  },
});
