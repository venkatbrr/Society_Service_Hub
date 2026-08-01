import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { Verandah } from '../../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { buildMcnHeaderOptions } from '../../../lib/mcnHeader';
import { supabase } from '../../../lib/supabase';

const LEVELS = [
  { label: 'Pre-school / Nursery', value: 'pre_school' },
  { label: 'Primary School (Grades 1-5)', value: 'primary' },
  { label: 'High School (Grades 1-10/12)', value: 'high_school' },
  { label: 'All-in-one (K-12)', value: 'all_in_one' },
] as const;

const SYLLABUSES = ['CBSE', 'ICSE', 'State Board', 'IB (International Baccalaureate)', 'Cambridge / IGCSE', 'Other'] as const;

const FACILITY_OPTIONS = [
  'Transport / Bus Service',
  'Playground',
  'Science Labs',
  'Smart Classes',
  'Library',
  'Computer Lab',
  'Indoor Sports Arena',
  'Music & Art Studios',
  'Swimming Pool',
  'CCTV Surveillance',
] as const;

export default function AddSchoolScreen() {
  const router = useRouter();
  const { communityId, user } = useAuth();
  const colors = Verandah;

  const [name, setName] = useState('');
  const [level, setLevel] = useState<'pre_school' | 'primary' | 'high_school' | 'all_in_one'>('primary');
  const [syllabus, setSyllabus] = useState('CBSE');
  const [distance, setDistance] = useState('');
  const [feeRange, setFeeRange] = useState('');
  const [description, setDescription] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [selectedFacilities, setSelectedFacilities] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleFacility = (facility: string) => {
    setSelectedFacilities(prev =>
      prev.includes(facility) ? prev.filter(f => f !== facility) : [...prev, facility]
    );
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    const distanceNum = parseFloat(distance);

    if (!trimmedName) {
      Toast.show({ type: 'error', text1: 'School name is required' });
      return;
    }
    if (isNaN(distanceNum) || distanceNum < 0) {
      Toast.show({ type: 'error', text1: 'Please enter a valid distance (>= 0)' });
      return;
    }
    if (!feeRange.trim()) {
      Toast.show({ type: 'error', text1: 'Fee range description is required' });
      return;
    }

    if (!communityId || !user) {
      Toast.show({ type: 'error', text1: 'Not authenticated' });
      return;
    }

    setIsSubmitting(true);
    try {
      let finalPhone = contactPhone.trim().replace(/\D/g, '');
      if (finalPhone && finalPhone.length !== 10) {
        Toast.show({ type: 'error', text1: 'Phone number must be 10 digits' });
        setIsSubmitting(false);
        return;
      }

      const { error } = await supabase
        .from('schools')
        .insert({
          community_id: communityId,
          created_by: user.id,
          name: trimmedName,
          level,
          syllabus,
          distance: distanceNum,
          fee_range: feeRange.trim(),
          facilities: selectedFacilities,
          description: description.trim() || null,
          contact_phone: finalPhone || null,
          website: website.trim() || null,
        });

      if (error) throw error;

      Toast.show({ type: 'success', text1: 'School added successfully' });
      router.back();
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to add school listing' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/network/schools' as any);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: 'Add school',
          onBack: handleBack,
        })}
      />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        
        {/* Name input */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>
            School name <Text style={{ color: colors.danger }}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="e.g. Oakridge International School"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            maxLength={100}
          />
        </View>

        {/* Level Selector */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>School level / Category</Text>
          <View style={styles.choiceGrid}>
            {LEVELS.map((item) => (
              <TouchableOpacity
                key={item.value}
                style={[
                  styles.choiceBtn,
                  { borderColor: colors.border },
                  level === item.value && { backgroundColor: colors.primary, borderColor: colors.primary }
                ]}
                onPress={() => setLevel(item.value)}
              >
                <Text style={[styles.choiceText, { color: level === item.value ? colors.primaryFg : colors.textPrimary }]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Syllabus / Board */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Syllabus / Curriculum Board</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.syllabusScroll}>
            {SYLLABUSES.map((item) => (
              <TouchableOpacity
                key={item}
                style={[
                  styles.syllabusChip,
                  { borderColor: colors.border },
                  syllabus === item && { backgroundColor: colors.accent, borderColor: colors.accent }
                ]}
                onPress={() => setSyllabus(item)}
              >
                <Text style={[styles.syllabusChipText, { color: syllabus === item ? colors.surface : colors.textPrimary }]}>
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Distance and Fees */}
        <View style={styles.rowFields}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>
              Distance (km) <Text style={{ color: colors.danger }}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
              placeholder="e.g. 2.4"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={distance}
              onChangeText={setDistance}
              maxLength={6}
            />
          </View>
          <View style={[styles.field, { flex: 1.5 }]}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>
              Annual Fees <Text style={{ color: colors.danger }}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
              placeholder="e.g. ₹1.2L - ₹2.0L"
              placeholderTextColor={colors.textMuted}
              value={feeRange}
              onChangeText={setFeeRange}
              maxLength={40}
            />
          </View>
        </View>

        {/* Facilities checklist */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Facilities Available</Text>
          <View style={styles.facilitiesGrid}>
            {FACILITY_OPTIONS.map((facility) => {
              const selected = selectedFacilities.includes(facility);
              return (
                <TouchableOpacity
                  key={facility}
                  style={[
                    styles.facilityCheckbox,
                    { borderColor: colors.border },
                    selected && { backgroundColor: colors.accentSoft, borderColor: colors.accent }
                  ]}
                  onPress={() => toggleFacility(facility)}
                >
                  <Ionicons
                    name={selected ? 'checkbox' : 'square-outline'}
                    size={18}
                    color={selected ? colors.accent : colors.textMuted}
                  />
                  <Text style={[styles.facilityLabel, { color: colors.textPrimary }]}>{facility}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>About the school (Optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea, { borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="Add general details, enrollment dates, reviews context..."
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={300}
          />
        </View>

        {/* Contact phone */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Contact Phone / Inquiry Number</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="10-digit mobile or local landline"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            value={contactPhone}
            onChangeText={setContactPhone}
            maxLength={15}
          />
        </View>

        {/* Website URL */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Website URL</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="e.g. www.oakridge.in"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            value={website}
            onChangeText={setWebsite}
            maxLength={100}
          />
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: colors.primary }]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.primaryFg} />
          ) : (
            <Text style={[styles.submitText, { color: colors.primaryFg }]}>Add school</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingBottom: 80,
  },
  field: {
    marginBottom: 20,
  },
  rowFields: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 0,
  },
  label: {
    ...VerandahType.captionBold,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: VerandahRadius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
  },
  textArea: {
    minHeight: 100,
  },
  choiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceBtn: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: VerandahRadius.md,
  },
  choiceText: {
    fontSize: 13,
    fontWeight: '500',
  },
  syllabusScroll: {
    gap: 8,
    paddingRight: 16,
  },
  syllabusChip: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: VerandahRadius.pill,
  },
  syllabusChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  facilitiesGrid: {
    gap: 8,
  },
  facilityCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 0.5,
    borderRadius: VerandahRadius.md,
    padding: 12,
  },
  facilityLabel: {
    fontSize: 14,
    fontWeight: '400',
  },
  submitBtn: {
    marginTop: 12,
    height: 52,
    borderRadius: VerandahRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
