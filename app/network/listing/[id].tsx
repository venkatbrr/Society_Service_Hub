import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Linking from 'expo-linking';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../../../components/Avatar';
import { Rupees } from '../../../components/Rupees';
import { Verandah } from '../../../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';

interface Product {
  id: string;
  name: string;
  description: string | null;
  unit: 'kg' | 'piece' | 'litre' | 'dozen' | 'box' | 'pack';
  price: number;
  is_available: boolean;
}

interface Listing {
  id: string;
  name: string;
  description: string | null;
  contact_phone: string | null;
  owner_id: string;
  profiles: { full_name: string; flat_number: string | null; phone_number: string | null } | null;
}

interface CartItem {
  productId: string;
  name: string;
  price: number;
  unit: string;
  quantity: number;
}

export default function ListingDetailScreen() {
  const { id: listingId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, communityId, profile, refreshSession } = useAuth();
  const colors = Verandah;
  const scrollViewRef = useRef<ScrollView>(null);

  const [listing, setListing] = useState<Listing | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [existingOrder, setExistingOrder] = useState<any | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [buyerNote, setBuyerNote] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchListingData = useCallback(async () => {
    if (!listingId || !user?.id) return;
    try {
      // 1. Fetch listing details and owner profile
      const { data: listingData, error: listingError } = await supabase
        .from('mcn_listings')
        .select(`
          *,
          profiles!owner_id(full_name, flat_number, phone_number)
        `)
        .eq('id', listingId)
        .single();

      if (listingError) throw listingError;
      setListing(listingData as unknown as Listing);

      // 2. Fetch products for this listing
      const { data: productsData, error: productsError } = await supabase
        .from('mcn_products')
        .select('*')
        .eq('listing_id', listingId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (productsError) throw productsError;
      setProducts(productsData as Product[]);

      // 3. Fetch existing pending order (if any)
      const { data: orderData, error: orderError } = await supabase
        .from('mcn_orders')
        .select('*, mcn_order_items(*)')
        .eq('listing_id', listingId)
        .eq('buyer_id', user.id)
        .eq('status', 'pending')
        .maybeSingle();

      if (orderError) throw orderError;
      setExistingOrder(orderData);

      if (orderData) {
        setBuyerNote(orderData.buyer_note || '');
        setBuyerPhone(orderData.buyer_phone || '');
        const existingQuantities: Record<string, number> = {};
        orderData.mcn_order_items.forEach((item: any) => {
          existingQuantities[item.product_id] = Number(item.quantity);
        });
        setQuantities(existingQuantities);
      } else {
        setBuyerPhone(profile?.phone_number || '');
      }
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error loading business details' });
    } finally {
      setLoading(false);
    }
  }, [listingId, user?.id, profile?.phone_number]);

  useEffect(() => {
    fetchListingData();
  }, [fetchListingData]);

  useEffect(() => {
    if (!existingOrder && profile?.phone_number && !buyerPhone) {
      setBuyerPhone(profile.phone_number);
    }
  }, [profile?.phone_number, existingOrder]);

  const handleIncrement = (productId: string, unit: string) => {
    const step = (unit === 'kg' || unit === 'litre') ? 0.5 : 1;
    setQuantities(prev => ({
      ...prev,
      [productId]: Math.min(999, (prev[productId] || 0) + step),
    }));
  };

  const handleDecrement = (productId: string, unit: string) => {
    const step = (unit === 'kg' || unit === 'litre') ? 0.5 : 1;
    setQuantities(prev => {
      const current = prev[productId] || 0;
      const next = current - step;
      if (next <= 0) {
        const nextQuantities = { ...prev };
        delete nextQuantities[productId];
        return nextQuantities;
      }
      return {
        ...prev,
        [productId]: next,
      };
    });
  };

  const selectedItems: CartItem[] = products
    .filter(p => p.is_available && (quantities[p.id] || 0) > 0)
    .map(p => ({
      productId: p.id,
      name: p.name,
      price: Number(p.price),
      unit: p.unit,
      quantity: quantities[p.id],
    }));

  const totalAmount = selectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const contactPhone = listing?.contact_phone || listing?.profiles?.phone_number;

  const handleCall = () => {
    if (!contactPhone) return;
    Linking.openURL(`tel:${contactPhone}`);
  };

  const handleWhatsApp = () => {
    if (!contactPhone) return;
    const itemsText = selectedItems
      .map(item => `- ${item.name} x ${item.quantity} ${item.unit} (₹${(item.price * item.quantity).toFixed(0)})`)
      .join('\n');
    const noteText = buyerNote.trim() ? `\nNote: "${buyerNote.trim()}"` : '';
    const text = encodeURIComponent(
      `Hi ${listing?.profiles?.full_name || 'there'}, I'm interested in placing an order for:\n${itemsText}\nTotal: ₹${totalAmount.toFixed(0)}${noteText}`
    );
    Linking.openURL(`whatsapp://send?phone=91${contactPhone}&text=${text}`);
  };

  const handleSubmit = async () => {
    if (selectedItems.length === 0) {
      Toast.show({ type: 'error', text1: 'Select at least one product' });
      return;
    }

    if (!listingId || !communityId || !user) return;

    const trimmedPhone = buyerPhone.trim().replace(/\D/g, '');
    if (!trimmedPhone || trimmedPhone.length !== 10) {
      Toast.show({ type: 'error', text1: '10-digit contact phone number is required' });
      return;
    }

    setSubmitting(true);
    try {
      if (existingOrder) {
        // 1. Delete old order items
        const { error: deleteError } = await supabase
          .from('mcn_order_items')
          .delete()
          .eq('order_id', existingOrder.id);
        if (deleteError) throw deleteError;

        // 2. Insert new order items
        const { error: insertItemsError } = await supabase
          .from('mcn_order_items')
          .insert(
            selectedItems.map(item => ({
              order_id: existingOrder.id,
              product_id: item.productId,
              quantity: item.quantity,
              unit_price: item.price,
            }))
          );
        if (insertItemsError) throw insertItemsError;

        // 3. Update order notes and phone number
        const { error: updateOrderError } = await supabase
          .from('mcn_orders')
          .update({
            buyer_note: buyerNote.trim() || null,
            buyer_phone: trimmedPhone,
          })
          .eq('id', existingOrder.id);
        if (updateOrderError) throw updateOrderError;

        Toast.show({ type: 'success', text1: 'Order updated!' });
      } else {
        // 1. Insert new order
        const { data: order, error: insertOrderError } = await supabase
          .from('mcn_orders')
          .insert({
            listing_id: listingId,
            community_id: communityId,
            buyer_id: user.id,
            status: 'pending',
            buyer_note: buyerNote.trim() || null,
            buyer_phone: trimmedPhone,
          })
          .select()
          .single();

        if (insertOrderError) throw insertOrderError;

        // 2. Insert order items
        const { error: insertItemsError } = await supabase
          .from('mcn_order_items')
          .insert(
            selectedItems.map(item => ({
              order_id: order.id,
              product_id: item.productId,
              quantity: item.quantity,
              unit_price: item.price,
            }))
          );
        if (insertItemsError) throw insertItemsError;

        Toast.show({ type: 'success', text1: 'Order placed!' });
      }

      // Sync profile phone number if it changed/was empty
      if (profile && profile.phone_number !== trimmedPhone) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ phone_number: trimmedPhone })
          .eq('id', user.id);
        if (!profileError) {
          await refreshSession();
        }
      }

      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      fetchListingData();
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to place order' });
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

  if (!listing) {
    return (
      <View style={styles.loaderWrap}>
        <Text style={{ color: colors.textSecondary }}>Business listing not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollViewRef}
      style={[styles.container, { backgroundColor: colors.surface }]}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: listing.name }} />

      <View style={styles.ownerCard}>
        <Avatar name={listing.profiles?.full_name || 'Resident'} size={48} />
        <View style={styles.ownerInfo}>
          <Text style={[styles.ownerName, { color: colors.textPrimary }]}>
            {listing.profiles?.full_name || 'Resident'}
          </Text>
          <Text style={[styles.ownerFlat, { color: colors.textTertiary }]}>
            {listing.profiles?.flat_number ? `Flat ${listing.profiles.flat_number}` : 'Resident'}
          </Text>
        </View>

        {contactPhone ? (
          <View style={styles.contactActions}>
            <TouchableOpacity onPress={handleCall} style={[styles.contactIconBtn, { borderColor: colors.border }]}>
              <Ionicons name="call-outline" size={20} color={colors.accent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleWhatsApp} style={[styles.contactIconBtn, { borderColor: colors.border }]}>
              <Ionicons name="logo-whatsapp" size={20} color={colors.accent} />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {listing.description ? (
        <View style={styles.descriptionSection}>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {listing.description}
          </Text>
        </View>
      ) : null}

      <View style={styles.divider} />

      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Products</Text>

      <View style={styles.productsList}>
        {products.length === 0 ? (
          <Text style={[styles.emptyProducts, { color: colors.textMuted }]}>
            No products added by the seller yet.
          </Text>
        ) : (
          products.map(product => {
            const qty = quantities[product.id] || 0;
            return (
              <View
                key={product.id}
                style={[
                  styles.productRow,
                  { borderColor: colors.border },
                  !product.is_available && styles.productUnavailable
                ]}
              >
                <View style={styles.productLeft}>
                  <Text style={[styles.productName, { color: colors.textPrimary }]}>{product.name}</Text>
                  {product.description ? (
                    <Text style={[styles.productDesc, { color: colors.textSecondary }]}>{product.description}</Text>
                  ) : null}
                  <View style={styles.priceContainer}>
                    <Rupees amount={Number(product.price)} size="sm" />
                    <Text style={[styles.unitText, { color: colors.textTertiary }]}> / {product.unit}</Text>
                  </View>
                </View>

                {product.is_available ? (
                  <View style={styles.qtyControls}>
                    <TouchableOpacity
                      onPress={() => handleDecrement(product.id, product.unit)}
                      style={[styles.qtyBtn, { borderColor: colors.border }]}
                    >
                      <Ionicons name="remove" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <Text style={[styles.qtyDisplay, { color: colors.textPrimary }]}>
                      {qty > 0 ? `${qty} ${product.unit}` : '0'}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleIncrement(product.id, product.unit)}
                      style={[styles.qtyBtn, { borderColor: colors.border }]}
                    >
                      <Ionicons name="add" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.unavailableBadge}>
                    <Text style={[styles.unavailableText, { color: colors.textMuted }]}>Not available</Text>
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>

      {selectedItems.length > 0 ? (
        <View style={styles.orderSummarySection}>
          <View style={styles.divider} />

          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Add note for seller</Text>
          <TextInput
            style={[styles.noteInput, { borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="Add delivery instruction, preferences, etc."
            placeholderTextColor={colors.textMuted}
            value={buyerNote}
            onChangeText={setBuyerNote}
            maxLength={140}
          />

          <View style={styles.divider} />

          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Contact phone number <Text style={{ color: colors.danger }}>*</Text>
          </Text>
          <TextInput
            style={[styles.noteInput, { borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="10-digit mobile number for calls or WhatsApp"
            placeholderTextColor={colors.textMuted}
            value={buyerPhone}
            onChangeText={setBuyerPhone}
            keyboardType="phone-pad"
            maxLength={15}
          />

          <View style={styles.divider} />

          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Order summary</Text>
          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {selectedItems.map(item => (
              <View key={item.productId} style={styles.summaryRow}>
                <Text style={[styles.summaryItemName, { color: colors.textSecondary }]}>
                  {item.name} <Text style={{ color: colors.textTertiary }}>× {item.quantity} {item.unit}</Text>
                </Text>
                <Rupees amount={item.price * item.quantity} size="sm" />
              </View>
            ))}

            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />

            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.textPrimary }]}>Total amount</Text>
              <Rupees amount={totalAmount} size="md" tone="in" />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color={colors.primaryFg} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: colors.primaryFg }]}>
                {existingOrder ? 'Update order' : 'Place order'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 80,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  ownerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  ownerName: {
    ...VerandahType.bodyBold,
  },
  ownerFlat: {
    ...VerandahType.caption,
    marginTop: 2,
  },
  contactActions: {
    flexDirection: 'row',
    gap: 8,
  },
  contactIconBtn: {
    borderWidth: 1,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  descriptionSection: {
    marginBottom: 16,
  },
  description: {
    ...VerandahType.body,
    lineHeight: 20,
  },
  divider: {
    height: 0.5,
    backgroundColor: Verandah.border,
    marginVertical: 20,
  },
  sectionTitle: {
    ...VerandahType.title,
    fontSize: 16,
    marginBottom: 16,
  },
  productsList: {
    gap: 12,
  },
  emptyProducts: {
    ...VerandahType.body,
    fontStyle: 'italic',
  },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  productUnavailable: {
    opacity: 0.55,
  },
  productLeft: {
    flex: 1,
    marginRight: 16,
  },
  productName: {
    ...VerandahType.bodyBold,
  },
  productDesc: {
    ...VerandahType.caption,
    marginTop: 2,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  unitText: {
    ...VerandahType.caption,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyDisplay: {
    ...VerandahType.captionBold,
    minWidth: 50,
    textAlign: 'center',
  },
  unavailableBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  unavailableText: {
    ...VerandahType.caption,
  },
  orderSummarySection: {
    marginTop: 10,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  summaryCard: {
    borderWidth: 0.5,
    borderRadius: VerandahRadius.lg,
    padding: 16,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryItemName: {
    ...VerandahType.body,
    flex: 1,
  },
  summaryDivider: {
    height: 0.5,
    marginVertical: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    ...VerandahType.bodyBold,
  },
  primaryBtn: {
    height: 52,
    borderRadius: VerandahRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
