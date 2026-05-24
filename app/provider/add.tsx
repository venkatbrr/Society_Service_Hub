import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { Verandah } from '../../constants/Colors';
import { CATEGORIES, CATEGORY_GROUPS, CategoryGroup } from '../../constants/categories';
import { getServiceCategoryEmoji } from '../../constants/emojis';
import { DetailField, getDetailFieldsForCategory } from '../../constants/providerDetails';
import { useAuth } from '../../context/AuthContext';
import { VerandahRadius, VerandahType } from '../../constants/Verandah';
import { actionToFraudStatus, checkProviderFraud, getFraudActionMessage } from '../../lib/fraudCheck';
import { normalizeIndianMobile } from '../../lib/phone';
import { supabase } from '../../lib/supabase';

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
  const [flatBlock, setFlatBlock] = useState('');
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

  const detailFields = useMemo(() => getDetailFieldsForCategory(category), [category]);

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

  const handleSave = async () => {
    if (!name.trim() || !phone.trim() || !category) {
      Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Name, phone, and category are required' });
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
      const { data: existingProviders, error: duplicateCheckError } = await supabase
        .from('service_providers')
        .select('id, name, category')
        .eq('community_id', communityId)
        .eq('phone', normalizedPhone)
        .order('created_at', { ascending: false })
        .limit(1);

      if (duplicateCheckError) throw duplicateCheckError;

      const existingProvider = existingProviders?.[0];
      if (existingProvider) {
        Toast.show({
          type: 'info',
          text1: 'Provider already saved',
          text2: `Opening ${existingProvider.name}${existingProvider.category ? ` (${existingProvider.category})` : ''}`,
        });
        router.replace(`/provider/${existingProvider.id}` as any);
        return;
      }

      // Run fraud check before inserting
      const verdict = await checkProviderFraud(normalizedPhone, communityId);

      if (verdict.action === 'BLOCK') {
        const msg = getFraudActionMessage(verdict);
        Toast.show({ type: msg.type, text1: msg.title, text2: msg.message });
        return;
      }

      const fraudStatus = actionToFraudStatus(verdict.action);
      const cleanedDetails = cleanDetails();

      const { error } = await supabase.from('service_providers').insert({
        community_id: communityId,
        created_by: user.id,
        name: name.trim(),
        phone: normalizedPhone,
        category,
        description: description.trim() || null,
        flat_block: flatBlock.trim() || null,
        fraud_status: fraudStatus,
        ...(cleanedDetails ? { details: cleanedDetails } : {}),
      });

      if (error) throw error;

      if (verdict.action === 'PASS') {
        Toast.show({ type: 'success', text1: 'Provider added successfully' });
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
              onChangeText={(val) => updateDetail(field.key, val)}
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
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Add provider</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Help your neighbors find trusted local service providers</Text>
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
                  <Text style={[styles.categoryText, { color: category === cat ? Verandah.primaryFg : colors.text }]}>{`${getServiceCategoryEmoji(cat)} ${cat}`}</Text>
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
            <Text style={[styles.label, { color: colors.text }]}>Flat / block (optional)</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="e.g. Often works in Block A"
              placeholderTextColor={colors.textMuted}
              value={flatBlock}
              onChangeText={setFlatBlock}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Description</Text>
            <TextInput
              style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="e.g. Very reliable, fair pricing..."
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
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
    padding: 24,
    paddingTop: 60,
  },
  header: {
    marginBottom: 32,
    gap: 6,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Verandah.cardMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    ...VerandahType.display,
    color: Verandah.textPrimary,
  },
  subtitle: {
    fontSize: 16,
    marginTop: 4,
    lineHeight: 22,
  },
  form: {
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    height: 54,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  categoryGroupScroll: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  categoryScroll: {
    flexDirection: 'row',
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    marginRight: 8,
    borderWidth: 1,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '500',
  },
  detailsSection: {
    borderTopWidth: 1,
    marginTop: 4,
    paddingTop: 20,
    marginBottom: 4,
  },
  detailsSectionLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1.5,
    marginBottom: 16,
    marginLeft: 4,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  textArea: {
    height: 120,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    fontSize: 16,
  },
  footer: {
    padding: 24,
    borderTopWidth: 1,
  },
  saveButton: {
    height: 58,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    color: Verandah.primaryFg,
    fontSize: 18,
    fontWeight: '500',
  },
});
