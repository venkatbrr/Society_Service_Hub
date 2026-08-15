import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { ImageUploader } from '../../components/ImageUploader';
import { Verandah } from '../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { buildMcnHeaderOptions } from '../../lib/mcnHeader';
import { goBackSmart, replaceTracked } from '../../lib/navigation';
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
  const [errors, setErrors] = useState<{ name?: boolean; category?: boolean; phone?: boolean }>({});

  const handleGoBack = () => {
    goBackSmart(router, '/mcn/listing-add');
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
    const newErrors: { name?: boolean; category?: boolean; phone?: boolean } = {};
    const trimmedName = name.trim();
    if (!trimmedName) {
      newErrors.name = true;
    }

    if (!selectedCategoryId) {
      newErrors.category = true;
    }

    let finalPhone = contactPhone.trim().replace(/\D/g, '');
    if (!finalPhone || finalPhone.length !== 10) {
      newErrors.phone = true;
    }

    setErrors(newErrors);

    if (newErrors.name) {
      Toast.show({ type: 'error', text1: 'Business name required' });
      return;
    }

    if (newErrors.category) {
      Toast.show({ type: 'error', text1: 'Business category is required' });
      return;
    }

    if (!communityId || !user) {
      Toast.show({ type: 'error', text1: 'Not authenticated' });
      return;
    }

    if (!finalPhone) {
      Toast.show({ type: 'error', text1: 'WhatsApp / phone number is required' });
      return;
    }
    if (finalPhone.length !== 10) {
      Toast.show({ type: 'error', text1: 'Phone number must be 10 digits' });
      return;
    }

    setIsSubmitting(true);
    try {
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
      replaceTracked(router, `/mcn/listing/manage/${listing.id}` as any);
    } catch (error: any) {
      console.error(error);
      const isDuplicateCategory = error?.code === '23505' || error?.code === 'unique_violation';
      Toast.show({
        type: 'error',
        text1: isDuplicateCategory ? 'One listing per category' : 'Failed to create business listing',
        text2: isDuplicateCategory
          ? 'You already have a business listed under this category. Edit that listing instead of creating another.'
          // The max-active-listings and 1-per-day triggers already raise a
          // clean, resident-facing message — surface it instead of a generic one.
          : error?.message,
      });
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
            style={[
              styles.input,
              {
                borderColor: errors.name ? '#DC2626' : colors.border,
                backgroundColor: errors.name ? '#FEF2F2' : colors.card,
                color: colors.textPrimary,
              },
            ]}
            placeholder="e.g. Ramana's Mango Corner, Lakshmi's Pickles"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={(txt) => {
              setName(txt);
              if (errors.name) setErrors((prev) => ({ ...prev, name: false }));
            }}
            maxLength={80}
          />
          {errors.name ? <Text style={styles.errorText}>Business name is required</Text> : null}
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
          <View style={[styles.categoryGrid, errors.category && styles.categoryGridError]}>
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
                  onPress={() => {
                    setSelectedCategoryId(category.id);
                    if (errors.category) setErrors((prev) => ({ ...prev, category: false }));
                  }}
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
          {errors.category ? <Text style={styles.errorText}>Please select a business category</Text> : null}
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>
            WhatsApp / phone number <Text style={{ color: colors.danger }}>*</Text>
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: errors.phone ? '#DC2626' : colors.border,
                backgroundColor: errors.phone ? '#FEF2F2' : colors.card,
                color: colors.textPrimary,
              },
            ]}
            placeholder="10-digit number. Customers will use this to contact you."
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            value={contactPhone}
            onChangeText={(txt) => {
              setContactPhone(txt);
              if (errors.phone) setErrors((prev) => ({ ...prev, phone: false }));
            }}
            maxLength={15}
          />
          {errors.phone ? <Text style={styles.errorText}>Valid 10-digit phone number is required</Text> : null}
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
    paddingHorizontal: 14,
    paddingTop: 0,
    paddingBottom: 24,
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
  categoryGridError: {
    padding: 6,
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 3,
    fontWeight: '500',
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
