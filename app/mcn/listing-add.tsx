import { Edit01 } from '@untitledui/icons/Edit01';
import { Plus } from '@untitledui/icons/Plus';
import { Trash01 } from '@untitledui/icons/Trash01';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { ImageUploader } from '../../components/ImageUploader';
import { Rupees } from '../../components/Rupees';
import { Verandah } from '../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { cloudinaryUrl } from '../../lib/cloudinary';
import { buildMcnHeaderOptions } from '../../lib/mcnHeader';
import { goBackSmart, replaceTracked } from '../../lib/navigation';
import { supabase } from '../../lib/supabase';

type McnCategory = { id: string; name: string; emoji: string; sort_order: number };

type ProdUnit = 'kg' | 'piece' | 'litre' | 'dozen' | 'box' | 'pack';

// Items staged on this screen have no row in mcn_products yet — they live in
// local state and are inserted right after the listing is created, so
// residents discover "add your items" while creating rather than after.
type DraftItem = {
  key: string;
  name: string;
  description: string | null;
  unit: ProdUnit;
  price: number | null;
  item_type: 'product' | 'service';
  image_url: string | null;
};

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

  // Staged products & services
  const [items, setItems] = useState<DraftItem[]>([]);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItemKey, setEditingItemKey] = useState<string | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodUnit, setProdUnit] = useState<ProdUnit>('piece');
  const [prodPrice, setProdPrice] = useState('');
  const [prodItemType, setProdItemType] = useState<'product' | 'service'>('product');
  const [prodDesc, setProdDesc] = useState('');
  const [prodImageUrl, setProdImageUrl] = useState<string | null>(null);
  const [prodErrors, setProdErrors] = useState<{ name?: boolean; price?: boolean }>({});

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

  const handleOpenItemModal = (item: DraftItem | null) => {
    setProdErrors({});
    if (item) {
      setEditingItemKey(item.key);
      setProdName(item.name);
      setProdUnit(item.unit);
      setProdPrice(item.price == null ? '' : String(item.price));
      setProdItemType(item.item_type);
      setProdDesc(item.description || '');
      setProdImageUrl(item.image_url);
    } else {
      setEditingItemKey(null);
      setProdName('');
      setProdUnit('piece');
      setProdPrice('');
      setProdItemType('product');
      setProdDesc('');
      setProdImageUrl(null);
    }
    setShowItemModal(true);
  };

  const handleSaveItem = () => {
    const trimmedName = prodName.trim();
    const trimmedPrice = prodPrice.trim();
    const parsedPrice = trimmedPrice ? parseFloat(trimmedPrice) : null;
    const newErrors: { name?: boolean; price?: boolean } = {};

    if (!trimmedName) {
      newErrors.name = true;
    }
    if (trimmedPrice && (parsedPrice == null || Number.isNaN(parsedPrice) || parsedPrice < 0)) {
      newErrors.price = true;
    }

    setProdErrors(newErrors);

    if (newErrors.name) {
      Toast.show({ type: 'error', text1: 'Item name is required' });
      return;
    }
    if (newErrors.price) {
      Toast.show({ type: 'error', text1: 'Enter a valid price >= 0' });
      return;
    }

    const next: DraftItem = {
      key: editingItemKey ?? `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmedName,
      description: prodDesc.trim() || null,
      unit: prodUnit,
      price: parsedPrice,
      item_type: prodItemType,
      image_url: prodImageUrl,
    };

    setItems((prev) => (editingItemKey ? prev.map((it) => (it.key === editingItemKey ? next : it)) : [...prev, next]));
    setShowItemModal(false);
  };

  const handleRemoveItem = (key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key));
  };

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

      // The listing exists by now, so a failed item insert must not be reported
      // as a failed listing — flag it separately and still land on manage,
      // where the resident can add the items again.
      let itemsFailed = false;
      if (items.length > 0) {
        const { error: itemsError } = await supabase.from('mcn_products').insert(
          items.map((item, index) => ({
            listing_id: listing.id,
            name: item.name,
            unit: item.unit,
            price: item.price,
            item_type: item.item_type,
            description: item.description,
            image_url: item.image_url,
            is_available: true,
            sort_order: index,
          }))
        );

        if (itemsError) {
          console.error(itemsError);
          itemsFailed = true;
        }
      }

      if (itemsFailed) {
        Toast.show({
          type: 'error',
          text1: 'Listing created, items could not be saved',
          text2: 'Add your products & services from the manage screen.',
        });
      } else {
        Toast.show({
          type: 'success',
          text1: 'Business listing created',
          text2: items.length > 0 ? `${items.length} item${items.length === 1 ? '' : 's'} added` : undefined,
        });
      }
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

        <View style={styles.field}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.label, { color: colors.textPrimary, marginBottom: 0 }]}>Products & services</Text>
            {items.length > 0 ? (
              <TouchableOpacity
                style={[styles.addItemBtn, { backgroundColor: colors.primary }]}
                onPress={() => handleOpenItemModal(null)}
                activeOpacity={0.85}
              >
                <Plus size={14} color={colors.primaryFg} aria-hidden={true} />
                <Text style={[styles.addItemText, { color: colors.primaryFg }]}>Add item</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* With nothing staged yet the whole empty state is the call to
              action — a muted line plus a small header button was too easy to
              scroll past, which is the reason items moved onto this screen. */}
          {items.length === 0 ? (
            <TouchableOpacity
              style={[styles.addItemCta, { borderColor: colors.primary, backgroundColor: colors.accentSoft }]}
              onPress={() => handleOpenItemModal(null)}
              activeOpacity={0.85}
            >
              <View style={[styles.addItemCtaIcon, { backgroundColor: colors.primary }]}>
                <Plus size={18} color={colors.primaryFg} aria-hidden={true} />
              </View>
              <View style={styles.addItemCtaCopy}>
                <Text style={[styles.addItemCtaTitle, { color: colors.primary }]}>Add your first item</Text>
                <Text style={[styles.addItemCtaHint, { color: colors.textSecondary }]}>
                  List what you sell or offer — customers browse these on your listing. Optional, you can add them later.
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={[styles.itemsBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
              {items.map((item, index) => (
                <View
                  key={item.key}
                  style={[styles.itemRow, { borderColor: colors.borderHair }, index === 0 && { borderTopWidth: 0 }]}
                >
                  {item.image_url ? (
                    <Image
                      source={{ uri: cloudinaryUrl(item.image_url, { width: 120, height: 120, crop: 'fill' }) }}
                      style={styles.itemThumb}
                    />
                  ) : null}
                  <View style={styles.itemMain}>
                    <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={styles.itemMetaRow}>
                      <View style={[styles.itemTypeBadge, { borderColor: colors.borderHair }]}>
                        <Text style={[styles.itemTypeBadgeText, { color: colors.textSecondary }]}>
                          {item.item_type === 'service' ? 'Service' : 'Product'}
                        </Text>
                      </View>
                      {item.price == null ? (
                        <Text style={[styles.priceOnRequestText, { color: colors.textTertiary }]}>Price on request</Text>
                      ) : (
                        <View style={styles.priceRow}>
                          <Rupees amount={Number(item.price)} size="sm" />
                          <Text style={{ color: colors.textTertiary }}> / {item.unit}</Text>
                        </View>
                      )}
                    </View>
                    {item.description ? (
                      <Text style={[styles.itemDescText, { color: colors.textSecondary }]} numberOfLines={1}>
                        {item.description}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.itemActions}>
                    <TouchableOpacity
                      style={[styles.actionIconBtn, { borderColor: colors.borderHair }]}
                      onPress={() => handleOpenItemModal(item)}
                    >
                      <Edit01 size={14} color={colors.textSecondary} aria-hidden={true} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionIconBtn, { borderColor: colors.borderHair }]}
                      onPress={() => handleRemoveItem(item.key)}
                    >
                      <Trash01 size={14} color={colors.danger} aria-hidden={true} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
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

      {/* Item creator / editor — mirrors the one on the manage screen, but
          saves into local state instead of mcn_products. */}
      <Modal visible={showItemModal} transparent animationType="slide" onRequestClose={() => setShowItemModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={[styles.modalCard, { backgroundColor: colors.card }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                {editingItemKey ? 'Edit item' : 'Add item'}
              </Text>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.textPrimary }]}>Item type</Text>
                <View style={styles.itemTypeToggleRow}>
                  {(['product', 'service'] as const).map((itemType) => {
                    const isSelected = prodItemType === itemType;
                    return (
                      <TouchableOpacity
                        key={itemType}
                        style={[
                          styles.itemTypeToggleBtn,
                          { borderColor: colors.border, backgroundColor: colors.surface },
                          isSelected && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
                        ]}
                        onPress={() => setProdItemType(itemType)}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.itemTypeToggleText,
                            { color: colors.textSecondary },
                            isSelected && { color: colors.accent },
                          ]}
                        >
                          {itemType === 'product' ? 'Product' : 'Service'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <ImageUploader
                currentImageUrl={prodImageUrl}
                onImageUploaded={setProdImageUrl}
                onImageRemoved={() => setProdImageUrl(null)}
                subfolder="products"
                compact
                placeholder="Add photo"
              />

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.textPrimary }]}>Name <Text style={{ color: colors.danger }}>*</Text></Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      borderColor: prodErrors.name ? '#DC2626' : colors.border,
                      backgroundColor: prodErrors.name ? '#FEF2F2' : colors.surface,
                      color: colors.textPrimary,
                    },
                  ]}
                  placeholder="e.g. Banginapalli, Chocolate cake, Mango pickle"
                  placeholderTextColor={colors.textMuted}
                  value={prodName}
                  onChangeText={(txt) => {
                    setProdName(txt);
                    if (prodErrors.name) setProdErrors((prev) => ({ ...prev, name: false }));
                  }}
                  maxLength={80}
                />
                {prodErrors.name ? <Text style={styles.errorText}>Item name is required</Text> : null}
              </View>

              <View style={styles.rowFields}>
                <View style={[styles.field, { flex: 1.2, marginRight: 10 }]}>
                  <Text style={[styles.label, { color: colors.textPrimary }]}>Price per unit (optional)</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        borderColor: prodErrors.price ? '#DC2626' : colors.border,
                        backgroundColor: prodErrors.price ? '#FEF2F2' : colors.surface,
                        color: colors.textPrimary,
                      },
                    ]}
                    placeholder="Leave empty if price varies"
                    placeholderTextColor={colors.textMuted}
                    value={prodPrice}
                    onChangeText={(txt) => {
                      setProdPrice(txt);
                      if (prodErrors.price) setProdErrors((prev) => ({ ...prev, price: false }));
                    }}
                    keyboardType="numeric"
                  />
                  {prodErrors.price ? <Text style={styles.errorText}>Enter a valid price (0 or higher)</Text> : null}
                  <Text style={[styles.priceHintText, { color: colors.textMuted }]}>Leave empty if price varies or is free.</Text>
                </View>

                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={[styles.label, { color: colors.textPrimary }]}>Unit</Text>
                  <View style={[styles.pickerContainer, { borderColor: colors.border }]}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unitPickerScroll}>
                      {(['kg', 'piece', 'litre', 'dozen', 'box', 'pack'] as const).map((u) => (
                        <TouchableOpacity
                          key={u}
                          style={[styles.unitChoiceBtn, prodUnit === u && { backgroundColor: colors.primary }]}
                          onPress={() => setProdUnit(u)}
                        >
                          <Text style={[styles.unitChoiceText, { color: prodUnit === u ? colors.primaryFg : colors.textPrimary }]}>
                            {u}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.textPrimary }]}>Description (optional)</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
                  placeholder="Short detail (e.g. 500g box, sweet & ripe)"
                  placeholderTextColor={colors.textMuted}
                  value={prodDesc}
                  onChangeText={setProdDesc}
                  maxLength={140}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalSecondaryBtn, { borderColor: colors.borderStrong }]}
                  onPress={() => setShowItemModal(false)}
                >
                  <Text style={[styles.modalSecondaryBtnText, { color: colors.textPrimary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalPrimaryBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSaveItem}
                >
                  <Text style={[styles.modalPrimaryBtnText, { color: colors.primaryFg }]}>
                    {editingItemKey ? 'Save' : 'Add'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: VerandahRadius.pill,
  },
  addItemText: {
    ...VerandahType.captionBold,
  },
  addItemCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  addItemCtaIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addItemCtaCopy: {
    flex: 1,
  },
  addItemCtaTitle: {
    ...VerandahType.bodyBold,
  },
  addItemCtaHint: {
    ...VerandahType.caption,
    marginTop: 2,
  },
  itemsBox: {
    borderWidth: 1,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderTopWidth: 0.5,
  },
  itemThumb: {
    width: 40,
    height: 40,
    borderRadius: VerandahRadius.md,
    marginRight: 8,
  },
  itemMain: {
    flex: 1,
    marginRight: 8,
  },
  itemName: {
    ...VerandahType.bodyBold,
  },
  itemMetaRow: {
    marginTop: 4,
  },
  itemTypeBadge: {
    alignSelf: 'flex-start',
    borderRadius: VerandahRadius.pill,
    borderWidth: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  itemTypeBadgeText: {
    ...VerandahType.micro,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  priceOnRequestText: {
    ...VerandahType.caption,
    fontStyle: 'italic',
    marginTop: 4,
  },
  itemDescText: {
    ...VerandahType.caption,
    marginTop: 4,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Verandah.borderStrong,
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 24,
    maxHeight: '90%',
  },
  modalTitle: {
    ...VerandahType.title,
    marginBottom: 12,
  },
  itemTypeToggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  itemTypeToggleBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: VerandahRadius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  itemTypeToggleText: {
    ...VerandahType.captionBold,
  },
  rowFields: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  pickerContainer: {
    borderWidth: 1,
    borderRadius: VerandahRadius.md,
    height: 40,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  unitPickerScroll: {
    alignItems: 'center',
    paddingHorizontal: 6,
    gap: 6,
  },
  unitChoiceBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: VerandahRadius.sm,
  },
  unitChoiceText: {
    fontSize: 12,
    fontWeight: '500',
  },
  priceHintText: {
    ...VerandahType.micro,
    marginTop: 6,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  modalSecondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: VerandahRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
  },
  modalSecondaryBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
  modalPrimaryBtn: {
    flex: 1,
    borderRadius: VerandahRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
  },
  modalPrimaryBtnText: {
    fontSize: 14,
    fontWeight: '500',
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
