import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
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
import { ProviderSelector } from '../../components/ProviderSelector';
import { ServiceHistoryList } from '../../components/ServiceHistoryList';
import { UrgencyBadge } from '../../components/UrgencyBadge';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import {
    mapServiceCategoryToProviderCategory,
    SERVICE_CATEGORIES,
    SERVICE_CATEGORY_DEFAULT_FREQUENCY,
    SERVICE_CATEGORY_EMOJI,
    SERVICE_CATEGORY_LABELS,
    ServiceCategory,
} from '../../lib/serviceCategories';
import { supabase } from '../../lib/supabase';

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
  const colors = Colors.light;

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

  const fetchService = useCallback(async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('user_services')
        .select('id, service_name, category, last_serviced_on, frequency_months, next_due_on, notes, provider_id')
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

        setService({
          ...serviceRow,
          days_until_due: daysUntilDue,
        });
        setEditName(serviceRow.service_name);
        setEditCategory(serviceRow.category as ServiceCategory);
        setEditLastServiced(new Date(serviceRow.last_serviced_on));
        setEditFrequency(String(serviceRow.frequency_months));
        setEditNotes(serviceRow.notes ?? '');
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

  useEffect(() => {
    if (!service?.provider_id) {
      setSelectedProvider(null);
      setMarkDoneProvider(null);
      return;
    }

    const linkedProvider = providers.find((provider) => provider.id === service.provider_id) ?? null;
    if (linkedProvider) {
      setSelectedProvider(linkedProvider);
      setMarkDoneProvider(linkedProvider);
    }
  }, [providers, service?.provider_id]);

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

  const submitMarkDone = async (skipDetails: boolean) => {
    if (!service) return;

    const noteValue = markDoneNote.trim();
    const costValue = markDoneCost.trim();
    const parsedCost = costValue.length ? Number(costValue) : null;

    if (!skipDetails && costValue.length && (parsedCost === null || Number.isNaN(parsedCost) || parsedCost < 0)) {
      Toast.show({ type: 'error', text1: 'Invalid cost', text2: 'Enter a valid non-negative amount.' });
      return;
    }

    const prevService = service;
    const today = new Date().toISOString().split('T')[0];

    setMarking(true);
    setMarkDoneSubmitting(true);

    setService((s) =>
      s
        ? {
            ...s,
            last_serviced_on: today,
            days_until_due: s.frequency_months * 30,
          }
        : s
    );

    try {
      if (skipDetails) {
        const { error } = await supabase.rpc('mark_service_done', {
          p_service_id: service.id,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('mark_service_done', {
          p_service_id: service.id,
          p_provider_id: markDoneProvider?.id ?? null,
          p_cost_paid: parsedCost,
          p_note: noteValue.length ? noteValue.slice(0, 280) : null,
        });
        if (error) throw error;
      }

      setShowMarkDoneSheet(false);
      setMarkDoneCost('');
      setMarkDoneNote('');
      setHistoryRefreshToken((v) => v + 1);
      Toast.show({ type: 'success', text1: 'Service logged' });
      fetchService();
    } catch (err: any) {
      setService(prevService);
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

    setSaving(true);
    try {
      const dateStr = editLastServiced.toISOString().split('T')[0];
      const { error } = await supabase
        .from('user_services')
        .update({
          service_name: editName.trim(),
          category: editCategory,
          last_serviced_on: dateStr,
          frequency_months: freq,
          notes: editNotes.trim() || null,
          provider_id: selectedProvider?.id ?? null,
          // next_due_on is recomputed by DB trigger on UPDATE
          next_due_on: dateStr, // placeholder; trigger overwrites
        })
        .eq('id', service.id);

      if (error) throw error;
      Toast.show({ type: 'success', text1: 'Service updated' });
      setEditOpen(false);
      fetchService();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete reminder?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!service) return;
            try {
              const { error } = await supabase
                .from('user_services')
                .delete()
                .eq('id', service.id);
              if (error) throw error;
              Toast.show({ type: 'success', text1: 'Reminder deleted' });
              router.back();
            } catch (err: any) {
              Toast.show({ type: 'error', text1: 'Error', text2: err.message });
            }
          },
        },
      ]
    );
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
      <LinearGradient
        colors={[colors.gradientStart + '10', colors.gradientEnd + '06', 'transparent']}
        style={styles.headerGradient}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          activeOpacity={0.75}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerEmoji}>{emoji}</Text>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {service.service_name}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Due card */}
        <View style={[styles.dueCard, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <Text style={[styles.dueLabel, { color: colors.textMuted }]}>NEXT SERVICE DUE</Text>
          <Text style={[styles.dueDate, { color: colors.text }]}>{dueDate}</Text>
          <UrgencyBadge daysUntilDue={service.days_until_due} />
        </View>

        {/* Action buttons */}
        <TouchableOpacity
          style={[styles.primaryBtn, marking && { opacity: 0.6 }]}
          onPress={handleMarkDone}
          disabled={marking}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[colors.secondary, '#059669']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.btnGradient}
          >
            <Text style={styles.btnText}>{marking ? 'Updating…' : '✅ Mark as serviced today'}</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          onPress={handleFindTech}
          activeOpacity={0.82}
        >
          <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>🔍 Find technicians</Text>
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
          <Text style={[styles.editToggleText, { color: colors.text }]}>
            {editOpen ? '▲ Hide edit details' : '✏️ Edit details'}
          </Text>
        </TouchableOpacity>

        {editOpen && (
          <View style={[styles.editSection, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>SERVICE NAME</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
              value={editName}
              onChangeText={setEditName}
              maxLength={100}
              placeholder="e.g., Living Room AC"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>CATEGORY</Text>
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
                    <Text style={{ fontSize: 14 }}>{SERVICE_CATEGORY_EMOJI[cat]}</Text>
                    <Text style={[{ fontSize: 11, fontWeight: '600', flexShrink: 1 }, { color: sel ? colors.primary : colors.textMuted }]} numberOfLines={2}>
                      {SERVICE_CATEGORY_LABELS[cat]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>LAST SERVICED ON</Text>
            <TouchableOpacity
              style={[styles.input, styles.dateRow, { backgroundColor: colors.surface2, borderColor: colors.border }]}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' }}>{formattedEditDate}</Text>
              <Text style={{ color: colors.textMuted }}>📅</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={editLastServiced}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                onChange={(_, date) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (date) setEditLastServiced(date);
                }}
              />
            )}

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>FREQUENCY (MONTHS)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
              value={editFrequency}
              onChangeText={(v) => setEditFrequency(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={2}
            />

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>LINKED PROVIDER (OPTIONAL)</Text>
            <Text style={[styles.providerHelperText, { color: colors.textMuted }]}>Map this reminder to any saved provider from your community.</Text>

            {providersLoading ? (
              <View style={[styles.providerStateCard, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.providerStateText, { color: colors.textMuted }]}>Loading providers...</Text>
              </View>
            ) : providerOptions.length === 0 ? (
              <>
                <View style={[styles.providerStateCard, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                  <Text style={styles.providerStateIcon}>👥</Text>
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
                  <Text style={[styles.selectorChevron, { color: colors.textMuted }]}>{providerPickerOpen ? '▲' : '▼'}</Text>
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

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>NOTES (OPTIONAL)</Text>
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

            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSaveEdit}
              disabled={saving}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[colors.gradientStart, colors.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.btnGradient}
              >
                <Text style={styles.btnText}>{saving ? 'Saving…' : 'Save changes'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* Delete */}
        <TouchableOpacity
          style={[styles.deleteBtn, { borderColor: colors.accent + '40' }]}
          onPress={handleDelete}
          activeOpacity={0.8}
        >
          <Text style={[styles.deleteBtnText, { color: colors.accent }]}>🗑️ Delete this reminder</Text>
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
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>PROVIDER (OPTIONAL)</Text>
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

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>COST PAID (OPTIONAL)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
                value={markDoneCost}
                onChangeText={(value) => setMarkDoneCost(value.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="₹"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>ONE-LINE NOTE (OPTIONAL)</Text>
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
                onPress={() => submitMarkDone(false)}
                disabled={markDoneSubmitting}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={[colors.secondary, '#059669']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.btnGradient}
                >
                  <Text style={styles.btnText}>{markDoneSubmitting ? 'Saving…' : 'Mark done'}</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => submitMarkDone(true)} disabled={markDoneSubmitting} style={styles.skipDetailsWrap}>
                <Text style={[styles.skipDetailsText, { color: colors.primary }]}>Skip details</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
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
    paddingTop: 56,
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
  backIcon: { fontSize: 18, fontWeight: '600' },
  headerEmoji: { fontSize: 22 },
  headerTitle: { flex: 1, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 60, gap: 12 },
  dueCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 8,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 0,
  },
  dueLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  dueDate: { fontSize: 22, fontWeight: '800' },
  primaryBtn: { borderRadius: 16, overflow: 'hidden' },
  secondaryBtn: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnGradient: { paddingVertical: 15, alignItems: 'center', borderRadius: 16 },
  btnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  secondaryBtnText: { fontSize: 15, fontWeight: '700' },
  editToggle: {
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginTop: 4,
  },
  editToggleText: { fontSize: 14, fontWeight: '600' },
  editSection: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 4,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 0,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 4,
  },
  providerHelperText: {
    fontSize: 12,
    marginBottom: 8,
    lineHeight: 18,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '500',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notesInput: { height: 76, paddingTop: 10 },
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
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  providerActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
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
    fontWeight: '600',
  },
  providerSelectorSubtext: {
    fontSize: 12,
  },
  selectorChevron: {
    fontSize: 12,
    fontWeight: '700',
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
    borderBottomColor: '#00000014',
    gap: 12,
  },
  providerOptionBody: {
    flex: 1,
    gap: 2,
  },
  providerOptionName: {
    fontSize: 14,
    fontWeight: '600',
  },
  providerOptionMeta: {
    fontSize: 12,
  },
  providerSuggestedTag: {
    fontSize: 11,
    fontWeight: '700',
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
  saveBtn: { marginTop: 16, borderRadius: 14, overflow: 'hidden' },
  deleteBtn: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
  },
  deleteBtnText: { fontSize: 14, fontWeight: '700' },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.26)',
  },
  sheetCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    maxHeight: '84%',
  },
  sheetHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D7DBE1',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sheetTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    marginRight: 12,
  },
  sheetClose: {
    fontSize: 18,
  },
  sheetBody: {
    padding: 16,
    paddingBottom: 28,
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
    fontWeight: '700',
  },
});
