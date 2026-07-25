import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
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
import { EmojiRating } from '../../../components/EmojiRating';
import { Verandah } from '../../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../../constants/Verandah';
import { GRADE_OPTIONS, SCHOOL_ASPECTS } from '../../../constants/schoolReviewAspects';
import { useAuth } from '../../../context/AuthContext';
import { WEST_HYDERABAD_SCHOOLS } from '../../../data/westHyderabadSchools';
import { supabase } from '../../../lib/supabase';

export default function SubmitSchoolReviewScreen() {
  const { schoolId } = useLocalSearchParams<{ schoolId: string }>();
  const router = useRouter();
  const { user, communityId } = useAuth();
  const colors = Verandah;

  const [schoolName, setSchoolName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existingReviewId, setExistingReviewId] = useState<string | null>(null);

  // Form State
  const [selectedGrade, setSelectedGrade] = useState<string>(GRADE_OPTIONS[0]);
  const [scores, setScores] = useState<Record<string, number>>({
    academics: 4,
    teachers: 4,
    infrastructure: 4,
    safety: 4,
    transport: 4,
    value: 4,
    happiness: 4,
  });
  const [comments, setComments] = useState<Record<string, string>>({
    academics: '',
    teachers: '',
    infrastructure: '',
    safety: '',
    transport: '',
    value: '',
    happiness: '',
  });
  const [overallComment, setOverallComment] = useState<string>('');

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/network/schools' as any);
    }
  };

  useEffect(() => {
    async function loadData() {
      if (!schoolId || !user?.id) return;
      try {
        // Load school name
        if (schoolId.startsWith('wh_school_')) {
          const found = WEST_HYDERABAD_SCHOOLS.find((s) => s.id === schoolId);
          if (found) setSchoolName(found.name);
        } else {
          const { data: schoolData } = await supabase
            .from('schools')
            .select('name')
            .eq('id', schoolId)
            .maybeSingle();
          if (schoolData) setSchoolName(schoolData.name);
        }

        // Load existing review by this user for this school
        const { data: reviewData } = await supabase
          .from('school_reviews')
          .select('*')
          .eq('school_id', schoolId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (reviewData) {
          setExistingReviewId(reviewData.id);
          setSelectedGrade(reviewData.child_grade);
          setScores({
            academics: reviewData.academics_score,
            teachers: reviewData.teachers_score,
            infrastructure: reviewData.infrastructure_score,
            safety: reviewData.safety_score,
            transport: reviewData.transport_score,
            value: reviewData.value_score,
            happiness: reviewData.happiness_score,
          });
          setComments({
            academics: reviewData.academics_comment || '',
            teachers: reviewData.teachers_comment || '',
            infrastructure: reviewData.infrastructure_comment || '',
            safety: reviewData.safety_comment || '',
            transport: reviewData.transport_comment || '',
            value: reviewData.value_comment || '',
            happiness: reviewData.happiness_comment || '',
          });
          if (reviewData.overall_comment) {
            setOverallComment(reviewData.overall_comment);
          }
        }
      } catch (err) {
        console.error('Error loading review setup:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [schoolId, user?.id]);

  const handleScoreChange = (key: string, score: number) => {
    setScores((prev) => ({ ...prev, [key]: score }));
  };

  const handleCommentChange = (key: string, text: string) => {
    setComments((prev) => ({ ...prev, [key]: text }));
  };

  const handleSubmit = async () => {
    if (!user?.id || !communityId || !schoolId) {
      Toast.show({ type: 'error', text1: 'Authentication required' });
      return;
    }

    if (!selectedGrade) {
      Toast.show({ type: 'error', text1: 'Please select your child’s grade' });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        school_id: schoolId,
        user_id: user.id,
        community_id: communityId,
        child_grade: selectedGrade,
        academics_score: scores.academics,
        teachers_score: scores.teachers,
        infrastructure_score: scores.infrastructure,
        safety_score: scores.safety,
        transport_score: scores.transport,
        value_score: scores.value,
        happiness_score: scores.happiness,
        academics_comment: comments.academics.trim() || null,
        teachers_comment: comments.teachers.trim() || null,
        infrastructure_comment: comments.infrastructure.trim() || null,
        safety_comment: comments.safety.trim() || null,
        transport_comment: comments.transport.trim() || null,
        value_comment: comments.value.trim() || null,
        happiness_comment: comments.happiness.trim() || null,
        overall_comment: overallComment.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('school_reviews')
        .upsert(payload, { onConflict: 'user_id,school_id' });

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: existingReviewId ? 'Report card updated!' : 'Report card submitted!',
        text2: 'Thank you for sharing your experience with fellow parents.',
      });

      router.back();
    } catch (err: any) {
      console.error(err);
      Toast.show({
        type: 'error',
        text1: 'Failed to submit report card',
        text2: err.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          title: existingReviewId ? 'Edit report card' : 'Parent report card',
          headerBackVisible: false,
          headerLeft: () => (
            <TouchableOpacity onPress={handleGoBack} style={styles.headerBackBtn} hitSlop={8}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Intro */}
        <View style={styles.introCard}>
          <Text style={styles.schoolName}>{schoolName || 'School'}</Text>
          <Text style={styles.introDesc}>
            Grade this school across 7 key dimensions to help fellow community parents make informed decisions.
          </Text>
        </View>

        {/* Grade Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Child's Grade / Level</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gradeChips}>
            {GRADE_OPTIONS.map((grade) => {
              const active = selectedGrade === grade;
              return (
                <TouchableOpacity
                  key={grade}
                  onPress={() => setSelectedGrade(grade)}
                  style={[styles.gradeChip, active && styles.gradeChipActive]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.gradeChipText, active && styles.gradeChipTextActive]}>
                    {grade}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* 7 Aspects Form */}
        <Text style={styles.sectionTitle}>Rate 7 Key Aspects</Text>

        {SCHOOL_ASPECTS.map((aspect) => (
          <View key={aspect.key} style={styles.aspectCard}>
            <View style={styles.aspectHeader}>
              <Text style={styles.aspectTitle}>
                {aspect.emoji} {aspect.label}
              </Text>
              <Text style={styles.aspectPrompt}>{aspect.prompt}</Text>
            </View>

            {/* Emoji Score Selection */}
            <View style={styles.ratingWrap}>
              <EmojiRating
                score={scores[aspect.key]}
                onScoreSelect={(s) => handleScoreChange(aspect.key, s)}
                size={32}
              />
            </View>

            {/* Optional Comment Input */}
            <TextInput
              style={styles.commentInput}
              placeholder={`Optional note on ${aspect.label.toLowerCase()} (e.g. key pros or cons)...`}
              placeholderTextColor={colors.textMuted}
              value={comments[aspect.key]}
              onChangeText={(txt) => handleCommentChange(aspect.key, txt)}
              maxLength={140}
              multiline
            />
          </View>
        ))}

        {/* Overall Comments / Additional Advice Card */}
        <View style={styles.aspectCard}>
          <View style={styles.aspectHeader}>
            <Text style={styles.aspectTitle}>💬 Overall Comments & Parent Advice</Text>
            <Text style={styles.aspectPrompt}>
              Share any overall feedback, admission tips, or advice for fellow neighborhood parents...
            </Text>
          </View>
          <TextInput
            style={[styles.commentInput, { minHeight: 72 }]}
            placeholder="Optional overall thoughts, admission tips, or advice for neighbor parents..."
            placeholderTextColor={colors.textMuted}
            value={overallComment}
            onChangeText={setOverallComment}
            maxLength={500}
            multiline
          />
        </View>

        {/* Submit CTA */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>
              {existingReviewId ? 'Update Parent Report Card' : 'Submit Parent Report Card'}
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
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBackBtn: {
    marginLeft: 2,
    padding: 6,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  introCard: {
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    padding: 16,
    marginBottom: 20,
  },
  schoolName: {
    ...VerandahType.title,
    color: Verandah.textPrimary,
    marginBottom: 4,
  },
  introDesc: {
    ...VerandahType.body,
    fontSize: 13,
    color: Verandah.textSecondary,
    lineHeight: 18,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    ...VerandahType.sectionLabel,
    color: Verandah.textPrimary,
    marginBottom: 10,
    marginTop: 4,
  },
  gradeChips: {
    gap: 8,
    paddingBottom: 16,
  },
  gradeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: VerandahRadius.pill,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  gradeChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: Verandah.accent,
  },
  gradeChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  gradeChipTextActive: {
    color: Verandah.accent,
    fontWeight: '600',
  },
  aspectCard: {
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    padding: 16,
    marginBottom: 16,
  },
  aspectHeader: {
    marginBottom: 12,
  },
  aspectTitle: {
    ...VerandahType.bodyBold,
    fontSize: 15,
    color: Verandah.textPrimary,
    marginBottom: 2,
  },
  aspectPrompt: {
    fontSize: 12,
    color: Verandah.textSecondary,
  },
  ratingWrap: {
    marginVertical: 8,
    alignItems: 'center',
  },
  commentInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 0.5,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    color: Verandah.textPrimary,
    minHeight: 48,
    marginTop: 10,
  },
  submitBtn: {
    backgroundColor: Verandah.accent,
    paddingVertical: 14,
    borderRadius: VerandahRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
