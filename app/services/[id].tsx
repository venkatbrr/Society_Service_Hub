import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { DateField, formatLocalDateForDb } from '../../components/DateField';
import { ImageUploader } from '../../components/ImageUploader';
import { ProviderSelector } from '../../components/ProviderSelector';
import { ServiceHistoryList } from '../../components/ServiceHistoryList';
import { UrgencyBadge } from '../../components/UrgencyBadge';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import {
    mapServiceCategoryToProviderCategory,
    SERVICE_CATEGORIES,
    SERVICE_CATEGORY_DEFAULT_FREQUENCY,
    SERVICE_CATEGORY_EMOJI,
    SERVICE_CATEGORY_ICONS,
    SERVICE_CATEGORY_LABELS,
    ServiceCategory,
} from '../../lib/serviceCategories';
import { cloudinaryUrl } from '../../lib/cloudinary';
import { goBackSmart } from '../../lib/navigation';
import {
    parseNotesAndImages,
    ReminderImage,
    ReminderImageDraft,
    toImagesJson,
} from '../../lib/serviceReminderHelpers';
import { supabase } from '../../lib/supabase';

const extractImageUrl = (
  imageUrl: string | null | undefined,
  notesText: string | null | undefined
): { url: string | null; cleanNotes: string } => {
  if (imageUrl) {
    const cleanNotes = (notesText || '').replace(/\[Receipt:\s*https?:\/\/[^\]]+\]/gi, '').trim();
    return { url: imageUrl, cleanNotes };
  }
  if (!notesText) return { url: null, cleanNotes: '' };
  const match = notesText.match(/\[Receipt:\s*(https?:\/\/[^\]]+)\]/i) || notesText.match(/(https:\/\/res\.cloudinary\.com\/[^\s]+)/i);
  if (match && match[1]) {
    const cleanNotes = notesText.replace(/\[Receipt:\s*https?:\/\/[^\]]+\]/gi, '').trim();
    return { url: match[1], cleanNotes };
  }
  return { url: null, cleanNotes: notesText };
};

interface ServiceDetail {
  id: string;
  service_name: string;
  category: string;
  last_serviced_on: string;
  frequency_months: number;
  next_due_on: string;
  notes: string | null;
  days_until_due: number;
  provider_id: string | null;
}

type UserServiceRow = {
  id: string;
  service_name: string;
  category: string;
  last_serviced_on: string;
  frequency_months: number;
  next_due_on: string;
  notes: string | null;
  images?: any;
  provider_id: string | null;
};

type ProviderOption = {
  id: string;
  name: string;
  category?: string;
  phone: string | null;
};

export default function ServiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { communityId } = useAuth();
  const colors = {
    background: Verandah.surface,
    text: Verandah.textPrimary,
    textMuted: Verandah.textSecondary,
    primary: Verandah.primary,
    secondary: Verandah.accent,
    accent: Verandah.danger,
    border: Verandah.border,
    card: Verandah.card,
    surface: Verandah.card,
    surface2: Verandah.cardMuted,
  };

  const [service, setService] = useState<ServiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<ServiceCategory | null>(null);
  const [editLastServiced, setEditLastServiced] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [editFrequency, setEditFrequency] = useState('6');
  const [editNotes, setEditNotes] = useState('');
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<ProviderOption | null>(null);

  const [showMarkDoneSheet, setShowMarkDoneSheet] = useState(false);
  const [markDoneProvider, setMarkDoneProvider] = useState<ProviderOption | null>(null);
  const [markDoneCost, setMarkDoneCost] = useState('');
  const [markDoneNote, setMarkDoneNote] = useState('');
  const [markDoneSubmitting, setMarkDoneSubmitting] = useState(false);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [reminderImages, setReminderImages] = useState<ReminderImage[]>([]);
  const [reminderImageDrafts, setReminderImageDrafts] = useState<ReminderImageDraft[]>([
    { title: '', url: null },
    { title: '', url: null },
    { title: '', url: null },
  ]);
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

  const fetchService = useCallback(async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('user_services')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        const serviceRow = data as UserServiceRow;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueDate = new Date(serviceRow.next_due_on);
        dueDate.setHours(0, 0, 0, 0);
        const msPerDay = 1000 * 60 * 60 * 24;
        const daysUntilDue = Math.round((dueDate.getTime() - today.getTime()) / msPerDay);

        let cleanNotes = serviceRow.notes || '';
        let images: ReminderImage[] = [];

        if (Array.isArray(serviceRow.images) && serviceRow.images.length > 0) {
          images = serviceRow.images as ReminderImage[];
        } else {
          const parsed = parseNotesAndImages(serviceRow.notes, (serviceRow as any).image_url);
          cleanNotes = parsed.cleanNotes;
          images = parsed.images;
        }

        setService({
          ...serviceRow,
          notes: cleanNotes,
          days_until_due: daysUntilDue,
        });
        setReminderImages(images);

        setReminderImageDrafts([
          { title: images[0]?.title ?? '', url: images[0]?.url ?? null },
          { title: images[1]?.title ?? '', url: images[1]?.url ?? null },
          { title: images[2]?.title ?? '', url: images[2]?.url ?? null },
        ]);
        setEditName(serviceRow.service_name);
        setEditCategory(serviceRow.category as ServiceCategory);
        setEditLastServiced(new Date(serviceRow.last_serviced_on));
        setEditFrequency(String(serviceRow.frequency_months));
        setEditNotes(cleanNotes);
      }
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load service' });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchService();
  }, [fetchService]);

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

  const [providerLinkUnresolved, setProviderLinkUnresolved] = useState(false);

  useEffect(() => {
    if (!service?.provider_id) {
      setSelectedProvider(null);
      setMarkDoneProvider(null);
      setProviderLinkUnresolved(false);
      return;
    }

    if (providersLoading) return;

    const linkedProvider = providers.find((provider) => provider.id === service.provider_id) ?? null;
    if (linkedProvider) {
      setSelectedProvider(linkedProvider);
      setMarkDoneProvider(linkedProvider);
      setProviderLinkUnresolved(false);
    } else {
      setProviderLinkUnresolved(true);
    }
  }, [providers, providersLoading, service?.provider_id]);

  const suggestedProviderCategory = editCategory ? mapServiceCategoryToProviderCategory(editCategory) : null;
  const providerOptions = useMemo(() => {
    return [...providers].sort((left, right) => {
      const leftSuggested = suggestedProviderCategory ? left.category === suggestedProviderCategory : false;
      const rightSuggested = suggestedProviderCategory ? right.category === suggestedProviderCategory : false;

      if (leftSuggested !== rightSuggested) {
        return leftSuggested ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });
  }, [providers, suggestedProviderCategory]);

  const handleMarkDone = () => {
    setShowMarkDoneSheet(true);
  };

  const submitMarkDone = async () => {
    if (!service) return;

    const noteValue = markDoneNote.trim();
    const costValue = markDoneCost.trim();
    const parsedCost = costValue.length ? Number(costValue) : null;

    if (costValue.length && (parsedCost === null || Number.isNaN(parsedCost) || parsedCost < 0)) {
      Toast.show({ type: 'error', text1: 'Invalid cost', text2: 'Enter a valid non-negative amount.' });
      return;
    }

    setMarking(true);
    setMarkDoneSubmitting(true);

    try {
      const { error } = await supabase.rpc('mark_service_done', {
        p_service_id: service.id,
        p_provider_id: markDoneProvider?.id ?? null,
        p_cost_paid: parsedCost,
        p_note: noteValue.length ? noteValue.slice(0, 280) : null,
      });
      if (error) throw error;

      setShowMarkDoneSheet(false);
      setMarkDoneCost('');
      setMarkDoneNote('');
      setHistoryRefreshToken((v) => v + 1);
      Toast.show({ type: 'success', text1: 'Service logged' });
      await fetchService();
    } catch (err: any) {
      console.error('Failed to mark service done:', err);
      Toast.show({ type: 'error', text1: 'Error', text2: err.message ?? 'Failed to mark service.' });
    } finally {
      setMarking(false);
      setMarkDoneSubmitting(false);
    }
  };

  const handleFindTech = () => {
    if (!service) return;
    const providerCategory = mapServiceCategoryToProviderCategory(service.category as ServiceCategory);
    router.push({
      pathname: '/(tabs)/',
      params: { segment: 'providers', filterCategory: providerCategory },
    } as any);
  };

  const handleSaveEdit = async () => {
    if (!service || !editCategory) return;
    const freq = parseInt(editFrequency, 10);
    if (isNaN(freq) || freq < 1 || freq > 60) {
      Toast.show({ type: 'error', text1: 'Frequency must be 1–60 months' });
      return;
    }
    if (editLastServiced > new Date()) {
      Toast.show({ type: 'error', text1: 'Last serviced date cannot be in the future' });
      return;
    }
    if (!editName.trim()) {
      Toast.show({ type: 'error', text1: 'Service name is required' });
      return;
    }

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

    setSaving(true);
    try {
      const dateStr = formatLocalDateForDb(editLastServiced);

      const nextDueDate = new Date(editLastServiced);
      nextDueDate.setMonth(nextDueDate.getMonth() + freq);
      const nextDueStr = formatLocalDateForDb(nextDueDate);

      const imagesJson = toImagesJson(reminderImageDrafts);

      const updatePayload: any = {
        service_name: editName.trim(),
        category: editCategory,
        last_serviced_on: dateStr,
        frequency_months: freq,
        notes: editNotes.trim() || null,
        images: imagesJson,
        provider_id: selectedProvider?.id ?? (providerLinkUnresolved ? service.provider_id : null),
        next_due_on: nextDueStr,
      };

      const { error } = await supabase
        .from('user_services')
        .update(updatePayload)
        .eq('id', service.id);

      if (error) throw error;
      Toast.show({ type: 'success', text1: 'Service updated' });
      setEditOpen(false);
      fetchService();
    } catch (err: any) {
      console.error('Failed to update service:', err);
      const userMessage = err?.message?.includes('user_services_notes_check')
        ? 'Notes cannot exceed 500 characters.'
        : err?.message ?? 'Failed to update service';
      Toast.show({ type: 'error', text1: 'Error', text2: userMessage });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    const performDelete = async () => {
      if (!service?.id) return;
      try {
        const { error } = await supabase
          .from('user_services')
          .delete()
          .eq('id', service.id);

        if (error) throw error;

        Toast.show({ type: 'success', text1: 'Reminder deleted' });
        router.replace('/services');
      } catch (err: any) {
        Toast.show({ type: 'error', text1: 'Error', text2: err.message ?? 'Failed to delete reminder.' });
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm('Delete reminder? This cannot be undone.');
      if (!confirmed) return;
      void performDelete();
      return;
    }

    Alert.alert('Delete reminder?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: performDelete,
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!service) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textMuted }}>Service not found.</Text>
      </View>
    );
  }

  const category = service.category as ServiceCategory;
  const emoji = SERVICE_CATEGORY_EMOJI[category] ?? '🔧';
  const dueDate = new Date(service.next_due_on).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const formattedEditDate = editLastServiced.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => goBackSmart(router, `/services/${id}`)}
          style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.75}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Ionicons name={(SERVICE_CATEGORY_ICONS[category] as any) ?? 'build-outline'} size={20} color={colors.primary} style={{ marginRight: 6 }} />
        <Text style={styles.headerTitle} numberOfLines={1}>
          {service.service_name}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Due card */}
        <View style={[styles.dueCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.dueLabel, { color: colors.textMuted }]}>Next service due</Text>
          <Text style={[styles.dueDate, { color: colors.text }]}>{dueDate}</Text>
          <UrgencyBadge daysUntilDue={service.days_until_due} />
        </View>

        {/* Reminder Images / Receipts */}
        {reminderImages.length > 0 ? (
          <View style={[styles.dueCard, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 10, gap: 10 }]}>
            <Text style={[styles.dueLabel, { color: colors.textMuted }]}>Reminder Images &amp; Documents</Text>
            {reminderImages.map((img, index) => (
              <View key={`detail-image-${index}`} style={{ gap: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{img.title}</Text>
                <TouchableOpacity
                  onPress={() => setPreviewImage({ url: img.url, title: img.title })}
                  activeOpacity={0.88}
                >
                  <Image
                    source={{ uri: cloudinaryUrl(img.url) }}
                    style={{ width: '100%', height: 120, borderRadius: 10, backgroundColor: colors.surface2 }}
                    contentFit="contain"
                  />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        {/* Action buttons */}
        <TouchableOpacity
          style={[styles.primaryBtn, marking && { opacity: 0.6 }]}
          onPress={handleMarkDone}
          disabled={marking}
          activeOpacity={0.85}
        >
          <View style={[styles.btnGradient, { backgroundColor: colors.secondary }]}> 
            <Text style={styles.btnText}>{marking ? 'Updating…' : 'Mark as serviced today'}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={handleFindTech}
          activeOpacity={0.82}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="search-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Find technicians</Text>
          </View>
        </TouchableOpacity>

        <ServiceHistoryList
          serviceId={service.id}
          communityId={communityId}
          refreshToken={historyRefreshToken}
        />

        {/* Collapsible edit section */}
        <TouchableOpacity
          style={[styles.editToggle, { borderColor: colors.border }]}
          onPress={() => setEditOpen((v) => !v)}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={editOpen ? 'chevron-up' : 'create-outline'} size={16} color={colors.text} style={{ marginRight: 6 }} />
            <Text style={[styles.editToggleText, { color: colors.text }]}>
              {editOpen ? 'Hide edit details' : 'Edit details'}
            </Text>
          </View>
        </TouchableOpacity>

        {editOpen && (
          <View style={[styles.editSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Service name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
              value={editName}
              onChangeText={setEditName}
              maxLength={100}
              placeholder="e.g., Living Room AC"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Category</Text>
            <View style={styles.categoryGrid}>
              {SERVICE_CATEGORIES.map((cat) => {
                const sel = editCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: sel ? colors.primary + '18' : colors.surface2,
                        borderColor: sel ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => {
                      setEditCategory(cat);
                      setEditFrequency(String(SERVICE_CATEGORY_DEFAULT_FREQUENCY[cat]));
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={(SERVICE_CATEGORY_ICONS[cat] as any) ?? 'build-outline'} size={16} color={sel ? colors.primary : colors.textMuted} style={{ marginRight: 6 }} />
                    <Text style={[{ fontSize: 11, fontWeight: '500', flexShrink: 1 }, { color: sel ? colors.primary : colors.textMuted }]} numberOfLines={2}>
                      {SERVICE_CATEGORY_LABELS[cat]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Last serviced on</Text>
            <DateField
              value={editLastServiced}
              onChange={setEditLastServiced}
              maximumDate={new Date()}
            />

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Frequency (months)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
              value={editFrequency}
              onChangeText={(v) => setEditFrequency(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={2}
            />

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Linked provider (optional)</Text>
            <Text style={[styles.providerHelperText, { color: colors.textMuted }]}>Map this reminder to any saved provider from your community.</Text>

            {providersLoading ? (
              <View style={[styles.providerStateCard, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.providerStateText, { color: colors.textMuted }]}>Loading providers...</Text>
              </View>
            ) : providerOptions.length === 0 ? (
              <>
                <View style={[styles.providerStateCard, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                  <Ionicons name="people-outline" size={22} color={colors.textMuted} />
                  <Text style={[styles.providerStateText, { color: colors.textMuted }]}>No saved providers available to map yet.</Text>
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
                  style={[styles.input, styles.providerSelector, { backgroundColor: colors.surface2, borderColor: colors.border }]}
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
                        Optional: link a known technician for quick follow-up
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
                        <Text style={[styles.providerOptionMeta, { color: colors.textMuted }]}>Keep this reminder independent</Text>
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

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Reminder images (optional, up to 3)</Text>
            <Text style={[styles.providerHelperText, { color: colors.textMuted }]}>Title is mandatory for every uploaded image.</Text>
            <View style={{ gap: 8, marginTop: 4 }}>
              {reminderImageDrafts.map((item, index) => (
                <View key={`edit-image-slot-${index}`} style={[styles.input, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 }]}>
                  <View style={{ width: 64, alignItems: 'center', justifyContent: 'center' }}>
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
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[styles.fieldLabel, { marginTop: 0, marginBottom: 0, color: colors.textMuted }]}>Image {index + 1} title</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text, paddingVertical: 8, fontSize: 13 }]}
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

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, styles.notesInput, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
              value={editNotes}
              onChangeText={setEditNotes}
              multiline
              maxLength={500}
              textAlignVertical="top"
              placeholder="Any extra details..."
              placeholderTextColor={colors.textMuted}
            />

            <View style={styles.editBtnRow}>
              <TouchableOpacity
                style={styles.cancelEditBtn}
                onPress={() => setEditOpen(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelEditBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, { flex: 1, marginTop: 0 }, saving && { opacity: 0.6 }]}
                onPress={handleSaveEdit}
                disabled={saving}
                activeOpacity={0.85}
              >
                <View style={[styles.btnGradient, { backgroundColor: colors.primary }]}> 
                  <Text style={styles.btnText}>{saving ? 'Saving…' : 'Save changes'}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Delete */}
        <TouchableOpacity
          style={[styles.deleteBtn, { borderColor: Verandah.dangerSoft, backgroundColor: Verandah.dangerSoft }]}
          onPress={handleDelete}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="trash-outline" size={16} color={Verandah.danger} style={{ marginRight: 6 }} />
            <Text style={[styles.deleteBtnText, { color: Verandah.danger }]}>Delete this reminder</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showMarkDoneSheet} transparent animationType="slide" onRequestClose={() => setShowMarkDoneSheet(false)}>
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheetCard, { backgroundColor: colors.background, borderColor: colors.border }]}> 
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Mark serviced - quick details (optional)</Text>
              <TouchableOpacity onPress={() => setShowMarkDoneSheet(false)}>
                <Text style={[styles.sheetClose, { color: colors.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Provider (optional)</Text>
              <ProviderSelector
                communityId={communityId ?? ''}
                mode="existing"
                onModeChange={() => undefined}
                selectedProviderId={markDoneProvider?.id}
                onSelectProvider={(provider) =>
                  setMarkDoneProvider({
                    id: provider.id,
                    name: provider.name,
                    phone: provider.phone ?? null,
                  })
                }
                manualProviderName=""
                onManualNameChange={() => undefined}
                manualProviderPhone=""
                onManualPhoneChange={() => undefined}
                manualProviderWhatsapp=""
                onManualWhatsappChange={() => undefined}
                allowNewProvider={false}
              />

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Cost paid (optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
                value={markDoneCost}
                onChangeText={(value) => setMarkDoneCost(value.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="Amount"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>One-line note (optional)</Text>
              <TextInput
                style={[styles.input, styles.sheetNoteInput, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
                value={markDoneNote}
                onChangeText={(value) => setMarkDoneNote(value.slice(0, 280))}
                placeholder="Anything worth noting?"
                placeholderTextColor={colors.textMuted}
                maxLength={280}
                multiline
              />

              <TouchableOpacity
                style={[styles.primaryBtn, markDoneSubmitting && { opacity: 0.7 }]}
                onPress={() => submitMarkDone()}
                disabled={markDoneSubmitting}
                activeOpacity={0.85}
              >
                <View style={[styles.btnGradient, { backgroundColor: colors.secondary }]}> 
                  <Text style={styles.btnText}>{markDoneSubmitting ? 'Saving…' : 'Mark done'}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setShowMarkDoneSheet(false)} disabled={markDoneSubmitting} style={styles.skipDetailsWrap}>
                <Text style={[styles.skipDetailsText, { color: Verandah.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
      {/* Fullscreen / In-App Image Viewer Modal */}
      <Modal
        visible={!!previewImage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPreviewImage(null)}
      >
        <View style={styles.imageModalOverlay}>
          <TouchableOpacity
            style={styles.imageModalCloseBtn}
            onPress={() => setPreviewImage(null)}
            activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close-circle" size={34} color="#FFFFFF" />
          </TouchableOpacity>

          {previewImage ? (
            <View style={styles.imageModalContent}>
              <Text style={styles.imageModalTitle}>{previewImage.title}</Text>
              <Image
                source={{ uri: cloudinaryUrl(previewImage.url) }}
                style={styles.imageModalPreview}
                contentFit="contain"
              />
            </View>
          ) : null}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 160 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: VerandahLayout.screenPaddingTop,
    paddingBottom: 10,
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
  headerEmoji: { fontSize: 22 },
  headerTitle: {
    flex: 1,
    ...VerandahType.display,
    color: Verandah.textPrimary,
  },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 6 },
  dueCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    gap: 4,
  },
  dueLabel: { fontSize: 10, fontWeight: '500', letterSpacing: 1 },
  dueDate: { fontSize: 20, fontWeight: '500' },
  primaryBtn: { borderRadius: 14, overflow: 'hidden' },
  secondaryBtn: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnGradient: { paddingVertical: 10, alignItems: 'center', borderRadius: 14 },
  btnText: { color: Verandah.primaryFg, fontSize: 15, fontWeight: '500' },
  secondaryBtnText: { fontSize: 15, fontWeight: '500' },
  editToggle: {
    paddingVertical: 8,
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginTop: 2,
  },
  editToggleText: { fontSize: 14, fontWeight: '500' },
  editSection: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    gap: 2,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1,
    marginTop: 10,
    marginBottom: 4,
  },
  providerHelperText: {
    fontSize: 12,
    marginBottom: 6,
    lineHeight: 16,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '400',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notesInput: { height: 68, paddingTop: 8 },
  providerStateCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
    marginTop: 4,
  },
  providerStateIcon: {
    fontSize: 16,
  },
  providerStateText: {
    fontSize: 12,
    lineHeight: 18,
  },
  providerActionBtn: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  providerActionBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
  providerPickerWrap: {
    gap: 8,
    marginTop: 4,
  },
  providerSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 58,
  },
  providerSelectorContent: {
    flex: 1,
    gap: 2,
    paddingRight: 8,
  },
  providerSelectorText: {
    fontSize: 14,
    fontWeight: '500',
  },
  providerSelectorSubtext: {
    fontSize: 12,
  },
  selectorChevron: {
    fontSize: 12,
    fontWeight: '500',
  },
  providerDropdown: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  providerSearchInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  providerDropdownScroll: {
    maxHeight: 200,
  },
  providerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Verandah.border,
    gap: 12,
  },
  providerOptionBody: {
    flex: 1,
    gap: 2,
  },
  providerOptionName: {
    fontSize: 14,
    fontWeight: '500',
  },
  providerOptionMeta: {
    fontSize: 12,
  },
  providerSuggestedTag: {
    fontSize: 11,
    fontWeight: '500',
  },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
    minWidth: '44%',
    flexShrink: 1,
  },
  editBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  cancelEditBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.card,
  },
  cancelEditBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Verandah.textSecondary,
  },
  saveBtn: { marginTop: 12, borderRadius: 12, overflow: 'hidden' },
  deleteBtn: {
    marginTop: 6,
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
  },
  deleteBtnText: { fontSize: 14, fontWeight: '500' },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Verandah.borderStrong,
  },
  sheetCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    maxHeight: '84%',
  },
  sheetHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Verandah.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sheetTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    marginRight: 12,
  },
  sheetClose: {
    fontSize: 18,
  },
  sheetBody: {
    padding: 14,
    paddingBottom: 20,
  },
  sheetNoteInput: {
    minHeight: 76,
    textAlignVertical: 'top',
  },
  skipDetailsWrap: {
    alignItems: 'center',
    marginTop: 10,
  },
  skipDetailsText: {
    fontSize: 14,
    fontWeight: '500',
  },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    position: 'relative',
  },
  imageModalCloseBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 24,
    right: 20,
    zIndex: 100,
    padding: 4,
  },
  imageModalContent: {
    width: '100%',
    height: '80%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  imageModalTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  imageModalPreview: {
    width: '100%',
    height: '85%',
    borderRadius: 12,
  },
});
