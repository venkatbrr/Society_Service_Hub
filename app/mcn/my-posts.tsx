import { CheckCircle } from '@untitledui/icons/CheckCircle';
import { Edit01 } from '@untitledui/icons/Edit01';
import { PauseCircle } from '@untitledui/icons/PauseCircle';
import { PlayCircle } from '@untitledui/icons/PlayCircle';
import { Plus } from '@untitledui/icons/Plus';
import { ShoppingBag01 } from '@untitledui/icons/ShoppingBag01';
import { SwitchHorizontal01 } from '@untitledui/icons/SwitchHorizontal01';
import { Trash01 } from '@untitledui/icons/Trash01';
import { XClose } from '@untitledui/icons/XClose';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackSmart } from '../../lib/navigation';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { EmptyState } from '../../components/EmptyState';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { Tables } from '../../lib/database.types';
import { confirmAction } from '../../lib/confirm';
import { buildMcnHeaderOptions } from '../../lib/mcnHeader';
import { supabase } from '../../lib/supabase';

type Post = Tables<'mcn_posts'>;
type Listing = Tables<'mcn_listings'>;

export default function MyPostsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ segment?: string; source?: string }>();
  const { user, communityId, isCommunityLead } = useAuth();
  const colors = Verandah;

  const [activeSegment, setActiveSegment] = useState<'business' | 'borrow'>(
    params.segment === 'borrow' ? 'borrow' : 'business'
  );
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
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabase
        .from('mcn_posts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPosts((data || []) as Post[]);
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to load posts', text2: error?.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

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
      setListings((data || []) as Listing[]);
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to load business listings', text2: error?.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (activeSegment === 'business') {
        fetchListings();
      } else {
        fetchPosts();
      }
    }, [activeSegment, fetchListings, fetchPosts])
  );

  const handleClose = async (id: string) => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('mcn_posts')
        .update({ is_available: false })
        .eq('id', id)
        .eq('user_id', user.id)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        Toast.show({ type: 'info', text1: 'Nothing updated', text2: 'This post may already be closed.' });
        return;
      }
      Toast.show({ type: 'success', text1: 'Post closed' });
      fetchPosts();
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to close post', text2: error?.message });
    }
  };

  const handleDelete = (id: string, postUserId: string) => {
    if (!user) return;
    const deletingOwnPost = postUserId === user.id;
    const canModerateAsLead = !!isCommunityLead && !deletingOwnPost;

    confirmAction({
      title: 'Delete post?',
      message: 'This action cannot be undone.',
      confirmLabel: 'Yes, delete',
      destructive: true,
      onConfirm: async () => {
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
        } catch (error: any) {
          console.error(error);
          Toast.show({ type: 'error', text1: 'Failed to delete post', text2: error?.message });
        }
      },
    });
  };

  const handleToggleListingActive = async (id: string, currentVal: boolean) => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('mcn_listings')
        .update({ is_active: !currentVal })
        .eq('id', id)
        .eq('owner_id', user.id)
        .select('id')
        .maybeSingle();

      if (error) {
        Toast.show({
          type: 'error',
          text1: 'Status update rejected',
          text2: error.message,
        });
        return;
      }
      if (!data) {
        Toast.show({
          type: 'info',
          text1: 'Nothing updated',
          text2: 'You can only update your own listings.',
        });
        return;
      }
      Toast.show({
        type: 'success',
        text1: !currentVal ? 'Listing is now active' : 'Listing is now paused',
      });
      fetchListings();
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to update status', text2: error?.message });
    }
  };

  const handleDeleteListing = (id: string) => {
    if (!user) return;
    confirmAction({
      title: 'Delete business listing?',
      message: 'This will permanently remove your business and all its items. This action cannot be undone.',
      confirmLabel: 'Yes, delete',
      destructive: true,
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('mcn_listings')
            .delete()
            .eq('id', id)
            .eq('owner_id', user.id);

          if (error) {
            if (error.code === '23503') {
              Toast.show({
                type: 'error',
                text1: 'Cannot delete this business',
                text2: 'It has orders in its history. Pause it instead.',
              });
              return;
            }
            throw error;
          }
          Toast.show({ type: 'success', text1: 'Listing deleted' });
          fetchListings();
        } catch (error: any) {
          console.error(error);
          Toast.show({ type: 'error', text1: 'Failed to delete listing', text2: error?.message });
        }
      },
    });
  };

  const activePosts = posts.filter((p) => p.is_available);
  const closedPosts = posts.filter((p) => !p.is_available);

  const sections = [];
  if (activePosts.length > 0) sections.push({ title: 'Active Posts', data: activePosts });
  if (closedPosts.length > 0) sections.push({ title: 'Closed Posts', data: closedPosts });

  const handleBack = () => {
    goBackSmart(router, '/mcn/my-posts');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: 'My Submissions',
          onBack: handleBack,
        })}
      />

      {/* Segmented Control Tabs */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeSegment === 'business' && styles.segmentActive]}
          onPress={() => setActiveSegment('business')}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ShoppingBag01
              size={15}
              color={activeSegment === 'business' ? colors.primary : colors.textSecondary}
              aria-hidden={true}
            />
            <Text
              style={[
                styles.segmentText,
                activeSegment === 'business' && [styles.segmentTextActive, { color: colors.primary }],
              ]}
            >
              Local businesses ({listings.length})
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeSegment === 'borrow' && styles.segmentActive]}
          onPress={() => setActiveSegment('borrow')}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <SwitchHorizontal01
              size={15}
              color={activeSegment === 'borrow' ? colors.primary : colors.textSecondary}
              aria-hidden={true}
            />
            <Text
              style={[
                styles.segmentText,
                activeSegment === 'borrow' && [styles.segmentTextActive, { color: colors.primary }],
              ]}
            >
              Borrow posts ({posts.length})
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={[styles.centerContainer, { backgroundColor: colors.paper }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : activeSegment === 'business' ? (
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
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderHair }]}>
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
                  onPress={() => router.push(`/mcn/listing/manage/${item.id}` as any)}
                >
                  <Edit01 size={14} color={colors.primary} aria-hidden={true} />
                  <Text style={[styles.actionText, { color: colors.primary }]}>Manage</Text>
                </TouchableOpacity>
                <View style={[styles.actionDivider, { backgroundColor: colors.borderHair }]} />
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleToggleListingActive(item.id, item.is_active)}
                >
                  {item.is_active ? (
                    <PauseCircle size={14} color={colors.textPrimary} aria-hidden={true} />
                  ) : (
                    <PlayCircle size={14} color={colors.textPrimary} aria-hidden={true} />
                  )}
                  <Text style={[styles.actionText, { color: colors.textPrimary }]}>
                    {item.is_active ? 'Pause' : 'Activate'}
                  </Text>
                </TouchableOpacity>
                <View style={[styles.actionDivider, { backgroundColor: colors.borderHair }]} />
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleDeleteListing(item.id)}
                >
                  <Trash01 size={14} color={colors.danger} aria-hidden={true} />
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
          contentContainerStyle={posts.length === 0 ? styles.emptyList : styles.listContent}
          refreshing={refreshing}
          onRefresh={() => fetchPosts(true)}
          ListEmptyComponent={
            <EmptyState
              icon="document-text-outline"
              title="No borrow posts"
              message="You haven't posted any borrow or share requests yet."
            />
          }
          renderSectionHeader={({ section: { title } }) => (
            <Text style={[styles.sectionHeader, { color: colors.textPrimary }]}>{title}</Text>
          )}
          renderItem={({ item }) => {
            const isOwner = item.user_id === user?.id;
            const canDeletePost = isOwner || !!isCommunityLead;

            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderHair }]}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleWrap}>
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <View style={[styles.badge, { backgroundColor: item.is_available ? colors.accentSoft : colors.borderStrong }]}>
                      <Text style={[styles.badgeText, { color: item.is_available ? colors.accent : colors.textMuted }]}>
                        {item.is_available ? 'Active' : 'Closed'}
                      </Text>
                    </View>
                  </View>
                  {item.description ? (
                    <Text style={[styles.descText, { color: colors.textSecondary }]} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}
                  <Text style={[styles.dateText, { color: colors.textTertiary }]}>
                    Posted: {new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </Text>
                  {item.contact_hint ? (
                    <Text style={[styles.phoneText, { color: colors.textSecondary }]}>Contact: {item.contact_hint}</Text>
                  ) : null}
                </View>

                <View style={styles.cardActions}>
                  {item.is_available && isOwner ? (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleClose(item.id)}>
                      <XClose size={14} color={colors.textPrimary} aria-hidden={true} />
                      <Text style={[styles.actionText, { color: colors.textPrimary }]}>Close</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.actionBtn}>
                      <CheckCircle size={14} color={colors.textMuted} aria-hidden={true} />
                      <Text style={[styles.actionText, { color: colors.textMuted }]}>
                        {item.is_available ? 'Active' : 'Closed'}
                      </Text>
                    </View>
                  )}
                  <View style={[styles.actionDivider, { backgroundColor: colors.borderHair }]} />
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleDelete(item.id, item.user_id)}
                    disabled={!canDeletePost}
                  >
                    <Trash01 size={14} color={canDeletePost ? colors.danger : colors.textMuted} aria-hidden={true} />
                    <Text style={[styles.actionText, { color: canDeletePost ? colors.danger : colors.textMuted }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        activeOpacity={0.85}
        onPress={() => {
          if (activeSegment === 'borrow') {
            router.push('/mcn/add?kind=borrow&source=my-posts' as any);
            return;
          }
          router.push('/mcn/listing-add' as any);
        }}
      >
        <Plus size={28} color={colors.primaryFg} aria-hidden={true} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: VerandahLayout.screenPaddingTop,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    borderColor: Verandah.border,
    backgroundColor: Verandah.card,
  },
  segmentActive: {
    borderColor: Verandah.primary,
    backgroundColor: Verandah.surface,
  },
  segmentText: {
    ...VerandahType.body,
    fontSize: 13,
    color: Verandah.textSecondary,
  },
  segmentTextActive: {
    ...VerandahType.bodyBold,
    color: Verandah.primary,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeader: {
    ...VerandahType.captionBold,
    fontSize: 14,
    marginTop: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    padding: 14,
  },
  cardTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: {
    ...VerandahType.title,
    fontSize: 16,
    flex: 1,
    marginRight: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: VerandahRadius.pill,
  },
  badgeText: {
    ...VerandahType.captionBold,
    fontSize: 11,
  },
  descText: {
    ...VerandahType.body,
    fontSize: 13,
    marginTop: 4,
  },
  phoneText: {
    ...VerandahType.body,
    fontSize: 12,
    marginTop: 6,
  },
  dateText: {
    ...VerandahType.caption,
    fontSize: 12,
    marginTop: 4,
  },
  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Verandah.border,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  actionDivider: {
    width: 1,
  },
  actionText: {
    ...VerandahType.bodyBold,
    fontSize: 12,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
});
