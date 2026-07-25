import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Avatar } from '../../../components/Avatar';
import { Rupees } from '../../../components/Rupees';
import { Verandah } from '../../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';

interface DropItem {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  price: number;
  image_url?: string | null;
}

interface DropDetails {
  id: string;
  title: string;
  description: string | null;
  image_url?: string | null;
  fulfillment_date: string;
  fulfillment_time: string;
  cutoff_at: string;
  max_orders: number | null;
  status: 'open' | 'closed' | 'completed' | 'cancelled';
  created_by: string;
  profiles?: {
    full_name: string | null;
    flat_number: string | null;
    phone_number: string | null;
  } | null;
  mcn_listings?: {
    name: string;
  } | null;
}

export default function PreorderDropDetailScreen() {
  const { id: dropId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, communityId, profile } = useAuth();
  const colors = Verandah;

  const [drop, setDrop] = useState<DropDetails | null>(null);
  const [items, setItems] = useState<DropItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Resident Pre-Order Form
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [flatNumber, setFlatNumber] = useState('');
  const [buyerNote, setBuyerNote] = useState('');

  const [existingOrder, setExistingOrder] = useState<any | null>(null);
  const [existingItems, setExistingItems] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchDropDetails = useCallback(async () => {
    if (!dropId) return;
    try {
      // 1. Fetch drop metadata
      const { data: dropData, error: dropErr } = await supabase
        .from('mcn_preorder_drops')
        .select('*, profiles(full_name, flat_number, phone_number), mcn_listings(name)')
        .eq('id', dropId)
        .maybeSingle();

      if (dropErr) throw dropErr;
      setDrop(dropData as DropDetails);

      // 2. Fetch drop items
      const { data: itemsData, error: itemsErr } = await supabase
        .from('mcn_preorder_items')
        .select('*')
        .eq('drop_id', dropId);

      if (itemsErr) throw itemsErr;
      setItems(itemsData as DropItem[]);

      // 3. Fetch existing order by current user
      if (user?.id) {
        const { data: orderData } = await supabase
          .from('mcn_preorder_orders')
          .select('*, mcn_preorder_order_items(*)')
          .eq('drop_id', dropId)
          .eq('buyer_id', user.id)
          .maybeSingle();

        if (orderData) {
          setExistingOrder(orderData);
          setExistingItems(orderData.mcn_preorder_order_items || []);

          // Seed quantities from existing order
          const qMap: Record<string, number> = {};
          (orderData.mcn_preorder_order_items || []).forEach((row: any) => {
            qMap[row.item_id] = row.quantity;
          });
          setQuantities(qMap);
        }
      }
    } catch (err) {
      console.error('Error fetching drop details:', err);
      Toast.show({ type: 'error', text1: 'Failed to load food drop details' });
    } finally {
      setLoading(false);
    }
  }, [dropId, user?.id]);

  useEffect(() => {
    fetchDropDetails();
  }, [fetchDropDetails]);

  // Pre-fill resident info from profile
  useEffect(() => {
    if (profile) {
      if (profile.full_name) setBuyerName(profile.full_name);
      if (profile.flat_number) setFlatNumber(profile.flat_number);
    }
  }, [profile]);

  const handleQtyChange = (itemId: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[itemId] || 0;
      const updated = Math.max(0, current + delta);
      return { ...prev, [itemId]: updated };
    });
  };

  // Subtotal Calculation
  const subtotal = items.reduce((acc, item) => {
    const qty = quantities[item.id] || 0;
    return acc + qty * item.price;
  }, 0);

  const now = new Date();
  const cutoffDate = drop ? new Date(drop.cutoff_at) : now;
  const isCutoffPassed = now >= cutoffDate;
  const isOpen = drop?.status === 'open' && !isCutoffPassed;

  const handleSubmitOrder = async () => {
    if (!user?.id || !communityId || !dropId) {
      Toast.show({ type: 'error', text1: 'Authentication required' });
      return;
    }

    if (isCreator) {
      Toast.show({
        type: 'error',
        text1: 'Hosts cannot place pre-orders',
        text2: 'You are the host of this food drop.',
      });
      return;
    }

    if (isCutoffPassed || drop?.status !== 'open') {
      Toast.show({
        type: 'error',
        text1: 'Pre-orders are closed for this drop',
        text2: 'The cut-off deadline has passed.',
      });
      return;
    }

    const selectedItems = items.filter((item) => (quantities[item.id] || 0) > 0);
    if (selectedItems.length === 0) {
      Toast.show({ type: 'error', text1: 'Please select at least one item' });
      return;
    }

    if (!flatNumber.trim()) {
      Toast.show({ type: 'error', text1: 'Please enter your flat / house number' });
      return;
    }

    if (!buyerPhone.trim()) {
      Toast.show({ type: 'error', text1: 'Please enter your contact phone number' });
      return;
    }

    setSubmitting(true);
    try {
      // Delete existing order if updating
      if (existingOrder) {
        await supabase
          .from('mcn_preorder_orders')
          .delete()
          .eq('id', existingOrder.id);
      }

      // Insert pre-order
      const { data: orderData, error: orderErr } = await supabase
        .from('mcn_preorder_orders')
        .insert({
          drop_id: dropId,
          community_id: communityId,
          buyer_id: user.id,
          buyer_name: buyerName.trim() || profile?.full_name || 'Resident',
          buyer_phone: buyerPhone.trim(),
          flat_number: flatNumber.trim().toUpperCase(),
          buyer_note: buyerNote.trim() || null,
          total_amount: subtotal,
          status: 'confirmed',
        })
        .select()
        .single();

      if (orderErr) throw orderErr;

      // Insert order items
      const lineItemsPayload = selectedItems.map((item) => ({
        order_id: orderData.id,
        item_id: item.id,
        item_name: item.name,
        quantity: quantities[item.id],
        unit_price: item.price,
      }));

      const { error: lineItemsErr } = await supabase
        .from('mcn_preorder_order_items')
        .insert(lineItemsPayload);

      if (lineItemsErr) throw lineItemsErr;

      Toast.show({
        type: 'success',
        text1: 'Pre-order placed successfully! 🎉',
        text2: 'Your food host will deliver to your flat at the scheduled time.',
      });

      fetchDropDetails();
    } catch (err: any) {
      console.error(err);
      Toast.show({
        type: 'error',
        text1: 'Failed to place pre-order',
        text2: err.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!existingOrder) return;

    const doCancel = async () => {
      try {
        const { error } = await supabase
          .from('mcn_preorder_orders')
          .delete()
          .eq('id', existingOrder.id);
        if (error) throw error;
        Toast.show({ type: 'success', text1: 'Pre-order cancelled' });
        setExistingOrder(null);
        setQuantities({});
      } catch (err) {
        console.error(err);
        Toast.show({ type: 'error', text1: 'Failed to cancel pre-order' });
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Cancel Pre-Order?\n\nAre you sure you want to cancel your pre-order for this drop?')) {
        doCancel();
      }
    } else {
      Alert.alert(
        'Cancel Pre-Order',
        'Are you sure you want to cancel your pre-order for this drop?',
        [
          { text: 'No', style: 'cancel' },
          { text: 'Cancel Order', style: 'destructive', onPress: doCancel },
        ]
      );
    }
  };

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!drop) {
    return (
      <View style={styles.loaderWrap}>
        <Text style={{ color: colors.textSecondary }}>Food drop not found.</Text>
      </View>
    );
  }

  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  const isCreator = drop?.created_by === user?.id;
  const hostName = drop?.profiles?.full_name || drop?.mcn_listings?.name || 'Local Food Host';
  const hostFlat = drop?.profiles?.flat_number ? `Flat ${drop.profiles.flat_number}` : '';

  const fulfillDateObj = new Date(drop?.fulfillment_date || Date.now());
  const fulfillFormatted = fulfillDateObj.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const cutoffFormatted = cutoffDate.toLocaleDateString('en-IN', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleShareDrop = async () => {
    if (!drop) return;
    const message = `🍕 *Food Drop: ${drop.title}*\nHosted by ${hostName}${hostFlat ? ` (${hostFlat})` : ''}\n\n📅 Delivery: ${fulfillFormatted} (${drop.fulfillment_time})\n⏰ Pre-Orders Close: ${cutoffFormatted}\n\nCheck out the menu & place your pre-order in Society Service Hub!`;

    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({ title: drop.title, text: message });
      } else {
        await Share.share({ message, title: drop.title });
      }
    } catch (err) {
      console.error('Error sharing food drop:', err);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          title: drop.title,
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity onPress={handleShareDrop} style={{ padding: 4 }} hitSlop={8}>
                <Ionicons name="share-outline" size={22} color={colors.accent} />
              </TouchableOpacity>

              {isCreator ? (
                <TouchableOpacity
                  onPress={() => router.push(`/network/drops/manage/${drop.id}` as any)}
                  style={{ marginRight: 4 }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.accent }}>
                    Manage Dashboard
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Cover Hero Banner */}
        {drop.image_url ? (
          <TouchableOpacity
            style={styles.heroImageWrap}
            onPress={() => setSelectedImageUrl(drop.image_url || null)}
            activeOpacity={0.9}
          >
            <Image source={{ uri: drop.image_url }} style={styles.heroImage} contentFit="cover" transition={200} />
          </TouchableOpacity>
        ) : null}

        {/* Host Header */}
        <View style={styles.hostCard}>
          <Avatar name={hostName} size={44} />
          <View style={styles.hostMeta}>
            <Text style={styles.hostTitle}>{drop.title}</Text>
            <Text style={styles.hostSub}>
              Hosted by {hostName} {hostFlat ? `(${hostFlat})` : ''}
            </Text>
          </View>
        </View>

        {/* Schedule & Cut-off Banner */}
        <View style={[styles.statusBanner, isOpen ? styles.bannerOpen : styles.bannerClosed]}>
          <Text style={styles.bannerIcon}>{isOpen ? '⏳' : '🔒'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerMainText}>
              {isOpen ? `Pre-Orders Open until ${cutoffFormatted}` : 'Pre-Orders Closed'}
            </Text>
            <Text style={styles.bannerSubText}>
              Delivery: <Text style={{ fontWeight: '600' }}>{fulfillFormatted}</Text> ({drop.fulfillment_time})
            </Text>
          </View>
        </View>

        {drop.description ? (
          <Text style={styles.description}>{drop.description}</Text>
        ) : null}

        {/* Host Notice Banner if current user is the host */}
        {isCreator ? (
          <View style={styles.hostNoticeBox}>
            <Ionicons name="information-circle" size={22} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.hostNoticeTitle}>You are hosting this food drop</Text>
              <Text style={styles.hostNoticeSub}>
                Hosts cannot place pre-orders on their own drop. Use the Manage Dashboard to track resident orders and kitchen prep totals.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <TouchableOpacity
                  style={styles.hostManageBtn}
                  onPress={() => router.push(`/network/drops/manage/${drop.id}` as any)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.hostManageBtnText}>Open Manage Dashboard →</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.hostManageBtn, { backgroundColor: '#FFFFFF', borderWidth: 0.5, borderColor: Verandah.accent }]}
                  onPress={() => router.push(`/network/drops/add?dropId=${drop.id}` as any)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.hostManageBtnText, { color: Verandah.accent }]}>✏️ Edit Drop</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}

        {/* Existing Order Status Card */}
        {existingOrder ? (
          <View style={styles.existingOrderBox}>
            <View style={styles.existingHeader}>
              <Text style={styles.existingTitle}>
                {existingOrder.status === 'fulfilled'
                  ? '✅ Pre-Order Delivered & Fulfilled'
                  : '📦 Your Pre-Order is Confirmed'}
              </Text>
              <Text style={styles.existingStatusText}>
                {existingOrder.status.toUpperCase()}
              </Text>
            </View>

            {existingItems.map((item: any) => (
              <View key={item.id} style={styles.existingItemRow}>
                <Text style={styles.existingItemName}>
                  {item.quantity}x {item.item_name}
                </Text>
                <Rupees amount={item.quantity * item.unit_price} size="sm" />
              </View>
            ))}

            <View style={styles.existingTotalRow}>
              <Text style={styles.existingTotalLabel}>Total Amount (Pay on Delivery):</Text>
              <Rupees amount={existingOrder.total_amount} size="md" tone="in" />
            </View>

            {isOpen && existingOrder.status === 'confirmed' ? (
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelOrder}>
                <Text style={styles.cancelBtnText}>Cancel Pre-Order</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* Menu Items Picker */}
        <Text style={styles.sectionHeader}>
          {isCreator ? 'Items Offered in Your Drop' : 'Select Pre-Order Items'}
        </Text>

        {items.map((item) => {
          const qty = quantities[item.id] || 0;
          return (
            <View key={item.id} style={styles.itemRow}>
              {item.image_url ? (
                <TouchableOpacity
                  onPress={() => setSelectedImageUrl(item.image_url || null)}
                  activeOpacity={0.8}
                >
                  <Image source={{ uri: item.image_url }} style={styles.itemThumb} contentFit="cover" transition={200} />
                </TouchableOpacity>
              ) : null}

              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                {item.description ? (
                  <Text style={styles.itemDesc}>{item.description}</Text>
                ) : null}
                <View style={styles.priceRow}>
                  <Rupees amount={item.price} size="sm" />
                  <Text style={styles.itemUnit}> / {item.unit}</Text>
                </View>
              </View>

              {/* Quantity Counter (Only for residents, not the host) */}
              {isOpen && !isCreator ? (
                <View style={styles.counterRow}>
                  <TouchableOpacity
                    style={[styles.counterBtn, qty === 0 && styles.counterBtnDisabled]}
                    onPress={() => handleQtyChange(item.id, -1)}
                    disabled={qty === 0}
                  >
                    <Text style={styles.counterBtnText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.counterVal}>{qty}</Text>
                  <TouchableOpacity
                    style={styles.counterBtn}
                    onPress={() => handleQtyChange(item.id, 1)}
                  >
                    <Text style={styles.counterBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          );
        })}

        {/* Resident Order Form (if open and not creator) */}
        {isOpen && !isCreator ? (
          <View style={styles.formSection}>
            <Text style={styles.sectionHeader}>Delivery Information</Text>

            <Text style={styles.subLabel}>Your Full Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Full Name"
              placeholderTextColor={colors.textMuted}
              value={buyerName}
              onChangeText={setBuyerName}
            />

            <Text style={[styles.subLabel, { marginTop: 10 }]}>Flat / House Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. A-302, Flat 104"
              placeholderTextColor={colors.textMuted}
              value={flatNumber}
              onChangeText={setFlatNumber}
            />

            <Text style={[styles.subLabel, { marginTop: 10 }]}>Contact Phone Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="10-digit mobile number"
              placeholderTextColor={colors.textMuted}
              value={buyerPhone}
              onChangeText={setBuyerPhone}
              keyboardType="phone-pad"
            />

            <Text style={[styles.subLabel, { marginTop: 10 }]}>Delivery Note (Optional)</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="e.g. Less spicy, call before coming..."
              placeholderTextColor={colors.textMuted}
              value={buyerNote}
              onChangeText={setBuyerNote}
              multiline
            />

            {/* Subtotal & Submit CTA */}
            <View style={styles.summaryBox}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal:</Text>
                <Rupees amount={subtotal} size="md" tone="in" />
              </View>
              <Text style={styles.paymentNote}>Payment mode: Pay on Delivery (UPI / Cash)</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.submitBtn,
                (subtotal === 0 || submitting) && styles.submitBtnDisabled,
              ]}
              onPress={handleSubmitOrder}
              disabled={subtotal === 0 || submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {existingOrder ? 'Update Pre-Order' : 'Submit Pre-Order'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>

      {/* Fullscreen Image Preview Modal */}
      <Modal
        visible={!!selectedImageUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedImageUrl(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedImageUrl(null)}
        >
          {selectedImageUrl ? (
            <Image
              source={{ uri: selectedImageUrl }}
              style={styles.modalImage}
              contentFit="contain"
            />
          ) : null}
          <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setSelectedImageUrl(null)}>
            <Ionicons name="close-circle" size={32} color="#FFFFFF" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  hostCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    padding: 16,
    marginBottom: 14,
  },
  hostMeta: {
    flex: 1,
    marginLeft: 12,
  },
  hostTitle: {
    ...VerandahType.title,
    fontSize: 16,
    color: Verandah.textPrimary,
    marginBottom: 2,
  },
  hostSub: {
    fontSize: 12,
    color: Verandah.textSecondary,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 0.5,
    marginBottom: 14,
    gap: 10,
  },
  bannerOpen: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  bannerClosed: {
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
  },
  bannerIcon: {
    fontSize: 20,
  },
  bannerMainText: {
    fontSize: 13,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  bannerSubText: {
    fontSize: 11,
    color: Verandah.textSecondary,
    marginTop: 1,
  },
  description: {
    ...VerandahType.body,
    fontSize: 13,
    color: Verandah.textSecondary,
    lineHeight: 18,
    marginBottom: 16,
  },
  existingOrderBox: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: Verandah.accent,
    borderRadius: VerandahRadius.lg,
    padding: 14,
    marginBottom: 20,
  },
  existingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  existingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Verandah.accent,
  },
  existingStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: Verandah.accent,
  },
  existingItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  existingItemName: {
    fontSize: 12,
    color: Verandah.textPrimary,
  },
  existingItemPrice: {
    fontSize: 12,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  existingTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#C7D2FE',
    marginTop: 8,
    paddingTop: 6,
  },
  existingTotalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  existingTotalVal: {
    fontSize: 13,
    fontWeight: '700',
    color: Verandah.accent,
  },
  cancelBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  cancelBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.danger,
  },
  sectionHeader: {
    ...VerandahType.sectionLabel,
    color: Verandah.textPrimary,
    marginBottom: 10,
    marginTop: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.md,
    padding: 12,
    marginBottom: 10,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  itemDesc: {
    fontSize: 11,
    color: Verandah.textSecondary,
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: Verandah.textPrimary,
  },
  itemUnit: {
    fontSize: 11,
    color: Verandah.textSecondary,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: VerandahRadius.pill,
    padding: 4,
  },
  counterBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#D1D5DB',
  },
  counterBtnDisabled: {
    opacity: 0.4,
  },
  counterBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  counterVal: {
    fontSize: 14,
    fontWeight: '700',
    color: Verandah.textPrimary,
    minWidth: 16,
    textAlign: 'center',
  },
  formSection: {
    marginTop: 16,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Verandah.textSecondary,
    marginBottom: 4,
  },
  input: {
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: Verandah.textPrimary,
  },
  multiline: {
    minHeight: 48,
  },
  summaryBox: {
    backgroundColor: '#F9FAFB',
    borderWidth: 0.5,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    marginVertical: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  summaryVal: {
    fontSize: 16,
    fontWeight: '700',
    color: Verandah.accent,
  },
  paymentNote: {
    fontSize: 11,
    color: Verandah.textSecondary,
    marginTop: 4,
  },
  hostNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: VerandahRadius.lg,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  hostNoticeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Verandah.accent,
    marginBottom: 2,
  },
  hostNoticeSub: {
    fontSize: 12,
    color: Verandah.textSecondary,
    lineHeight: 17,
    marginBottom: 8,
  },
  hostManageBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Verandah.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: VerandahRadius.pill,
  },
  hostManageBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  submitBtn: {
    backgroundColor: Verandah.accent,
    paddingVertical: 14,
    borderRadius: VerandahRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  heroImageWrap: {
    height: 180,
    borderRadius: VerandahRadius.lg,
    overflow: 'hidden',
    marginBottom: 14,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  itemThumb: {
    width: 48,
    height: 48,
    borderRadius: VerandahRadius.md,
    marginRight: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImage: {
    width: '90%',
    height: '80%',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 40,
    right: 20,
  },
});
