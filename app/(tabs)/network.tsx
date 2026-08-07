import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BaseCard } from '../../components/BaseCard';
import { NetworkTileIcon } from '../../components/NetworkTileIcon';
import { useWebPullToRefresh } from '../../components/useWebPullToRefresh';
import { WebPullIndicator } from '../../components/WebPullIndicator';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { WEST_HYDERABAD_SCHOOLS } from '../../data/westHyderabadSchools';
import { supabase } from '../../lib/supabase';

export default function NetworkScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { communityId } = useAuth();
  const colors = Verandah;

  const [businessCount, setBusinessCount] = useState<number | null>(null);
  const [preorderCount, setPreorderCount] = useState<number | null>(null);
  const [carpoolCount, setCarpoolCount] = useState<number | null>(null);
  const [parentCount, setParentCount] = useState<number | null>(null);
  const [schoolCount, setSchoolCount] = useState<number | null>(null);
  const [postCount, setPostCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSectionStats = useCallback(
    async (isRefresh = false) => {
      if (!communityId) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const [businessRes, preorderRes, carpoolRes, parentRes, schoolRes, postRes] = await Promise.all([
          supabase
            .from('mcn_listings')
            .select('id', { count: 'exact', head: true })
            .eq('community_id', communityId)
            .eq('is_active', true),
          supabase
            .from('mcn_preorder_drops')
            .select('id', { count: 'exact', head: true })
            .eq('community_id', communityId)
            .eq('status', 'open')
            .gt('cutoff_at', new Date().toISOString()),
          supabase
            .from('mcn_carpools')
            .select('id', { count: 'exact', head: true })
            .eq('community_id', communityId)
            .eq('status', 'active'),
          supabase
            .from('mcn_parent_corner')
            .select('id', { count: 'exact', head: true })
            .eq('community_id', communityId),
          supabase
            .from('schools')
            .select('id', { count: 'exact', head: true })
            .eq('community_id', communityId),
          supabase
            .from('mcn_posts')
            .select('id', { count: 'exact', head: true })
            .eq('community_id', communityId)
            .eq('kind', 'borrow')
            .eq('is_available', true),
        ]);

        setBusinessCount(businessRes.count ?? 0);
        setPreorderCount(preorderRes.count ?? 0);
        setCarpoolCount(carpoolRes.count ?? 0);
        setParentCount(parentRes.count ?? 0);
        setSchoolCount(WEST_HYDERABAD_SCHOOLS.length + (schoolRes.count ?? 0));
        setPostCount(postRes.count ?? 0);
      } catch (err) {
        console.error('Error fetching MCN section stats:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [communityId]
  );

  useFocusEffect(
    useCallback(() => {
      fetchSectionStats();
    }, [fetchSectionStats])
  );

  const webPullProps = useWebPullToRefresh(() => fetchSectionStats(true), refreshing);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      {/* Screen Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>My Community Network</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Connect with neighbors, local businesses, school parents & community sharing
        </Text>
      </View>

      {/* Quick Action Navigation Bar */}
      <View style={styles.quickActionsRow}>
        <TouchableOpacity
          style={[styles.quickActionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push('/mcn/my-orders' as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="bag-handle-outline" size={18} color={colors.primary} style={{ marginRight: 6 }} />
          <Text style={[styles.quickActionText, { color: colors.textPrimary }]}>My Orders</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.quickActionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push('/mcn/my-posts' as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="documents-outline" size={18} color={colors.accent} style={{ marginRight: 6 }} />
          <Text style={[styles.quickActionText, { color: colors.textPrimary }]}>My Submissions</Text>
        </TouchableOpacity>
      </View>

      {/* Main Section Cards */}
      <ScrollView
        {...webPullProps.pullProps}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchSectionStats(true)}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <WebPullIndicator pullDistance={webPullProps.pullDistance} refreshing={refreshing} isPulling={webPullProps.isPulling} />
        {/* Merged Food Drops & Community Business Section Card */}
        <BaseCard
          padding={14}
          onPress={() => router.push('/mcn/drops' as any)}
          style={styles.sectionCard}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconCircle, { backgroundColor: '#FEE2E2' }]}>
              <NetworkTileIcon kind="food" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                Pre-order Food & Community Business
              </Text>
              <Text style={[styles.badgeText, { color: colors.accent }]}>
                {preorderCount || 0} open drops · {businessCount || 0} active listings
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </View>
          <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
            Pre-order weekend specials, home-baked sweets, pop-up meals & local resident services. Order directly inside your society!
          </Text>
        </BaseCard>

        {/* 2. Carpooling Section Card */}
        <BaseCard
          padding={14}
          onPress={() => router.push('/mcn/carpools' as any)}
          style={styles.sectionCard}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}>
              <NetworkTileIcon kind="carpool" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                Community Carpooling
              </Text>
              <Text style={[styles.badgeText, { color: '#D97706' }]}>
                {carpoolCount ?? 0} active rides · City & Outstation
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </View>
          <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
            Share daily office commutes, weekend intercity travel, outstation trips & school runs with verified society neighbors!
          </Text>
        </BaseCard>

        {/* 2. Parent Corner Section Card */}
        <BaseCard
          padding={14}
          onPress={() => router.push('/mcn/parents' as any)}
          style={styles.sectionCard}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconCircle, { backgroundColor: '#E0E7FF' }]}>
              <NetworkTileIcon kind="parents" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Parent Corner</Text>
              {parentCount !== null && (
                <Text style={[styles.badgeText, { color: colors.primary }]}>
                  {parentCount} {parentCount === 1 ? 'child listed' : 'children listed'}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </View>
          <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
            Connect with neighborhood parents, share children's school & college details, organize morning carpool & study groups.
          </Text>
        </BaseCard>

        {/* 4. Schools Catalog Section Card */}
        <BaseCard
          padding={14}
          onPress={() => router.push('/mcn/schools' as any)}
          style={styles.sectionCard}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconCircle, { backgroundColor: '#D1FAE5' }]}>
              <NetworkTileIcon kind="schools" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Schools Catalog & Compare</Text>
              {schoolCount !== null && (
                <Text style={[styles.badgeText, { color: '#059669' }]}>
                  {schoolCount} {schoolCount === 1 ? 'school cataloged' : 'schools cataloged'}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </View>
          <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
            Browse and compare 50+ nearby schools, syllabus, distances, & fee structures curated by community residents.
          </Text>
        </BaseCard>

        {/* 5. Borrow & Share Section Card */}
        <BaseCard
          padding={14}
          onPress={() => router.push('/mcn/my-posts?segment=borrow' as any)}
          style={styles.sectionCard}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconCircle, { backgroundColor: '#EDE9FE' }]}>
              <NetworkTileIcon kind="borrow" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                Borrow & Share
              </Text>
              <Text style={[styles.badgeText, { color: '#7C3AED' }]}>
                {postCount ?? 0} {postCount === 1 ? 'active borrow post' : 'active borrow posts'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </View>
          <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
            Borrow tools, ladders, board games, travel gear & books from neighbors in your society!
          </Text>
        </BaseCard>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: VerandahLayout.screenPaddingTop,
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  title: {
    ...VerandahType.display,
    marginBottom: 4,
  },
  subtitle: {
    ...VerandahType.body,
    fontSize: 13,
  },
  quickActionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 8,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
  },
  quickActionText: {
    ...VerandahType.bodyBold,
    fontSize: 13,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  sectionCard: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    borderStyle: 'solid',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardTitle: {
    ...VerandahType.title,
    fontSize: 17,
  },
  badgeText: {
    ...VerandahType.captionBold,
    fontSize: 12,
    marginTop: 2,
  },
  cardDescription: {
    ...VerandahType.body,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 0,
  },
});
