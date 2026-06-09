import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, SectionList, StyleSheet, Text, TouchableOpacity, View, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { EmptyState } from '../../components/EmptyState';
import { Verandah } from '../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { Tables } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';

type Post = Tables<'mcn_posts'>;
type Listing = Tables<'mcn_listings'>;

export default function MyPostsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const colors = Verandah;

  const [activeSegment, setActiveSegment] = useState<'business' | 'borrow'>('business');
  const [listings, setListings] = useState<Listing[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPosts = useCallback(async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabase
        .from('mcn_posts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPosts(data as Post[]);
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to load posts' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  const fetchListings = useCallback(async (isRefresh = false) => {
    if (!user) return;
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

  const handleDelete = (id: string) => {
    if (!user) return;
    Alert.alert('Delete post?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('mcn_posts')
              .delete()
              .eq('id', id)
              .eq('user_id', user.id);
            if (error) throw error;
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

  const activePosts = posts.filter((p) => p.is_available);
  const closedPosts = posts.filter((p) => !p.is_available);

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

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Stack.Screen options={{ title: 'My community posts' }} />

      {/* Tab Switched Header */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeSegment === 'business' && styles.segmentActive]}
          onPress={() => { setActiveSegment('business'); }}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons
              name="storefront-outline"
              size={15}
              color={activeSegment === 'business' ? colors.textPrimary : colors.textSecondary}
            />
            <Text style={[styles.segmentText, activeSegment === 'business' && styles.segmentTextActive]}>
              Local businesses
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, activeSegment === 'borrow' && styles.segmentActive]}
          onPress={() => { setActiveSegment('borrow'); }}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons
              name="swap-horizontal-outline"
              size={15}
              color={activeSegment === 'borrow' ? colors.textPrimary : colors.textSecondary}
            />
            <Text style={[styles.segmentText, activeSegment === 'borrow' && styles.segmentTextActive]}>
              Borrow & free
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {activeSegment === 'business' ? (
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
          contentContainerStyle={posts.length === 0 ? styles.emptyList : styles.listContent}
          refreshing={refreshing}
          onRefresh={() => fetchPosts(true)}
          ListEmptyComponent={
            <EmptyState
              icon="document-text-outline"
              title="No posts found"
              message="You haven't shared anything yet."
            />
          }
          renderSectionHeader={({ section: { title } }) => (
            <Text style={[styles.sectionHeader, { color: colors.textPrimary }]}>{title}</Text>
          )}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
              </View>

              <View style={styles.cardActions}>
                {item.is_available ? (
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleClose(item.id)}>
                    <Ionicons name="close-circle-outline" size={14} color={colors.textPrimary} />
                    <Text style={[styles.actionText, { color: colors.textPrimary }]}>Close</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.actionBtn}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={colors.textMuted} />
                    <Text style={[styles.actionText, { color: colors.textMuted }]}>Closed</Text>
                  </View>
                )}
                <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item.id)}>
                  <Ionicons name="trash-outline" size={14} color={colors.danger} />
                  <Text style={[styles.actionText, { color: colors.danger }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
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
    marginTop: 16,
    marginBottom: 8,
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
    fontSize: 14,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  segmentTextActive: {
    color: Verandah.textPrimary,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
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
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    borderRadius: VerandahRadius.lg,
    borderWidth: 0.5,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    marginBottom: 12,
  },
  cardTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
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
    paddingTop: 12,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  actionText: {
    fontSize: 14,
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
});
