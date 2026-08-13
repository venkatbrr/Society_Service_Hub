import { Announcement01 } from '@untitledui/icons/Announcement01';
import { Car01 } from '@untitledui/icons/Car01';
import { DotsHorizontal } from '@untitledui/icons/DotsHorizontal';
import { Edit01 } from '@untitledui/icons/Edit01';
import { FaceSmile } from '@untitledui/icons/FaceSmile';
import { Trophy01 } from '@untitledui/icons/Trophy01';
import { Users01 } from '@untitledui/icons/Users01';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackSmart, replaceTracked } from '../../../lib/navigation';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { AppIcon } from '../../../components/AppIcon';
import { SchoolPicker } from '../../../components/SchoolPicker';
import { Verandah } from '../../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { WestHyderabadSchool } from '../../../data/westHyderabadSchools';
import { buildMcnHeaderOptions } from '../../../lib/mcnHeader';
import { normalizeIndianMobile, toLast10Digits } from '../../../lib/phone';
import { supabase } from '../../../lib/supabase';

const INSTITUTION_TYPES = [
  { id: 'school', label: 'School', icon: 'school' as const },
  { id: 'college', label: 'College', icon: 'graduation' as const },
  { id: 'preschool', label: 'Pre-School', icon: 'baby' as const },
];

const BOARD_OPTIONS = ['CBSE', 'ICSE', 'State Board', 'IB', 'IGCSE', 'PU Board', 'University', 'Other'];

// data/westHyderabadSchools.ts levels relevant to each institution type. College
// has no matches in the catalog, so it always falls straight to free text.
const SCHOOL_LEVEL_FILTER: Record<'school' | 'preschool', WestHyderabadSchool['level'][]> = {
  school: ['primary', 'high_school', 'all_in_one'],
  preschool: ['pre_school'],
};

const INTENT_OPTIONS = [
  { id: 'carpool', label: 'Carpooling' },
  { id: 'study_group', label: 'Study Group' },
  { id: 'homework_help', label: 'Homework Help' },
  { id: 'school_info', label: 'School Info & Updates' },
  { id: 'activities', label: 'Sports / Activities Buddy' },
  { id: 'playdate', label: 'Playdate / Hangout' },
  { id: 'other', label: 'Other' },
];

const renderIntentAddIcon = (id: string, color: string) => {
  switch (id) {
    case 'carpool': return <Car01 size={13} color={color} aria-hidden={true} />;
    case 'study_group': return <Users01 size={13} color={color} aria-hidden={true} />;
    case 'homework_help': return <Edit01 size={13} color={color} aria-hidden={true} />;
    case 'school_info': return <Announcement01 size={13} color={color} aria-hidden={true} />;
    case 'activities': return <Trophy01 size={13} color={color} aria-hidden={true} />;
    case 'playdate': return <FaceSmile size={13} color={color} aria-hidden={true} />;
    case 'other': return <DotsHorizontal size={13} color={color} aria-hidden={true} />;
    default: return null;
  }
};

export default function AddParentCornerScreen() {
  const router = useRouter();
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const { communityId, user, profile, isCommunityLead } = useAuth();
  const colors = Verandah;

  const [studentName, setStudentName] = useState('');
  const [institutionType, setInstitutionType] = useState<'school' | 'college' | 'preschool'>('school');
  const [schoolName, setSchoolName] = useState('');
  const [schoolCatalogId, setSchoolCatalogId] = useState<string | null>(null);
  // Starts on the searchable catalog picker; "Other" (or editing an entry with
  // no catalog id) switches to the free-text field.
  const [useFreeTextSchool, setUseFreeTextSchool] = useState(false);
  const [board, setBoard] = useState('CBSE');
  const [gradeClass, setGradeClass] = useState('');
  const [parentName, setParentName] = useState('');
  const [flatNumber, setFlatNumber] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [intents, setIntents] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(!!editId);

  const handleBack = () => {
    goBackSmart(router, '/mcn/parents/add');
  };

  // Auto-fill user profile info if creating new entry
  useEffect(() => {
    async function loadUserProfile() {
      if (!user || editId) return;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, flat_number, phone_number')
          .eq('id', user.id)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          setParentName(data.full_name || '');
          setFlatNumber(data.flat_number || '');
          setContactPhone(data.phone_number || '');
        }
      } catch (err) {
        console.error('Error fetching user profile for pre-fill:', err);
      }
    }

    async function loadExistingEntry() {
      if (!editId) return;
      try {
        setInitialLoading(true);
        const { data, error } = await supabase
          .from('mcn_parent_corner')
          .select('*')
          .eq('id', editId)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          Toast.show({ type: 'error', text1: 'This entry no longer exists' });
          replaceTracked(router, '/mcn/parents' as any);
          return;
        }

        if (data.user_id !== user?.id && !isCommunityLead) {
          Toast.show({ type: 'error', text1: 'You can only edit your own entry' });
          replaceTracked(router, '/mcn/parents' as any);
          return;
        }

        setStudentName(data.student_name);
        setInstitutionType(data.institution_type);
        setSchoolName(data.school_name);
        setSchoolCatalogId((data as any).school_catalog_id ?? null);
        setUseFreeTextSchool(!(data as any).school_catalog_id);
        setBoard(data.board);
        setGradeClass(data.grade_class);
        setParentName(data.parent_name);
        setFlatNumber(data.flat_number);
        setContactPhone(data.contact_phone);
        setIntents(data.intents || []);
        setNotes(data.notes || '');
      } catch (err) {
        console.error('Error loading existing entry:', err);
        Toast.show({ type: 'error', text1: 'Failed to load record details' });
      } finally {
        setInitialLoading(false);
      }
    }

    if (editId) {
      loadExistingEntry();
    } else {
      loadUserProfile();
    }
  }, [user, editId, isCommunityLead]);

  const toggleIntent = (id: string) => {
    setIntents((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleInstitutionTypeChange = (type: 'school' | 'college' | 'preschool') => {
    if (type === institutionType) return;
    setInstitutionType(type);
    // The previously picked school may not fit the new type's catalog level —
    // clear it and go back to the picker (college has no catalog entries, so
    // it always lands on free text).
    setSchoolCatalogId(null);
    setSchoolName('');
    setUseFreeTextSchool(type === 'college');
  };

  const handleSelectCatalogSchool = (school: WestHyderabadSchool) => {
    setSchoolCatalogId(school.id);
    setSchoolName(school.name);
    if (BOARD_OPTIONS.includes(school.syllabus)) {
      setBoard(school.syllabus);
    }
  };

  const handleSubmit = async () => {
    if (!communityId || !user) {
      Toast.show({ type: 'error', text1: 'Community or User session missing' });
      return;
    }

    if (!studentName.trim()) {
      Toast.show({ type: 'error', text1: 'Student Name is required' });
      return;
    }

    if (!schoolName.trim()) {
      Toast.show({ type: 'error', text1: 'School / College Name is required' });
      return;
    }

    if (!gradeClass.trim()) {
      Toast.show({ type: 'error', text1: 'Class / Grade is required' });
      return;
    }

    if (!parentName.trim()) {
      Toast.show({ type: 'error', text1: 'Parent Name is required' });
      return;
    }

    const effectiveFlat = (profile?.flat_number || flatNumber).trim();
    if (!effectiveFlat) {
      Toast.show({
        type: 'error',
        text1: 'Flat number required',
        text2: 'Please set your flat in profile before submitting.',
      });
      router.push('/profile/edit' as any);
      return;
    }

    const normalizedPhone = normalizeIndianMobile(contactPhone);
    if (!normalizedPhone) {
      Toast.show({ type: 'error', text1: 'Invalid phone number', text2: 'Enter a valid 10-digit Indian mobile number.' });
      return;
    }

    setLoading(true);
    try {
      const fields = {
        student_name: studentName.trim(),
        institution_type: institutionType,
        school_name: schoolName.trim(),
        school_catalog_id: institutionType === 'college' ? null : schoolCatalogId,
        board: board.trim(),
        grade_class: gradeClass.trim(),
        parent_name: parentName.trim(),
        flat_number: effectiveFlat.toUpperCase(),
        contact_phone: normalizedPhone,
        intents,
        notes: notes.trim() || null,
      };

      if (editId) {
        const { data, error } = await supabase
          .from('mcn_parent_corner')
          .update({ ...fields, updated_at: new Date().toISOString() })
          .eq('id', editId)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          Toast.show({
            type: 'error',
            text1: 'Could not save',
            text2: 'This entry may have been removed, or it is not yours to edit.',
          });
          return;
        }
        Toast.show({ type: 'success', text1: 'Child details updated' });
      } else {
        const { error } = await supabase
          .from('mcn_parent_corner')
          .insert({ ...fields, community_id: communityId, user_id: user.id });
        if (error) throw error;
        Toast.show({ type: 'success', text1: 'Child details added to Parent Corner' });
      }

      replaceTracked(router, '/mcn/parents' as any);
    } catch (err: any) {
      console.error('Error saving parent corner record:', err);
      Toast.show({ type: 'error', text1: err.message || 'Failed to save details' });
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <View style={[styles.loaderContainer, { backgroundColor: colors.surface }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: editId ? 'Edit Child Details' : 'Add Child Details',
          onBack: handleBack,
        })}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Card Header Banner */}
        <View style={[styles.headerBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.bannerIconWrap}>
            <AppIcon name="users" size={24} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: colors.textPrimary }]}>Parent Corner Registration</Text>
            <Text style={[styles.bannerSubtitle, { color: colors.textSecondary }]}>
              Help neighborhood parents connect for school news, carpooling, & study groups.
            </Text>
          </View>
        </View>

        {/* Child's Name */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Child's Full Name *</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.textPrimary }]}
            placeholder="e.g. Aarav Sharma"
            placeholderTextColor={colors.textMuted}
            value={studentName}
            onChangeText={setStudentName}
            maxLength={60}
          />
        </View>

        {/* Institution Type Selector */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Institution Type</Text>
          <View style={styles.typeSegmentRow}>
            {INSTITUTION_TYPES.map((t) => {
              const isActive = institutionType === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    styles.typeBtn,
                    { borderColor: colors.border, backgroundColor: colors.card },
                    isActive && { backgroundColor: colors.accentSoft, borderColor: colors.accent },
                  ]}
                  onPress={() => handleInstitutionTypeChange(t.id as any)}
                >
                  <View style={styles.iconLabelRow}>
                    <AppIcon name={t.icon} size={12} />
                    <Text style={[styles.typeBtnText, { color: isActive ? colors.accent : colors.textSecondary }]}>
                      {t.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* School / College Name */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>School / College Name *</Text>
          {institutionType === 'college' || useFreeTextSchool ? (
            <>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.textPrimary }]}
                placeholder={institutionType === 'college' ? 'e.g. Osmania University' : 'e.g. Delhi Public School (East)'}
                placeholderTextColor={colors.textMuted}
                value={schoolName}
                onChangeText={(text) => {
                  setSchoolName(text);
                  setSchoolCatalogId(null);
                }}
                maxLength={100}
              />
              {institutionType !== 'college' && (
                <TouchableOpacity
                  style={{ marginTop: 6 }}
                  onPress={() => {
                    setUseFreeTextSchool(false);
                    setSchoolName('');
                  }}
                >
                  <Text style={[styles.suggestionChipText, { color: colors.accent }]}>Choose from school list instead</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <SchoolPicker
              value={schoolCatalogId}
              displayName={schoolName}
              levelFilter={SCHOOL_LEVEL_FILTER[institutionType]}
              onSelect={handleSelectCatalogSchool}
              onSelectOther={() => {
                setUseFreeTextSchool(true);
                setSchoolCatalogId(null);
              }}
            />
          )}
        </View>

        {/* Board / Curriculum */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Board / Curriculum *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {BOARD_OPTIONS.map((b) => {
              const isActive = board === b;
              return (
                <TouchableOpacity
                  key={b}
                  style={[
                    styles.boardChip,
                    { borderColor: colors.border, backgroundColor: colors.card },
                    isActive && { backgroundColor: colors.accentSoft, borderColor: colors.primary },
                  ]}
                  onPress={() => setBoard(b)}
                >
                  <Text style={[styles.boardChipText, { color: isActive ? colors.primary : colors.textSecondary }]}>
                    {b}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Grade / Class & Section */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Class / Grade & Section *</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.textPrimary }]}
            placeholder="e.g. Class 8 - B  or  2nd Year B.Tech (CSE)"
            placeholderTextColor={colors.textMuted}
            value={gradeClass}
            onChangeText={setGradeClass}
            maxLength={40}
          />
        </View>

        {/* Parent Details Section */}
        <View style={[styles.sectionDivider, { borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PARENT CONTACT DETAILS</Text>
        </View>

        {/* Parent Name */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Parent Name *</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.textPrimary }]}
            placeholder="e.g. Venkat"
            placeholderTextColor={colors.textMuted}
            value={parentName}
            onChangeText={setParentName}
            maxLength={60}
          />
        </View>

        {/* Flat / House Number */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Flat / Unit Number *</Text>
          {(profile?.flat_number || flatNumber) ? (
            <View style={[styles.input, { justifyContent: 'center', borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.textPrimary, ...VerandahType.body }}>{profile?.flat_number || flatNumber}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.input, { justifyContent: 'center', borderColor: Verandah.caution, backgroundColor: Verandah.cautionSoft }]}
              onPress={() => router.push('/profile/edit' as any)}
              activeOpacity={0.85}
            >
              <Text style={{ color: Verandah.caution, ...VerandahType.captionBold }}>
                + Set your flat in profile to continue
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Contact Phone */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Parent Phone Number (For WhatsApp / Call) *</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.textPrimary }]}
            placeholder="e.g. 9876543210"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            value={contactPhone}
            onChangeText={setContactPhone}
            onBlur={() => setContactPhone((prev) => toLast10Digits(prev))}
            maxLength={15}
          />
        </View>

        {/* Looking For / Intent Tags */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Looking For (Select all that apply)</Text>
          <View style={styles.intentGrid}>
            {INTENT_OPTIONS.map((opt) => {
              const isActive = intents.includes(opt.id);
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.boardChip,
                    { borderColor: colors.borderHair, backgroundColor: colors.card },
                    isActive && { backgroundColor: Verandah.cardMuted, borderColor: colors.primary },
                  ]}
                  onPress={() => toggleIntent(opt.id)}
                >
                  <View style={styles.iconLabelRow}>
                    {renderIntentAddIcon(opt.id, isActive ? colors.primary : colors.textSecondary)}
                    <Text style={[styles.boardChipText, { color: isActive ? colors.primary : colors.textSecondary }]}>
                      {opt.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Optional Notes / Purpose */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Notes / Intentions (Optional)</Text>
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              { borderColor: colors.border, backgroundColor: colors.card, color: colors.textPrimary },
            ]}
            placeholder={
              intents.includes('other')
                ? "Tell us more about what you're looking for..."
                : 'e.g. Interested in morning carpooling, open for Class 10 Math study group...'
            }
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
            value={notes}
            onChangeText={setNotes}
            maxLength={300}
          />
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: colors.primary }, loading && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={colors.primaryFg} />
          ) : (
            <Text style={[styles.submitBtnText, { color: colors.primaryFg }]}>
              {editId ? 'Save Changes' : 'Add to Parent Corner'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 0,
    paddingBottom: 24,
  },
  headerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    marginBottom: 4,
  },
  bannerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  bannerTitle: {
    ...VerandahType.title,
    fontSize: 15,
    marginBottom: 1,
  },
  bannerSubtitle: {
    ...VerandahType.caption,
    fontSize: 11,
  },
  inputGroup: {
    marginBottom: 10,
  },
  label: {
    ...VerandahType.bodyBold,
    marginBottom: 4,
    fontSize: 12,
  },
  input: {
    height: 40,
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  textArea: {
    height: 56,
    paddingTop: 8,
    paddingBottom: 8,
    textAlignVertical: 'top',
  },
  typeSegmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  typeBtnText: {
    ...VerandahType.bodyBold,
    fontSize: 11,
  },
  iconLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  suggestionChipText: {
    ...VerandahType.caption,
    fontSize: 11,
  },
  intentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  boardChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: VerandahRadius.pill,
    borderWidth: 1,
  },
  boardChipText: {
    ...VerandahType.captionBold,
    fontSize: 11,
  },
  sectionDivider: {
    marginTop: 4,
    marginBottom: 10,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  sectionTitle: {
    ...VerandahType.sectionLabel,
  },
  submitBtn: {
    height: 42,
    borderRadius: VerandahRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  submitBtnText: {
    ...VerandahType.title,
    fontSize: 14,
  },
});
