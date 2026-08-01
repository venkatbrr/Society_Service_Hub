import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Platform,
    RefreshControl,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { AppIcon } from '../../../components/AppIcon';
import { BaseCard } from '../../../components/BaseCard';
import { EmptyState } from '../../../components/EmptyState';
import { useWebPullToRefresh } from '../../../components/useWebPullToRefresh';
import { Verandah } from '../../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { buildMcnHeaderOptions } from '../../../lib/mcnHeader';
import { supabase } from '../../../lib/supabase';

import { isSupabaseSchemaError } from '../../../lib/supabaseErrors';

export interface ParentCornerItem {
  id: string;
  community_id: string;
  user_id: string;
  student_name: string;
  institution_type: 'school' | 'college' | 'preschool';
  school_name: string;
  board: string;
  grade_class: string;
  parent_name: string;
  flat_number: string;
  contact_phone: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

type SortOption = 'school' | 'grade' | 'flat' | 'recent';

const INSTITUTION_TYPES = [
  { id: 'all', label: 'All Types', icon: 'book' as const },
  { id: 'school', label: 'School', icon: 'school' as const },
  { id: 'college', label: 'College', icon: 'graduation' as const },
  { id: 'preschool', label: 'Pre-School', icon: 'baby' as const },
];

const BOARD_OPTIONS = ['All', 'CBSE', 'ICSE', 'State Board', 'IB', 'IGCSE', 'PU Board', 'University', 'Other'];

export default function ParentCornerScreen() {
  const router = useRouter();
  const { communityId, user, isCommunityLead } = useAuth();
  const colors = Verandah;

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [entries, setEntries] = useState<ParentCornerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isMissingSchema, setIsMissingSchema] = useState(false);

  // Filters & Sorting
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedBoard, setSelectedBoard] = useState<string>('All');
  const [selectedSchool, setSelectedSchool] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('school');

  const webPullProps = useWebPullToRefresh(() => fetchEntries(true));

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/network' as any);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchEntries = useCallback(
    async (isRefresh = false) => {
      if (!communityId) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const { data, error } = await supabase
          .from('mcn_parent_corner')
          .select('*')
          .eq('community_id', communityId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setEntries((data || []) as ParentCornerItem[]);
        setIsMissingSchema(false);
      } catch (error: any) {
        console.error('Error fetching parent corner entries:', error);
        if (isSupabaseSchemaError(error)) {
          setIsMissingSchema(true);
          setEntries([]);
        } else {
          Toast.show({ type: 'error', text1: 'Failed to load parent corner' });
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [communityId]
  );

  useFocusEffect(
    useCallback(() => {
      fetchEntries();
    }, [fetchEntries])
  );

  // Extract list of unique top schools in this community
  const uniqueSchools = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.school_name.trim()) set.add(e.school_name.trim());
    });
    return Array.from(set).sort();
  }, [entries]);

  // Filtered and Sorted Entries
  const processedEntries = useMemo(() => {
    let list = [...entries];

    // Search filter
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase().trim();
      list = list.filter(
        (item) =>
          item.student_name.toLowerCase().includes(q) ||
          item.school_name.toLowerCase().includes(q) ||
          item.grade_class.toLowerCase().includes(q) ||
          item.board.toLowerCase().includes(q) ||
          item.parent_name.toLowerCase().includes(q) ||
          item.flat_number.toLowerCase().includes(q) ||
          (item.notes && item.notes.toLowerCase().includes(q))
      );
    }

    // Institution Type Filter
    if (selectedType !== 'all') {
      list = list.filter((item) => item.institution_type === selectedType);
    }

    // Board Filter
    if (selectedBoard !== 'All') {
      list = list.filter((item) => item.board.toLowerCase() === selectedBoard.toLowerCase());
    }

    // School Name Filter
    if (selectedSchool) {
      list = list.filter((item) => item.school_name.toLowerCase() === selectedSchool.toLowerCase());
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'school') {
        const comp = a.school_name.localeCompare(b.school_name);
        if (comp !== 0) return comp;
        return a.grade_class.localeCompare(b.grade_class);
      } else if (sortBy === 'grade') {
        const comp = a.grade_class.localeCompare(b.grade_class);
        if (comp !== 0) return comp;
        return a.school_name.localeCompare(b.school_name);
      } else if (sortBy === 'flat') {
        return a.flat_number.localeCompare(b.flat_number);
      } else {
        // recent
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return list;
  }, [entries, debouncedSearch, selectedType, selectedBoard, selectedSchool, sortBy]);

  useEffect(() => {
    fetchEntries();
  }, [communityId, fetchEntries]);

  const handleShareParentPost = async (item: ParentCornerItem) => {
    const messageLines = [
      `*Parent Corner Student Record*`,
      `Student: ${item.student_name} (${item.grade_class})`,
      `School/Inst: ${item.school_name} (${item.board})`,
      `Parent: ${item.parent_name} (Flat ${item.flat_number})`,
      `Contact: ${item.contact_phone}`,
    ];
    if (item.notes) {
      messageLines.push(`Notes: "${item.notes}"`);
    }
    const message = messageLines.join('\n');

    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({ title: `Parent Corner: ${item.student_name}`, text: message });
      } else {
        await Share.share({ message, title: `Parent Corner: ${item.student_name}` });
      }
    } catch (err) {
      console.error('Error sharing parent post:', err);
    }
  };

  const handleWhatsAppPress = (item: ParentCornerItem) => {
    const cleanPhone = item.contact_phone.replace(/\D/g, '');
    const text = `Hi ${item.parent_name}, I saw your entry for ${item.student_name} (${item.school_name}) in our community Parent Corner.`;
    const url = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(text)}`;
    Linking.openURL(url).catch(() => {
      Toast.show({ type: 'error', text1: 'Could not open WhatsApp' });
    });
  };

  const handleCallPress = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    Linking.openURL(`tel:${cleanPhone}`).catch(() => {
      Toast.show({ type: 'error', text1: 'Could not initiate call' });
    });
  };

  const handleDeleteEntry = (id: string, studentName: string) => {
    Alert.alert('Delete Entry', `Are you sure you want to remove student record for "${studentName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('mcn_parent_corner').delete().eq('id', id);
            if (error) throw error;
            Toast.show({ type: 'success', text1: 'Entry removed' });
            fetchEntries();
          } catch (err) {
            console.error(err);
            Toast.show({ type: 'error', text1: 'Failed to delete entry' });
          }
        },
      },
    ]);
  };

  const renderStudentCard = (item: ParentCornerItem) => {
    const isOwner = item.user_id === user?.id;
    const canManage = isOwner || isCommunityLead;

    return (
      <BaseCard key={item.id} padding={16} style={styles.card}>
        {/* Header Row: Student Name & Class Badge */}
        <View style={styles.cardHeader}>
          <View style={styles.studentInfoLeft}>
            <View style={[styles.avatarCircle, { backgroundColor: colors.accentSoft }]}>
              <AppIcon
                name={item.institution_type === 'college' ? 'graduation' : item.institution_type === 'preschool' ? 'baby' : 'backpack'}
                size={18}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.studentName, { color: colors.textPrimary }]}>{item.student_name}</Text>
              <Text style={[styles.classBadgeText, { color: colors.accent }]}>
                {item.grade_class}
              </Text>
            </View>
          </View>

          {canManage && (
            <View style={styles.cardActionsRight}>
              {isOwner && (
                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: '/network/parents/add',
                      params: { editId: item.id },
                    } as any)
                  }
                  style={styles.iconBtn}
                >
                  <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => handleDeleteEntry(item.id, item.student_name)}
                style={styles.iconBtn}
              >
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Institution & Board */}
        <View style={[styles.institutionRow, { borderColor: colors.border }]}>
          <Ionicons name="school-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
          <Text style={[styles.institutionText, { color: colors.textPrimary }]}>
            {item.school_name}
          </Text>
          <View style={[styles.boardPill, { backgroundColor: colors.cardMuted }]}>
            <Text style={[styles.boardPillText, { color: colors.textSecondary }]}>{item.board}</Text>
          </View>
        </View>

        {/* Parent Details */}
        <View style={styles.parentRow}>
          <Ionicons name="person-outline" size={14} color={colors.textMuted} style={{ marginRight: 6 }} />
          <Text style={[styles.parentText, { color: colors.textSecondary }]}>
            Parent: <Text style={{ color: colors.textPrimary, fontWeight: '500' }}>{item.parent_name}</Text>
          </Text>
          <Text style={[styles.flatDot, { color: colors.textMuted }]}>•</Text>
          <Ionicons name="home-outline" size={14} color={colors.textMuted} style={{ marginRight: 4 }} />
          <Text style={[styles.parentText, { color: colors.textSecondary }]}>Flat {item.flat_number}</Text>
        </View>

        {/* Optional Notes (Carpool / Study group) */}
        {item.notes ? (
          <View style={[styles.notesBox, { backgroundColor: colors.cardMuted, borderColor: colors.border }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.accent} style={{ marginRight: 6 }} />
            <Text style={[styles.notesText, { color: colors.textSecondary }]}>{item.notes}</Text>
          </View>
        ) : null}

        {/* Contact Action Bar: WhatsApp, Call, & Share */}
        <View style={styles.contactBar}>
          <TouchableOpacity
            style={[styles.whatsappBtn, { backgroundColor: '#25D366' }]}
            onPress={() => handleWhatsAppPress(item)}
            activeOpacity={0.8}
          >
            <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.whatsappBtnText}>WhatsApp Parent</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.callBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => handleCallPress(item.contact_phone)}
            activeOpacity={0.8}
          >
            <Ionicons name="call-outline" size={18} color={colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.callBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => handleShareParentPost(item)}
            activeOpacity={0.8}
          >
            <Ionicons name="share-outline" size={18} color={colors.accent} />
          </TouchableOpacity>
        </View>
      </BaseCard>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: 'Parent Corner',
          onBack: handleBack,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/network/parents/add' as any)}
              style={styles.headerAddBtn}
            >
              <Ionicons name="add-circle" size={26} color={colors.primary} />
            </TouchableOpacity>
          ),
        })}
      />

      {/* Header Subtitle */}
      <View style={styles.headerSubtitleWrap}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Connect with resident parents for school info, carpooling, & study groups
        </Text>
      </View>

      {/* Search Input */}
      <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View style={styles.searchIconWrap}>
          <AppIcon name="search" size={14} />
        </View>
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Search student, school, grade, board..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={{ padding: 4 }}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Row 1: Institution Types */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScrollContainer}
        >
          {INSTITUTION_TYPES.map((t) => {
            const isActive = selectedType === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={[
                  styles.filterChip,
                  { borderColor: colors.border, backgroundColor: colors.card },
                  isActive && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
                ]}
                onPress={() => setSelectedType(t.id)}
              >
                <View style={styles.iconLabelRow}>
                  <AppIcon name={t.icon} size={12} />
                  <Text
                    style={[
                      styles.chipText,
                      { color: colors.textSecondary },
                      isActive && { color: colors.accent, fontWeight: '500' },
                    ]}
                  >
                    {t.label}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Filter Row 2: Boards */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScrollContainer}
        >
          <Text style={[styles.filterLabel, { color: colors.textMuted }]}>Board:</Text>
          {BOARD_OPTIONS.map((b) => {
            const isActive = selectedBoard === b;
            return (
              <TouchableOpacity
                key={b}
                style={[
                  styles.filterChipSm,
                  { borderColor: colors.border, backgroundColor: colors.card },
                  isActive && { borderColor: colors.primary, backgroundColor: colors.accentSoft },
                ]}
                onPress={() => setSelectedBoard(b)}
              >
                <Text
                  style={[
                    styles.chipTextSm,
                    { color: colors.textSecondary },
                    isActive && { color: colors.primary, fontWeight: '500' },
                  ]}
                >
                  {b}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Quick School Filter Chips (If present) */}
      {uniqueSchools.length > 0 && (
        <View style={styles.filterSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScrollContainer}
          >
            <Text style={[styles.filterLabel, { color: colors.textMuted }]}>Schools:</Text>
            <TouchableOpacity
              style={[
                styles.filterChipSm,
                { borderColor: colors.border, backgroundColor: colors.card },
                selectedSchool === null && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
              ]}
              onPress={() => setSelectedSchool(null)}
            >
              <Text
                style={[
                  styles.chipTextSm,
                  { color: colors.textSecondary },
                  selectedSchool === null && { color: colors.accent, fontWeight: '500' },
                ]}
              >
                All Schools
              </Text>
            </TouchableOpacity>

            {uniqueSchools.map((s) => {
              const isActive = selectedSchool === s;
              return (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.filterChipSm,
                    { borderColor: colors.border, backgroundColor: colors.card },
                    isActive && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
                  ]}
                  onPress={() => setSelectedSchool(isActive ? null : s)}
                >
                  <View style={styles.iconLabelRow}>
                    <AppIcon name="school" size={11} />
                    <Text
                      style={[
                        styles.chipTextSm,
                        { color: colors.textSecondary },
                        isActive && { color: colors.accent, fontWeight: '500' },
                      ]}
                    >
                      {s}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Sort Options Bar */}
      <View style={[styles.sortBar, { borderColor: colors.border }]}>
        <Text style={[styles.sortLabel, { color: colors.textMuted }]}>Sort by:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {(
            [
              { id: 'school', label: 'School Name (A-Z)', icon: 'school' as const },
              { id: 'grade', label: 'Class / Grade', icon: 'backpack' as const },
              { id: 'flat', label: 'Flat No', icon: 'home' as const },
              { id: 'recent', label: 'Recently Added', icon: 'clock' as const },
            ] as const
          ).map((s) => {
            const isActive = sortBy === s.id;
            return (
              <TouchableOpacity
                key={s.id}
                onPress={() => setSortBy(s.id)}
                style={[
                  styles.sortBtn,
                  { borderColor: colors.border },
                  isActive && { backgroundColor: colors.card, borderColor: colors.primary },
                ]}
              >
                <View style={styles.iconLabelRow}>
                  <AppIcon name={s.icon} size={12} />
                  <Text style={[styles.sortBtnText, { color: isActive ? colors.primary : colors.textSecondary }]}>
                    {s.label}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Content List */}
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          {...webPullProps}
          style={styles.list}
          data={processedEntries}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchEntries(true)}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={
            processedEntries.length === 0 ? styles.emptyList : styles.listContent
          }
          renderItem={({ item }) => renderStudentCard(item)}
          ListEmptyComponent={
            isMissingSchema ? (
              <EmptyState
                icon="construct-outline"
                title="Database Table Missing"
                message="Please run migration file '20260726400000_add_mcn_parent_corner.sql' in your Supabase Dashboard SQL Editor to set up the Parent Corner table."
              />
            ) : (
              <EmptyState
                icon="people-outline"
                title="No student details added yet"
                message="Be the first parent to list your child's school/college details and connect with neighbors!"
              />
            )
          }
        />
      )}

      {/* FAB Button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        activeOpacity={0.8}
        onPress={() => router.push('/network/parents/add' as any)}
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
  headerAddBtn: {
    marginRight: 8,
  },
  headerSubtitleWrap: {
    paddingHorizontal: 20,
    paddingTop: VerandahLayout.mcnHeaderToContentGap,
    paddingBottom: 6,
  },
  subtitle: {
    ...VerandahType.body,
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
  searchIconWrap: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  filterSection: {
    marginBottom: 6,
  },
  filterLabel: {
    ...VerandahType.captionBold,
    alignSelf: 'center',
    marginRight: 4,
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
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginBottom: 10,
  },
  sortLabel: {
    ...VerandahType.captionBold,
    marginRight: 8,
  },
  sortBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: VerandahRadius.sm,
    borderWidth: 1,
  },
  sortBtnText: {
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
    marginBottom: 10,
  },
  studentInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  iconLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  studentName: {
    ...VerandahType.title,
    fontSize: 16,
  },
  classBadgeText: {
    ...VerandahType.bodyBold,
    fontSize: 13,
  },
  cardActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    padding: 6,
  },
  institutionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    marginBottom: 8,
  },
  institutionText: {
    ...VerandahType.bodyBold,
    flex: 1,
    fontSize: 14,
  },
  boardPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: VerandahRadius.pill,
  },
  boardPillText: {
    ...VerandahType.captionBold,
    fontSize: 11,
  },
  parentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  parentText: {
    ...VerandahType.caption,
    fontSize: 12,
  },
  flatDot: {
    marginHorizontal: 6,
  },
  notesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 10,
    borderRadius: VerandahRadius.md,
    borderWidth: 0.5,
    marginBottom: 12,
  },
  notesText: {
    ...VerandahType.caption,
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  contactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  whatsappBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: VerandahRadius.md,
  },
  whatsappBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  callBtn: {
    width: 44,
    height: 40,
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
