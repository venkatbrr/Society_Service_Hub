import { Check } from '@untitledui/icons/Check';
import { CheckCircle } from '@untitledui/icons/CheckCircle';
import { ChevronDown } from '@untitledui/icons/ChevronDown';
import { ChevronUp } from '@untitledui/icons/ChevronUp';
import { FilterLines } from '@untitledui/icons/FilterLines';
import { Plus } from '@untitledui/icons/Plus';
import { SwitchVertical01 } from '@untitledui/icons/SwitchVertical01';
import { XClose } from '@untitledui/icons/XClose';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackSmart, replaceTracked } from '../../../lib/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { AppIcon } from '../../../components/AppIcon';
import { EmptyState } from '../../../components/EmptyState';
import { MuteToggleButton } from '../../../components/MuteToggleButton';
import { PreorderDropCard, PreorderDropItem } from '../../../components/PreorderDropCard';
import { RepublishDropSheet } from '../../../components/RepublishDropSheet';

import { Rupees } from '../../../components/Rupees';
import { ChipRowSlider } from '../../../components/ChipRowSlider';
import { useWebPullToRefresh } from '../../../components/useWebPullToRefresh';
import { WebPullIndicator } from '../../../components/WebPullIndicator';
import { DietDot } from '../../../components/DietDot';
import { Verandah } from '../../../constants/Colors';
import { DIET_META, DIET_TYPES } from '../../../constants/diet';
import { DROP_SORT_MOST_ORDERED_ENABLED } from '../../../constants/featureFlags';
import { MEAL_META, MEAL_TYPES, MealType } from '../../../constants/meal';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { buildMcnHeaderOptions } from '../../../lib/mcnHeader';
import { supabase } from '../../../lib/supabase';

type SortOption = 'closing' | 'delivery' | 'newest' | 'price' | 'popular';

const SORT_OPTIONS: { key: SortOption; label: string; hint: string }[] = [
  { key: 'closing', label: 'Closing soon', hint: 'Order before it closes' },
  { key: 'delivery', label: 'Delivery soonest', hint: 'Food arriving first' },
  { key: 'newest', label: 'Just added', hint: 'Newest menus from your neighbours' },
  { key: 'price', label: 'Price: low to high', hint: 'Cheapest item on the menu' },
  // Parked, not removed — the comparator below and get_mcn_drop_order_counts
  // are both live. See DROP_SORT_MOST_ORDERED_ENABLED.
  ...(DROP_SORT_MOST_ORDERED_ENABLED
    ? ([{ key: 'popular', label: 'Most ordered', hint: 'What the society is already buying' }] as const)
    : []),
];

type DayFilter = 'all' | 'today' | 'tomorrow' | 'weekend' | 'week';
type MealFilter = 'all' | MealType;
type PriceFilter = 'all' | 'under100' | 'mid' | 'over300';
type DietFilter = 'all' | 'veg' | 'egg' | 'non_veg';

interface DropFilters {
  day: DayFilter;
  meal: MealFilter;
  price: PriceFilter;
  diet: DietFilter;
}

const DEFAULT_FILTERS: DropFilters = {
  day: 'all',
  meal: 'all',
  price: 'all',
  diet: 'all',
};

/** How many filter groups are away from their default — drives the pill badge. */
function countActiveFilters(f: DropFilters): number {
  return (
    (f.day !== 'all' ? 1 : 0) +
    (f.meal !== 'all' ? 1 : 0) +
    (f.price !== 'all' ? 1 : 0) +
    (f.diet !== 'all' ? 1 : 0)
  );
}

/** Local calendar day, not `toISOString()` — the UTC day trails IST before
 *  5:30 AM, which would put "today's" drops under tomorrow. */
function localDayStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function matchesDay(dateStr: string, filter: DayFilter, now: Date): boolean {
  if (filter === 'all') return true;
  if (!dateStr) return false;

  const today = localDayStr(now);
  if (filter === 'today') return dateStr === today;

  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  if (filter === 'tomorrow') return dateStr === localDayStr(tomorrowDate);

  if (filter === 'week') {
    const weekOut = new Date(now);
    weekOut.setDate(weekOut.getDate() + 7);
    return dateStr >= today && dateStr <= localDayStr(weekOut);
  }

  // Weekend — the coming Saturday and Sunday. On a Saturday or Sunday that is
  // this weekend, not the next one.
  const day = now.getDay();
  const daysToSat = day === 0 ? -1 : 6 - day;
  const sat = new Date(now);
  sat.setDate(sat.getDate() + daysToSat);
  const sun = new Date(sat);
  sun.setDate(sun.getDate() + 1);
  return dateStr === localDayStr(sat) || dateStr === localDayStr(sun);
}

function matchesPrice(min: number | null | undefined, filter: PriceFilter): boolean {
  if (filter === 'all') return true;
  // A drop whose menu never loaded has no price to judge; hiding it would be
  // a silent data-loading failure dressed up as a filter result.
  if (min == null) return true;
  if (filter === 'under100') return min < 100;
  if (filter === 'mid') return min >= 100 && min <= 300;
  return min > 300;
}

/** One labelled row of mutually exclusive filter chips inside the sheet. */
function FilterGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: T; label: string; leading?: React.ReactNode }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View style={styles.filterGroup}>
      <Text style={styles.filterGroupLabel}>{label}</Text>
      <View style={styles.filterChipWrap}>
        {options.map((option) => {
          const selected = option.key === value;
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.filterChip, selected && styles.filterChipSel]}
              onPress={() => onChange(option.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              {option.leading}
              <Text style={[styles.filterChipText, selected && styles.filterChipTextSel]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function FoodDropsCatalogScreen() {
  const router = useRouter();
  const { id: targetDropId, tab: initialTab } = useLocalSearchParams<{ id?: string; tab?: string }>();
  const { user, communityId, isCommunityLead, isPlatformAdmin } = useAuth();
  // Hiding a drop takes it out of every other tab, so without a surface of its
  // own a lead would have no way back to the thing they just hid.
  const canReviewHidden = !!isCommunityLead || !!isPlatformAdmin;
  const colors = Verandah;
  const redirectedRef = React.useRef<string | null>(null);

  const [drops, setDrops] = useState<PreorderDropItem[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'closed' | 'my_drops' | 'review'>('active');
  const [preparingCollapsed, setPreparingCollapsed] = useState(false);
  // Republish sheet target — the host's own past menu being run again.
  const [republishDropId, setRepublishDropId] = useState<string | null>(null);
  const [completedCollapsed, setCompletedCollapsed] = useState(false);

  useEffect(() => {
    if (initialTab && (initialTab === 'active' || initialTab === 'closed' || initialTab === 'my_drops')) {
      setActiveTab(initialTab as any);
    }
  }, [initialTab]);

  // Share links use the `/mcn/drops?id=<uuid>` bridge form. Redirect with
  // replace(), not push(), so the bridge URL does not keep its own history
  // entry — otherwise browser-back lands on it and it immediately forwards to
  // the detail screen again, trapping the user in a back loop.
  useEffect(() => {
    if (targetDropId && redirectedRef.current !== targetDropId) {
      redirectedRef.current = targetDropId;
      replaceTracked(router, `/mcn/drops/${targetDropId}` as any);
    }
  }, [targetDropId, router]);
  const [myMetrics, setMyMetrics] = useState<{
    totalRevenue: number;
    completedRevenue: number;
    totalOrders: number;
  }>({ totalRevenue: 0, completedRevenue: 0, totalOrders: 0 });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [sortBy, setSortBy] = useState<SortOption>('closing');
  const [filters, setFilters] = useState<DropFilters>(DEFAULT_FILTERS);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  // Edited inside the sheet and committed on "Show results", so a half-built
  // filter set never re-renders the list underneath the sheet.
  const [draftFilters, setDraftFilters] = useState<DropFilters>(DEFAULT_FILTERS);

  const activeFilterCount = countActiveFilters(filters);

  const fetchDrops = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const isAnonymousView = !user?.id;
        let query = supabase.from('mcn_preorder_drops').select('*').order('cutoff_at', { ascending: true });

        if (communityId) {
          query = query.eq('community_id', communityId);
        }

        if (activeTab === 'my_drops' && user?.id) {
          query = query.eq('created_by', user?.id);
        } else if (activeTab === 'review') {
          query = query.not('flagged_for_review_at', 'is', null);
        } else {
          // A drop hidden for review leaves the catalogue entirely — that is what
          // "hidden" means, and it is why moderation does not need a public spam
          // badge next to the host's name and flat. The host still sees it under
          // "Mine", leads under "Hidden", and existing buyers still reach it from
          // My Orders.
          query = query.is('flagged_for_review_at', null);
        }

        if (activeTab === 'active' && isAnonymousView) {
          query = query.eq('status', 'open');
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data) {
          // Fetch order counts and revenue metrics per drop
          const dropIds = data.map((d: any) => d.id);
          let orderCounts: Record<string, number> = {};
          let itemCounts: Record<string, number> = {};
          let profileMap: Record<string, { full_name: string | null; flat_number: string | null }> = {};
          let listingMap: Record<string, { name: string; image_url: string | null }> = {};
          let totRev = 0;
          let compRev = 0;
          let totOrd = 0;

          // Order counts come from an aggregate RPC rather than a direct read
          // of mcn_preorder_orders: those rows carry buyer name, phone, and
          // flat, so they are not publicly readable. Reading them directly
          // meant logged-out browsers saw every drop at zero orders and the
          // "Most ordered" sort silently did nothing.
          //
          // Gated on the flag because that sort is now the only consumer —
          // fetching counts nothing renders would be a round trip per catalog
          // load for a hidden feature (hidden-features/README.md, rule 5).
          if (dropIds.length > 0 && DROP_SORT_MOST_ORDERED_ENABLED) {
            const { data: countRows } = await supabase.rpc('get_mcn_drop_order_counts', {
              p_drop_ids: dropIds,
            });

            (countRows || []).forEach((row: any) => {
              orderCounts[row.drop_id] = Number(row.order_count || 0);
              itemCounts[row.drop_id] = Number(row.item_count || 0);
            });
          }

          // Revenue is the host's own figure and needs the amounts, so it stays
          // on a direct read — but only on the tab that displays it.
          if (dropIds.length > 0 && user?.id && activeTab === 'my_drops') {
            const { data: orderData } = await supabase
              .from('mcn_preorder_orders')
              .select('drop_id, total_amount, status')
              .in('drop_id', dropIds);

            const dropStatusMap: Record<string, string> = {};
            data.forEach((d: any) => {
              dropStatusMap[d.id] = d.status;
            });

            (orderData || []).forEach((row: any) => {
              if (row.status === 'cancelled') return;
              totOrd += 1;
              const amt = parseFloat(row.total_amount || 0);
              totRev += amt;
              if (dropStatusMap[row.drop_id] === 'completed' || row.status === 'fulfilled') {
                compRev += amt;
              }
            });
          }

          // Menu items drive the price filter/sort and the diet filter. One
          // query for every drop on screen — the public select policy on
          // mcn_preorder_items makes this work signed out too.
          const minPriceMap: Record<string, number> = {};
          const dietMap: Record<string, Set<string>> = {};

          if (dropIds.length > 0) {
            const { data: itemRows } = await supabase
              .from('mcn_preorder_items')
              .select('drop_id, price, diet_type')
              .in('drop_id', dropIds);

            (itemRows || []).forEach((row: any) => {
              const price = parseFloat(String(row.price ?? ''));
              if (!isNaN(price)) {
                const current = minPriceMap[row.drop_id];
                if (current === undefined || price < current) {
                  minPriceMap[row.drop_id] = price;
                }
              }
              if (!dietMap[row.drop_id]) dietMap[row.drop_id] = new Set();
              dietMap[row.drop_id].add(row.diet_type || 'veg');
            });
          }

          const creatorIds = Array.from(
            new Set(data.map((d: any) => d.created_by).filter(Boolean))
          );

          if (creatorIds.length > 0) {
            const { data: hostRows } = await supabase.rpc('get_public_host_profiles', {
              p_user_ids: creatorIds,
            });

            // The RPC is the anon-safe path. Signed-in residents can still read
            // host profiles directly via profiles_select_public_hosts, so fall
            // back to that when the RPC yields nothing (e.g. not yet deployed).
            let hostProfiles: any[] = hostRows || [];
            if (hostProfiles.length === 0 && user?.id) {
              const { data: directRows } = await supabase
                .from('profiles')
                .select('id, full_name, flat_number')
                .in('id', creatorIds);
              hostProfiles = directRows || [];
            }

            hostProfiles.forEach((profile: any) => {
              profileMap[profile.id] = {
                full_name: profile.full_name || null,
                flat_number: profile.flat_number || null,
              };
            });
          }

          const listingIds = Array.from(
            new Set(data.map((d: any) => d.listing_id).filter(Boolean))
          );

          if (listingIds.length > 0) {
            const { data: listingData } = await supabase
              .from('mcn_listings')
              .select('id, name, image_url')
              .in('id', listingIds);

            (listingData || []).forEach((listing: any) => {
              listingMap[listing.id] = {
                name: listing.name,
                image_url: listing.image_url || null,
              };
            });
          }

          setMyMetrics({
            totalRevenue: totRev,
            completedRevenue: compRev,
            totalOrders: totOrd,
          });

          const now = new Date();
          const formatted: PreorderDropItem[] = data.map((d: any) => ({
            ...d,
            order_count: orderCounts[d.id] || 0,
            item_count: itemCounts[d.id] || 0,
            profiles: profileMap[d.created_by] || null,
            mcn_listings: d.listing_id ? listingMap[d.listing_id] || null : null,
            min_price: minPriceMap[d.id] ?? null,
            // Ordered veg → egg → non-veg so the dots on a mixed tile always
            // appear in the same sequence.
            diet_types: DIET_TYPES.filter((t) => dietMap[d.id]?.has(t)),
          }));

          const isDeliveryPassed = (d: PreorderDropItem): boolean => {
            if (d.status === 'completed' || d.status === 'cancelled') return true;
            if (!d.fulfillment_date) return false;
            const timeStr = d.fulfillment_time || '23:59';
            const fulfillDateTime = new Date(`${d.fulfillment_date}T${timeStr}:00`);
            if (isNaN(fulfillDateTime.getTime())) {
              const fulfillDateOnly = new Date(`${d.fulfillment_date}T23:59:59`);
              return now > fulfillDateOnly;
            }
            return now > fulfillDateTime;
          };

          // Filter by active vs closed tab if not in my_drops
          let filtered = formatted;
          if (activeTab === 'active') {
            filtered = formatted.filter(
              (d) => d.status === 'open' && new Date(d.cutoff_at) > now
            );
          } else if (activeTab === 'closed') {
            const preparing = formatted.filter(
              (d) => d.status !== 'completed' && d.status !== 'cancelled' && (d.status === 'closed' || new Date(d.cutoff_at) <= now) && !isDeliveryPassed(d)
            );
            const completed = formatted.filter(
              (d) => d.status === 'completed' || d.status === 'cancelled' || isDeliveryPassed(d)
            );
            filtered = [...preparing, ...completed];
          }

          setDrops(filtered);
        } else {
          setDrops([]);
        }
      } catch (err) {
        console.error('Error fetching preorder drops:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [communityId, activeTab, user?.id]
  );

  useEffect(() => {
    fetchDrops();
  }, [communityId, activeTab]);

  useFocusEffect(
    useCallback(() => {
      fetchDrops();
    }, [fetchDrops])
  );

  const webPullProps = useWebPullToRefresh(() => fetchDrops(true), refreshing);

  /**
   * Filtering and sorting run client-side. A community sees a handful of open
   * drops at a time, and every field involved is already loaded for the tiles —
   * a round trip per chip tap would cost more than it saves.
   */
  const processedDrops = useMemo(() => {
    const now = new Date();

    const list = drops.filter((d) => {
      if (!matchesDay(d.fulfillment_date, filters.day, now)) return false;
      if (filters.meal !== 'all' && d.meal_type !== filters.meal) return false;
      if (!matchesPrice(d.min_price, filters.price)) return false;

      // "Has at least one" — you are ordering individual items, and the menu
      // marks each one, so a mixed drop is a real result for both filters.
      if (filters.diet !== 'all' && !(d.diet_types || []).includes(filters.diet)) return false;

      return true;
    });

    const deliveryAt = (d: PreorderDropItem): number => {
      const parsed = new Date(`${d.fulfillment_date}T${d.fulfillment_time || '23:59'}:00`);
      return isNaN(parsed.getTime()) ? Number.MAX_SAFE_INTEGER : parsed.getTime();
    };

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'delivery':
          return deliveryAt(a) - deliveryAt(b);
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'price': {
          // Drops with no priced menu sink rather than leading a "cheapest
          // first" list at position one with no price to show.
          const av = a.min_price ?? Number.MAX_SAFE_INTEGER;
          const bv = b.min_price ?? Number.MAX_SAFE_INTEGER;
          return av - bv;
        }
        case 'popular':
          return (b.order_count || 0) - (a.order_count || 0);
        case 'closing':
        default:
          return new Date(a.cutoff_at).getTime() - new Date(b.cutoff_at).getTime();
      }
    });

    return sorted;
  }, [drops, filters, sortBy, activeTab]);

  const listRows = useMemo(() => {
    const drops = processedDrops;

    if (activeTab !== 'closed') {
      return drops.map((drop) => ({ type: 'drop' as const, drop }));
    }

    const isDeliveryPassed = (d: PreorderDropItem): boolean => {
      if (d.status === 'completed' || d.status === 'cancelled') return true;
      if (!d.fulfillment_date) return false;
      const timeStr = d.fulfillment_time || '23:59';
      const fulfillDateTime = new Date(`${d.fulfillment_date}T${timeStr}:00`);
      const now = new Date();
      if (isNaN(fulfillDateTime.getTime())) {
        const fulfillDateOnly = new Date(`${d.fulfillment_date}T23:59:59`);
        return now > fulfillDateOnly;
      }
      return now > fulfillDateTime;
    };

    const preparing = drops.filter((d) => !isDeliveryPassed(d));
    const completed = drops.filter((d) => isDeliveryPassed(d));

    const rows: (
      | { type: 'header'; section: 'preparing' | 'completed'; count: number }
      | { type: 'drop'; drop: PreorderDropItem }
    )[] = [];

    if (preparing.length > 0) {
      rows.push({ type: 'header', section: 'preparing', count: preparing.length });
      if (!preparingCollapsed) {
        preparing.forEach((drop) => rows.push({ type: 'drop', drop }));
      }
    }

    if (completed.length > 0) {
      rows.push({ type: 'header', section: 'completed', count: completed.length });
      if (!completedCollapsed) {
        completed.forEach((drop) => rows.push({ type: 'drop', drop }));
      }
    }

    return rows;
  }, [processedDrops, activeTab, preparingCollapsed, completedCollapsed]);

  const handleBack = () => {
    goBackSmart(router, '/mcn/drops');
  };

  const requireLoginForAction = () => {
    if (user?.id) return true;
    Toast.show({
      type: 'info',
      text1: 'Login required',
      text2: 'You can browse menus now. Please login to publish one or manage orders.',
    });
    router.push('/login' as any);
    return false;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: 'Pre-order Food',
          onBack: handleBack,
          headerRight: user?.id ? () => <MuteToggleButton channel="food_drops" /> : undefined,
        })}
      />


      {/* The Pre-order Food / Businesses switcher that sat here until
          2026-08-24 is gone: each section now has its own card on the MCN hub,
          so the switcher was a second entry point to a sibling screen rather
          than a control over anything on this one. */}

      {/* Tabs, filter and sort share one row — the two controls are the same
          pill as Open/Past/Mine, just icon-width, so five affordances still
          fit a narrow phone without the row scrolling. */}
      <View style={styles.controlsRow}>
        <ChipRowSlider<'active' | 'closed' | 'my_drops' | 'review'>
          value={activeTab}
          onChange={(val) => {
            if (val === 'my_drops' && !user?.id) {
              requireLoginForAction();
              return;
            }
            setActiveTab(val);
          }}
          chips={[
            { key: 'active', label: 'Open' },
            { key: 'closed', label: 'Past' },
            { key: 'my_drops', label: 'Mine' },
            // President / VP only — the queue of drops hidden pending review.
            // Residents can do nothing with it, so they never see the chip.
            ...(canReviewHidden ? ([{ key: 'review' as const, label: 'Review' }]) : []),
          ]}
          // A fourth chip no longer fits beside the filter and sort pills on a
          // narrow phone, so the lead's row scrolls internally. It needs a
          // bounded slot to do that: ChipRowSlider's scrollable root is a
          // horizontal ScrollView, which has no intrinsic width and collapses
          // when dropped straight into a `flexDirection: 'row'` parent — that
          // is why the chip did not appear at all. `flex: 1` gives it the
          // leftover width and doubles as the spacer the icon pills need.
          scrollable={canReviewHidden}
          containerStyle={canReviewHidden ? styles.tabsScrollSlot : undefined}
          chipStyle={styles.tabBtn}
          inactiveChipStyle={{ backgroundColor: Verandah.card, borderWidth: 0.5, borderColor: Verandah.borderHair }}
          pillStyle={styles.tabBtnActive}
          activeColor={Verandah.primaryFg}
          inactiveColor={Verandah.textPrimary}
          textStyle={styles.tabText}
          activeTextStyle={styles.tabTextActive}
        />

        {!canReviewHidden ? <View style={{ flex: 1 }} /> : null}

        <TouchableOpacity
          style={[styles.iconPill, activeFilterCount > 0 && styles.iconPillActive]}
          onPress={() => {
            setDraftFilters(filters);
            setFilterOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={
            activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : 'Filters'
          }
        >
          <FilterLines
            size={15}
            color={activeFilterCount > 0 ? Verandah.primaryFg : Verandah.textPrimary}
            aria-hidden={true}
          />
          {activeFilterCount > 0 ? (
            <Text style={styles.iconPillCount}>{activeFilterCount}</Text>
          ) : null}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.iconPill, sortBy !== 'closing' && styles.iconPillActive]}
          onPress={() => setSortOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Sort, currently ${SORT_OPTIONS.find((s) => s.key === sortBy)?.label}`}
        >
          <SwitchVertical01
            size={15}
            color={sortBy !== 'closing' ? Verandah.primaryFg : Verandah.textPrimary}
            aria-hidden={true}
          />
        </TouchableOpacity>
      </View>

      {/* Sort sheet */}
      <Modal
        visible={sortOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSortOpen(false)}
      >
        <View style={styles.sheetRoot}>
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={() => setSortOpen(false)}
            accessibilityLabel="Close sort options"
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Sort by</Text>
              <TouchableOpacity onPress={() => setSortOpen(false)} hitSlop={8}>
                <XClose size={20} color={Verandah.textSecondary} aria-hidden={true} />
              </TouchableOpacity>
            </View>

            {SORT_OPTIONS.map((option) => {
              const selected = sortBy === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={styles.sortRow}
                  onPress={() => {
                    setSortBy(option.key);
                    setSortOpen(false);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sortRowLabel, selected && styles.sortRowLabelSel]}>
                      {option.label}
                    </Text>
                    <Text style={styles.sortRowHint}>{option.hint}</Text>
                  </View>
                  {selected ? <Check size={18} color={Verandah.primary} aria-hidden={true} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

      {/* Filter sheet */}
      <Modal
        visible={filterOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterOpen(false)}
      >
        <View style={styles.sheetRoot}>
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={() => setFilterOpen(false)}
            accessibilityLabel="Close filters"
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Filters</Text>
              <TouchableOpacity onPress={() => setFilterOpen(false)} hitSlop={8}>
                <XClose size={20} color={Verandah.textSecondary} aria-hidden={true} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <FilterGroup
                label="Delivery day"
                value={draftFilters.day}
                onChange={(day) => setDraftFilters((f) => ({ ...f, day }))}
                options={[
                  { key: 'all', label: 'Any day' },
                  { key: 'today', label: 'Today' },
                  { key: 'tomorrow', label: 'Tomorrow' },
                  { key: 'weekend', label: 'This weekend' },
                  { key: 'week', label: 'Next 7 days' },
                ]}
              />

              <FilterGroup
                label="Meal"
                value={draftFilters.meal}
                onChange={(meal) => setDraftFilters((f) => ({ ...f, meal }))}
                options={[
                  { key: 'all' as MealFilter, label: 'Any meal' },
                  ...MEAL_TYPES.map((m) => ({ key: m as MealFilter, label: MEAL_META[m].label })),
                ]}
              />

              <FilterGroup
                label="Veg / Non-veg"
                value={draftFilters.diet}
                onChange={(diet) => setDraftFilters((f) => ({ ...f, diet }))}
                options={[
                  { key: 'all', label: 'Anything' },
                  ...DIET_TYPES.map((t) => ({
                    key: t as DietFilter,
                    label: DIET_META[t].label,
                    leading: <DietDot value={t} size={11} />,
                  })),
                ]}
              />

              <FilterGroup
                label="Price"
                value={draftFilters.price}
                onChange={(price) => setDraftFilters((f) => ({ ...f, price }))}
                options={[
                  { key: 'all', label: 'Any price' },
                  { key: 'under100', label: 'Under ₹100' },
                  { key: 'mid', label: '₹100 – ₹300' },
                  { key: 'over300', label: 'Above ₹300' },
                ]}
              />

            </ScrollView>

            <View style={styles.sheetFooter}>
              <TouchableOpacity
                style={styles.sheetClearBtn}
                onPress={() => setDraftFilters(DEFAULT_FILTERS)}
              >
                <Text style={styles.sheetClearText}>Clear all</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetApplyBtn}
                onPress={() => {
                  setFilters(draftFilters);
                  setFilterOpen(false);
                }}
              >
                <Text style={styles.sheetApplyText}>Show results</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* My Menus Revenue & Earnings Card */}
      {activeTab === 'my_drops' && !loading ? (
        <View style={styles.revenueCard}>
          <View style={styles.iconLabelRow}>
            <AppIcon name="money" size={16} />
            <Text style={styles.revenueCardTitle}>My Pre-order Food Performance & Revenue</Text>
          </View>
          <View style={styles.revenueRow}>
            <View style={styles.revenueCol}>
              <Text style={styles.revenueSub}>Menus Published</Text>
              <Text style={styles.revenueValText}>{drops.length}</Text>
            </View>
            <View style={styles.revenueDivider} />
            <View style={styles.revenueCol}>
              <Text style={styles.revenueSub}>Total Orders</Text>
              <Text style={styles.revenueValText}>{myMetrics.totalOrders}</Text>
            </View>
            <View style={styles.revenueDivider} />
            <View style={styles.revenueCol}>
              <Text style={styles.revenueSub}>Total Revenue</Text>
              <Rupees amount={myMetrics.totalRevenue} size="md" tone="in" />
            </View>
            <View style={styles.revenueDivider} />
            <View style={styles.revenueCol}>
              <Text style={styles.revenueSub}>Delivered</Text>
              <Rupees amount={myMetrics.completedRevenue} size="md" tone="in" />
            </View>
          </View>
        </View>
      ) : null}

      {/* Content List */}
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          {...webPullProps.pullProps}
          data={listRows}
          keyExtractor={(row) => (row.type === 'header' ? `header-${row.section}` : row.drop.id)}
          contentContainerStyle={
            processedDrops.length === 0 ? styles.emptyList : styles.listContent
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchDrops(true)}
              colors={[colors.primary]}
            />
          }
          ListHeaderComponent={
            <WebPullIndicator pullDistance={webPullProps.pullDistance} refreshing={refreshing} isPulling={webPullProps.isPulling} />
          }
          renderItem={({ item: row }) => {
            if (row.type === 'header') {
              const isPreparing = row.section === 'preparing';
              const collapsed = isPreparing ? preparingCollapsed : completedCollapsed;
              const toggle = () =>
                isPreparing
                  ? setPreparingCollapsed((v) => !v)
                  : setCompletedCollapsed((v) => !v);

              return (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={toggle}
                  style={isPreparing ? styles.sectionHeaderPreparing : styles.sectionHeaderCompleted}
                >
                  <View style={[styles.iconLabelRow, { flex: 1 }]}>
                    {isPreparing ? (
                      <AppIcon name="chef" size={14} />
                    ) : (
                      <CheckCircle size={16} color={Verandah.green600} aria-hidden={true} />
                    )}
                    <Text style={isPreparing ? styles.sectionHeaderTextPreparing : styles.sectionHeaderTextCompleted}>
                      {isPreparing ? 'Kitchen Preparing' : 'Past Completed & Delivered Menus'} ({row.count})
                    </Text>
                  </View>
                  {collapsed ? (
                    <ChevronDown size={16} color={isPreparing ? '#92400E' : '#065F46'} aria-hidden={true} />
                  ) : (
                    <ChevronUp size={16} color={isPreparing ? '#92400E' : '#065F46'} aria-hidden={true} />
                  )}
                </TouchableOpacity>
              );
            }

            const item = row.drop;
            // "Republish" only on the host's own past menus, under Mine. It is
            // the tab a repeat cook already opens to find last week's menu, so
            // it is where the one-tap rerun belongs. Never on a drop hidden for
            // review — republishing would undo the moderation in one tap.
            const canRepublish =
              activeTab === 'my_drops' &&
              item.created_by === user?.id &&
              !item.flagged_for_review_at &&
              !(item.status === 'open' && new Date(item.cutoff_at) > new Date());

            return (
              <PreorderDropCard
                drop={item}
                onPress={() => router.push(`/mcn/drops/${item.id}` as any)}
                onRepublish={canRepublish ? () => setRepublishDropId(item.id) : undefined}
              />
            );
          }}
          ListEmptyComponent={
            // A filtered-to-nothing list is a different problem from an empty
            // one — telling a resident to "check back soon" when they have
            // simply over-narrowed hides the fix from them.
            drops.length > 0 && activeFilterCount > 0 ? (
              <EmptyState
                icon="restaurant-outline"
                title="No menus match these filters"
                message={`${drops.length} menu${drops.length === 1 ? '' : 's'} here, but none fit what you picked. Try widening or clearing the filters.`}
                actionLabel="Clear filters"
                onAction={() => {
                  setFilters(DEFAULT_FILTERS);
                  setDraftFilters(DEFAULT_FILTERS);
                }}
              />
            ) : (
              <EmptyState
                icon="restaurant-outline"
                title={
                  activeTab === 'active'
                    ? 'No active menus'
                    : activeTab === 'my_drops'
                    ? 'You haven’t published any pre-order food'
                    : activeTab === 'review'
                    ? 'Nothing waiting for review'
                    : 'No past pre-order food'
                }
                message={
                  activeTab === 'active'
                    ? 'No local pre-order food open right now. Check back soon or publish your own menu!'
                    : activeTab === 'review'
                    ? 'Menus you hide, and menus auto-hidden after three resident reports, collect here.'
                    : 'Publish a menu to let neighbours pre-order your weekend specials!'
                }
              />
            )
          }
        />
      )}

      {/* Floating Add FAB */}
      {user?.id ? (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/mcn/drops/add' as any)}
          activeOpacity={0.85}
        >
          <Plus size={24} color={Verandah.primaryFg} aria-hidden={true} />
          <Text style={styles.fabText}>Publish Menu</Text>
        </TouchableOpacity>
      ) : null}

      {/* Republish: rerun one of the host's own past menus, changing only the
          closing and delivery time. Publishing lands the host on the new drop,
          which is the thing they now want to share. */}
      {communityId && user?.id ? (
        <RepublishDropSheet
          dropId={republishDropId}
          communityId={communityId}
          userId={user.id}
          onClose={() => setRepublishDropId(null)}
          onPublished={(newDropId) => {
            // Same ordering rule as onEditFull below: navigate, then close.
            router.push(`/mcn/drops/${newDropId}` as any);
            setTimeout(() => setRepublishDropId(null), 0);
          }}
          onEditFull={(sourceId) => {
            // Navigate FIRST, then close. The sheet owns a history entry via
            // useWebBackToClose, and closing it runs `history.back()` unless
            // that entry has been navigated on top of. Clearing state first let
            // the pop land on the publish form and bounce the host straight
            // back to this catalog — the form flashed up, showed its "Menu
            // copied" toast, and vanished.
            router.push(`/mcn/drops/add?fromDropId=${sourceId}` as any);
            setTimeout(() => setRepublishDropId(null), 0);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBanner: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  bannerTitle: {
    ...VerandahType.title,
    fontSize: 15,
    color: Verandah.textPrimary,
    marginBottom: 2,
  },
  bannerSub: {
    ...VerandahType.body,
    fontSize: 12,
    color: Verandah.textSecondary,
    lineHeight: 16,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    gap: 8,
  },
  iconPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: VerandahRadius.pill,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.card,
  },
  iconPillActive: {
    backgroundColor: Verandah.primary,
    borderColor: Verandah.primary,
  },
  iconPillCount: {
    fontSize: 12,
    fontWeight: '700',
    color: Verandah.primaryFg,
    fontFamily: VerandahType.sansFamily,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: Verandah.card,
    borderTopLeftRadius: VerandahRadius.lg,
    borderTopRightRadius: VerandahRadius.lg,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sheetTitle: {
    ...VerandahType.title,
    fontSize: 16,
    color: Verandah.textPrimary,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderTopWidth: 0.5,
    borderTopColor: Verandah.borderHair,
  },
  sortRowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Verandah.textPrimary,
    fontFamily: VerandahType.sansFamily,
  },
  sortRowLabelSel: {
    color: Verandah.primary,
  },
  sortRowHint: {
    fontSize: 11.5,
    color: Verandah.textSecondary,
    marginTop: 1,
  },
  filterGroup: {
    marginBottom: 14,
  },
  filterGroupLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Verandah.textSecondary,
    marginBottom: 7,
  },
  filterChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: VerandahRadius.pill,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.paper,
  },
  filterChipSel: {
    backgroundColor: Verandah.primary,
    borderColor: Verandah.primary,
  },
  filterChipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: Verandah.textPrimary,
    fontFamily: VerandahType.sansFamily,
  },
  filterChipTextSel: {
    color: Verandah.primaryFg,
  },
  sheetFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: Verandah.borderHair,
  },
  sheetClearBtn: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: VerandahRadius.pill,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
  },
  sheetClearText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: Verandah.textPrimary,
    fontFamily: VerandahType.sansFamily,
  },
  sheetApplyBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: VerandahRadius.pill,
    backgroundColor: Verandah.primary,
  },
  sheetApplyText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: Verandah.primaryFg,
    fontFamily: VerandahType.sansFamily,
  },
  iconLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // Bounded slot for the lead's scrollable four-chip row — see the comment at
  // the ChipRowSlider call site.
  tabsScrollSlot: {
    flex: 1,
  },
  tabBtn: {
    paddingVertical: 7,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderRadius: VerandahRadius.pill,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.card,
  },
  tabBtnActive: {
    backgroundColor: Verandah.primary,
    borderColor: Verandah.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Verandah.textPrimary,
    fontFamily: VerandahType.sansFamily,
  },
  tabTextActive: {
    fontWeight: '700',
    color: Verandah.primaryFg,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Verandah.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: VerandahRadius.pill,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionHeaderPreparing: {
    marginTop: 8,
    marginBottom: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#FEF3C7',
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    borderColor: '#FDE68A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderTextPreparing: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
  },
  sectionHeaderCompleted: {
    marginTop: 10,
    marginBottom: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: Verandah.accentSoft,
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderTextCompleted: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  revenueCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: Verandah.accentSoft,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: VerandahRadius.lg,
    padding: 10,
    ...Verandah.shadowCard,
  },
  revenueCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
    marginBottom: 6,
  },
  revenueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  revenueCol: {
    flex: 1,
    alignItems: 'center',
  },
  revenueSub: {
    fontSize: 10,
    fontWeight: '500',
    color: '#047857',
    marginBottom: 2,
    textAlign: 'center',
  },
  revenueDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#A7F3D0',
  },
  revenueValText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#065F46',
  },
});
