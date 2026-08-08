import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { ImageUploader } from '../../../../components/ImageUploader';
import { Rupees } from '../../../../components/Rupees';
import { Verandah } from '../../../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../../../constants/Verandah';
import { useAuth } from '../../../../context/AuthContext';
import { cloudinaryUrl } from '../../../../lib/cloudinary';
import { buildMcnHeaderOptions } from '../../../../lib/mcnHeader';
import { goBackSmart } from '../../../../lib/navigation';
import { supabase } from '../../../../lib/supabase';

interface Product {
  id: string;
  listing_id: string;
  name: string;
  description: string | null;
  unit: 'kg' | 'piece' | 'litre' | 'dozen' | 'box' | 'pack';
  price: number | null;
  item_type: 'product' | 'service';
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
}

type McnCategory = {
  id: string;
  name: string;
  emoji: string;
  sort_order: number;
};

interface Listing {
  id: string;
  name: string;
  description: string | null;
  contact_phone: string | null;
  category_id: string | null;
  category: { name: string; emoji: string } | null;
  image_url: string | null;
  is_active: boolean;
  owner_id: string;
  flagged_for_review_at: string | null;
}

export default function ManageListingScreen() {
  const { id: listingId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, isCommunityLead } = useAuth();
  const colors = Verandah;

  const [listing, setListing] = useState<Listing | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<McnCategory[]>([]);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Listing details editor state
  const [showListingModal, setShowListingModal] = useState(false);
  const [editListingName, setEditListingName] = useState('');
  const [editListingDesc, setEditListingDesc] = useState('');
  const [editListingPhone, setEditListingPhone] = useState('');
  const [editListingCategoryId, setEditListingCategoryId] = useState<string | null>(null);
  const [editListingImageUrl, setEditListingImageUrl] = useState<string | null>(null);
  const [savingListing, setSavingListing] = useState(false);

  // Product editor state
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null); // null means "Add Product"
  const [prodName, setProdName] = useState('');
  const [prodUnit, setProdUnit] = useState<'kg' | 'piece' | 'litre' | 'dozen' | 'box' | 'pack'>('piece');
  const [prodPrice, setProdPrice] = useState('');
  const [prodItemType, setProdItemType] = useState<'product' | 'service'>('product');
  const [prodDesc, setProdDesc] = useState('');
  const [prodImageUrl, setProdImageUrl] = useState<string | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const listingModalScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (showListingModal) {
      setTimeout(() => {
        listingModalScrollRef.current?.scrollTo({ y: 0, animated: false });
      }, 50);
    }
  }, [showListingModal]);

  const handleGoBack = () => {
    goBackSmart(router, `/mcn/listing/manage/${listingId}`);
  };

  const fetchData = useCallback(async () => {
    if (!listingId || !user?.id) return;
    try {
      setLoading(true);
      // Fetch listing details
      const { data: listingData, error: listingError } = await supabase
        .from('mcn_listings')
        .select('*, category:mcn_business_categories(*)')
        .eq('id', listingId)
        .maybeSingle();

      if (listingError) throw listingError;
      if (!listingData) throw new Error('Listing not found');

      // Security check: ensure current user is owner or a community lead
      if (listingData.owner_id !== user.id && !isCommunityLead) {
        Toast.show({ type: 'error', text1: 'Not authorized to manage this listing' });
        router.replace('/mcn/business' as any);
        return;
      }

      const categoryRel = Array.isArray((listingData as any).category)
        ? (listingData as any).category[0] || null
        : (listingData as any).category || null;
      setListing({ ...(listingData as any), category: categoryRel } as Listing);
      setEditListingName(listingData.name);
      setEditListingDesc(listingData.description || '');
      setEditListingPhone(listingData.contact_phone || '');
      setEditListingCategoryId(listingData.category_id || null);
      setEditListingImageUrl((listingData as any).image_url || null);

      // 2. Fetch products
      const { data: productsData, error: productsError } = await supabase
        .from('mcn_products')
        .select('*')
        .eq('listing_id', listingId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (productsError) throw productsError;
      setProducts(productsData as Product[]);

      // 3. Fetch categories for picker
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('mcn_business_categories')
        .select('id, name, emoji, sort_order')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (categoriesError) throw categoriesError;
      setCategories((categoriesData || []) as McnCategory[]);

      // 4. Fetch count of pending orders
      const { count, error: countError } = await supabase
        .from('mcn_orders')
        .select('*', { count: 'exact', head: true })
        .eq('listing_id', listingId)
        .eq('status', 'pending');

      if (countError) throw countError;
      setPendingOrdersCount(count || 0);

    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error loading management panel' });
    } finally {
      setLoading(false);
    }
  }, [listingId, user?.id, isCommunityLead]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!showListingModal) return;
    const timer = setTimeout(() => {
      listingModalScrollRef.current?.scrollTo({ y: 0, animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [showListingModal]);

  const handleToggleActive = async (value: boolean) => {
    if (!listing) return;
    try {
      // Reactivating clears the "hidden for review" flag — a lead has looked
      // at it (or the owner fixed it) and chosen to bring it back.
      const { error } = await supabase
        .from('mcn_listings')
        .update({ is_active: value, flagged_for_review_at: value ? null : listing.flagged_for_review_at })
        .eq('id', listing.id);

      if (error) throw error;
      setListing(prev =>
        prev ? { ...prev, is_active: value, flagged_for_review_at: value ? null : prev.flagged_for_review_at } : null
      );
      Toast.show({
        type: 'success',
        text1: value ? 'Listing is now active' : 'Listing is now paused',
      });
    } catch (error: any) {
      console.error(error);
      // The max-active-listings trigger raises a clean, resident-facing
      // message (e.g. "you can have at most 5 active listings") — show it.
      Toast.show({ type: 'error', text1: 'Failed to update status', text2: error?.message });
    }
  };

  const handleToggleProductAvailable = async (productId: string, value: boolean) => {
    try {
      const { error } = await supabase
        .from('mcn_products')
        .update({ is_available: value })
        .eq('id', productId);

      if (error) throw error;
      setProducts(prev =>
        prev.map(p => (p.id === productId ? { ...p, is_available: value } : p))
      );
      Toast.show({
        type: 'success',
        text1: value ? 'Item marked available' : 'Item marked unavailable',
      });
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to update item status' });
    }
  };

  const handleSaveListingDetails = async () => {
    if (!listing) return;
    const trimmedName = editListingName.trim();
    if (!trimmedName) {
      Toast.show({ type: 'error', text1: 'Business name is required' });
      return;
    }
    if (!editListingCategoryId) {
      Toast.show({ type: 'error', text1: 'Business category is required' });
      return;
    }

    setSavingListing(true);
    try {
      let finalPhone = editListingPhone.trim().replace(/\D/g, '');
      if (!finalPhone) {
        Toast.show({ type: 'error', text1: 'WhatsApp / phone number is required' });
        setSavingListing(false);
        return;
      }
      if (finalPhone.length !== 10) {
        Toast.show({ type: 'error', text1: 'Phone number must be 10 digits' });
        setSavingListing(false);
        return;
      }

      const { error } = await supabase
        .from('mcn_listings')
        .update({
          name: trimmedName,
          description: editListingDesc.trim() || null,
          contact_phone: finalPhone,
          category_id: editListingCategoryId,
          image_url: editListingImageUrl,
        })
        .eq('id', listing.id);

      if (error) throw error;

      Toast.show({ type: 'success', text1: 'Listing updated successfully' });
      setShowListingModal(false);
      fetchData();
    } catch (error: any) {
      console.error(error);
      const isDuplicateCategory = error?.code === '23505' || error?.code === 'unique_violation';
      Toast.show({
        type: 'error',
        text1: isDuplicateCategory ? 'One listing per category' : 'Failed to update listing details',
        text2: isDuplicateCategory
          ? 'You already have another business listed under this category.'
          : undefined,
      });
    } finally {
      setSavingListing(false);
    }
  };

  const handleOpenProductModal = (product: Product | null) => {
    setEditingProduct(product);
    if (product) {
      setProdName(product.name);
      setProdUnit(product.unit);
      setProdPrice(product.price == null ? '' : String(product.price));
      setProdItemType(product.item_type || 'product');
      setProdDesc(product.description || '');
      setProdImageUrl(product.image_url || null);
    } else {
      setProdName('');
      setProdUnit('piece');
      setProdPrice('');
      setProdItemType('product');
      setProdDesc('');
      setProdImageUrl(null);
    }
    setShowProductModal(true);
  };

  const handleSaveProduct = async () => {
    const trimmedName = prodName.trim();
    const trimmedPrice = prodPrice.trim();
    const parsedPrice = trimmedPrice ? parseFloat(trimmedPrice) : null;

    if (!trimmedName) {
      Toast.show({ type: 'error', text1: 'Item name is required' });
      return;
    }
    if (trimmedPrice && (parsedPrice == null || Number.isNaN(parsedPrice) || parsedPrice < 0)) {
      Toast.show({ type: 'error', text1: 'Enter a valid price >= 0' });
      return;
    }

    setSavingProduct(true);
    try {
      if (editingProduct) {
        // Edit service
        const { error } = await supabase
          .from('mcn_products')
          .update({
            name: trimmedName,
            unit: prodUnit,
            price: parsedPrice,
            item_type: prodItemType,
            description: prodDesc.trim() || null,
            image_url: prodImageUrl,
          })
          .eq('id', editingProduct.id);

        if (error) throw error;
        Toast.show({ type: 'success', text1: 'Item updated' });
      } else {
        // Add item
        const nextSortOrder = products.length > 0 ? Math.max(...products.map(p => p.sort_order)) + 1 : 0;
        const { error } = await supabase
          .from('mcn_products')
          .insert({
            listing_id: listingId,
            name: trimmedName,
            unit: prodUnit,
            price: parsedPrice,
            item_type: prodItemType,
            description: prodDesc.trim() || null,
            image_url: prodImageUrl,
            is_available: true,
            sort_order: nextSortOrder,
          });

        if (error) throw error;
        Toast.show({ type: 'success', text1: 'Item added' });
      }

      setShowProductModal(false);
      fetchData();
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to save item' });
    } finally {
      setSavingProduct(false);
    }
  };

  const handleDeleteProduct = (productId: string) => {
    const doDelete = async () => {
      try {
        const { error } = await supabase
          .from('mcn_products')
          .delete()
          .eq('id', productId);

        if (error) {
          if (error.code === '23503') {
            Toast.show({
              type: 'error',
              text1: 'Cannot delete item',
              text2: 'This item has existing references and cannot be deleted.',
            });
          } else {
            throw error;
          }
        } else {
          Toast.show({ type: 'success', text1: 'Item deleted' });
          fetchData();
        }
      } catch (error: any) {
        console.error(error);
        Toast.show({ type: 'error', text1: 'Failed to delete item' });
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Delete item?\n\nAre you sure you want to delete this item?')) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Delete item',
        'Are you sure you want to delete this item?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  const handleDeleteListing = () => {
    if (!listing) return;
    const doDelete = async () => {
      try {
        const { error } = await supabase
          .from('mcn_listings')
          .delete()
          .eq('id', listing.id);

        if (error) {
          if (error.code === '23503') {
            Toast.show({
              type: 'error',
              text1: 'Cannot delete this business',
              text2: 'It has orders in its history. Pause it instead.',
            });
            return;
          }
          throw error;
        }
        Toast.show({ type: 'success', text1: 'Listing deleted' });
        router.replace('/mcn/business' as any);
      } catch (error: any) {
        console.error(error);
        Toast.show({ type: 'error', text1: 'Failed to delete listing', text2: error?.message });
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Delete business listing?\n\nAre you sure you want to delete this business listing? This action cannot be undone.')) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Delete business listing',
        'Are you sure you want to delete this business listing? This action cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={styles.loaderWrap}>
        <Text style={{ color: colors.textSecondary }}>Business listing not found.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: 'Manage listing',
          onBack: handleGoBack,
        })}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Inline Business Details Editor */}
        <View style={[styles.card, { borderColor: colors.border, padding: 12 }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 6 }]}>Edit Business Details</Text>

          <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>Cover Image</Text>
          <View style={{ marginBottom: -10 }}>
            <ImageUploader
              currentImageUrl={editListingImageUrl}
              onImageUploaded={setEditListingImageUrl}
              onImageRemoved={() => setEditListingImageUrl(null)}
              subfolder="listings"
              placeholder="Add or change cover photo (optional)"
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>Business name <Text style={{ color: colors.danger }}>*</Text></Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
              value={editListingName}
              onChangeText={setEditListingName}
              placeholder="e.g. IRA Fashion & Tailoring"
              placeholderTextColor={colors.textMuted}
              maxLength={80}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>About your business / notes</Text>
            <TextInput
              style={[styles.input, styles.textArea, { borderColor: colors.border, color: colors.textPrimary }]}
              value={editListingDesc}
              onChangeText={setEditListingDesc}
              placeholder="Share details, notes, specialties..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              maxLength={280}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>Business category <Text style={{ color: colors.danger }}>*</Text></Text>
            <View style={styles.categoryGrid}>
              {categories.map((category) => {
                const isSelected = editListingCategoryId === category.id;
                return (
                  <TouchableOpacity
                    key={category.id}
                    style={[
                      styles.categoryChip,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                      isSelected && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
                    ]}
                    onPress={() => setEditListingCategoryId(category.id)}
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
            <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
              WhatsApp / phone number <Text style={{ color: colors.danger }}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
              value={editListingPhone}
              onChangeText={setEditListingPhone}
              placeholder="10-digit mobile number"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              maxLength={15}
            />
          </View>

          <TouchableOpacity
            style={[styles.modalPrimaryBtn, { backgroundColor: colors.primary, marginTop: 6 }]}
            onPress={handleSaveListingDetails}
            disabled={savingListing}
            activeOpacity={0.85}
          >
            {savingListing ? (
              <ActivityIndicator color={colors.primaryFg} size="small" />
            ) : (
              <Text style={[styles.modalPrimaryBtnText, { color: colors.primaryFg }]}>Save business details</Text>
            )}
          </TouchableOpacity>
        </View>

        {listing.flagged_for_review_at ? (
          <View style={[styles.toggleRow, { borderColor: colors.danger, backgroundColor: colors.dangerSoft, marginBottom: 10 }]}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleLabel, { color: colors.danger }]}>Hidden pending review</Text>
              <Text style={[styles.toggleDesc, { color: colors.textSecondary }]}>
                Multiple residents reported this listing, so it was automatically hidden. A community lead or
                platform admin can turn it back on below once reviewed.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Listing Active Toggle */}
        <View style={[styles.toggleRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View>
            <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>Listing active</Text>
            <Text style={[styles.toggleDesc, { color: colors.textSecondary }]}>
              Show this business in the community feed
            </Text>
          </View>
          <Switch
            value={listing.is_active}
            onValueChange={handleToggleActive}
            trackColor={{ false: colors.borderStrong, true: colors.accentSoft }}
            thumbColor={listing.is_active ? colors.accent : colors.textMuted}
          />
        </View>

        {/* Services Section */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Products & services</Text>
          <TouchableOpacity
            style={[styles.addProductBtn, { borderColor: colors.border }]}
            onPress={() => handleOpenProductModal(null)}
          >
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text style={[styles.addProductText, { color: colors.primary }]}>Add item</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.productsList}>
          {products.length === 0 ? (
            <View style={styles.emptyProducts}>
              <Text style={[styles.emptyProductsText, { color: colors.textMuted }]}>
                No items added yet. Add products or services for your business.
              </Text>
            </View>
          ) : (
            products.map((product) => (
              <View key={product.id} style={[styles.productRow, { borderColor: colors.border }]}>
                {product.image_url ? (
                  <Image
                    source={{ uri: cloudinaryUrl(product.image_url, { width: 120, height: 120, crop: 'fill' }) }}
                    style={styles.productThumb}
                    contentFit="cover"
                    transition={200}
                  />
                ) : null}
                <View style={styles.productMain}>
                  <Text style={[styles.productName, { color: colors.textPrimary }]}>{product.name}</Text>
                  <View style={styles.productMetaRow}>
                    <View style={[styles.itemTypeBadge, { borderColor: colors.border }]}> 
                      <Text style={[styles.itemTypeBadgeText, { color: colors.textSecondary }]}>
                        {product.item_type === 'service' ? 'Service' : 'Product'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.priceRow}>
                    {product.price == null ? (
                      <Text style={[styles.priceOnRequestText, { color: colors.textTertiary }]}>Price on request</Text>
                    ) : (
                      <>
                        <Rupees amount={Number(product.price)} size="sm" />
                        <Text style={{ color: colors.textTertiary }}> / {product.unit}</Text>
                      </>
                    )}
                  </View>
                  {product.description ? (
                    <Text style={[styles.productDescText, { color: colors.textSecondary }]} numberOfLines={1}>
                      {product.description}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.productActions}>
                  <View style={styles.switchCol}>
                    <Text style={[styles.switchText, { color: colors.textTertiary }]}>
                      {product.is_available ? 'Available' : 'Paused'}
                    </Text>
                    <Switch
                      value={product.is_available}
                      onValueChange={(val) => handleToggleProductAvailable(product.id, val)}
                      style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                      trackColor={{ false: colors.borderStrong, true: colors.accentSoft }}
                      thumbColor={product.is_available ? colors.accent : colors.textMuted}
                    />
                  </View>
                  <TouchableOpacity
                    onPress={() => handleOpenProductModal(product)}
                    style={[styles.actionIconBtn, { borderColor: colors.border }]}
                  >
                    <Ionicons name="pencil-outline" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteProduct(product.id)}
                    style={[styles.actionIconBtn, { borderColor: colors.border }]}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.deleteListingWrap}>
          <TouchableOpacity
            style={[styles.deleteListingBtn, { borderColor: colors.dangerSoft, backgroundColor: colors.dangerSoft }]}
            onPress={handleDeleteListing}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
            <Text style={[styles.deleteListingBtnText, { color: colors.danger }]}>Delete business listing</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* MODAL 1: Listing Details Editor */}
      <Modal visible={showListingModal} transparent animationType="slide" onRequestClose={() => setShowListingModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={[styles.modalCard, { backgroundColor: colors.card }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView ref={listingModalScrollRef} showsVerticalScrollIndicator={false}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Edit business details</Text>

            <ImageUploader
              currentImageUrl={editListingImageUrl}
              onImageUploaded={setEditListingImageUrl}
              onImageRemoved={() => setEditListingImageUrl(null)}
              subfolder="listings"
              placeholder="Add cover photo (optional)"
            />

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>Business name</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
                value={editListingName}
                onChangeText={setEditListingName}
                maxLength={80}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>About your business</Text>
              <TextInput
                style={[styles.input, styles.textArea, { borderColor: colors.border, color: colors.textPrimary }]}
                value={editListingDesc}
                onChangeText={setEditListingDesc}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                maxLength={280}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>Business category <Text style={{ color: colors.danger }}>*</Text></Text>
              <View style={styles.categoryGrid}>
                {categories.map((category) => {
                  const isSelected = editListingCategoryId === category.id;
                  return (
                    <TouchableOpacity
                      key={category.id}
                      style={[
                        styles.categoryChip,
                        { borderColor: colors.border, backgroundColor: colors.surface },
                        isSelected && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
                      ]}
                      onPress={() => setEditListingCategoryId(category.id)}
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
              <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
                WhatsApp / phone number <Text style={{ color: colors.danger }}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
                value={editListingPhone}
                onChangeText={setEditListingPhone}
                keyboardType="phone-pad"
                maxLength={15}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalSecondaryBtn, { borderColor: colors.borderStrong }]}
                onPress={() => setShowListingModal(false)}
                disabled={savingListing}
              >
                <Text style={[styles.modalSecondaryBtnText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalPrimaryBtn, { backgroundColor: colors.primary }]}
                onPress={handleSaveListingDetails}
                disabled={savingListing}
              >
                {savingListing ? (
                  <ActivityIndicator color={colors.primaryFg} />
                ) : (
                  <Text style={[styles.modalPrimaryBtnText, { color: colors.primaryFg }]}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* MODAL 2: Product Creator/Editor */}
      <Modal visible={showProductModal} transparent animationType="slide" onRequestClose={() => setShowProductModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={[styles.modalCard, { backgroundColor: colors.card }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              {editingProduct ? 'Edit item' : 'Add item'}
            </Text>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>Item type</Text>
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
              <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>Name</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
                placeholder="e.g. Banginapalli, Chocolate cake, Mango pickle"
                placeholderTextColor={colors.textMuted}
                value={prodName}
                onChangeText={setProdName}
                maxLength={80}
              />
            </View>

            <View style={styles.rowFields}>
              <View style={[styles.field, { flex: 1.2, marginRight: 10 }]}>
                <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>Price per unit (optional)</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
                  placeholder="Leave empty if price varies"
                  placeholderTextColor={colors.textMuted}
                  value={prodPrice}
                  onChangeText={setProdPrice}
                  keyboardType="numeric"
                />
                <Text style={[styles.priceHintText, { color: colors.textMuted }]}>Leave empty if price varies or is free.</Text>
              </View>

              <View style={[styles.field, { flex: 1 }]}>
                <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>Unit</Text>
                <View style={[styles.pickerContainer, { borderColor: colors.border }]}>
                  {/* Since React Native standard picker is heavy and not styled, we can render 
                      horizontal choices or a simple selection bar to keep Verandah look */}
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
              <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>Description (optional)</Text>
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
                onPress={() => setShowProductModal(false)}
                disabled={savingProduct}
              >
                <Text style={[styles.modalSecondaryBtnText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalPrimaryBtn, { backgroundColor: colors.primary }]}
                onPress={handleSaveProduct}
                disabled={savingProduct}
              >
                {savingProduct ? (
                  <ActivityIndicator color={colors.primaryFg} />
                ) : (
                  <Text style={[styles.modalPrimaryBtnText, { color: colors.primaryFg }]}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
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
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 0,
    paddingBottom: 40,
  },
  headerAction: {
    padding: 8,
  },
  headerBackBtn: {
    marginLeft: 2,
    padding: 6,
  },
  headerActionText: {
    ...VerandahType.captionBold,
  },
  card: {
    padding: 10,
    borderRadius: VerandahRadius.lg,
    borderWidth: 0.5,
    backgroundColor: Verandah.card,
    marginBottom: 8,
  },
  listingName: {
    ...VerandahType.title,
    marginBottom: 4,
  },
  coverImagePreview: {
    width: '100%',
    height: 110,
    borderRadius: VerandahRadius.md,
    marginBottom: 8,
  },
  productThumb: {
    width: 40,
    height: 40,
    borderRadius: VerandahRadius.md,
    marginRight: 8,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    borderRadius: VerandahRadius.pill,
    backgroundColor: Verandah.cardMuted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 6,
  },
  categoryBadgeText: {
    ...VerandahType.caption,
  },
  listingDesc: {
    ...VerandahType.body,
    marginBottom: 6,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  phoneText: {
    ...VerandahType.caption,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: VerandahRadius.lg,
    borderWidth: 0.5,
    marginBottom: 8,
  },
  toggleLabel: {
    ...VerandahType.bodyBold,
  },
  toggleDesc: {
    ...VerandahType.caption,
    marginTop: 1,
  },
  ordersLinkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: VerandahRadius.lg,
    borderWidth: 0.5,
    marginBottom: 10,
  },
  ordersLinkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ordersIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordersTitle: {
    ...VerandahType.bodyBold,
  },
  ordersDesc: {
    ...VerandahType.caption,
    marginTop: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    ...VerandahType.title,
    fontSize: 15,
  },
  addProductBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: VerandahRadius.pill,
  },
  addProductText: {
    ...VerandahType.captionBold,
  },
  emptyProducts: {
    padding: 24,
    alignItems: 'center',
  },
  emptyProductsText: {
    ...VerandahType.body,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  productsList: {
    gap: 12,
  },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  productMain: {
    flex: 1,
    marginRight: 12,
  },
  productName: {
    ...VerandahType.bodyBold,
  },
  productMetaRow: {
    marginTop: 6,
  },
  itemTypeBadge: {
    alignSelf: 'flex-start',
    borderRadius: VerandahRadius.pill,
    borderWidth: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 3,
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
  },
  productDescText: {
    ...VerandahType.caption,
    marginTop: 4,
  },
  productActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchCol: {
    alignItems: 'center',
    marginRight: 4,
  },
  switchText: {
    ...VerandahType.micro,
  },
  actionIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
    gap: 16,
  },
  modalTitle: {
    ...VerandahType.title,
    marginBottom: 8,
  },
  field: {
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: {
    minHeight: 70,
  },
  rowFields: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 46,
    justifyContent: 'center',
    marginBottom: 6,
  },
  categoryChipText: {
    ...VerandahType.caption,
    lineHeight: 18,
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
    height: 52,
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
    height: 52,
  },
  modalPrimaryBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
  deleteListingWrap: {
    marginTop: 32,
    marginBottom: 16,
  },
  deleteListingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: VerandahRadius.pill,
    height: 48,
    paddingHorizontal: 20,
  },
  deleteListingBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
