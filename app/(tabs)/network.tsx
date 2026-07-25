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
import { useWebPullToRefresh } from '../../components/useWebPullToRefresh';
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
        const [businessRes, preorderRes, parentRes, schoolRes, postRes] = await Promise.all([
          supabase
            .from('mcn_listings')
            .select('id', { count: 'exact', head: true })
            .eq('community_id', communityId)
            .eq('is_active', true),
          supabase
            .from('mcn_preorder_drops')
            .select('id', { count: 'exact', head: true })
            .eq('community_id', communityId)
            .eq('status', 'open'),
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
            .eq('is_available', true),
        ]);

        setBusinessCount(businessRes.count ?? 0);
        setPreorderCount(preorderRes.count ?? 0);
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

  const webPullProps = useWebPullToRefresh(() => fetchSectionStats(true));

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
          onPress={() => router.push('/network/my-orders' as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="bag-handle-outline" size={18} color={colors.primary} style={{ marginRight: 6 }} />
          <Text style={[styles.quickActionText, { color: colors.textPrimary }]}>My Orders</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.quickActionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push('/network/my-posts' as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="documents-outline" size={18} color={colors.accent} style={{ marginRight: 6 }} />
          <Text style={[styles.quickActionText, { color: colors.textPrimary }]}>My Submissions</Text>
        </TouchableOpacity>
      </View>

      {/* Main Section Cards */}
      <ScrollView
        {...webPullProps}
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
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>NETWORK SECTIONS</Text>

        {/* Merged Food Drops & Community Business Section Card */}
        <BaseCard
          padding={18}
          onPress={() => router.push('/network/drops' as any)}
          style={styles.sectionCard}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconCircle, { backgroundColor: '#FEE2E2' }]}>
              <Text style={styles.iconEmoji}>🍕</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                Food Drops & Community Business
              </Text>
              <Text style={[styles.badgeText, { color: colors.accent }]}>
                {preorderCount || 0} open drops · {businessCount || 0} active listings
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </View>
          <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
            Pre-order weekend pizzas, home-baked sweets, pop-up meals & local resident services. Order directly inside your society!
          </Text>
          <View style={[styles.cardFooter, { borderColor: colors.border }]}>
            <Text style={[styles.actionLinkText, { color: colors.accent }]}>
              Explore Food Drops & Businesses →
            </Text>
          </View>
        </BaseCard>

        {/* 2. Parent Corner Section Card */}
        <BaseCard
          padding={18}
          onPress={() => router.push('/network/parents' as any)}
          style={styles.sectionCard}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconCircle, { backgroundColor: '#E0E7FF' }]}>
              <Text style={styles.iconEmoji}>👨‍👩‍👧‍👦</Text>
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
          <View style={[styles.cardFooter, { borderColor: colors.border }]}>
            <Text style={[styles.actionLinkText, { color: colors.primary }]}>Open Parent Directory →</Text>
          </View>
        </BaseCard>

        {/* 3. School Catalog Section Card */}
        <BaseCard
          padding={18}
          onPress={() => router.push('/network/schools' as any)}
          style={styles.sectionCard}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconCircle, { backgroundColor: '#D1FAE5' }]}>
              <Text style={styles.iconEmoji}>🏫</Text>
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
          <View style={[styles.cardFooter, { borderColor: colors.border }]}>
            <Text style={[styles.actionLinkText, { color: colors.primary }]}>Explore Schools Directory →</Text>
          </View>
        </BaseCard>

        {/* 4. Borrow & Share Section Card */}
        <BaseCard
          padding={18}
          onPress={() => router.push('/network/my-posts?segment=borrow&source=network' as any)}
          style={styles.sectionCard}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconCircle, { backgroundColor: '#FCE7F3' }]}>
              <Text style={styles.iconEmoji}>🔄</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Borrow & Share</Text>
              {postCount !== null && (
                <Text style={[styles.badgeText, { color: '#DB2777' }]}>
                  {postCount} {postCount === 1 ? 'item available' : 'items available'}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </View>
          <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
            Borrow or lend household items, power tools, textbooks, & travel gear safely within your society.
          </Text>
          <View style={[styles.cardFooter, { borderColor: colors.border }]}>
            <Text style={[styles.actionLinkText, { color: colors.primary }]}>View Community Posts →</Text>
          </View>
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
    marginBottom: 16,
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
    marginBottom: 16,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
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
  sectionLabel: {
    ...VerandahType.sectionLabel,
    marginBottom: 12,
  },
  sectionCard: {
    marginBottom: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconEmoji: {
    fontSize: 22,
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
    marginBottom: 12,
  },
  cardFooter: {
    paddingTop: 10,
    borderTopWidth: 0.5,
    alignItems: 'flex-start',
  },
  actionLinkText: {
    ...VerandahType.bodyBold,
    fontSize: 13,
  },
});
