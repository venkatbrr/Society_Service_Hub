import { ChevronRight } from '@untitledui/icons/ChevronRight';
import { File02 } from '@untitledui/icons/File02';
import { ShoppingBag01 } from '@untitledui/icons/ShoppingBag01';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedTileGlyph } from '../../components/AnimatedTileGlyph';
import { BaseCard } from '../../components/BaseCard';
import { ComingSoonTile } from '../../components/ComingSoonTile';
import { NotificationBell } from '../../components/NotificationBell';
import { useWebPullToRefresh } from '../../components/useWebPullToRefresh';

import { WebPullIndicator } from '../../components/WebPullIndicator';
import { Verandah } from '../../constants/Colors';
import {
    BORROW_SHARE_ENABLED,
    HAS_HIDDEN_MCN_SECTIONS,
    SCHOOLS_CATALOG_ENABLED,
} from '../../constants/featureFlags';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { WEST_HYDERABAD_SCHOOLS } from '../../data/westHyderabadSchools';
import { supabase } from '../../lib/supabase';

export default function NetworkScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { communityId } = useAuth();
  const colors = Verandah;
  const { width: windowWidth } = useWindowDimensions();

  // "My Community Network" must stay on one line at any width. The app is capped
  // at the 460px phone frame on desktop, so size off whichever is narrower and
  // scale down rather than wrapping. adjustsFontSizeToFit is a no-op on web, so
  // this clamp — not the Text prop — is what actually prevents the overflow;
  // 0.56em per char is a deliberately generous advance estimate for the serif.
  const HERO_TITLE = 'My Community Network';
  const heroTitleSize = Math.max(
    18,
    Math.min(30, (Math.min(windowWidth, 460) - 40) / (HERO_TITLE.length * 0.56))
  );

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
        // Hidden sections render no card, so their counts are never read — skip
        // the round trip rather than paying for a number nothing displays.
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
          SCHOOLS_CATALOG_ENABLED
            ? supabase
                .from('schools')
                .select('id', { count: 'exact', head: true })
                .eq('community_id', communityId)
            : null,
          BORROW_SHARE_ENABLED
            ? supabase
                .from('mcn_posts')
                .select('id', { count: 'exact', head: true })
                .eq('community_id', communityId)
                .eq('kind', 'borrow')
                .eq('is_available', true)
            : null,
        ]);

        const firstError = [businessRes, preorderRes, carpoolRes, parentRes, schoolRes, postRes]
          .map((r) => r?.error)
          .find(Boolean);
        if (firstError) throw firstError;

        setBusinessCount(businessRes.count ?? 0);
        setPreorderCount(preorderRes.count ?? 0);
        setCarpoolCount(carpoolRes.count ?? 0);
        setParentCount(parentRes.count ?? 0);
        setSchoolCount(schoolRes ? WEST_HYDERABAD_SCHOOLS.length + (schoolRes.count ?? 0) : null);
        setPostCount(postRes ? postRes.count ?? 0 : null);
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
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      {/* Dark teal hero panel */}
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <Text
            style={[styles.heroTitle, { fontSize: heroTitleSize, lineHeight: heroTitleSize + 4, flex: 1 }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {HERO_TITLE}
          </Text>
          <NotificationBell
            color={Verandah.cream}
            style={styles.heroBellBtn}
          />
        </View>
        <Text style={styles.heroSubtitle}>

          {BORROW_SHARE_ENABLED
            ? 'Neighbours, local businesses, school parents & sharing — all in one place.'
            : 'Neighbours, local businesses, carpools & school parents — all in one place.'}
        </Text>

        <View style={styles.quickActionsRow}>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => router.push('/mcn/my-orders' as any)}
            activeOpacity={0.8}
          >
            <ShoppingBag01 size={16} color={colors.cream} style={{ marginRight: 6 }} aria-hidden={true} />
            <Text style={styles.quickActionText}>My Orders</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => router.push('/mcn/my-posts' as any)}
            activeOpacity={0.8}
          >
            <File02 size={16} color={colors.cream} style={{ marginRight: 6 }} aria-hidden={true} />
            <Text style={styles.quickActionText}>My Submissions</Text>
          </TouchableOpacity>
        </View>
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
        {/* Merged Menus & Community Business Section Card */}
        <BaseCard
          padding={14}
          onPress={() => router.push('/mcn/drops' as any)}
          style={styles.sectionCard}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconCircle, { backgroundColor: '#FEE2E2' }]}>
              <AnimatedTileGlyph kind="food" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                Pre-order Food & Community Business
              </Text>
              <Text style={[styles.badgeText, { color: colors.accent }]}>
                {preorderCount || 0} open menus · {businessCount || 0} active listings
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textMuted} aria-hidden={true} />
          </View>
          <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
            Pre-order weekend specials, home-baked sweets, pop-up meals & local resident services. Order directly inside your society!
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
              <AnimatedTileGlyph kind="parents" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Parent Corner</Text>
              {parentCount !== null && (
                <Text style={[styles.badgeText, { color: colors.primary }]}>
                  {parentCount} {parentCount === 1 ? 'child listed' : 'children listed'}
                </Text>
              )}
            </View>
            <ChevronRight size={18} color={colors.textMuted} aria-hidden={true} />
          </View>
          <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
            Connect with neighborhood parents, share children's school & college details, organize morning carpool & study groups.
          </Text>
        </BaseCard>

        {/* 3. Carpooling Section Card */}
        <BaseCard
          padding={14}
          onPress={() => router.push('/mcn/carpools' as any)}
          style={styles.sectionCard}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}>
              <AnimatedTileGlyph kind="carpool" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                Community Carpooling
              </Text>
              <Text style={[styles.badgeText, { color: '#D97706' }]}>
                {carpoolCount ?? 0} active rides · City & Outstation
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textMuted} aria-hidden={true} />
          </View>
          <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
            Share daily office commutes, weekend intercity travel, outstation trips & school runs with verified society neighbors!
          </Text>
        </BaseCard>

        {/* 4. Schools Catalog Section Card — hidden, see constants/featureFlags.ts */}
        {SCHOOLS_CATALOG_ENABLED && (
          <BaseCard
            padding={14}
            onPress={() => router.push('/mcn/schools' as any)}
            style={styles.sectionCard}
          >
            <View style={styles.cardHeaderRow}>
              <View style={[styles.iconCircle, { backgroundColor: '#D1FAE5' }]}>
                <AnimatedTileGlyph kind="schools" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Schools Catalog & Compare</Text>
                {schoolCount !== null && (
                  <Text style={[styles.badgeText, { color: Verandah.green600 }]}>
                    {schoolCount} {schoolCount === 1 ? 'school cataloged' : 'schools cataloged'}
                  </Text>
                )}
              </View>
              <ChevronRight size={18} color={colors.textMuted} aria-hidden={true} />
            </View>
            <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
              Browse and compare 50+ nearby schools, syllabus, distances, & fee structures curated by community residents.
            </Text>
          </BaseCard>
        )}

        {/* 5. Borrow & Share Section Card — hidden, see constants/featureFlags.ts */}
        {BORROW_SHARE_ENABLED && (
          <BaseCard
            padding={14}
            onPress={() => router.push('/mcn/my-posts?segment=borrow' as any)}
            style={styles.sectionCard}
          >
            <View style={styles.cardHeaderRow}>
              <View style={[styles.iconCircle, { backgroundColor: '#EDE9FE' }]}>
                <AnimatedTileGlyph kind="borrow" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                  Borrow & Share
                </Text>
                <Text style={[styles.badgeText, { color: '#7C3AED' }]}>
                  {postCount ?? 0} {postCount === 1 ? 'active borrow post' : 'active borrow posts'}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textMuted} aria-hidden={true} />
            </View>
            <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
              Borrow tools, ladders, board games, travel gear & books from neighbors in your society!
            </Text>
          </BaseCard>
        )}

        {/* Teaser standing in for the hidden sections. Not pressable — there is
            nothing to open yet, and a dead tap reads as a bug. */}
        {HAS_HIDDEN_MCN_SECTIONS && <ComingSoonTile style={styles.sectionCard} />}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Verandah.paper,
  },
  hero: {
    backgroundColor: Verandah.teal900,
    paddingTop: VerandahLayout.screenPaddingTop + 4,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 4,
  },
  heroTitle: {
    fontFamily: VerandahType.serifFamily,
    fontWeight: '400',
    color: Verandah.cream,
    letterSpacing: -0.4,
  },
  heroBellBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 0.5,
    borderColor: 'rgba(240, 237, 227, 0.2)',
  },
  heroSubtitle: {

    fontFamily: VerandahType.sansFamily,
    fontSize: 12.5,
    lineHeight: 17,
    color: 'rgba(240, 237, 227, 0.72)',
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: VerandahRadius.button,
    borderWidth: 0.5,
    borderColor: 'rgba(240, 237, 227, 0.22)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  quickActionText: {
    fontFamily: VerandahType.sansFamily,
    fontWeight: '600',
    fontSize: 13,
    color: Verandah.cream,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 24,
    gap: 10,
  },
  sectionCard: {
    marginBottom: 0,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardTitle: {
    fontFamily: VerandahType.sansFamily,
    fontWeight: '600',
    fontSize: 15,
  },
  badgeText: {
    fontFamily: VerandahType.sansFamily,
    fontWeight: '500',
    fontSize: 12,
    marginTop: 2,
  },
  cardDescription: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 12.5,
    lineHeight: 17,
    marginBottom: 0,
  },
});
