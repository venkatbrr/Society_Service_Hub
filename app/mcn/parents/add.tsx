import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackSmart } from '../../../lib/navigation';
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
import { Verandah } from '../../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { buildMcnHeaderOptions } from '../../../lib/mcnHeader';
import { supabase } from '../../../lib/supabase';

const INSTITUTION_TYPES = [
  { id: 'school', label: 'School', icon: 'school' as const },
  { id: 'college', label: 'College', icon: 'graduation' as const },
  { id: 'preschool', label: 'Pre-School', icon: 'baby' as const },
];

const BOARD_OPTIONS = ['CBSE', 'ICSE', 'State Board', 'IB', 'IGCSE', 'PU Board', 'University / Autonomous', 'Other'];

const INTENT_OPTIONS: { id: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'carpool', label: 'Carpooling', icon: 'car-outline' },
  { id: 'study_group', label: 'Study Group', icon: 'people-outline' },
  { id: 'homework_help', label: 'Homework Help', icon: 'pencil-outline' },
  { id: 'school_info', label: 'School Info & Updates', icon: 'megaphone-outline' },
  { id: 'activities', label: 'Sports / Activities Buddy', icon: 'football-outline' },
  { id: 'playdate', label: 'Playdate / Hangout', icon: 'happy-outline' },
  { id: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

const POPULAR_SCHOOL_SUGGESTIONS = [
  'Delhi Public School',
  'National Public School',
  'St. Joseph’s School',
  'Ryan International',
  'Kendriya Vidyalaya',
  'Orchids International',
];

export default function AddParentCornerScreen() {
  const router = useRouter();
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const { communityId, user } = useAuth();
  const colors = Verandah;

  const [studentName, setStudentName] = useState('');
  const [institutionType, setInstitutionType] = useState<'school' | 'college' | 'preschool'>('school');
  const [schoolName, setSchoolName] = useState('');
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
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, flat_number, phone')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        if (data) {
          if (!editId) {
            setParentName(data.full_name || '');
            setFlatNumber(data.flat_number || '');
            setContactPhone(data.phone || '');
          }
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
          .single();

        if (error) throw error;
        if (data) {
          setStudentName(data.student_name);
          setInstitutionType(data.institution_type);
          setSchoolName(data.school_name);
          setBoard(data.board);
          setGradeClass(data.grade_class);
          setParentName(data.parent_name);
          setFlatNumber(data.flat_number);
          setContactPhone(data.contact_phone);
          setIntents(data.intents || []);
          setNotes(data.notes || '');
        }
      } catch (err) {
        console.error('Error loading existing entry:', err);
        Toast.show({ type: 'error', text1: 'Failed to load record details' });
      } finally {
        setInitialLoading(false);
      }
    }

    loadUserProfile();
    if (editId) {
      loadExistingEntry();
    }
  }, [user, editId]);

  const toggleIntent = (id: string) => {
    setIntents((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
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

    if (!flatNumber.trim()) {
      Toast.show({ type: 'error', text1: 'Flat Number is required' });
      return;
    }

    if (!contactPhone.trim()) {
      Toast.show({ type: 'error', text1: 'Contact Phone Number is required' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        community_id: communityId,
        user_id: user.id,
        student_name: studentName.trim(),
        institution_type: institutionType,
        school_name: schoolName.trim(),
        board: board.trim(),
        grade_class: gradeClass.trim(),
        parent_name: parentName.trim(),
        flat_number: flatNumber.trim(),
        contact_phone: contactPhone.trim(),
        intents,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (editId) {
        const { error } = await supabase
          .from('mcn_parent_corner')
          .update(payload)
          .eq('id', editId);
        if (error) throw error;
        Toast.show({ type: 'success', text1: 'Child details updated!' });
      } else {
        const { error } = await supabase
          .from('mcn_parent_corner')
          .insert(payload);
        if (error) throw error;
        Toast.show({ type: 'success', text1: 'Child details added to Parent Corner!' });
      }

      router.replace('/mcn/parents' as any);
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
                  onPress={() => setInstitutionType(t.id as any)}
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
          <TextInput
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.textPrimary }]}
            placeholder="e.g. Delhi Public School (East)"
            placeholderTextColor={colors.textMuted}
            value={schoolName}
            onChangeText={setSchoolName}
          />
          {/* Popular Suggestions */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {POPULAR_SCHOOL_SUGGESTIONS.map((suggestion) => (
                <TouchableOpacity
                  key={suggestion}
                  style={[styles.suggestionChip, { borderColor: colors.border, backgroundColor: colors.cardMuted }]}
                  onPress={() => setSchoolName(suggestion)}
                >
                  <Text style={[styles.suggestionChipText, { color: colors.textSecondary }]}>+ {suggestion}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
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
          />
        </View>

        {/* Flat / House Number */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Flat / Unit Number *</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.textPrimary }]}
            placeholder="e.g. Block A-402"
            placeholderTextColor={colors.textMuted}
            value={flatNumber}
            onChangeText={setFlatNumber}
          />
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
                    { borderColor: colors.border, backgroundColor: colors.card },
                    isActive && { backgroundColor: colors.accentSoft, borderColor: colors.primary },
                  ]}
                  onPress={() => toggleIntent(opt.id)}
                >
                  <View style={styles.iconLabelRow}>
                    <Ionicons
                      name={opt.icon}
                      size={13}
                      color={isActive ? colors.primary : colors.textSecondary}
                    />
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
  suggestionChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: VerandahRadius.pill,
    borderWidth: 1,
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
