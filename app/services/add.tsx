import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';
import { DateField, formatLocalDateForDb } from '../../components/DateField';
import { ImageUploader } from '../../components/ImageUploader';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { goBackSmart } from '../../lib/navigation';
import {
    mapServiceCategoryToProviderCategory,
    SERVICE_CATEGORIES,
    SERVICE_CATEGORY_DEFAULT_FREQUENCY,
    SERVICE_CATEGORY_ICONS,
    SERVICE_CATEGORY_LABELS,
    ServiceCategory,
} from '../../lib/serviceCategories';
import { toImagesJson } from '../../lib/serviceReminderHelpers';
import { supabase } from '../../lib/supabase';

type ReminderImage = {
  title: string;
  url: string;
};

type ReminderImageDraft = {
  title: string;
  url: string | null;
};

const MAX_REMINDER_IMAGES = 3;
const REMINDER_IMAGE_TAG_REGEX = /\[ReminderImage:([^|\]]+)\|(https?:\/\/[^\]]+)\]/gi;

const createEmptyReminderImageDrafts = (): ReminderImageDraft[] =>
  Array.from({ length: MAX_REMINDER_IMAGES }, () => ({ title: '', url: null }));

const buildNotesWithReminderImages = (notesText: string, images: ReminderImage[]): string | null => {
  const cleanText = notesText.trim();
  const imageTags = images
    .map((image) => `[ReminderImage:${encodeURIComponent(image.title.trim())}|${image.url}]`)
    .join('\n');

  const combined = [cleanText, imageTags].filter(Boolean).join('\n');
  return combined || null;
};

type ProviderOption = {
  id: string;
  name: string;
  category: string;
  phone: string | null;
};

export default function AddServiceScreen() {
  const router = useRouter();
  const { user, communityId } = useAuth();
  const colors = {
    background: Verandah.surface,
    text: Verandah.textPrimary,
    textMuted: Verandah.textSecondary,
    primary: Verandah.primary,
    border: Verandah.border,
    card: Verandah.card,
    surface: Verandah.cardMuted,
  };

  const [serviceName, setServiceName] = useState('');
  const [category, setCategory] = useState<ServiceCategory | null>(null);
  const [lastServicedOn, setLastServicedOn] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [frequencyMonths, setFrequencyMonths] = useState('6');
  const [notes, setNotes] = useState('');
  const [reminderImageDrafts, setReminderImageDrafts] = useState<ReminderImageDraft[]>(
    createEmptyReminderImageDrafts()
  );
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<ProviderOption | null>(null);
  const [loading, setLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      async function fetchProviders() {
        setProvidersLoading(true);
        try {
          let query = supabase
            .from('service_providers')
            .select('id, name, category, phone')
            .order('name', { ascending: true });

          if (communityId) {
            query = query.eq('community_id', communityId);
          }

          const { data, error } = await query;

          if (error) throw error;

          if (isMounted) {
            setProviders((data ?? []) as ProviderOption[]);
          }
        } catch {
          if (isMounted) {
            setProviders([]);
          }
        } finally {
          if (isMounted) {
            setProvidersLoading(false);
          }
        }
      }

      fetchProviders();

      return () => {
        isMounted = false;
      };
    }, [communityId])
  );

  const handleCategorySelect = (cat: ServiceCategory) => {
    setCategory(cat);
    setFrequencyMonths(String(SERVICE_CATEGORY_DEFAULT_FREQUENCY[cat]));
  };

  const suggestedProviderCategory = category ? mapServiceCategoryToProviderCategory(category) : null;
  const providerOptions = [...providers].sort((left, right) => {
    const leftSuggested = suggestedProviderCategory ? left.category === suggestedProviderCategory : false;
    const rightSuggested = suggestedProviderCategory ? right.category === suggestedProviderCategory : false;

    if (leftSuggested !== rightSuggested) {
      return leftSuggested ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });

  const handleSubmit = async () => {
    if (!serviceName.trim()) {
      Toast.show({ type: 'error', text1: 'Service name is required' });
      return;
    }
    if (!category) {
      Toast.show({ type: 'error', text1: 'Please select a category' });
      return;
    }
    const freq = parseInt(frequencyMonths, 10);
    if (isNaN(freq) || freq < 1 || freq > 60) {
      Toast.show({ type: 'error', text1: 'Frequency must be between 1 and 60 months' });
      return;
    }
    if (lastServicedOn > new Date()) {
      Toast.show({ type: 'error', text1: 'Last serviced date cannot be in the future' });
      return;
    }
    if (!user) return;

    // Validate mandatory image titles and missing uploads
    for (let i = 0; i < reminderImageDrafts.length; i++) {
      const draft = reminderImageDrafts[i];
      const hasUrl = !!draft.url;
      const hasTitle = draft.title.trim().length > 0;

      if (hasUrl && !hasTitle) {
        Toast.show({
          type: 'error',
          text1: 'Title required',
          text2: `Please enter a title for Image ${i + 1}`,
        });
        return;
      }
      if (!hasUrl && hasTitle) {
        Toast.show({
          type: 'error',
          text1: 'Image missing',
          text2: `Please upload an image for "${draft.title.trim()}"`,
        });
        return;
      }
    }

    setLoading(true);
    try {
      const dateStr = formatLocalDateForDb(lastServicedOn);

      const nextDueDate = new Date(lastServicedOn);
      nextDueDate.setMonth(nextDueDate.getMonth() + freq);
      const nextDueOn = formatLocalDateForDb(nextDueDate);

      const imagesJson = toImagesJson(reminderImageDrafts);

      const insertPayload: any = {
        user_id: user.id,
        community_id: communityId ?? null,
        service_name: serviceName.trim(),
        category,
        last_serviced_on: dateStr,
        frequency_months: freq,
        next_due_on: nextDueOn,
        notes: notes.trim() || null,
        images: imagesJson,
        provider_id: selectedProvider?.id ?? null,
      };

      const { error } = await supabase.from('user_services').insert(insertPayload);

      if (error) throw error;

      Toast.show({ type: 'success', text1: 'Service reminder added' });
      goBackSmart(router, '/services/add');
    } catch (err: any) {
      console.error('Failed to add service reminder:', err);
      const userMessage = err?.message?.includes('user_services_notes_check')
        ? 'Notes cannot exceed 500 characters.'
        : err?.message ?? 'Failed to save service reminder';
      Toast.show({ type: 'error', text1: 'Error', text2: userMessage });
    } finally {
      setLoading(false);
    }
  };

  const formattedDate = lastServicedOn.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => goBackSmart(router, '/services/add')}
          style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.75}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add reminder</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Service Name */}
        <Text style={[styles.label, { color: colors.textMuted }]}>Service name *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
          placeholder="e.g., Living Room AC"
          placeholderTextColor={colors.textMuted}
          value={serviceName}
          onChangeText={setServiceName}
          maxLength={100}
          returnKeyType="next"
        />

        {/* Category */}
        <Text style={[styles.label, { color: colors.textMuted }]}>Category *</Text>
        <View style={styles.categoryGrid}>
          {SERVICE_CATEGORIES.map((cat) => {
            const selected = category === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: selected ? colors.primary + '18' : colors.card,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => handleCategorySelect(cat)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={(SERVICE_CATEGORY_ICONS[cat] as any) ?? 'build-outline'}
                  size={16}
                  color={selected ? colors.primary : colors.textMuted}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[styles.catLabel, { color: selected ? colors.primary : colors.textMuted }]}
                  numberOfLines={2}
                >
                  {SERVICE_CATEGORY_LABELS[cat]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Last Serviced On */}
        <Text style={[styles.label, { color: colors.textMuted }]}>Last serviced on *</Text>
        <DateField
          value={lastServicedOn}
          onChange={setLastServicedOn}
          maximumDate={new Date()}
        />

        {/* Frequency */}
        <Text style={[styles.label, { color: colors.textMuted }]}>Frequency (months) *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
          placeholder="e.g., 6"
          placeholderTextColor={colors.textMuted}
          value={frequencyMonths}
          onChangeText={(v) => setFrequencyMonths(v.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          maxLength={2}
          returnKeyType="next"
        />

        {/* Optional provider mapping */}
        <Text style={[styles.label, { color: colors.textMuted }]}>Link to service provider (optional)</Text>
        <Text style={[styles.helperText, { color: colors.textMuted }]}>Choose a saved provider now, or skip this and add the reminder without linking anyone.</Text>

        {providersLoading ? (
          <View style={[styles.providerStateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.providerStateText, { color: colors.textMuted }]}>Loading providers...</Text>
          </View>
        ) : providerOptions.length === 0 ? (
          <>
            <View style={[styles.providerStateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={styles.providerStateIcon}>👥</Text>
              <Text style={[styles.providerStateText, { color: colors.textMuted }]}>No saved providers yet. You can still create the reminder now and link a provider later.</Text>
            </View>
            <TouchableOpacity
              style={[styles.providerActionBtn, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}
              onPress={() => router.push('/provider/add' as any)}
              activeOpacity={0.8}
            >
              <Text style={[styles.providerActionBtnText, { color: colors.primary }]}>+ Add provider now</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.providerPickerWrap}>
            <TouchableOpacity
              style={[styles.input, styles.providerSelector, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                const next = !providerPickerOpen;
                if (next) setProviderSearch('');
                setProviderPickerOpen(next);
              }}
              activeOpacity={0.8}
            >
              <View style={styles.providerSelectorContent}>
                <Text style={[styles.providerSelectorText, { color: selectedProvider ? colors.text : colors.textMuted }]} numberOfLines={1}>
                  {selectedProvider ? selectedProvider.name : 'No provider linked'}
                </Text>
                {selectedProvider?.category ? (
                  <Text style={[styles.providerSelectorSubtext, { color: colors.textMuted }]} numberOfLines={1}>
                    {selectedProvider.category}
                  </Text>
                ) : (
                  <Text style={[styles.providerSelectorSubtext, { color: colors.textMuted }]} numberOfLines={1}>
                    Optional: map this reminder to a known technician
                  </Text>
                )}
              </View>
              <Ionicons name={providerPickerOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
            </TouchableOpacity>

            {providerPickerOpen ? (
              <View style={[styles.providerDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.providerSearchInput, { color: colors.text, borderBottomColor: colors.border }]}
                  placeholder="Search by name or phone number..."
                  placeholderTextColor={colors.textMuted}
                  value={providerSearch}
                  onChangeText={setProviderSearch}
                  autoFocus
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                />
                <TouchableOpacity
                  style={[styles.providerOption, !selectedProvider && { backgroundColor: colors.primary + '10' }]}
                  onPress={() => {
                    setSelectedProvider(null);
                    setProviderSearch('');
                    setProviderPickerOpen(false);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.providerOptionBody}>
                    <Text style={[styles.providerOptionName, { color: colors.text }]}>No linked provider</Text>
                    <Text style={[styles.providerOptionMeta, { color: colors.textMuted }]}>Create the reminder without mapping a technician</Text>
                  </View>
                  {!selectedProvider ? <Text style={[styles.providerSuggestedTag, { color: colors.primary }]}>Selected</Text> : null}
                </TouchableOpacity>

                <ScrollView nestedScrollEnabled style={styles.providerDropdownScroll}>
                  {providerOptions
                    .filter((p) => {
                      if (!providerSearch.trim()) return true;
                      const q = providerSearch.toLowerCase().replace(/\D/g, '');
                      const qRaw = providerSearch.toLowerCase();
                      return (
                        p.name.toLowerCase().includes(qRaw) ||
                        (q.length > 0 && (p.phone ?? '').replace(/\D/g, '').includes(q))
                      );
                    })
                    .map((provider) => {
                    const isSuggested = suggestedProviderCategory && provider.category === suggestedProviderCategory;
                    const isSelected = selectedProvider?.id === provider.id;

                    return (
                      <TouchableOpacity
                        key={provider.id}
                        style={[styles.providerOption, isSelected && { backgroundColor: colors.primary + '10' }]}
                        onPress={() => {
                          setSelectedProvider(provider);
                          setProviderSearch('');
                          setProviderPickerOpen(false);
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={styles.providerOptionBody}>
                          <Text style={[styles.providerOptionName, { color: colors.text }]} numberOfLines={1}>{provider.name}</Text>
                          <Text style={[styles.providerOptionMeta, { color: colors.textMuted }]} numberOfLines={1}>{provider.category}</Text>
                        </View>
                        {isSuggested ? (
                          <Text style={[styles.providerSuggestedTag, { color: colors.primary }]}>Suggested</Text>
                        ) : isSelected ? (
                          <Text style={[styles.providerSuggestedTag, { color: colors.primary }]}>Selected</Text>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
          </View>
        )}

        {/* Reminder images */}
        <Text style={[styles.label, { color: colors.textMuted }]}>Reminder images (optional, up to 3)</Text>
        <Text style={[styles.helperText, { color: colors.textMuted }]}>Title is mandatory for every uploaded image.</Text>
        <View style={styles.imageSlotsWrap}>
          {reminderImageDrafts.map((item, index) => (
            <View key={`service-image-slot-${index}`} style={styles.imageSlot}>
              <View style={styles.imageSlotUploaderWrap}>
                <ImageUploader
                  currentImageUrl={item.url}
                  onImageUploaded={(url) => {
                    setReminderImageDrafts((prev) =>
                      prev.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, url } : row
                      )
                    );
                  }}
                  onImageRemoved={() => {
                    setReminderImageDrafts((prev) =>
                      prev.map((row, rowIndex) =>
                        rowIndex === index ? { title: '', url: null } : row
                      )
                    );
                  }}
                  subfolder="service_receipts"
                  placeholder={`Upload image ${index + 1}`}
                  compact={true}
                />
              </View>
              <View style={styles.imageSlotTitleWrap}>
                <Text style={[styles.slotLabel, { color: colors.textMuted }]}>Image {index + 1} title</Text>
                <TextInput
                  style={[styles.input, styles.slotTitleInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                  placeholder={
                    index === 0
                      ? 'e.g., Warranty card'
                      : index === 1
                      ? 'e.g., Purchase receipt'
                      : 'e.g., Model / serial number tag'
                  }
                  placeholderTextColor={colors.textMuted}
                  value={item.title}
                  onChangeText={(value) => {
                    setReminderImageDrafts((prev) =>
                      prev.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, title: value.slice(0, 60) } : row
                      )
                    );
                  }}
                  maxLength={60}
                />
              </View>
            </View>
          ))}
        </View>

        {/* Notes */}
        <Text style={[styles.label, { color: colors.textMuted }]}>Notes (optional)</Text>
        <TextInput
          style={[
            styles.input,
            styles.notesInput,
            { backgroundColor: colors.card, borderColor: colors.border, color: colors.text },
          ]}
          placeholder="Any extra details..."
          placeholderTextColor={colors.textMuted}
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={500}
          textAlignVertical="top"
          returnKeyType="done"
        />
        <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 4, textAlign: 'right' }}>
          {500 - notes.length} characters remaining
        </Text>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, loading && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          <View style={[styles.submitGradient, { backgroundColor: colors.primary }]}> 
            <Text style={styles.submitText}>{loading ? 'Saving…' : 'Add Reminder'}</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: VerandahLayout.screenPaddingTop,
    paddingBottom: 14,
    gap: 10,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  backIcon: { fontSize: 18, fontWeight: '500' },
  headerTitle: {
    flex: 1,
    ...VerandahType.display,
    color: Verandah.textPrimary,
  },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 60 },
  label: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 20,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '500',
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notesInput: {
    height: 90,
    paddingTop: 12,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    minWidth: '46%',
    flexShrink: 1,
  },
  catEmoji: { fontSize: 16 },
  catLabel: { fontSize: 12, fontWeight: '500', flexShrink: 1 },
  providerStateCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  providerStateIcon: {
    fontSize: 18,
    lineHeight: 20,
  },
  providerStateText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  providerActionBtn: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  providerActionBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
  providerPickerWrap: {
    marginTop: 8,
  },
  providerSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  providerSelectorContent: {
    flex: 1,
    marginRight: 12,
  },
  providerSelectorText: {
    fontSize: 15,
    fontWeight: '500',
  },
  providerSelectorSubtext: {
    fontSize: 12,
    marginTop: 4,
  },
  selectorChevron: {
    fontSize: 12,
    fontWeight: '500',
  },
  providerDropdown: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 16,
    maxHeight: 300,
    overflow: 'hidden',
  },
  providerSearchInput: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  providerDropdownScroll: {
    maxHeight: 196,
  },
  providerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Verandah.border,
  },
  providerOptionBody: {
    flex: 1,
    marginRight: 12,
  },
  providerOptionName: {
    fontSize: 14,
    fontWeight: '500',
  },
  providerOptionMeta: {
    fontSize: 12,
    marginTop: 3,
  },
  providerSuggestedTag: {
    fontSize: 11,
    fontWeight: '500',
  },
  imageSlotsWrap: {
    marginTop: 8,
    gap: 8,
  },
  imageSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    borderRadius: 12,
    padding: 10,
    gap: 12,
  },
  imageSlotUploaderWrap: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageSlotTitleWrap: {
    flex: 1,
    gap: 4,
  },
  slotLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  slotTitleInput: {
    marginTop: 0,
    marginBottom: 0,
    paddingVertical: 8,
    fontSize: 13,
  },
  submitButton: { marginTop: 32, borderRadius: 16, overflow: 'hidden' },
  submitGradient: { paddingVertical: 16, alignItems: 'center', borderRadius: 16 },
  submitText: { color: Verandah.primaryFg, fontSize: 16, fontWeight: '500' },
});
