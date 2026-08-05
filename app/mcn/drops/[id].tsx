import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackSmart } from '../../../lib/navigation';
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
import { format12HourTime, VerandahRadius, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { buildMcnHeaderOptions } from '../../../lib/mcnHeader';
import { supabase } from '../../../lib/supabase';

interface DropItem {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  price: number;
  image_url?: string | null;
  max_quantity?: number | null;
}

interface DropDetails {
  id: string;
  community_id: string;
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
  const { user, communityId, profile, isCommunityLead } = useAuth();
  const colors = Verandah;

  const [drop, setDrop] = useState<DropDetails | null>(null);
  const [items, setItems] = useState<DropItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Resident Pre-Order Form
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [flatNumber, setFlatNumber] = useState('');
  const [buyerNote, setBuyerNote] = useState('');

  const [userOrders, setUserOrders] = useState<any[]>([]);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  const fetchDropDetails = useCallback(async () => {
    if (!dropId) return;
    try {
      // 1. Fetch drop metadata
      const { data: dropData, error: dropErr } = await supabase
        .from('mcn_preorder_drops')
        .select('*')
        .eq('id', dropId)
        .maybeSingle();

      if (dropErr || !dropData) throw dropErr || new Error('Drop not found');

      // Fetch host profile
      let hostProfile = null;
      if (dropData.created_by) {
        const { data: pData } = await supabase
          .from('profiles')
          .select('full_name, flat_number, phone_number')
          .eq('id', dropData.created_by)
          .maybeSingle();
        hostProfile = pData;
      }

      // Fetch linked business listing if any
      let listingMeta = null;
      if (dropData.listing_id) {
        const { data: lData } = await supabase
          .from('mcn_listings')
          .select('name')
          .eq('id', dropData.listing_id)
          .maybeSingle();
        listingMeta = lData;
      }

      setDrop({
        ...dropData,
        profiles: hostProfile,
        mcn_listings: listingMeta,
      } as DropDetails);

      // 2. Fetch drop items
      const { data: itemsData, error: itemsErr } = await supabase
        .from('mcn_preorder_items')
        .select('*')
        .eq('drop_id', dropId);

      if (itemsErr) throw itemsErr;

      // Deduplicate items by signature to prevent duplicate entries from showing
      const uniqueItemsMap = new Map<string, DropItem>();
      (itemsData || []).forEach((row: any) => {
        const key = `${row.name?.trim().toLowerCase()}_${row.unit}_${row.price}`;
        if (!uniqueItemsMap.has(key)) {
          uniqueItemsMap.set(key, row as DropItem);
        }
      });
      setItems(Array.from(uniqueItemsMap.values()));

      // 3. Fetch all existing orders for this drop by current user
      if (user?.id) {
        const { data: ordersData, error: ordersErr } = await supabase
          .from('mcn_preorder_orders')
          .select('*, mcn_preorder_order_items(*)')
          .eq('drop_id', dropId)
          .eq('buyer_id', user.id)
          .order('created_at', { ascending: false });

        if (!ordersErr && ordersData) {
          setUserOrders(ordersData);

          // Verify if currently editing order is still valid and confirmed
          if (editingOrderId) {
            const activeOrd = ordersData.find((o) => o.id === editingOrderId && o.status === 'confirmed');
            if (!activeOrd) {
              setEditingOrderId(null);
              setQuantities({});
            }
          }
        } else {
          setUserOrders([]);
        }
      }
    } catch (err) {
      console.error('Error fetching drop details:', err);
      Toast.show({ type: 'error', text1: 'Failed to load food drop details' });
    } finally {
      setLoading(false);
    }
  }, [dropId, user?.id, editingOrderId]);

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
    const item = items.find((i) => i.id === itemId);
    const maxQty = item?.max_quantity;

    setQuantities((prev) => {
      const current = prev[itemId] || 0;
      let updated = Math.max(0, current + delta);
      
      if (maxQty !== undefined && maxQty !== null && updated > maxQty) {
        updated = maxQty;
        Toast.show({ type: 'info', text1: 'Maximum item capacity reached' });
      }
      
      return { ...prev, [itemId]: updated };
    });
  };

  const handleStartEditOrder = (order: any) => {
    if (order.status !== 'confirmed') {
      Toast.show({ type: 'info', text1: 'Delivered or cancelled orders cannot be edited' });
      return;
    }
    setEditingOrderId(order.id);
    const qMap: Record<string, number> = {};
    (order.mcn_preorder_order_items || []).forEach((row: any) => {
      qMap[row.item_id] = row.quantity;
    });
    setQuantities(qMap);
    if (order.buyer_name) setBuyerName(order.buyer_name);
    if (order.buyer_phone) setBuyerPhone(order.buyer_phone);
    if (order.flat_number) setFlatNumber(order.flat_number);
    if (order.buyer_note) setBuyerNote(order.buyer_note);
    Toast.show({ type: 'info', text1: 'Editing active pre-order items' });
  };

  const handleCancelEdit = () => {
    setEditingOrderId(null);
    setQuantities({});
    if (profile) {
      if (profile.full_name) setBuyerName(profile.full_name);
      if (profile.flat_number) setFlatNumber(profile.flat_number);
    }
    setBuyerNote('');
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
    if (!dropId) {
      Toast.show({ type: 'error', text1: 'Drop is unavailable' });
      return;
    }

    if (!user?.id) {
      Toast.show({
        type: 'info',
        text1: 'Login required',
        text2: 'You can place an order after login.',
      });
      router.push('/login' as any);
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

    const selectedItemsQty = selectedItems.reduce((sum, item) => sum + (quantities[item.id] || 0), 0);

    if (drop?.max_orders) {
      const { data: capacityData, error: capacityErr } = await supabase.rpc(
        'check_mcn_drop_item_capacity',
        {
          p_drop_id: dropId,
          p_requested_qty: selectedItemsQty,
          p_existing_order_id: editingOrderId || null,
        }
      );

      if (capacityErr) {
        Toast.show({ type: 'error', text1: 'Could not validate available item capacity' });
        return;
      }

      const capacity = Array.isArray(capacityData) ? capacityData[0] : capacityData;
      if (capacity && !capacity.can_place) {
        const maxItems = Number(capacity.max_items || drop.max_orders || 0);
        const remaining = Number(capacity.remaining_capacity || 0);
        Toast.show({
          type: 'error',
          text1: 'Item limit reached',
          text2: `This drop is capped at ${maxItems} total items. Remaining capacity: ${remaining}.`,
        });
        return;
      }
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
      if (editingOrderId) {
        // Update active pre-order
        const { error: orderErr } = await supabase
          .from('mcn_preorder_orders')
          .update({
            buyer_name: buyerName.trim() || profile?.full_name || 'Resident',
            buyer_phone: buyerPhone.trim(),
            flat_number: flatNumber.trim().toUpperCase(),
            buyer_note: buyerNote.trim() || null,
            total_amount: subtotal,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingOrderId)
          .eq('buyer_id', user.id);

        if (orderErr) throw orderErr;

        // Delete existing items for this order and insert updated items
        await supabase
          .from('mcn_preorder_order_items')
          .delete()
          .eq('order_id', editingOrderId);

        const lineItemsPayload = selectedItems.map((item) => ({
          order_id: editingOrderId,
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
          text1: 'Pre-order updated successfully! 🎉',
          text2: 'Your updated food choices have been saved.',
        });
      } else {
        // Insert new pre-order
        const { data: orderData, error: orderErr } = await supabase
          .from('mcn_preorder_orders')
          .insert({
            drop_id: dropId,
            community_id: drop?.community_id || communityId || '',
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
      }

      setEditingOrderId(null);
      setQuantities({});
      setBuyerNote('');
      fetchDropDetails();
    } catch (err: any) {
      console.error(err);
      Toast.show({
        type: 'error',
        text1: editingOrderId ? 'Failed to update pre-order' : 'Failed to place pre-order',
        text2: err.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelOrder = async (targetOrderId: string) => {
    const doCancel = async () => {
      try {
        const { error } = await supabase
          .from('mcn_preorder_orders')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', targetOrderId)
          .eq('buyer_id', user?.id);

        if (error) throw error;
        Toast.show({ type: 'success', text1: 'Pre-order cancelled' });
        if (editingOrderId === targetOrderId) {
          setEditingOrderId(null);
          setQuantities({});
        }
        fetchDropDetails();
      } catch (err) {
        console.error(err);
        Toast.show({ type: 'error', text1: 'Failed to cancel pre-order' });
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Cancel Pre-Order?\n\nAre you sure you want to cancel this pre-order?')) {
        doCancel();
      }
    } else {
      Alert.alert(
        'Cancel Pre-Order',
        'Are you sure you want to cancel this pre-order?',
        [
          { text: 'No', style: 'cancel' },
          { text: 'Cancel Order', style: 'destructive', onPress: doCancel },
        ]
      );
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <Stack.Screen options={{ title: 'Food drop details' }} />
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </View>
    );
  }

  if (!drop) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <Stack.Screen options={{ title: 'Food drop details' }} />
        <View style={styles.loaderWrap}>
          <Text style={{ color: colors.textSecondary }}>Food drop not found.</Text>
        </View>
      </View>
    );
  }

  const isCreator = drop?.created_by === user?.id;
  const canManageDrop = isCreator || isCommunityLead;
  const rawHostName = drop?.profiles?.full_name?.trim() || drop?.mcn_listings?.name?.trim() || 'Local Food Host';
  const hostName = rawHostName === 'Host' ? 'Local Food Host' : rawHostName;
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

  const handleDeleteDrop = () => {
    if (!drop) return;
    const confirmDelete = async () => {
      try {
        const { error } = await supabase.from('mcn_preorder_drops').delete().eq('id', drop.id);
        if (error) throw error;
        Toast.show({ type: 'success', text1: 'Food drop deleted' });
        router.replace('/mcn/drops' as any);
      } catch (err: any) {
        Toast.show({ type: 'error', text1: 'Failed to delete food drop', text2: err.message });
      }
    };

    const title = 'Delete Food Drop?';
    const message = `Are you sure you want to delete "${drop.title}"? All items and pre-orders will be deleted. This cannot be undone.`;

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${title}\n${message}`)) {
        void confirmDelete();
      }
    } else {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete },
      ]);
    }
  };

  const handleShareDrop = async () => {
    if (!drop) return;
    const shareUrl =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? `${window.location.origin}/mcn/drops?id=${drop.id}`
        : `https://society-service-hub.app/mcn/drops?id=${drop.id}`;

    const messageLines = [
      `🍲 *Food Drop: ${drop.title}*`,
      `Hosted by ${hostName}${hostFlat ? ` (${hostFlat})` : ''}`,
      ``,
      `📅 Delivery: ${fulfillFormatted} (${format12HourTime(drop.fulfillment_time)})`,
      `⏰ Pre-Orders Close: ${cutoffFormatted}`,
    ];

    if (drop.image_url) {
      messageLines.push(`🖼️ Photo: ${drop.image_url}`);
    }

    messageLines.push(``);
    messageLines.push(`🔗 View Menu & Place Pre-Order:`);
    messageLines.push(shareUrl);

    const message = messageLines.join('\n');

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

  const handleBack = () => {
    if (selectedImageUrl) {
      setSelectedImageUrl(null);
      return;
    }
    goBackSmart(router, `/mcn/drops/${dropId}`);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: drop.title,
          onBack: handleBack,
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity onPress={handleShareDrop} style={{ padding: 4 }} hitSlop={8}>
                <Ionicons name="share-outline" size={22} color={colors.accent} />
              </TouchableOpacity>

              {canManageDrop ? (
                <>
                  <TouchableOpacity
                    onPress={() => router.push(`/mcn/drops/manage/${drop.id}` as any)}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.accent }}>
                      Dashboard
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleDeleteDrop} style={{ padding: 4 }} hitSlop={8}>
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
          ),
        })}
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
              Delivery: <Text style={{ fontWeight: '600' }}>{fulfillFormatted}</Text> ({format12HourTime(drop.fulfillment_time)})
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
                  onPress={() => router.push(`/mcn/drops/manage/${drop.id}` as any)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.hostManageBtnText}>Open Manage Dashboard →</Text>
                </TouchableOpacity>

                {isOpen ? (
                  <TouchableOpacity
                    style={[styles.hostManageBtn, { backgroundColor: '#FFFFFF', borderWidth: 0.5, borderColor: Verandah.accent }]}
                    onPress={() => router.push(`/mcn/drops/add?dropId=${drop.id}` as any)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.hostManageBtnText, { color: Verandah.accent }]}>✏️ Edit Drop</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

        {/* Existing User Orders Status Cards */}
        {userOrders.length > 0 && !isCreator ? (
          <View style={{ marginBottom: 8 }}>
            <Text style={styles.sectionHeader}>Your Orders for this Drop</Text>
            {userOrders.map((ord: any, index: number) => {
              const isFulfilled = ord.status === 'fulfilled';
              const isCancelled = ord.status === 'cancelled';
              const isConfirmed = ord.status === 'confirmed';
              const orderItems = ord.mcn_preorder_order_items || [];

              return (
                <View
                  key={ord.id}
                  style={[
                    styles.existingOrderBox,
                    isFulfilled && { backgroundColor: '#F0FDF4', borderColor: '#059669' },
                    isCancelled && { backgroundColor: '#F9FAFB', borderColor: '#D1D5DB' },
                  ]}
                >
                  <View style={styles.existingHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.orderLabelText}>Order #{userOrders.length - index}</Text>
                      {isFulfilled ? (
                        <View style={styles.fulfilledBadgeInline}>
                          <Ionicons name="checkmark-circle" size={14} color="#059669" />
                          <Text style={styles.fulfilledBadgeText}>Delivered</Text>
                        </View>
                      ) : isConfirmed ? (
                        <View style={styles.confirmedBadgeInline}>
                          <Ionicons name="time-outline" size={14} color="#2563EB" />
                          <Text style={styles.confirmedBadgeText}>Confirmed</Text>
                        </View>
                      ) : (
                        <View style={styles.cancelledBadgeInline}>
                          <Text style={styles.cancelledBadgeText}>Cancelled</Text>
                        </View>
                      )}
                    </View>

                    <Text style={styles.existingDateText}>
                      {new Date(ord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>

                  {orderItems.map((item: any) => (
                    <View key={item.id} style={styles.existingItemRow}>
                      <Text style={styles.existingItemName}>
                        {item.quantity}x {item.item_name}
                      </Text>
                      <Rupees amount={item.quantity * item.unit_price} size="sm" />
                    </View>
                  ))}

                  <View style={styles.existingTotalRow}>
                    <Text style={styles.existingTotalLabel}>
                      {isFulfilled ? 'Total Paid / Due:' : 'Total Amount (Pay on Delivery):'}
                    </Text>
                    <Rupees amount={ord.total_amount} size="md" tone="in" />
                  </View>

                  {isFulfilled ? (
                    <View style={styles.deliveredNoticeBox}>
                      <Ionicons name="checkmark-circle-outline" size={16} color="#059669" />
                      <Text style={styles.deliveredNoticeText}>
                        Food marked as delivered by host. Enjoy your meal!
                      </Text>
                    </View>
                  ) : isConfirmed && isOpen ? (
                    <View style={styles.orderActionRow}>
                      <TouchableOpacity
                        style={[
                          styles.editOrderBtn,
                          editingOrderId === ord.id && styles.editingOrderBtnActive,
                        ]}
                        onPress={() => handleStartEditOrder(ord)}
                      >
                        <Ionicons
                          name="pencil"
                          size={14}
                          color={editingOrderId === ord.id ? '#FFFFFF' : colors.accent}
                        />
                        <Text
                          style={[
                            styles.editOrderBtnText,
                            editingOrderId === ord.id && { color: '#FFFFFF' },
                          ]}
                        >
                          {editingOrderId === ord.id ? 'Currently Editing' : 'Update / Edit Items'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.cancelOrderBtn}
                        onPress={() => handleCancelOrder(ord.id)}
                      >
                        <Ionicons name="trash-outline" size={14} color={Verandah.danger} />
                        <Text style={styles.cancelOrderBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Menu Items Picker Header & Items */}
        <Text style={styles.sectionHeader}>
          {isCreator
            ? 'Items Offered in Your Drop'
            : editingOrderId
            ? 'Update Selected Items'
            : userOrders.length > 0
            ? 'Select Items for New Pre-Order'
            : 'Select Pre-Order Items'}
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
        {isOpen && !isCreator && user?.id ? (
          <View style={styles.formSection}>
            {editingOrderId ? (
              <View style={styles.editingModeBanner}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.editingBannerTitle}>✏️ Updating Active Pre-Order</Text>
                  <Text style={styles.editingBannerSub}>
                    Modify item quantities above and click Update Pre-Order below to save.
                  </Text>
                </View>
                <TouchableOpacity style={styles.cancelEditBtn} onPress={handleCancelEdit}>
                  <Text style={styles.cancelEditBtnText}>+ Place New Order</Text>
                </TouchableOpacity>
              </View>
            ) : null}

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
                  {editingOrderId
                    ? 'Update Pre-Order'
                    : userOrders.length > 0
                    ? 'Place Additional Pre-Order'
                    : 'Submit Pre-Order'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {!isCreator && !user?.id ? (
          <View style={styles.loginPromptCard}>
            <Text style={styles.loginPromptTitle}>Login to place pre-order</Text>
            <Text style={styles.loginPromptSub}>
              You can browse this menu without login. Sign in to place pre-orders and track your orders.
            </Text>
            <TouchableOpacity
              style={styles.loginPromptBtn}
              onPress={() => router.push('/login' as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.loginPromptBtnText}>Go to login</Text>
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
    padding: 10,
    paddingBottom: 30,
  },
  hostCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    padding: 8,
    marginBottom: 8,
  },
  hostMeta: {
    flex: 1,
    marginLeft: 10,
  },
  hostTitle: {
    ...VerandahType.title,
    fontSize: 15,
    color: Verandah.textPrimary,
    marginBottom: 1,
  },
  hostSub: {
    fontSize: 11,
    color: Verandah.textSecondary,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    borderWidth: 0.5,
    marginBottom: 8,
    gap: 8,
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
    fontSize: 18,
  },
  bannerMainText: {
    fontSize: 12,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  bannerSubText: {
    fontSize: 10,
    color: Verandah.textSecondary,
    marginTop: 1,
  },
  description: {
    ...VerandahType.body,
    fontSize: 12,
    color: Verandah.textSecondary,
    lineHeight: 16,
    marginBottom: 8,
  },
  existingOrderBox: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: Verandah.accent,
    borderRadius: VerandahRadius.lg,
    padding: 8,
    marginBottom: 8,
  },
  existingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  existingTitle: {
    fontSize: 12,
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
    marginVertical: 1,
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
    marginTop: 4,
    paddingTop: 4,
  },
  existingTotalLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  existingTotalVal: {
    fontSize: 12,
    fontWeight: '700',
    color: Verandah.accent,
  },
  cancelBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  cancelBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.danger,
  },
  orderLabelText: {
    fontSize: 12,
    fontWeight: '700',
    color: Verandah.textPrimary,
  },
  fulfilledBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  fulfilledBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#059669',
  },
  confirmedBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  confirmedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#2563EB',
  },
  cancelledBadgeInline: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  cancelledBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
  },
  existingDateText: {
    fontSize: 10,
    color: Verandah.textTertiary,
  },
  deliveredNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    padding: 6,
    borderRadius: 6,
    marginTop: 4,
  },
  deliveredNoticeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
    flex: 1,
  },
  orderActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: '#C7D2FE',
  },
  editOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: Verandah.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  editingOrderBtnActive: {
    backgroundColor: Verandah.accent,
  },
  editOrderBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.accent,
  },
  cancelOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cancelOrderBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.danger,
  },
  editingModeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  editingBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E40AF',
  },
  editingBannerSub: {
    fontSize: 10,
    color: '#1E3A8A',
    marginTop: 1,
  },
  cancelEditBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#2563EB',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 6,
  },
  cancelEditBtnText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#2563EB',
  },
  sectionHeader: {
    ...VerandahType.sectionLabel,
    color: Verandah.textPrimary,
    marginBottom: 4,
    marginTop: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.md,
    padding: 8,
    marginBottom: 6,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  itemDesc: {
    fontSize: 11,
    color: Verandah.textSecondary,
    marginTop: 1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: Verandah.textPrimary,
  },
  itemUnit: {
    fontSize: 10,
    color: Verandah.textSecondary,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: VerandahRadius.pill,
    padding: 3,
  },
  counterBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
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
    fontSize: 14,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  counterVal: {
    fontSize: 13,
    fontWeight: '700',
    color: Verandah.textPrimary,
    minWidth: 14,
    textAlign: 'center',
  },
  formSection: {
    marginTop: 8,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Verandah.textSecondary,
    marginBottom: 2,
  },
  input: {
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: Verandah.textPrimary,
  },
  multiline: {
    minHeight: 44,
  },
  summaryBox: {
    backgroundColor: '#F9FAFB',
    borderWidth: 0.5,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 8,
    marginVertical: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  summaryVal: {
    fontSize: 15,
    fontWeight: '700',
    color: Verandah.accent,
  },
  paymentNote: {
    fontSize: 10,
    color: Verandah.textSecondary,
    marginTop: 2,
  },
  loginPromptCard: {
    marginTop: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    padding: 10,
    gap: 6,
  },
  loginPromptTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  loginPromptSub: {
    fontSize: 11,
    color: Verandah.textSecondary,
    lineHeight: 16,
  },
  loginPromptBtn: {
    alignSelf: 'flex-start',
    marginTop: 2,
    backgroundColor: Verandah.accent,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  loginPromptBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  hostNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: VerandahRadius.lg,
    padding: 10,
    marginBottom: 8,
    gap: 8,
  },
  hostNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Verandah.accent,
    marginBottom: 2,
  },
  hostNoticeSub: {
    fontSize: 11,
    color: Verandah.textSecondary,
    lineHeight: 15,
    marginBottom: 6,
  },
  hostManageBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Verandah.accent,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: VerandahRadius.pill,
  },
  hostManageBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  submitBtn: {
    backgroundColor: Verandah.accent,
    paddingVertical: 12,
    borderRadius: VerandahRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  heroImageWrap: {
    height: 140,
    borderRadius: VerandahRadius.lg,
    overflow: 'hidden',
    marginBottom: 8,
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
