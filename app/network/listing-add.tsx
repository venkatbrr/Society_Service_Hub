import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { ImageUploader } from '../../components/ImageUploader';
import { Verandah } from '../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { buildMcnHeaderOptions } from '../../lib/mcnHeader';
import { supabase } from '../../lib/supabase';

type McnCategory = { id: string; name: string; emoji: string; sort_order: number };

export default function AddListingScreen() {
  const router = useRouter();
  const { communityId, user } = useAuth();
  const colors = Verandah;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [categories, setCategories] = useState<McnCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/network' as any);
  };

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const { data, error } = await supabase
          .from('mcn_business_categories')
          .select('id, name, emoji, sort_order')
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true });

        if (error) throw error;
        setCategories((data || []) as McnCategory[]);
      } catch (error) {
        console.error(error);
        Toast.show({ type: 'error', text1: 'Failed to load business categories' });
      }
    };

    fetchCategories();
  }, []);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Toast.show({ type: 'error', text1: 'Business name required' });
      return;
    }

    if (!selectedCategoryId) {
      Toast.show({ type: 'error', text1: 'Business category is required' });
      return;
    }

    if (!communityId || !user) {
      Toast.show({ type: 'error', text1: 'Not authenticated' });
      return;
    }

    setIsSubmitting(true);
    try {
      let finalPhone = contactPhone.trim().replace(/\D/g, '');
      if (!finalPhone) {
        Toast.show({ type: 'error', text1: 'WhatsApp / phone number is required' });
        setIsSubmitting(false);
        return;
      }
      if (finalPhone.length !== 10) {
        Toast.show({ type: 'error', text1: 'Phone number must be 10 digits' });
        setIsSubmitting(false);
        return;
      }

      const { data: listing, error } = await supabase
        .from('mcn_listings')
        .insert({
          community_id: communityId,
          owner_id: user.id,
          name: trimmedName,
          description: description.trim() || null,
          contact_phone: finalPhone,
          category_id: selectedCategoryId,
          image_url: imageUrl,
          is_active: true,
        })
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!listing) throw new Error('Listing was not returned after insert');

      Toast.show({ type: 'success', text1: 'Business listing created' });
      // Navigate to the manage screen for this listing
      router.replace(`/network/listing/manage/${listing.id}` as any);
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to create business listing' });
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
          title: 'Add business listing',
          onBack: handleGoBack,
        })}
      />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <ImageUploader
          currentImageUrl={imageUrl}
          onImageUploaded={setImageUrl}
          onImageRemoved={() => setImageUrl(null)}
          subfolder="listings"
          placeholder="Add cover photo (optional)"
        />

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>
            Business name <Text style={{ color: colors.danger }}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="e.g. Ramana's Mango Corner, Lakshmi's Pickles"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            maxLength={80}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>About your business</Text>
          <TextInput
            style={[styles.input, styles.textArea, { borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="Describe what you offer, delivery preferences, etc."
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
          <Text style={[styles.label, { color: colors.textPrimary }]}>Business category <Text style={{ color: colors.danger }}>*</Text></Text>
          <View style={styles.categoryGrid}>
            {categories.map((category) => {
              const isSelected = selectedCategoryId === category.id;
              return (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.categoryChip,
                    { borderColor: colors.border, backgroundColor: colors.card },
                    isSelected && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
                  ]}
                  onPress={() => setSelectedCategoryId(category.id)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      { color: colors.textSecondary },
                      isSelected && { color: colors.accent },
                    ]}
                    numberOfLines={2}
                  >
                    {category.emoji} {category.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>
            WhatsApp / phone number <Text style={{ color: colors.danger }}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="10-digit number. Customers will use this to contact you."
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            value={contactPhone}
            onChangeText={setContactPhone}
            maxLength={15}
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
            <Text style={[styles.submitText, { color: colors.primaryFg }]}>Create listing</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  field: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  textArea: {
    minHeight: 64,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  categoryChip: {
    width: '49%',
    borderWidth: 1,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 40,
    justifyContent: 'center',
    marginBottom: 6,
  },
  categoryChipText: {
    ...VerandahType.caption,
    lineHeight: 16,
  },
  submitBtn: {
    marginTop: 8,
    height: 44,
    borderRadius: VerandahRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    fontSize: 15,
    fontWeight: '600',
  },
  headerBackBtn: {
    marginLeft: 2,
    padding: 6,
  },
});
