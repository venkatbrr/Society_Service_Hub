/**
 * Borrow & share composer — `/mcn/add`.
 *
 * Hidden, not removed: `BORROW_SHARE_ENABLED` gates every entry point (the MCN
 * hub card and the My Submissions FAB), but the route stays reachable by URL so
 * the feature can be QA'd before the flag flips. See
 * `docs/hidden-features/mcn-schools-and-borrow.md`.
 *
 * This screen was replaced by a bare `<Redirect href="/(tabs)/network" />` in
 * commit ce09600 (2026-08-01) — before the feature was flagged off — which quietly
 * broke the "flip the flag and it comes back" contract: with the flag on, the
 * FAB opened a screen that bounced straight back to the hub and there was no way
 * to create a borrow post at all. Restored here from 7d52f0e, with the routes
 * updated from `/network/*` to `/mcn/*` and the header wired to the shared MCN
 * header + `goBackSmart()` like every other screen in this folder.
 *
 * `kind` is fixed to `'borrow'`. `mcn_posts.kind` also allows `'business'`, but
 * community businesses moved to `mcn_listings` long ago and nothing renders a
 * business-kind post any more — writing one would create an invisible row.
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
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
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { buildMcnHeaderOptions } from '../../lib/mcnHeader';
import { goBackSmart } from '../../lib/navigation';
import { toLast10Digits } from '../../lib/phone';
import { supabase } from '../../lib/supabase';

export default function AddPostScreen() {
  const { source } = useLocalSearchParams<{ kind?: string; source?: string }>();
  const router = useRouter();
  const { communityId, user } = useAuth();
  const colors = Verandah;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contactHint, setContactHint] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleBack = () => {
    goBackSmart(router, `/mcn/add${source ? `?source=${source}` : ''}`);
  };

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Toast.show({ type: 'error', text1: 'Title required' });
      return;
    }

    if (!communityId || !user) {
      Toast.show({ type: 'error', text1: 'Not authenticated' });
      return;
    }

    // A borrow post with no way to reach the owner is a dead end for whoever
    // wants the ladder, so contact info is mandatory here.
    let finalContact = contactHint.trim();
    if (!finalContact) {
      Toast.show({ type: 'error', text1: 'Contact info is required for Borrow & Share posts' });
      return;
    }
    // Free text is allowed ("knock on A101"), but a phone number is stored as a
    // bare 10 digits so the contact affordance can turn it into a WhatsApp link.
    const last10 = toLast10Digits(finalContact);
    if (last10.length === 10 && /^[\d\s+()-]+$/.test(finalContact)) {
      finalContact = last10;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('mcn_posts').insert({
        community_id: communityId,
        user_id: user.id,
        kind: 'borrow',
        title: trimmedTitle,
        description: description.trim() || null,
        contact_hint: finalContact,
        is_available: true,
      });

      if (error) throw error;

      Toast.show({ type: 'success', text1: 'Post added' });
      // replace(), not push(): the composer should not sit in the back stack
      // once the post exists, or back lands on a form that would create a
      // duplicate.
      router.replace((source === 'my-posts' ? '/mcn/my-posts?segment=borrow' : '/network') as any);
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to add post', text2: error?.message });
    } finally {
      setIsSubmitting(false);
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
          title: 'Borrow & Share',
          onBack: handleBack,
        })}
      />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>
            Post title <Text style={{ color: colors.danger }}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="e.g. Ladder to borrow, Baby stroller — free"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea, { borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="Add item condition, borrowing duration, and return notes..."
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={280}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>
            Contact info <Text style={{ color: colors.danger }}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="Phone number, or where to reach you"
            placeholderTextColor={colors.textMuted}
            value={contactHint}
            onChangeText={setContactHint}
            maxLength={80}
          />
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: colors.primary }, isSubmitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.primaryFg} />
          ) : (
            <Text style={[styles.submitText, { color: colors.primaryFg }]}>Add post</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: VerandahLayout.mcnHeaderToContentGap,
    paddingBottom: 60,
  },
  field: {
    marginBottom: 18,
  },
  label: {
    ...VerandahType.sectionLabel,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: {
    minHeight: 96,
    paddingTop: 10,
  },
  submitBtn: {
    paddingVertical: 14,
    borderRadius: VerandahRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitText: {
    ...VerandahType.bodyBold,
    fontSize: 15,
  },
});
