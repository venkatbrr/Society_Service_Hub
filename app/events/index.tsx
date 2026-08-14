import { Plus } from '@untitledui/icons/Plus';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { ChipRowSlider } from '../../components/ChipRowSlider';
import { EmptyState } from '../../components/EmptyState';
import { CommunityEventItem, EventCard } from '../../components/EventCard';
import { HeaderBackButton } from '../../components/HeaderBackButton';
import { SegmentedSlider } from '../../components/SegmentedSlider';
import { useWebPullToRefresh } from '../../components/useWebPullToRefresh';
import { WebPullIndicator } from '../../components/WebPullIndicator';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { EVENT_CATEGORIES, EventCategory, eventCategoryMeta } from '../../lib/events';
import { goBackSmart } from '../../lib/navigation';
import { supabase } from '../../lib/supabase';

export default function CommunityEventsScreen() {
  const router = useRouter();
  const { communityId, isEventOrganizer, isCommunityLead } = useAuth();
  const canPost = isEventOrganizer || isCommunityLead;

  const [events, setEvents] = useState<CommunityEventItem[]>([]);
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const [category, setCategory] = useState<EventCategory | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadEvents = useCallback(async (isRefresh = false) => {
    if (!communityId) {
      setEvents([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      let query = supabase
        .from('community_events')
        .select('id, title, category, image_url, venue, event_date, start_time, registration_last_date, status')
        .eq('community_id', communityId);

      if (scope === 'upcoming') {
        query = query.gte('event_date', todayStr).order('event_date', { ascending: true }).order('start_time', { ascending: true });
      } else {
        query = query.lt('event_date', todayStr).order('event_date', { ascending: false });
      }

      const { data, error } = await query;
      if (error) throw error;
      setEvents((data ?? []) as CommunityEventItem[]);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to load events', text2: error.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [communityId, scope]);

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents])
  );

  const webPullProps = useWebPullToRefresh(() => loadEvents(true), refreshing);

  const filteredEvents = useMemo(() => {
    if (category === 'all') return events;
    return events.filter((e) => e.category === category);
  }, [events, category]);

  // Only offer the categories this community actually posts in. Showing all six
  // every time made an empty screen look like a filter problem.
  const availableCategories = useMemo(() => {
    const present = new Set(events.map((e) => e.category));
    return EVENT_CATEGORIES.filter((c) => present.has(c));
  }, [events]);

  // A stale category filter after switching scope would show an empty list with
  // no obvious cause, so drop back to "All" when the chip disappears.
  useEffect(() => {
    if (category !== 'all' && !availableCategories.includes(category)) {
      setCategory('all');
    }
  }, [availableCategories, category]);

  const handleBack = () => goBackSmart(router, '/events');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <HeaderBackButton onPress={handleBack} />
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Community events</Text>
          <Text style={styles.subtitle}>Cultural, sports & festival events in your community</Text>
        </View>
      </View>

      <SegmentedSlider<'upcoming' | 'past'>
        value={scope}
        onChange={setScope}
        segments={[
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'past', label: 'Past' },
        ]}
        trackStyle={styles.scopeTrack}
      />

      {/* The slider must sit inside a fixed-height slot. Its root is a
          horizontal ScrollView, and a ScrollView dropped straight into this
          flex-1 column has no intrinsic height to hold it — it takes whatever
          the column gives it, so the chips (centred inside it) and the animated
          pill land at a different vertical offset than the measured chip boxes
          and the row visibly jumps between selections. Every other chip row in
          the app pins this: business.tsx via `maxHeight`, CategoryFilter via a
          wrapper View. */}
      {availableCategories.length > 1 ? (
        <View style={styles.chipsSlot}>
          <ChipRowSlider<EventCategory | 'all'>
            value={category}
            onChange={setCategory}
            chips={[
              { key: 'all', label: 'All' },
              ...availableCategories.map((c) => ({ key: c, label: eventCategoryMeta(c).label })),
            ]}
            containerStyle={styles.chipsRow}
            contentContainerStyle={styles.chipsRowContent}
            activeColor={Verandah.primaryFg}
            inactiveColor={Verandah.textPrimary}
          />
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={Verandah.accent} />
        </View>
      ) : (
        <FlatList
          {...webPullProps.pullProps}
          data={filteredEvents}
          keyExtractor={(item) => item.id}
          contentContainerStyle={filteredEvents.length ? styles.listContent : styles.emptyList}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadEvents(true)} tintColor={Verandah.accent} />}
          ListHeaderComponent={
            <WebPullIndicator pullDistance={webPullProps.pullDistance} refreshing={refreshing} isPulling={webPullProps.isPulling} />
          }
          renderItem={({ item }) => (
            <EventCard event={item} variant="full" onPress={() => router.push(`/events/${item.id}` as any)} />
          )}
          ListEmptyComponent={
            <EmptyState
              title={scope === 'upcoming' ? 'No upcoming events' : 'No past events'}
              message={
                scope === 'upcoming'
                  ? canPost
                    ? 'Post the first cultural, sports or festival event for your community.'
                    : 'Nothing scheduled yet. Check back soon.'
                  : 'Past events will show up here once they happen.'
              }
              actionLabel={scope === 'upcoming' && canPost ? 'Post an event' : undefined}
              onAction={scope === 'upcoming' && canPost ? () => router.push('/events/add' as any) : undefined}
            />
          }
        />
      )}

      {canPost ? (
        <TouchableOpacity style={styles.fab} onPress={() => router.push('/events/add' as any)} activeOpacity={0.85}>
          <Plus size={20} color={Verandah.primaryFg} aria-hidden={true} />
          <Text style={styles.fabText}>Post event</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Chip box is 12.5px text (~16 line) + 5px padding top/bottom + hairline border. */
const CHIP_ROW_HEIGHT = 30;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Verandah.paper,
    paddingHorizontal: 20,
    paddingTop: VerandahLayout.screenPaddingTop,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '400',
    color: Verandah.textPrimary,
  },
  subtitle: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 12.5,
    color: Verandah.textSecondary,
    marginTop: 2,
  },
  scopeTrack: {
    marginBottom: 10,
  },
  chipsSlot: {
    height: CHIP_ROW_HEIGHT,
    justifyContent: 'center',
    marginBottom: 12,
  },
  chipsRow: {
    maxHeight: CHIP_ROW_HEIGHT,
  },
  chipsRowContent: {
    alignItems: 'center',
    gap: 6,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: 90,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Verandah.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: VerandahRadius.pill,
    ...Verandah.shadowRaised,
  },
  fabText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 13.5,
    fontWeight: '700',
    color: Verandah.primaryFg,
  },
});
