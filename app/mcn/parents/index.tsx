import { Announcement01 } from '@untitledui/icons/Announcement01';
import { BookOpen01 } from '@untitledui/icons/BookOpen01';
import { Car01 } from '@untitledui/icons/Car01';
import { DotsHorizontal } from '@untitledui/icons/DotsHorizontal';
import { Edit01 } from '@untitledui/icons/Edit01';
import { FaceSmile } from '@untitledui/icons/FaceSmile';
import { Home02 } from '@untitledui/icons/Home02';
import { Trophy01 } from '@untitledui/icons/Trophy01';
import { MessageCircle01 } from '@untitledui/icons/MessageCircle01';
import { MessageSquare01 } from '@untitledui/icons/MessageSquare01';
import { Phone01 } from '@untitledui/icons/Phone01';
import { Plus } from '@untitledui/icons/Plus';
import { PlusCircle } from '@untitledui/icons/PlusCircle';
import { SearchLg } from '@untitledui/icons/SearchLg';
import { Share07 } from '@untitledui/icons/Share07';
import { Trash01 } from '@untitledui/icons/Trash01';
import { User01 } from '@untitledui/icons/User01';
import { Users01 } from '@untitledui/icons/Users01';
import { XClose } from '@untitledui/icons/XClose';
import { useFocusEffect } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import { goBackSmart } from '../../../lib/navigation';
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
import { WebPullIndicator } from '../../../components/WebPullIndicator';
import { Verandah } from '../../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { buildMcnHeaderOptions } from '../../../lib/mcnHeader';
import { toLast10Digits } from '../../../lib/phone';
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
  intents: string[];
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

const INTENT_LABELS: Record<string, string> = {
  carpool: 'Carpooling',
  study_group: 'Study Group',
  homework_help: 'Homework Help',
  school_info: 'School Info & Updates',
  activities: 'Sports / Activities Buddy',
  playdate: 'Playdate / Hangout',
  other: 'Other',
};

const renderIntentIcon = (id: string, color: string) => {
  switch (id) {
    case 'carpool': return <Car01 size={11} color={color} aria-hidden={true} style={{ marginRight: 3 }} />;
    case 'study_group': return <Users01 size={11} color={color} aria-hidden={true} style={{ marginRight: 3 }} />;
    case 'homework_help': return <Edit01 size={11} color={color} aria-hidden={true} style={{ marginRight: 3 }} />;
    case 'school_info': return <Announcement01 size={11} color={color} aria-hidden={true} style={{ marginRight: 3 }} />;
    case 'activities': return <Trophy01 size={11} color={color} aria-hidden={true} style={{ marginRight: 3 }} />;
    case 'playdate': return <FaceSmile size={11} color={color} aria-hidden={true} style={{ marginRight: 3 }} />;
    case 'other': return <DotsHorizontal size={11} color={color} aria-hidden={true} style={{ marginRight: 3 }} />;
    default: return null;
  }
};

const INTENT_FILTER_OPTIONS = [{ id: 'all', label: 'All' }, ...Object.entries(INTENT_LABELS).map(([id, label]) => ({ id, label }))];

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
  const [loadError, setLoadError] = useState(false);

  // Filters & Sorting
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedBoard, setSelectedBoard] = useState<string>('All');
  const [selectedSchool, setSelectedSchool] = useState<string | null>(null);
  const [selectedIntent, setSelectedIntent] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('school');

  const webPullProps = useWebPullToRefresh(() => fetchEntries(true), refreshing);

  const handleBack = () => {
    goBackSmart(router, '/mcn/parents');
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchEntries = useCallback(
    async (isRefresh = false) => {
      if (!communityId) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const { data, error } = await supabase
          .from('mcn_parent_corner')
          .select('*')
          .eq('community_id', communityId)
          .order('created_at', { ascending: false })
          .limit(500);

        if (error) throw error;
        setEntries((data || []) as ParentCornerItem[]);
        setIsMissingSchema(false);
        setLoadError(false);
      } catch (error: any) {
        console.error('Error fetching parent corner entries:', error);
        if (isSupabaseSchemaError(error)) {
          setIsMissingSchema(true);
          setLoadError(false);
          setEntries([]);
        } else {
          setIsMissingSchema(false);
          setLoadError(true);
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

  // Extract list of unique top schools in this community (case-insensitive deduplication)
  const uniqueSchools = useMemo(() => {
    const byKey = new Map<string, string>();
    entries.forEach((e) => {
      const label = e.school_name.trim();
      if (!label) return;
      const key = label.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, label);
    });
    return Array.from(byKey.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );
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

    // Intent Filter
    if (selectedIntent !== 'all') {
      list = list.filter((item) => (item.intents || []).includes(selectedIntent));
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'school') {
        const comp = a.school_name.localeCompare(b.school_name, undefined, { numeric: true, sensitivity: 'base' });
        if (comp !== 0) return comp;
        return a.grade_class.localeCompare(b.grade_class, undefined, { numeric: true, sensitivity: 'base' });
      } else if (sortBy === 'grade') {
        const comp = a.grade_class.localeCompare(b.grade_class, undefined, { numeric: true, sensitivity: 'base' });
        if (comp !== 0) return comp;
        return a.school_name.localeCompare(b.school_name, undefined, { numeric: true, sensitivity: 'base' });
      } else if (sortBy === 'flat') {
        return a.flat_number.localeCompare(b.flat_number, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        // recent
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return list;
  }, [entries, debouncedSearch, selectedType, selectedBoard, selectedSchool, selectedIntent, sortBy]);

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
    const last10 = toLast10Digits(item.contact_phone || '');
    if (last10.length !== 10) {
      Toast.show({ type: 'error', text1: 'No valid phone number on this entry' });
      return;
    }
    const text = `Hi ${item.parent_name}, I saw your entry for ${item.student_name} (${item.school_name}) in our community Parent Corner.`;
    const url = `https://wa.me/91${last10}?text=${encodeURIComponent(text)}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank');
      return;
    }
    Linking.openURL(url).catch(() => {
      Toast.show({ type: 'error', text1: 'Could not open WhatsApp' });
    });
  };

  const handleCallPress = (phone: string) => {
    const last10 = toLast10Digits(phone || '');
    if (last10.length !== 10) {
      Toast.show({ type: 'error', text1: 'No valid phone number on this entry' });
      return;
    }
    Linking.openURL(`tel:${last10}`).catch(() => {
      Toast.show({ type: 'error', text1: 'Could not initiate call' });
    });
  };

  const handleDeleteEntry = (id: string, studentName: string) => {
    const performDelete = async () => {
      try {
        const { data, error } = await supabase
          .from('mcn_parent_corner')
          .delete()
          .eq('id', id)
          .select('id');
        if (error) throw error;
        if (!data || data.length === 0) {
          Toast.show({ type: 'error', text1: 'Could not remove this entry' });
          return;
        }
        Toast.show({ type: 'success', text1: 'Entry removed' });
        fetchEntries();
      } catch (err) {
        console.error(err);
        Toast.show({ type: 'error', text1: 'Failed to delete entry' });
      }
    };

    const title = 'Remove this entry?';
    const body = `This removes the record for "${studentName}" from Parent Corner. This cannot be undone.`;

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${title}\n${body}`)) {
        performDelete();
      }
    } else {
      Alert.alert(title, body, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: performDelete },
      ]);
    }
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
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/mcn/parents/add',
                    params: { editId: item.id },
                  } as any)
                }
                style={styles.iconBtn}
              >
                <Edit01 size={18} color={colors.textSecondary} aria-hidden={true} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDeleteEntry(item.id, item.student_name)}
                style={styles.iconBtn}
              >
                <Trash01 size={18} color="#EF4444" aria-hidden={true} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Institution & Board */}
        <View style={[styles.institutionRow, { borderColor: colors.borderHair }]}>
          <BookOpen01 size={16} color={colors.primary} aria-hidden={true} style={{ marginRight: 6 }} />
          <Text style={[styles.institutionText, { color: colors.textPrimary }]}>
            {item.school_name}
          </Text>
          <View style={[styles.boardPill, { backgroundColor: colors.cardMuted }]}>
            <Text style={[styles.boardPillText, { color: colors.textSecondary }]}>{item.board}</Text>
          </View>
        </View>

        {/* Parent Details */}
        <View style={styles.parentRow}>
          <User01 size={14} color={colors.textMuted} aria-hidden={true} style={{ marginRight: 6 }} />
          <Text style={[styles.parentText, { color: colors.textSecondary }]}>
            Parent: <Text style={{ color: colors.textPrimary, fontWeight: '500' }}>{item.parent_name}</Text>
          </Text>
          <Text style={[styles.flatDot, { color: colors.textMuted }]}>•</Text>
          <Home02 size={14} color={colors.textMuted} aria-hidden={true} style={{ marginRight: 4 }} />
          <Text style={[styles.parentText, { color: colors.textSecondary }]}>Flat {item.flat_number}</Text>
        </View>

        {/* Intent Tags (Carpool / Study group / etc.) */}
        {item.intents && item.intents.length > 0 ? (
          <View style={styles.intentRow}>
            {item.intents.map((id) => (
              <View key={id} style={[styles.intentBadge, { backgroundColor: colors.accentSoft }]}>
                {renderIntentIcon(id, colors.accent)}
                <Text style={[styles.intentBadgeText, { color: colors.accent }]}>{INTENT_LABELS[id] || id}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Optional Notes (Carpool / Study group) */}
        {item.notes ? (
          <View style={[styles.notesBox, { backgroundColor: colors.cardMuted, borderColor: colors.borderHair }]}>
            <MessageSquare01 size={14} color={colors.accent} aria-hidden={true} style={{ marginRight: 6 }} />
            <Text style={[styles.notesText, { color: colors.textSecondary }]} numberOfLines={4}>{item.notes}</Text>
          </View>
        ) : null}

        {/* Contact Action Bar: WhatsApp, Call, & Share */}
        <View style={styles.contactBar}>
          <TouchableOpacity
            style={[styles.whatsappBtn, { backgroundColor: '#25D366' }]}
            onPress={() => handleWhatsAppPress(item)}
            activeOpacity={0.8}
          >
            <MessageCircle01 size={18} color="#FFFFFF" aria-hidden={true} style={{ marginRight: 6 }} />
            <Text style={styles.whatsappBtnText}>WhatsApp Parent</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.callBtn, { borderColor: colors.borderHair, backgroundColor: colors.card }]}
            onPress={() => handleCallPress(item.contact_phone)}
            activeOpacity={0.8}
          >
            <Phone01 size={18} color={colors.primary} aria-hidden={true} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.callBtn, { borderColor: colors.borderHair, backgroundColor: colors.card }]}
            onPress={() => handleShareParentPost(item)}
            activeOpacity={0.8}
          >
            <Share07 size={18} color={colors.accent} aria-hidden={true} />
          </TouchableOpacity>
        </View>
      </BaseCard>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: 'Parent Corner',
          onBack: handleBack,
          headerRight: () =>
            !isMissingSchema ? (
              <TouchableOpacity
                onPress={() => router.push('/mcn/parents/add' as any)}
                style={styles.headerAddBtn}
              >
                <PlusCircle size={24} color={colors.primary} aria-hidden={true} />
              </TouchableOpacity>
            ) : null,
        })}
      />

      {/* Header Subtitle */}
      <View style={styles.headerSubtitleWrap}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Connect with resident parents for school info, carpooling, & study groups
        </Text>
      </View>

      {/* Search Input */}
      <View style={[styles.searchWrap, { borderColor: colors.borderHair, backgroundColor: colors.card }]}>
        <View style={styles.searchIconWrap}>
          <SearchLg size={14} color={colors.textMuted} aria-hidden={true} />
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
            <XClose size={18} color={colors.textMuted} aria-hidden={true} />
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

      {/* Filter Row 3: Looking For / Intent */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScrollContainer}
        >
          <Text style={[styles.filterLabel, { color: colors.textMuted }]}>Looking for:</Text>
          {INTENT_FILTER_OPTIONS.map((opt) => {
            const isActive = selectedIntent === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.filterChipSm,
                  { borderColor: colors.border, backgroundColor: colors.card },
                  isActive && { borderColor: colors.primary, backgroundColor: colors.accentSoft },
                ]}
                onPress={() => setSelectedIntent(opt.id)}
              >
                <Text
                  style={[
                    styles.chipTextSm,
                    { color: colors.textSecondary },
                    isActive && { color: colors.primary, fontWeight: '500' },
                  ]}
                >
                  {opt.label}
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
          {...webPullProps.pullProps}
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
          ListHeaderComponent={
            <WebPullIndicator pullDistance={webPullProps.pullDistance} refreshing={refreshing} isPulling={webPullProps.isPulling} />
          }
          contentContainerStyle={
            processedEntries.length === 0 ? styles.emptyList : styles.listContent
          }
          renderItem={({ item }) => renderStudentCard(item)}
          ListEmptyComponent={
            isMissingSchema ? (
              <EmptyState
                icon="construct-outline"
                title="Parent Corner isn't available yet"
                message="This feature needs the latest updates before it can load. Please try again later."
              />
            ) : loadError ? (
              <EmptyState
                icon="cloud-offline-outline"
                title="Couldn't load Parent Corner"
                message="Check your connection and pull down to refresh."
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
      {!isMissingSchema && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.primary }]}
          activeOpacity={0.8}
          onPress={() => router.push('/mcn/parents/add' as any)}
        >
          <Plus size={28} color={colors.primaryFg} aria-hidden={true} />
        </TouchableOpacity>
      )}
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
  intentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  intentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: VerandahRadius.pill,
  },
  intentBadgeText: {
    ...VerandahType.captionBold,
    fontSize: 11,
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
