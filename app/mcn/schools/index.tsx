import { useFocusEffect } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import { goBackSmart } from '../../../lib/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { BaseCard } from '../../../components/BaseCard';
import { ChipRowSlider } from '../../../components/ChipRowSlider';
import { EmptyState } from '../../../components/EmptyState';
import { useWebPullToRefresh } from '../../../components/useWebPullToRefresh';
import { WebPullIndicator } from '../../../components/WebPullIndicator';
import { Verandah } from '../../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { WEST_HYDERABAD_SCHOOLS, WestHyderabadSchool } from '../../../data/westHyderabadSchools';
import { buildMcnHeaderOptions } from '../../../lib/mcnHeader';
import { supabase } from '../../../lib/supabase';

const LEVEL_MAP = {
  pre_school: 'Pre-School / Nursery',
  primary: 'Primary (Grades 1-5)',
  high_school: 'High School (1-10/12)',
  all_in_one: 'K-12 (All-in-one)',
};

const LOCALITY_OPTIONS = [
  'All Areas',
  'Kokapet',
  'Tellapur',
  'Nallagandla',
  'Financial District',
  'Kollur',
  'Chandanagar',
  'Patancheru',
  'Mokila',
  'Narsingi',
];

const BOARD_OPTIONS = ['All Boards', 'CBSE', 'IB', 'Cambridge (CAIE)', 'ICSE', 'Preschool'];

export default function SchoolsCatalogScreen() {
  const router = useRouter();
  const { communityId } = useAuth();
  const colors = Verandah;

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedLocality, setSelectedLocality] = useState('All Areas');
  const [selectedBoard, setSelectedBoard] = useState('All Boards');
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<string[]>([]);

  const [customSchools, setCustomSchools] = useState<WestHyderabadSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const handleBack = () => {
    goBackSmart(router, '/mcn/schools');
  };

  const webPullProps = useWebPullToRefresh(() => fetchCustomSchools(true), refreshing);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchCustomSchools = useCallback(
    async (isRefresh = false) => {
      if (!communityId) {
        setLoading(false);
        return;
      }
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const { data, error } = await supabase
          .from('schools')
          .select('*')
          .eq('community_id', communityId);

        if (!error && data) {
          const normalized = data.map((item: any) => ({
            id: item.id,
            name: item.name,
            area_locality: item.area_locality || 'Local Community',
            syllabus: item.syllabus,
            level: item.level || 'all_in_one',
            address: item.address || '',
            contact_phone: item.contact_phone || '',
            google_rating: item.google_rating || '',
            website: item.website || '',
            google_maps_link: item.google_maps_link || '',
            fee_range: item.fee_range || 'Contact school for fees',
            distance: item.distance || 0,
            facilities: item.facilities || [],
            description: item.description || '',
          }));
          setCustomSchools(normalized);
        }
      } catch (err) {
        console.error('Error fetching custom schools:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [communityId]
  );

  useFocusEffect(
    useCallback(() => {
      fetchCustomSchools();
    }, [fetchCustomSchools])
  );

  // Combine Catalog schools + Custom user-added schools
  const allSchoolsList = useMemo(() => {
    const map = new Map<string, WestHyderabadSchool>();
    WEST_HYDERABAD_SCHOOLS.forEach((s) => map.set(s.id, s));
    customSchools.forEach((s) => map.set(s.id, s));
    return Array.from(map.values());
  }, [customSchools]);

  // Filtered schools
  const filteredSchools = useMemo(() => {
    let list = [...allSchoolsList];

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.syllabus.toLowerCase().includes(q) ||
          s.area_locality.toLowerCase().includes(q) ||
          (s.address && s.address.toLowerCase().includes(q))
      );
    }

    if (selectedLocality !== 'All Areas') {
      list = list.filter((s) => s.area_locality.toLowerCase().includes(selectedLocality.toLowerCase()));
    }

    if (selectedBoard !== 'All Boards') {
      list = list.filter((s) => s.syllabus.toLowerCase().includes(selectedBoard.toLowerCase()));
    }

    return list;
  }, [allSchoolsList, debouncedSearch, selectedLocality, selectedBoard]);

  const handleToggleSelectSchool = (schoolId: string) => {
    setSelectedSchoolIds((prev) => {
      if (prev.includes(schoolId)) {
        return prev.filter((id) => id !== schoolId);
      }
      if (prev.length >= 3) {
        Toast.show({ type: 'info', text1: 'You can compare up to 3 schools at once' });
        return prev;
      }
      return [...prev, schoolId];
    });
  };

  const handleOpenLink = (url: string | null) => {
    if (!url) return;
    let finalUrl = url.trim();
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(finalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    Linking.openURL(finalUrl).catch(() => {
      Toast.show({ type: 'error', text1: 'Could not open link' });
    });
  };

  const getMapsUrl = (school: WestHyderabadSchool) => {
    if (school.google_maps_link?.trim()) {
      return school.google_maps_link.trim();
    }
    if (school.address?.trim()) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(school.address.trim())}`;
    }
    return null;
  };

  const handleCall = (phone: string | null) => {
    if (!phone) return;
    const clean = phone.replace(/\D/g, '');
    Linking.openURL(`tel:${clean}`).catch(() => {
      Toast.show({ type: 'error', text1: 'Could not initiate call' });
    });
  };

  const renderSchoolCard = (school: WestHyderabadSchool) => {
    const isSelected = selectedSchoolIds.includes(school.id);
    const mapsUrl = getMapsUrl(school);

    return (
      <BaseCard key={school.id} padding={16} style={styles.card}>
        <View style={styles.cardHeader}>
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => router.push(`/mcn/schools/${school.id}` as any)}
            activeOpacity={0.7}
          >
            <Text style={[styles.schoolName, { color: colors.textPrimary }]}>{school.name}</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.localityBadge, { backgroundColor: colors.accentSoft }]}>
                <Text style={[styles.localityBadgeText, { color: colors.accent }]}>{school.area_locality}</Text>
              </View>
              <Text style={[styles.levelText, { color: colors.textSecondary }]}>
                {LEVEL_MAP[school.level] || school.level}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleToggleSelectSchool(school.id)}
            style={[
              styles.compareToggleBtn,
              { borderColor: colors.border },
              isSelected && { backgroundColor: colors.accentSoft, borderColor: colors.accent },
            ]}
          >
            <Text style={[styles.compareToggleText, { color: isSelected ? colors.accent : colors.textSecondary }]}>
              {isSelected ? 'Selected' : 'Compare'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Board & Rating Row */}
        <View style={[styles.specRow, { borderColor: colors.border }]}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.syllabusLabel, { color: colors.textMuted }]}>Board: </Text>
            <Text style={[styles.syllabusVal, { color: colors.textPrimary }]}>{school.syllabus}</Text>
          </View>
          {school.review_count && school.review_count > 0 ? (
            <View style={styles.parentReviewBadge}>
              <Text style={styles.parentReviewBadgeText}>
                {school.review_count} {school.review_count === 1 ? 'parent review' : 'parent reviews'}
              </Text>
            </View>
          ) : school.google_rating ? (
            <View style={styles.ratingBadge}>
              <Text style={[styles.ratingText, { color: colors.textPrimary }]}>Rating {school.google_rating}</Text>
            </View>
          ) : null}
        </View>

        {/* Address */}
        {school.address ? (
          <Text style={[styles.addressText, { color: colors.textSecondary }]} numberOfLines={2}>
            {school.address}
          </Text>
        ) : null}

        {/* Action Row: Call, Website, Maps, Details */}
        <View style={styles.actionRow}>
          {school.contact_phone ? (
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
              onPress={() => handleCall(school.contact_phone)}
            >
              <Text style={[styles.actionBtnText, { color: colors.textPrimary }]}>Call</Text>
            </TouchableOpacity>
          ) : null}

          {school.website ? (
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
              onPress={() => handleOpenLink(school.website)}
            >
              <Text style={[styles.actionBtnText, { color: colors.textPrimary }]}>Website</Text>
            </TouchableOpacity>
          ) : null}

          {mapsUrl ? (
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
              onPress={() => handleOpenLink(mapsUrl)}
            >
              <Text style={[styles.actionBtnText, { color: colors.textPrimary }]}>Maps</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.detailsBtn, { backgroundColor: colors.cardMuted }]}
            onPress={() => router.push(`/mcn/schools/${school.id}` as any)}
          >
            <Text style={[styles.detailsBtnText, { color: colors.primary }]}>Details</Text>
          </TouchableOpacity>
        </View>
      </BaseCard>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: 'West Hyderabad Schools',
          onBack: handleBack,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/mcn/schools/add' as any)}
              style={{
                backgroundColor: colors.primary,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: VerandahRadius.pill,
                marginRight: 6,
              }}
            >
              <Text style={{ color: colors.primaryFg, fontSize: 12, fontWeight: '600' }}>+ Add School</Text>
            </TouchableOpacity>
          ),
        })}
      />

      <View style={styles.headerSubtitleWrap}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Verified directory of 50+ schools in Kokapet, Tellapur, Nallagandla & Patancheru corridor
        </Text>
      </View>

      {/* Search Input */}
      <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Search school name, board, locality..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={styles.clearSearchBtn}>
            <Text style={[styles.clearSearchText, { color: colors.textMuted }]}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Locality Filter Chips */}
      <View style={styles.filterSection}>
        <ChipRowSlider<string>
          chips={LOCALITY_OPTIONS.map((loc) => ({ key: loc, label: loc }))}
          value={selectedLocality}
          onChange={(loc) => setSelectedLocality(loc)}
          contentContainerStyle={styles.chipsScrollContainer}
          chipStyle={styles.filterChip}
          inactiveChipStyle={{ borderColor: colors.border, backgroundColor: colors.card }}
          pillStyle={{ borderColor: colors.accent, backgroundColor: colors.accentSoft }}
          activeColor={colors.accent}
          inactiveColor={colors.textSecondary}
          textStyle={styles.chipText}
          activeTextStyle={{ fontWeight: '500' }}
        />
      </View>

      {/* Board Filter Chips */}
      <View style={styles.filterSection}>
        <ChipRowSlider<string>
          chips={BOARD_OPTIONS.map((b) => ({ key: b, label: b }))}
          value={selectedBoard}
          onChange={(b) => setSelectedBoard(b)}
          contentContainerStyle={styles.chipsScrollContainer}
          chipStyle={styles.filterChipSm}
          inactiveChipStyle={{ borderColor: colors.border, backgroundColor: colors.card }}
          pillStyle={{ borderColor: colors.primary, backgroundColor: colors.accentSoft }}
          activeColor={colors.primary}
          inactiveColor={colors.textSecondary}
          textStyle={styles.chipTextSm}
          activeTextStyle={{ fontWeight: '500' }}
        />
      </View>

      {/* List Content */}
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          {...webPullProps.pullProps}
          style={styles.list}
          data={filteredSchools}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchCustomSchools(true)}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <WebPullIndicator pullDistance={webPullProps.pullDistance} refreshing={refreshing} isPulling={webPullProps.isPulling} />
          }
          contentContainerStyle={
            filteredSchools.length === 0 ? styles.emptyList : styles.listContent
          }
          renderItem={({ item }) => renderSchoolCard(item)}
          ListEmptyComponent={
            <EmptyState
              icon="school-outline"
              title="No schools found"
              message="No schools match your search or filter criteria. Try resetting filters!"
            />
          }
        />
      )}

      {/* Floating Compare Action Bar */}
      {selectedSchoolIds.length >= 2 && (
        <View style={[styles.compareBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.compareBarText, { color: colors.textPrimary }]}>
            {selectedSchoolIds.length} school(s) selected
          </Text>
          <View style={styles.compareBarActions}>
            <TouchableOpacity onPress={() => setSelectedSchoolIds([])} style={styles.clearBtn}>
              <Text style={[styles.clearBtnText, { color: colors.textSecondary }]}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                router.push(`/mcn/schools/compare?ids=${selectedSchoolIds.join(',')}` as any)
              }
              style={[styles.compareBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.compareBtnText, { color: colors.primaryFg }]}>Compare Side-by-Side</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerTextBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  headerSubtitleWrap: {
    paddingHorizontal: 20,
    paddingTop: VerandahLayout.mcnHeaderToContentGap,
    paddingBottom: 6,
  },
  subtitle: {
    ...VerandahType.body,
    fontSize: 13,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  clearSearchBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  clearSearchText: {
    ...VerandahType.caption,
    fontSize: 12,
  },
  filterSection: {
    marginBottom: 6,
  },
  chipsScrollContainer: {
    paddingHorizontal: 20,
    gap: 6,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: VerandahRadius.pill,
    borderWidth: 1,
  },
  chipText: {
    ...VerandahType.caption,
    fontSize: 12,
  },
  filterChipSm: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: VerandahRadius.pill,
    borderWidth: 1,
  },
  chipTextSm: {
    ...VerandahType.caption,
    fontSize: 11,
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
    paddingHorizontal: 20,
    paddingBottom: 88,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  schoolName: {
    ...VerandahType.title,
    fontSize: 16,
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  localityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: VerandahRadius.pill,
  },
  localityBadgeText: {
    ...VerandahType.captionBold,
    fontSize: 11,
  },
  levelText: {
    ...VerandahType.caption,
    fontSize: 11,
  },
  compareToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: VerandahRadius.pill,
    borderWidth: 1,
    gap: 4,
  },
  compareToggleText: {
    ...VerandahType.captionBold,
    fontSize: 11,
  },
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    marginBottom: 8,
  },
  syllabusLabel: {
    ...VerandahType.caption,
    fontSize: 12,
  },
  syllabusVal: {
    ...VerandahType.bodyBold,
    fontSize: 13,
  },
  parentReviewBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: VerandahRadius.pill,
  },
  parentReviewBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.accent,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    ...VerandahType.captionBold,
    fontSize: 12,
  },
  addressText: {
    ...VerandahType.caption,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
  },
  actionBtnText: {
    ...VerandahType.captionBold,
    fontSize: 11,
  },
  detailsBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: VerandahRadius.md,
  },
  detailsBtnText: {
    ...VerandahType.captionBold,
    fontSize: 12,
  },
  compareBar: {
    position: 'absolute',
    bottom: 16,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: VerandahRadius.lg,
    borderWidth: 1,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  compareBarText: {
    ...VerandahType.bodyBold,
    fontSize: 13,
  },
  compareBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  clearBtnText: {
    ...VerandahType.captionBold,
    fontSize: 12,
  },
  compareBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: VerandahRadius.md,
  },
  compareBtnText: {
    ...VerandahType.bodyBold,
    fontSize: 12,
  },
});
