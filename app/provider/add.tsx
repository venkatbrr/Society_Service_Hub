import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { HeaderBackButton } from '../../components/HeaderBackButton';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahType } from '../../constants/Verandah';
import { CATEGORIES, CATEGORY_GROUPS, CategoryGroup } from '../../constants/categories';
import { getServiceCategoryEmoji } from '../../constants/emojis';
import { DetailField, getDetailFieldsForCategory } from '../../constants/providerDetails';
import { useAuth } from '../../context/AuthContext';
import { actionToFraudStatus, checkProviderFraud, getFraudActionMessage } from '../../lib/fraudCheck';
import { normalizeIndianMobile } from '../../lib/phone';
import { supabase } from '../../lib/supabase';
import { goBackSmart } from '../../lib/navigation';

const buildProviderCategoryGroups = (sourceCategories: string[]): CategoryGroup[] => {
  const included = new Set(sourceCategories);
  const groups = CATEGORY_GROUPS
    .map((group) => ({
      ...group,
      categories: group.categories.filter((cat) => included.has(cat)),
    }))
    .filter((group) => group.categories.length > 0);

  const groupedSet = new Set(groups.flatMap((group) => group.categories));
  const uncategorized = sourceCategories.filter((cat) => !groupedSet.has(cat));

  if (uncategorized.length > 0) {
    groups.push({ id: 'more', label: 'More', categories: uncategorized });
  }

  return groups;
};

const findGroupIdByCategory = (groups: CategoryGroup[], selectedCategory: string) => {
  const group = groups.find((entry) => entry.categories.includes(selectedCategory));
  return group?.id ?? 'all';
};

export default function AddProviderScreen() {
  const { user, communityId } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = {
    background: Verandah.surface,
    text: Verandah.textPrimary,
    textMuted: Verandah.textSecondary,
    primary: Verandah.primary,
    border: Verandah.border,
    card: Verandah.card,
    cardMuted: Verandah.cardMuted,
  };

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [personalNote, setPersonalNote] = useState('');
  const [details, setDetails] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);

  const categoryGroups = useMemo(() => buildProviderCategoryGroups(CATEGORIES), []);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(() =>
    findGroupIdByCategory(categoryGroups, CATEGORIES[0])
  );

  const visibleCategories = useMemo(() => {
    if (selectedGroupId === 'all') {
      return CATEGORIES;
    }

    return categoryGroups.find((group) => group.id === selectedGroupId)?.categories ?? CATEGORIES;
  }, [categoryGroups, selectedGroupId]);

  const detailFields = useMemo(
    () => getDetailFieldsForCategory(category).filter((field) => field.key !== 'salary'),
    [category]
  );

  const handleCategoryChange = (cat: string) => {
    setCategory(cat);
    setSelectedGroupId(findGroupIdByCategory(categoryGroups, cat));
    setDetails({}); // reset details when category changes
  };

  const handleGroupChange = (groupId: string) => {
    setSelectedGroupId(groupId);

    if (groupId === 'all') {
      return;
    }

    const firstCategory = categoryGroups.find((group) => group.id === groupId)?.categories[0];
    if (firstCategory && firstCategory !== category) {
      setCategory(firstCategory);
      setDetails({});
    }
  };

  const updateDetail = (key: string, value: any) => {
    setDetails(prev => ({ ...prev, [key]: value }));
  };

  const toggleChip = (key: string, option: string) => {
    setDetails(prev => {
      const current: string[] = prev[key] || [];
      if (current.includes(option)) {
        return { ...prev, [key]: current.filter((o: string) => o !== option) };
      }
      return { ...prev, [key]: [...current, option] };
    });
  };

  // Strip empty values from details before saving
  const cleanDetails = () => {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(details)) {
      if (value === '' || value === null || value === undefined) continue;
      if (Array.isArray(value) && value.length === 0) continue;
      cleaned[key] = value;
    }
    return Object.keys(cleaned).length > 0 ? cleaned : null;
  };

  const findExistingProviderByPhone = async (normalizedPhone: string) => {
    const { data, error } = await supabase
      .from('service_providers')
      .select('id, name, category')
      .eq('community_id', communityId as string)
      .eq('phone', normalizedPhone)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  };

  const openExistingProvider = (existingProvider: { id: string; name: string; category: string | null }) => {
    Toast.show({
      type: 'info',
      text1: 'Provider already saved',
      text2: `This phone number is already linked to ${existingProvider.name}${existingProvider.category ? ` (${existingProvider.category})` : ''}`,
    });
    router.replace(`/provider/${existingProvider.id}` as any);
  };

  const handleSave = async () => {
    if (!name.trim() || !phone.trim() || !category) {
      Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Name, phone, and category are required' });
      return;
    }

    if (name.trim().length < 2 || name.trim().length > 80) {
      Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Name must be between 2 and 80 characters' });
      return;
    }

    if (description.trim().length > 1000) {
      Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Description cannot exceed 1000 characters' });
      return;
    }

    if (personalNote.trim().length > 1000) {
      Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Personal note cannot exceed 1000 characters' });
      return;
    }

    const normalizedPhone = normalizeIndianMobile(phone);
    if (!normalizedPhone) {
      Toast.show({ type: 'error', text1: 'Invalid Phone', text2: 'Enter a valid 10-digit mobile number. Country code is optional.' });
      return;
    }

    if (!user?.id || !communityId) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Your session is missing community details. Please re-login and try again.' });
      return;
    }

    setIsLoading(true);
    try {
      const existingProvider = await findExistingProviderByPhone(normalizedPhone);
      if (existingProvider) {
        openExistingProvider(existingProvider);
        return;
      }

      // Run fraud check before inserting
      const verdict = await checkProviderFraud(normalizedPhone, communityId, {
        name: name.trim(),
        description: description.trim(),
        created_by: user.id,
      });

      if (verdict.action === 'BLOCK') {
        const msg = getFraudActionMessage(verdict);
        Toast.show({ type: msg.type, text1: msg.title, text2: msg.message });
        return;
      }

      const fraudStatus = actionToFraudStatus(verdict.action);
      const cleanedDetails = cleanDetails();

      const { data: insertedProvider, error } = await supabase
        .from('service_providers')
        .insert({
          community_id: communityId,
          created_by: user.id,
          name: name.trim(),
          phone: normalizedPhone,
          category,
          description: description.trim() || null,
          fraud_status: fraudStatus,
          ...(cleanedDetails ? { details: cleanedDetails } : {}),
        })
        .select('id')
        .maybeSingle();

      if (error) {
        const isDuplicateError = error.message?.includes('A provider with this phone number already exists in your community');
        if (isDuplicateError) {
          const duplicateProvider = await findExistingProviderByPhone(normalizedPhone);
          if (duplicateProvider) {
            openExistingProvider(duplicateProvider);
            return;
          }
        }

        throw error;
      }

      const trimmedPersonalNote = personalNote.trim();
      if (trimmedPersonalNote && insertedProvider?.id) {
        const { error: personalNoteError } = await supabase
          .from('provider_personal_notes')
          .upsert(
            {
              user_id: user.id,
              provider_id: insertedProvider.id,
              note: trimmedPersonalNote,
            },
            { onConflict: 'user_id,provider_id' }
          );

        if (personalNoteError) {
          throw personalNoteError;
        }
      }

      if (verdict.action === 'PASS') {
        Toast.show({ type: 'success', text1: 'Provider added successfully' });
        if (insertedProvider?.id) {
          router.replace(`/provider/${insertedProvider.id}` as any);
          return;
        }
      } else {
        const msg = getFraudActionMessage(verdict);
        Toast.show({ type: msg.type, text1: msg.title, text2: msg.message });
      }
      router.back();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const renderDetailField = (field: DetailField) => {
    switch (field.type) {
      case 'radio':
        return (
          <View key={field.key} style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>{field.label}</Text>
            <View style={styles.chipContainer}>
              {field.options?.map(option => {
                const isSelected = details[field.key] === option;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.card,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => updateDetail(field.key, option)}
                  >
                    <Text style={[styles.chipText, { color: isSelected ? Verandah.primaryFg : colors.text }]}>{option}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      case 'chips':
        return (
          <View key={field.key} style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>{field.label}</Text>
            <View style={styles.chipContainer}>
              {field.options?.map(option => {
                const selected: string[] = details[field.key] || [];
                const isSelected = selected.includes(option);
                return (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.card,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => toggleChip(field.key, option)}
                  >
                    <Text style={[styles.chipText, { color: isSelected ? Verandah.primaryFg : colors.text }]}>{option}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      case 'number':
        return (
          <View key={field.key} style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>
              {field.label}{field.suffix ? ` (${field.suffix})` : ''}
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder={field.placeholder}
              placeholderTextColor={colors.textMuted}
              value={details[field.key]?.toString() || ''}
              onChangeText={(val) => {
                const cleaned = val.replace(/[^0-9.]/g, '');
                const num = parseFloat(cleaned);
                updateDetail(field.key, isNaN(num) ? '' : Math.max(0, num));
              }}
              keyboardType="numeric"
            />
          </View>
        );

      case 'text':
        return (
          <View key={field.key} style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>{field.label}</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder={field.placeholder}
              placeholderTextColor={colors.textMuted}
              value={details[field.key] || ''}
              onChangeText={(val) => updateDetail(field.key, val)}
            />
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <HeaderBackButton onPress={() => goBackSmart(router, '/provider/add')} color={colors.text} style={styles.backButton} />
          <Text style={styles.title}>Add provider</Text>
        </View>

        <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Name</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="e.g. Ramesh - Electrician"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
              maxLength={80}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Phone number</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="e.g. +91 98765 43210"
              placeholderTextColor={colors.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Category</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryGroupScroll}>
              {[
                { id: 'all', label: 'All Services' },
                ...categoryGroups.map((group) => ({ id: group.id, label: group.label })),
              ].map((group) => {
                const selected = selectedGroupId === group.id;
                return (
                  <TouchableOpacity
                    key={group.id}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: selected ? colors.primary : colors.card,
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => handleGroupChange(group.id)}
                  >
                    <Text style={[styles.categoryText, { color: selected ? Verandah.primaryFg : colors.text }]}>{group.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {visibleCategories.map(cat =>
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: category === cat ? colors.primary : colors.card,
                      borderColor: category === cat ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => handleCategoryChange(cat)}
                >
                  <Text style={[styles.categoryText, { color: category === cat ? Verandah.primaryFg : colors.text }]}>{cat}</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>

          {/* Category-specific optional detail fields */}
          {detailFields.length > 0 && (
            <View style={[styles.detailsSection, { borderTopColor: colors.border }]}>
              <Text style={[styles.detailsSectionLabel, { color: colors.textMuted }]}>
                Optional details for {category}
              </Text>
              {detailFields.map(renderDetailField)}
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Description</Text>
            <TextInput
              style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="e.g. Fan repair ₹300, switchboard fix ₹150, full home wiring ₹2500"
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              maxLength={1000}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Personal note (private)</Text>
            <TextInput
              style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="This note is visible only to you."
              placeholderTextColor={colors.textMuted}
              value={personalNote}
              onChangeText={setPersonalNote}
              maxLength={1000}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 24), backgroundColor: colors.card, borderColor: colors.border }]}>
        <TouchableOpacity
          onPress={handleSave}
          disabled={isLoading}
          activeOpacity={0.85}
          style={[styles.saveButton, { backgroundColor: colors.primary }]}
        >
          {isLoading ? <ActivityIndicator color={Verandah.primaryFg} /> : <Text style={styles.saveButtonText}>Add provider</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: VerandahLayout.screenPaddingTop,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Verandah.cardMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    ...VerandahType.bodyBold,
    fontSize: 18,
    color: Verandah.textPrimary,
  },
  form: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  inputGroup: {
    marginBottom: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1.2,
    marginBottom: 4,
    marginLeft: 2,
  },
  input: {
    height: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  categoryGroupScroll: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  categoryScroll: {
    flexDirection: 'row',
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginRight: 6,
    borderWidth: 1,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '500',
  },
  detailsSection: {
    borderTopWidth: 1,
    marginTop: 4,
    paddingTop: 12,
    marginBottom: 4,
  },
  detailsSectionLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1.2,
    marginBottom: 10,
    marginLeft: 2,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  textArea: {
    height: 72,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    fontSize: 14,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  saveButton: {
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    color: Verandah.primaryFg,
    fontSize: 16,
    fontWeight: '500',
  },
});
