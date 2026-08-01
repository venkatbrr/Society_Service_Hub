import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Verandah } from '../../constants/Colors';
import { VerandahRadius } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function AddPostScreen() {
  const { kind, source } = useLocalSearchParams<{ kind: 'business' | 'borrow'; source?: string }>();
  const router = useRouter();
  const { communityId, user } = useAuth();
  const colors = Verandah;

  const normalizedKind: 'business' | 'borrow' = kind === 'business' ? 'business' : 'borrow';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contactHint, setContactHint] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const headerTitle = normalizedKind === 'business' ? 'Share with neighbours' : 'Borrow & Share';
  const titlePlaceholder = normalizedKind === 'business' 
    ? 'e.g. Homemade pickles, Yoga classes, Laptop repair' 
    : 'e.g. Ladder to borrow, Baby stroller — free';
  const descriptionPlaceholder = normalizedKind === 'business'
    ? 'Add details about your offer...'
    : 'Add item condition, borrowing duration, and return notes...';

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Toast.show({ type: 'error', text1: 'Title required' });
      return;
    }

    if (!communityId || !user) return;

    setIsSubmitting(true);
    try {
      let finalContact = contactHint.trim();
      const digitsOnly = finalContact.replace(/\D/g, '');
      if (digitsOnly.length === 10) {
        finalContact = digitsOnly;
      }

      if (normalizedKind === 'borrow' && !finalContact) {
        Toast.show({ type: 'error', text1: 'Contact info is required for Borrow & Share posts' });
        setIsSubmitting(false);
        return;
      }

      const { error } = await supabase.from('mcn_posts').insert({
        community_id: communityId,
        user_id: user.id,
        kind: normalizedKind,
        title: trimmedTitle,
        description: description.trim() || null,
        contact_hint: finalContact || null,
        is_available: true,
      });

      if (error) throw error;
      
      Toast.show({ type: 'success', text1: 'Post added' });
      if (source === 'my-posts') {
        router.replace('/network/my-posts?segment=borrow' as any);
        return;
      }
      router.replace('/network' as any);
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to add post' });
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
      <Stack.Screen options={{ title: headerTitle }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Post title <Text style={{ color: colors.danger }}>*</Text></Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
            placeholder={titlePlaceholder}
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
            placeholder={descriptionPlaceholder}
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
          <Text style={[styles.label, { color: colors.textPrimary }]}>Contact info {normalizedKind === 'borrow' ? <Text style={{ color: colors.danger }}>*</Text> : null}</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
            placeholder={normalizedKind === 'borrow' ? "Required: phone number or where to reach you" : "e.g. 9876543210 or say 'knock on A101'"}
            placeholderTextColor={colors.textMuted}
            value={contactHint}
            onChangeText={setContactHint}
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
            <Text style={[styles.submitText, { color: colors.primaryFg }]}>Add post</Text>
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
  label: {
    fontSize: 14,
    fontWeight: '500',
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
