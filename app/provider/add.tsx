import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { Colors } from '../../constants/Colors';
import { CATEGORIES } from '../../constants/categories';
import { getServiceCategoryEmoji } from '../../constants/emojis';
import { DetailField, getDetailFieldsForCategory } from '../../constants/providerDetails';
import { useAuth } from '../../context/AuthContext';
import { actionToFraudStatus, checkProviderFraud, getFraudActionMessage } from '../../lib/fraudCheck';
import { supabase } from '../../lib/supabase';

export default function AddProviderScreen() {
  const { user, communityId } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = Colors.light;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [flatBlock, setFlatBlock] = useState('');
  const [details, setDetails] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);

  const detailFields = useMemo(() => getDetailFieldsForCategory(category), [category]);

  const handleCategoryChange = (cat: string) => {
    setCategory(cat);
    setDetails({}); // reset details when category changes
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

    setIsLoading(true);
    try {
      // Run fraud check before inserting
      const verdict = await checkProviderFraud(phone.trim(), communityId as string);

      if (verdict.action === 'BLOCK') {
        const msg = getFraudActionMessage(verdict);
        Toast.show({ type: msg.type, text1: msg.title, text2: msg.message });
        return;
      }

      const fraudStatus = actionToFraudStatus(verdict.action);
      const cleanedDetails = cleanDetails();

      const { error } = await supabase.from('service_providers').insert({
        community_id: communityId as string,
        created_by: user?.id as string,
        name: name.trim(),
        phone: phone.trim(),
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
            <Text style={[styles.label, { color: colors.text }]}>{field.label.toUpperCase()}</Text>
            <View style={styles.chipContainer}>
              {field.options?.map(option => {
                const isSelected = details[field.key] === option;
                return isSelected ? (
                  <LinearGradient
                    key={option}
                    colors={[colors.gradientStart, colors.gradientEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.chipGradient}
                  >
                    <TouchableOpacity onPress={() => updateDetail(field.key, option)}>
                      <Text style={[styles.chipText, { color: '#FFF' }]}>{option}</Text>
                    </TouchableOpacity>
                  </LinearGradient>
                ) : (
                  <TouchableOpacity
                    key={option}
                    style={[styles.chip, { backgroundColor: colors.glass, borderColor: colors.border }]}
                    onPress={() => updateDetail(field.key, option)}
                  >
                    <Text style={[styles.chipText, { color: colors.text }]}>{option}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      case 'chips':
        return (
          <View key={field.key} style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>{field.label.toUpperCase()}</Text>
            <View style={styles.chipContainer}>
              {field.options?.map(option => {
                const selected: string[] = details[field.key] || [];
                const isSelected = selected.includes(option);
                return isSelected ? (
                  <LinearGradient
                    key={option}
                    colors={[colors.gradientStart, colors.gradientEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.chipGradient}
                  >
                    <TouchableOpacity onPress={() => toggleChip(field.key, option)}>
                      <Text style={[styles.chipText, { color: '#FFF' }]}>{option}</Text>
                    </TouchableOpacity>
                  </LinearGradient>
                ) : (
                  <TouchableOpacity
                    key={option}
                    style={[styles.chip, { backgroundColor: colors.glass, borderColor: colors.border }]}
                    onPress={() => toggleChip(field.key, option)}
                  >
                    <Text style={[styles.chipText, { color: colors.text }]}>{option}</Text>
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
              {field.label.toUpperCase()}{field.suffix ? ` (₹ ${field.suffix})` : ' (₹)'}
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
            <Text style={[styles.label, { color: colors.text }]}>{field.label.toUpperCase()}</Text>
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
          <Text style={[styles.title, { color: colors.text }]}>Share Contact</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Help your neighbors find trusted local service providers</Text>
        </View>

        <View style={[styles.form, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>NAME</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="e.g. Ramesh - Electrician"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>PHONE NUMBER</Text>
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
            <Text style={[styles.label, { color: colors.text }]}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {CATEGORIES.map(cat =>
                category === cat ? (
                  <LinearGradient
                    key={cat}
                    colors={[colors.gradientStart, colors.gradientEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.categoryChipGradient}
                  >
                    <TouchableOpacity onPress={() => handleCategoryChange(cat)}>
                      <Text style={[styles.categoryText, { color: '#FFF' }]}>{cat}</Text>
                    </TouchableOpacity>
                  </LinearGradient>
                ) : (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryChip, { backgroundColor: colors.glass, borderColor: colors.border }]}
                    onPress={() => handleCategoryChange(cat)}
                  >
                    <Text style={[styles.categoryText, { color: colors.text }]}>{`${getServiceCategoryEmoji(cat)} ${cat}`}</Text>
                  </TouchableOpacity>
                )
              )}
            </ScrollView>
          </View>

          {/* Category-specific optional detail fields */}
          {detailFields.length > 0 && (
            <View style={[styles.detailsSection, { borderTopColor: colors.border }]}>
              <Text style={[styles.detailsSectionLabel, { color: colors.textMuted }]}>
                OPTIONAL DETAILS FOR {category.toUpperCase()}
              </Text>
              {detailFields.map(renderDetailField)}
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>FLAT / BLOCK (OPTIONAL)</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="e.g. Often works in Block A"
              placeholderTextColor={colors.textMuted}
              value={flatBlock}
              onChangeText={setFlatBlock}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>DESCRIPTION</Text>
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

      <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 24), backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <TouchableOpacity
          onPress={handleSave}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.saveButton}
          >
            {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>Add Provider</Text>}
          </LinearGradient>
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
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
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
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 0,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
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
  categoryChipGradient: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    marginRight: 8,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  detailsSection: {
    borderTopWidth: 1,
    marginTop: 4,
    paddingTop: 20,
    marginBottom: 4,
  },
  detailsSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
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
  chipGradient: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
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
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
