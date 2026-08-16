import { useRouter } from 'expo-router';
import React, { useState } from 'react';
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
import { HeaderBackButton } from '../components/HeaderBackButton';
import { ImageUploader } from '../components/ImageUploader';
import { SegmentedSlider } from '../components/SegmentedSlider';
import { Verandah } from '../constants/Colors';
import { VerandahBorder, VerandahLayout, VerandahRadius, VerandahType } from '../constants/Verandah';
import { useAuth } from '../context/AuthContext';
import { goBackSmart } from '../lib/navigation';
import { supabase } from '../lib/supabase';

type FeedbackKind = 'bug' | 'feature';

const SEGMENTS = [
  { key: 'bug' as const, label: 'Bug report' },
  { key: 'feature' as const, label: 'Feature idea' },
];

export default function FeedbackScreen() {
  const router = useRouter();
  const { user, communityId } = useAuth();

  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [message, setMessage] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selfPath = '/feedback';

  const isMessageValid = message.trim().length > 0;

  const handleSubmit = async () => {
    if (!user) {
      Toast.show({ type: 'error', text1: 'You must be signed in to send feedback.' });
      return;
    }

    if (!isMessageValid) {
      Toast.show({ type: 'error', text1: 'Please describe the bug or feature idea.' });
      return;
    }

    try {
      setSubmitting(true);

      const { error } = await supabase.from('feedback_reports').insert({
        user_id: user.id,
        community_id: communityId || null,
        kind,
        message: message.trim(),
        image_url: imageUrl || null,
      });

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: 'Feedback sent',
        text2: 'Thank you for helping us improve Wooru.',
      });

      goBackSmart(router, selfPath);
    } catch (error: any) {
      console.error('Feedback submit error:', error);
      Toast.show({
        type: 'error',
        text1: 'Unable to submit feedback',
        text2: error?.message || 'Please try again later',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      {/* Header */}
      <View style={styles.header}>
        <HeaderBackButton
          onPress={() => goBackSmart(router, selfPath)}
          color={Verandah.textPrimary}
        />
        <Text style={styles.headerTitle}>Bug or feature request</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.introCopy}>
          Have a suggestion or found an issue? Tell us what happened and we will look into it.
        </Text>

        {/* Slider for Bug vs Feature */}
        <View style={styles.segmentWrap}>
          <SegmentedSlider<FeedbackKind>
            segments={SEGMENTS}
            value={kind}
            onChange={setKind}
            accessibilityLabel="Feedback type"
          />
        </View>

        {/* Message Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            {kind === 'bug' ? 'What went wrong?' : 'What would you like to see?'}
            <Text style={styles.requiredAsterisk}> *</Text>
          </Text>
          <TextInput
            style={styles.textArea}
            value={message}
            onChangeText={setMessage}
            placeholder={
              kind === 'bug'
                ? 'Describe what happened and what you expected to see...'
                : 'Describe your idea and how it would help you or your community...'
            }
            placeholderTextColor={Verandah.textMuted}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />
        </View>

        {/* Optional Screenshot */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Screenshot (optional)</Text>
          <ImageUploader
            currentImageUrl={imageUrl}
            onImageUploaded={setImageUrl}
            onImageRemoved={() => setImageUrl(null)}
            subfolder="feedback"
            aspectRatio={16 / 9}
            placeholder="Add screenshot"
          />
        </View>

        {/* Submit CTA */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            (!isMessageValid || submitting) && styles.submitBtnDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!isMessageValid || submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={Verandah.primaryFg} />
          ) : (
            <Text style={styles.submitBtnText}>
              {kind === 'bug' ? 'Submit bug report' : 'Submit feature request'}
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
    backgroundColor: Verandah.paper,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: VerandahLayout.screenPaddingTop,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: Verandah.paper,
  },
  headerTitle: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 24,
    lineHeight: 28,
    color: Verandah.textPrimary,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  introCopy: {
    ...VerandahType.body,
    color: Verandah.textSecondary,
    marginBottom: 16,
  },
  segmentWrap: {
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    ...VerandahType.captionBold,
    color: Verandah.textPrimary,
    marginBottom: 8,
  },
  requiredAsterisk: {
    color: Verandah.danger,
  },
  textArea: {
    ...VerandahType.body,
    backgroundColor: Verandah.cardMuted,
    borderWidth: VerandahBorder.tile,
    borderColor: Verandah.borderHair,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 120,
    color: Verandah.textPrimary,
  },
  submitBtn: {
    backgroundColor: Verandah.primary,
    borderRadius: VerandahRadius.button,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    ...Verandah.shadowRaised,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    ...VerandahType.button,
    color: Verandah.primaryFg,
  },
});
