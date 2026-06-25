import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { Rupees } from '../../../../components/Rupees';
import { Verandah } from '../../../../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../../../../constants/Verandah';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../lib/supabase';

interface Product {
  id: string;
  listing_id: string;
  name: string;
  description: string | null;
  unit: 'kg' | 'piece' | 'litre' | 'dozen' | 'box' | 'pack';
  price: number;
  is_available: boolean;
  sort_order: number;
}

interface Listing {
  id: string;
  name: string;
  description: string | null;
  contact_phone: string | null;
  is_active: boolean;
  owner_id: string;
}

export default function ManageListingScreen() {
  const { id: listingId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const colors = Verandah;

  const [listing, setListing] = useState<Listing | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Listing details editor state
  const [showListingModal, setShowListingModal] = useState(false);
  const [editListingName, setEditListingName] = useState('');
  const [editListingDesc, setEditListingDesc] = useState('');
  const [editListingPhone, setEditListingPhone] = useState('');
  const [savingListing, setSavingListing] = useState(false);

  // Product editor state
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null); // null means "Add Product"
  const [prodName, setProdName] = useState('');
  const [prodUnit, setProdUnit] = useState<'kg' | 'piece' | 'litre' | 'dozen' | 'box' | 'pack'>('piece');
  const [prodPrice, setProdPrice] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [savingProduct, setSavingProduct] = useState(false);

  const fetchData = useCallback(async () => {
    if (!listingId || !user?.id) return;
    try {
      // 1. Fetch listing details
      const { data: listingData, error: listingError } = await supabase
        .from('mcn_listings')
        .select('*')
        .eq('id', listingId)
        .single();

      if (listingError) throw listingError;
      
      // Security check: ensure current user is owner
      if (listingData.owner_id !== user.id) {
        Toast.show({ type: 'error', text1: 'Not authorized to manage this listing' });
        router.replace('/(tabs)/network');
        return;
      }

      setListing(listingData as Listing);
      setEditListingName(listingData.name);
      setEditListingDesc(listingData.description || '');
      setEditListingPhone(listingData.contact_phone || '');

      // 2. Fetch products
      const { data: productsData, error: productsError } = await supabase
        .from('mcn_products')
        .select('*')
        .eq('listing_id', listingId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (productsError) throw productsError;
      setProducts(productsData as Product[]);

      // 3. Fetch count of pending orders
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
  }, [listingId, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggleActive = async (value: boolean) => {
    if (!listing) return;
    try {
      const { error } = await supabase
        .from('mcn_listings')
        .update({ is_active: value })
        .eq('id', listing.id);

      if (error) throw error;
      setListing(prev => prev ? { ...prev, is_active: value } : null);
      Toast.show({
        type: 'success',
        text1: value ? 'Listing is now active' : 'Listing is now paused',
      });
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to update status' });
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
        text1: value ? 'Service marked available' : 'Service marked unavailable',
      });
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to update service status' });
    }
  };

  const handleSaveListingDetails = async () => {
    if (!listing) return;
    const trimmedName = editListingName.trim();
    if (!trimmedName) {
      Toast.show({ type: 'error', text1: 'Business name is required' });
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
        })
        .eq('id', listing.id);

      if (error) throw error;

      Toast.show({ type: 'success', text1: 'Listing updated successfully' });
      setShowListingModal(false);
      fetchData();
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to update listing details' });
    } finally {
      setSavingListing(false);
    }
  };

  const handleOpenProductModal = (product: Product | null) => {
    setEditingProduct(product);
    if (product) {
      setProdName(product.name);
      setProdUnit(product.unit);
      setProdPrice(String(product.price));
      setProdDesc(product.description || '');
    } else {
      setProdName('');
      setProdUnit('piece');
      setProdPrice('');
      setProdDesc('');
    }
    setShowProductModal(true);
  };

  const handleSaveProduct = async () => {
    const trimmedName = prodName.trim();
    const priceNum = parseFloat(prodPrice);

    if (!trimmedName) {
      Toast.show({ type: 'error', text1: 'Service name is required' });
      return;
    }
    if (isNaN(priceNum) || priceNum < 0) {
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
            price: priceNum,
            description: prodDesc.trim() || null,
          })
          .eq('id', editingProduct.id);

        if (error) throw error;
        Toast.show({ type: 'success', text1: 'Service updated' });
      } else {
        // Add service
        const nextSortOrder = products.length > 0 ? Math.max(...products.map(p => p.sort_order)) + 1 : 0;
        const { error } = await supabase
          .from('mcn_products')
          .insert({
            listing_id: listingId,
            name: trimmedName,
            unit: prodUnit,
            price: priceNum,
            description: prodDesc.trim() || null,
            is_available: true,
            sort_order: nextSortOrder,
          });

        if (error) throw error;
        Toast.show({ type: 'success', text1: 'Service added' });
      }

      setShowProductModal(false);
      fetchData();
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to save service' });
    } finally {
      setSavingProduct(false);
    }
  };

  const handleDeleteProduct = (productId: string) => {
    Alert.alert(
      'Delete service',
      'Are you sure you want to delete this service?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('mcn_products')
                .delete()
                .eq('id', productId);

              if (error) {
                // If it fails because of database restriction (restrict foreign key)
                if (error.code === '23503') {
                  Toast.show({
                    type: 'error',
                    text1: 'Cannot delete service',
                    text2: 'This service has existing references and cannot be deleted.',
                  });
                } else {
                  throw error;
                }
              } else {
                Toast.show({ type: 'success', text1: 'Service deleted' });
                fetchData();
              }
            } catch (error: any) {
              console.error(error);
              Toast.show({ type: 'error', text1: 'Failed to delete service' });
            }
          },
        },
      ]
    );
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
        options={{
          title: 'Manage listing',
          headerRight: () => (
            <TouchableOpacity onPress={() => setShowListingModal(true)} style={styles.headerAction}>
              <Text style={[styles.headerActionText, { color: colors.accent }]}>Edit details</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Read-only listing Summary */}
        <View style={[styles.card, { borderColor: colors.border }]}>
          <Text style={[styles.listingName, { color: colors.textPrimary }]}>{listing.name}</Text>
          {listing.description ? (
            <Text style={[styles.listingDesc, { color: colors.textSecondary }]}>{listing.description}</Text>
          ) : null}
          {listing.contact_phone ? (
            <View style={styles.phoneRow}>
              <Ionicons name="call-outline" size={16} color={colors.textTertiary} />
              <Text style={[styles.phoneText, { color: colors.textSecondary }]}>
                {listing.contact_phone}
              </Text>
            </View>
          ) : null}
        </View>

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
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Services</Text>
          <TouchableOpacity
            style={[styles.addProductBtn, { borderColor: colors.border }]}
            onPress={() => handleOpenProductModal(null)}
          >
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text style={[styles.addProductText, { color: colors.primary }]}>Add service</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.productsList}>
          {products.length === 0 ? (
            <View style={styles.emptyProducts}>
              <Text style={[styles.emptyProductsText, { color: colors.textMuted }]}>
                No services added yet. Add services you offer with their prices.
              </Text>
            </View>
          ) : (
            products.map((product) => (
              <View key={product.id} style={[styles.productRow, { borderColor: colors.border }]}>
                <View style={styles.productMain}>
                  <Text style={[styles.productName, { color: colors.textPrimary }]}>{product.name}</Text>
                  <View style={styles.priceRow}>
                    <Rupees amount={Number(product.price)} size="sm" />
                    <Text style={{ color: colors.textTertiary }}> / {product.unit}</Text>
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
      </ScrollView>

      {/* MODAL 1: Listing Details Editor */}
      <Modal visible={showListingModal} transparent animationType="slide" onRequestClose={() => setShowListingModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={[styles.modalCard, { backgroundColor: colors.card }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Edit business details</Text>

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
              {editingProduct ? 'Edit service' : 'Add service'}
            </Text>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>Service name</Text>
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
                <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>Price per unit</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  value={prodPrice}
                  onChangeText={setProdPrice}
                  keyboardType="numeric"
                />
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
    padding: 24,
    paddingBottom: 80,
  },
  headerAction: {
    padding: 8,
  },
  headerActionText: {
    ...VerandahType.captionBold,
  },
  card: {
    padding: 16,
    borderRadius: VerandahRadius.lg,
    borderWidth: 0.5,
    backgroundColor: Verandah.card,
    marginBottom: 16,
  },
  listingName: {
    ...VerandahType.title,
    marginBottom: 6,
  },
  listingDesc: {
    ...VerandahType.body,
    marginBottom: 12,
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
    padding: 16,
    borderRadius: VerandahRadius.lg,
    borderWidth: 0.5,
    marginBottom: 12,
  },
  toggleLabel: {
    ...VerandahType.bodyBold,
  },
  toggleDesc: {
    ...VerandahType.caption,
    marginTop: 2,
  },
  ordersLinkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: VerandahRadius.lg,
    borderWidth: 0.5,
    marginBottom: 20,
  },
  ordersLinkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ordersIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordersTitle: {
    ...VerandahType.bodyBold,
  },
  ordersDesc: {
    ...VerandahType.caption,
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    ...VerandahType.title,
    fontSize: 16,
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
    alignItems: 'center',
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
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
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
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
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
});
