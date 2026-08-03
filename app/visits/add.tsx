import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { ProviderSelector } from '../../components/ProviderSelector';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahType } from '../../constants/Verandah';
import { CATEGORIES, CATEGORY_GROUPS, CategoryGroup } from '../../constants/categories';
import { getServiceCategoryEmoji } from '../../constants/emojis';
import { useAuth } from '../../context/AuthContext';
import { normalizeIndianMobile } from '../../lib/phone';
import { supabase } from '../../lib/supabase';

const buildVisitCategoryGroups = (sourceCategories: string[]): CategoryGroup[] => {
  const included = new Set(sourceCategories);
  const groups = CATEGORY_GROUPS
    .map((group) => ({
      ...group,
      categories: group.categories.filter((cat) => included.has(cat)),
    }))
    .filter((group) => group.categories.length > 0);
  const groupedSet = new Set(groups.flatMap((g) => g.categories));
  const rest = sourceCategories.filter((cat) => !groupedSet.has(cat));
  if (rest.length > 0) groups.push({ id: 'more', label: 'More', categories: rest });
  return groups;
};

const findVisitGroupId = (groups: CategoryGroup[], cat: string) =>
  groups.find((g) => g.categories.includes(cat))?.id ?? 'all';

const formatLocalDateForDb = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatTimeForWeb = (date: Date) => {
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${hours}:${minutes}`;
};

const parseTimeFromWeb = (timeString: string, baseDate: Date) => {
  const [hours, minutes] = timeString.split(':').map(Number);
  const newDate = new Date(baseDate);
  newDate.setHours(hours);
  newDate.setMinutes(minutes);
  return newDate;
};

export default function AddVisitScreen() {
  const router = useRouter();
  const { user, communityId } = useAuth();
  const insets = useSafeAreaInsets();
  const isSubmittingRef = useRef(false);
  const colors = {
    background: Verandah.surface,
    text: Verandah.textPrimary,
    textMuted: Verandah.textSecondary,
    primary: Verandah.primary,
    card: Verandah.card,
    border: Verandah.border,
  };

  const [providerMode, setProviderMode] = useState<'existing' | 'new'>('existing');
  const [selectedProvider, setSelectedProvider] = useState<any>(null);
  const [manualProviderName, setManualProviderName] = useState('');
  const [manualProviderPhone, setManualProviderPhone] = useState('');
  const [manualProviderWhatsapp, setManualProviderWhatsapp] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const visitCategoryGroups = useMemo(() => buildVisitCategoryGroups(CATEGORIES), []);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');

  const visibleCategories = useMemo(() => {
    if (selectedGroupId === 'all') return CATEGORIES;
    return visitCategoryGroups.find((g) => g.id === selectedGroupId)?.categories ?? CATEGORIES;
  }, [visitCategoryGroups, selectedGroupId]);

  const handleCategorySelect = (cat: string) => {
    setCategory(cat);
    setSelectedGroupId(findVisitGroupId(visitCategoryGroups, cat));
  };

  const handleGroupSelect = (groupId: string) => {
    setSelectedGroupId(groupId);
    if (groupId !== 'all') {
      const first = visitCategoryGroups.find((g) => g.id === groupId)?.categories[0];
      if (first) setCategory(first);
    }
  };
  const [category, setCategory] = useState('');

  // Date and Time state
  const [visitDate, setVisitDate] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    return d;
  });
  const [startTime, setStartTime] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    return d;
  });
  const [endTime, setEndTime] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 2);
    return d;
  });

  const [estimatedCost, setEstimatedCost] = useState('');
  const [maxJoiners, setMaxJoiners] = useState('');

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) setVisitDate(selectedDate);
  };

  const onStartTimeChange = (event: DateTimePickerEvent, selectedTime?: Date) => {
    setShowStartTimePicker(Platform.OS === 'ios');
    if (selectedTime) setStartTime(selectedTime);
  };

  const onEndTimeChange = (event: DateTimePickerEvent, selectedTime?: Date) => {
    setShowEndTimePicker(Platform.OS === 'ios');
    if (selectedTime) setEndTime(selectedTime);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const handleSave = async () => {
    if (isSubmittingRef.current) return;
    if (!title.trim()) return Toast.show({ type: 'error', text1: 'Missing Title' });
    if (!category) return Toast.show({ type: 'error', text1: 'Select a Category' });

    const pName = providerMode === 'existing' ? selectedProvider?.name : manualProviderName;
    if (!pName) return Toast.show({ type: 'error', text1: 'Provider name is required' });

    const normalizedManualPhone = manualProviderPhone.trim()
      ? normalizeIndianMobile(manualProviderPhone)
      : null;
    if (manualProviderPhone.trim() && !normalizedManualPhone) {
      return Toast.show({ type: 'error', text1: 'Invalid Phone', text2: 'Enter a valid 10-digit mobile number.' });
    }

    const normalizedManualWhatsapp = manualProviderWhatsapp.trim()
      ? normalizeIndianMobile(manualProviderWhatsapp)
      : null;
    if (manualProviderWhatsapp.trim() && !normalizedManualWhatsapp) {
      return Toast.show({ type: 'error', text1: 'Invalid WhatsApp', text2: 'Enter a valid 10-digit mobile number.' });
    }

    const normalizedExistingPhone = selectedProvider?.phone
      ? (normalizeIndianMobile(selectedProvider.phone) ?? selectedProvider.phone)
      : null;
    const normalizedExistingWhatsapp = selectedProvider?.whatsapp
      ? (normalizeIndianMobile(selectedProvider.whatsapp) ?? selectedProvider.whatsapp)
      : null;

    const startMins = startTime.getHours() * 60 + startTime.getMinutes();
    const endMins = endTime.getHours() * 60 + endTime.getMinutes();
    if (endMins <= startMins) {
      return Toast.show({
        type: 'error',
        text1: 'Invalid Time Slot',
        text2: 'End time must be greater than start time.',
      });
    }

    const timeSlot = `${formatTime(startTime)} - ${formatTime(endTime)}`;

    isSubmittingRef.current = true;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('service_visits').insert({
        community_id: communityId as string,
        created_by: user?.id as string,
        provider_id: providerMode === 'existing' ? selectedProvider.id : null,
        provider_name: pName,
        provider_phone: providerMode === 'existing' ? normalizedExistingPhone : normalizedManualPhone,
        provider_whatsapp: providerMode === 'existing' ? normalizedExistingWhatsapp : normalizedManualWhatsapp,
        title: title.trim(),
        description: description.trim() || null,
        category,
        visit_date: formatLocalDateForDb(visitDate),
        visit_time_slot: timeSlot,
        estimated_cost: estimatedCost.trim() || null,
        max_joiners: maxJoiners ? parseInt(maxJoiners) : null,
        status: 'upcoming'
      });

      if (error) throw error;

      Toast.show({ type: 'success', text1: 'Visit shared!' });
      router.back();
    } catch (e: any) {
      console.error(e);
      Toast.show({ type: 'error', text1: 'Error', text2: e.message });
    } finally {
      setSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>Plan a visit</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>Let neighbors know a provider is coming</Text>
          </View>
        </View>

        <View style={[styles.section, styles.providerSection]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>1. WHICH PROVIDER IS VISITING?</Text>
          <ProviderSelector
            communityId={communityId as string}
            mode={providerMode}
            onModeChange={setProviderMode}
            selectedProviderId={selectedProvider?.id}
            onSelectProvider={setSelectedProvider}
            manualProviderName={manualProviderName}
            onManualNameChange={setManualProviderName}
            manualProviderPhone={manualProviderPhone}
            onManualPhoneChange={setManualProviderPhone}
            manualProviderWhatsapp={manualProviderWhatsapp}
            onManualWhatsappChange={setManualProviderWhatsapp}
          />
        </View>

        <View style={[styles.section, styles.detailsSection]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>2. VISIT DETAILS</Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Visit title *</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
              placeholder="e.g. AC deep cleaning, pest control"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Category *</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={categoryGridStyle.groupScroll}>
              {[{ id: 'all', label: 'All Services' }, ...visitCategoryGroups.map((g) => ({ id: g.id, label: g.label }))].map((group) => {
                const selected = selectedGroupId === group.id;
                return (
                  <TouchableOpacity
                    key={group.id}
                    style={[
                      categoryGridStyle.catChip,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primary : colors.card,
                      },
                    ]}
                    onPress={() => handleGroupSelect(group.id)}
                  >
                    <Text style={[categoryGridStyle.catText, { color: selected ? Verandah.primaryFg : colors.text }]}>{group.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={categoryGridStyle.categoryScroll}>
              {visibleCategories.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    categoryGridStyle.catChip,
                    {
                      borderColor: category === cat ? colors.primary : colors.border,
                      backgroundColor: category === cat ? colors.primary : colors.card,
                    },
                  ]}
                  onPress={() => handleCategorySelect(cat)}
                >
                  <Text style={[categoryGridStyle.catText, { color: category === cat ? Verandah.primaryFg : colors.text }]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Visit date *</Text>
            {Platform.OS === 'web' ? (
              <input
                type="date"
                value={formatLocalDateForDb(visitDate)}
                onChange={(e) => {
                  if (e.target.value) {
                    setVisitDate(new Date(e.target.value));
                  }
                }}
                min={formatLocalDateForDb(new Date())}
                style={{
                  height: 56,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: colors.border,
                  borderRadius: 16,
                  paddingLeft: 16,
                  paddingRight: 16,
                  fontSize: 16,
                  color: colors.text,
                  backgroundColor: colors.card,
                  fontFamily: 'inherit',
                  outline: 'none',
                  boxSizing: 'border-box',
                  width: '100%',
                }}
              />
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.input, { borderColor: colors.border, justifyContent: 'center', backgroundColor: colors.card }]}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text style={{ fontSize: 16, color: colors.text }}>
                    {visitDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={visitDate}
                    mode="date"
                    display="default"
                    onChange={onDateChange}
                    minimumDate={new Date()}
                  />
                )}
              </>
            )}
          </View>

          {Platform.OS === 'web' ? (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text }]}>Start time *</Text>
                <input
                  type="time"
                  value={formatTimeForWeb(startTime)}
                  onChange={(e) => {
                    if (e.target.value) {
                      setStartTime(parseTimeFromWeb(e.target.value, startTime));
                    }
                  }}
                  style={{
                    height: 56,
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: colors.border,
                    borderRadius: 16,
                    paddingLeft: 16,
                    paddingRight: 16,
                    fontSize: 16,
                    color: colors.text,
                    backgroundColor: colors.card,
                    fontFamily: 'inherit',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text }]}>End time *</Text>
                <input
                  type="time"
                  value={formatTimeForWeb(endTime)}
                  onChange={(e) => {
                    if (e.target.value) {
                      setEndTime(parseTimeFromWeb(e.target.value, endTime));
                    }
                  }}
                  style={{
                    height: 56,
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: colors.border,
                    borderRadius: 16,
                    paddingLeft: 16,
                    paddingRight: 16,
                    fontSize: 16,
                    color: colors.text,
                    backgroundColor: colors.card,
                    fontFamily: 'inherit',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              </View>
            </View>
          ) : (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text }]}>Start time *</Text>
                <TouchableOpacity
                  style={[styles.input, { borderColor: colors.border, justifyContent: 'center', backgroundColor: colors.card }]}
                  onPress={() => setShowStartTimePicker(true)}
                >
                  <Text style={{ fontSize: 16, color: colors.text }}>{formatTime(startTime)}</Text>
                </TouchableOpacity>
                {showStartTimePicker && (
                  <DateTimePicker
                    value={startTime}
                    mode="time"
                    display="default"
                    onChange={onStartTimeChange}
                  />
                )}
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text }]}>End time *</Text>
                <TouchableOpacity
                  style={[styles.input, { borderColor: colors.border, justifyContent: 'center', backgroundColor: colors.card }]}
                  onPress={() => setShowEndTimePicker(true)}
                >
                  <Text style={{ fontSize: 16, color: colors.text }}>{formatTime(endTime)}</Text>
                </TouchableOpacity>
                {showEndTimePicker && (
                  <DateTimePicker
                    value={endTime}
                    mode="time"
                    display="default"
                    onChange={onEndTimeChange}
                  />
                )}
              </View>
            </View>
          )}

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.text }]}>Est. cost (optional)</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                placeholder="e.g. 400 / unit"
                placeholderTextColor={colors.textMuted}
                value={estimatedCost}
                onChangeText={setEstimatedCost}
              />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.text }]}>Max joiners</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                placeholder="Empty for unlimited"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                value={maxJoiners}
                onChangeText={setMaxJoiners}
              />
            </View>
          </View>

          <View style={[styles.inputGroup, styles.lastInputGroup]}>
            <Text style={[styles.label, { color: colors.text }]}>Description (optional)</Text>
            <TextInput
              style={[styles.textArea, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
              placeholder="Any details neighbors should know..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              value={description}
              onChangeText={setDescription}
              textAlignVertical="top"
            />
          </View>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="bulb-outline" size={20} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.primary }]}>
                Share visits to coordinate with neighbors. Providers often charge less for multiple jobs in one trip!
            </Text>
        </View>

        <TouchableOpacity
          onPress={handleSave}
          disabled={submitting}
          activeOpacity={0.85}
          style={[styles.submitBtn, { marginBottom: Math.max(insets.bottom, 40), backgroundColor: colors.primary }]}
        >
          {submitting ? <ActivityIndicator color={Verandah.primaryFg} /> : <Text style={styles.submitBtnText}>Share visit</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const categoryGridStyle = StyleSheet.create({
  groupScroll: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  categoryScroll: {
    flexDirection: 'row',
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  catText: {
    fontSize: 13,
    fontWeight: '500',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: VerandahLayout.screenPaddingTop,
  },
  header: {
    flexDirection: 'row',
    marginBottom: 32,
    alignItems: 'flex-start',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
  },
  headerText: {
    flex: 1,
  },
  title: {
    ...VerandahType.display,
    color: Verandah.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 4,
    lineHeight: 20,
  },
  section: {
    marginBottom: 32,
  },
  providerSection: {
    marginBottom: 0,
    ...(Platform.OS === 'web' ? { zIndex: 100, overflow: 'visible' } : {}),
  },
  detailsSection: {
    marginBottom: 0,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 1.5,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  lastInputGroup: {
    marginBottom: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    height: 56,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  textArea: {
    height: 100,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  infoCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 16,
    gap: 12,
    marginBottom: 6,
    alignItems: 'center',
    borderWidth: 1,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  submitBtn: {
    height: 58,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnText: {
    color: Verandah.primaryFg,
    fontSize: 18,
    fontWeight: '500',
  },
});
