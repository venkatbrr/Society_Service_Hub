import { CheckCircle } from '@untitledui/icons/CheckCircle';
import { ChevronDown } from '@untitledui/icons/ChevronDown';
import { ChevronUp } from '@untitledui/icons/ChevronUp';
import { Edit01 } from '@untitledui/icons/Edit01';
import { Lock01 } from '@untitledui/icons/Lock01';
import { MessageCircle01 } from '@untitledui/icons/MessageCircle01';
import { Phone01 } from '@untitledui/icons/Phone01';
import { Trash01 } from '@untitledui/icons/Trash01';
import { XCircle } from '@untitledui/icons/XCircle';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackSmart, replaceTracked } from '../../../../lib/navigation';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Rupees } from '../../../../components/Rupees';
import { Verandah } from '../../../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../../../constants/Verandah';
import { buildMcnHeaderOptions } from '../../../../lib/mcnHeader';
import { supabase } from '../../../../lib/supabase';

interface DropOrder {
  id: string;
  buyer_name: string;
  buyer_phone: string;
  flat_number: string;
  buyer_note: string | null;
  total_amount: number;
  status: 'confirmed' | 'fulfilled' | 'cancelled';
  created_at: string;
  mcn_preorder_order_items: {
    id: string;
    item_name: string;
    quantity: number;
    unit_price: number;
  }[];
}

interface DropItem {
  id: string;
  name: string;
  unit: string;
  price: number;
  max_quantity?: number | null;
}

export default function ManagePreorderDropScreen() {
  const { id: dropId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = Verandah;

  const [drop, setDrop] = useState<any | null>(null);
  const [items, setItems] = useState<DropItem[]>([]);
  const [orders, setOrders] = useState<DropOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeliveredSection, setShowDeliveredSection] = useState(true);
  const [showCancelledSection, setShowCancelledSection] = useState(false);

  const fetchDropManagerData = useCallback(async () => {
    if (!dropId) return;
    try {
      // 1. Fetch drop info
      const { data: dropData, error: dropErr } = await supabase
        .from('mcn_preorder_drops')
        .select('*')
        .eq('id', dropId)
        .maybeSingle();

      if (dropErr) throw dropErr;
      setDrop(dropData);

      // 2. Fetch drop items
      const { data: itemsData } = await supabase
        .from('mcn_preorder_items')
        .select('*')
        .eq('drop_id', dropId);

      const uniqueItemsMap = new Map<string, any>();
      (itemsData || []).forEach((row: any) => {
        const key = `${row.name?.trim().toLowerCase()}_${row.unit}_${row.price}`;
        if (!uniqueItemsMap.has(key)) {
          uniqueItemsMap.set(key, row);
        }
      });
      setItems(Array.from(uniqueItemsMap.values()));

      // 3. Fetch all pre-orders for this drop
      const { data: ordersData, error: ordersErr } = await supabase
        .from('mcn_preorder_orders')
        .select('*, mcn_preorder_order_items(*)')
        .eq('drop_id', dropId)
        .order('flat_number', { ascending: true });

      if (ordersErr) throw ordersErr;
      setOrders((ordersData || []) as DropOrder[]);
    } catch (err) {
      console.error('Error loading manager data:', err);
      Toast.show({ type: 'error', text1: 'Failed to load manager dashboard' });
    } finally {
      setLoading(false);
    }
  }, [dropId]);

  useEffect(() => {
    fetchDropManagerData();
  }, [fetchDropManagerData]);

  // Aggregate item totals for kitchen prep
  const itemPrepAggregates: Record<string, number> = {};
  let grandTotalRevenue = 0;
  let totalItemsCount = 0;

  orders.forEach((order) => {
    if (order.status !== 'cancelled') {
      grandTotalRevenue += order.total_amount;
      (order.mcn_preorder_order_items || []).forEach((line) => {
        itemPrepAggregates[line.item_name] = (itemPrepAggregates[line.item_name] || 0) + line.quantity;
        totalItemsCount += line.quantity;
      });
    }
  });

  // max_quantity is optional at drop creation, so only some items carry a cap.
  // Order lines snapshot item_name, so caps are matched back by name.
  const capByItemName = new Map<string, number>();
  items.forEach((item) => {
    if (item.max_quantity != null) {
      capByItemName.set(item.name.trim().toLowerCase(), item.max_quantity);
    }
  });

  const orderedItemKeys = new Set(Object.keys(itemPrepAggregates).map((n) => n.trim().toLowerCase()));

  // Every ordered item, plus any capped item with no orders yet — the host still
  // needs to see how much of that cap is left.
  const prepRows: { name: string; count: number; cap: number | null }[] = [
    ...Object.entries(itemPrepAggregates).map(([name, count]) => ({
      name,
      count,
      cap: capByItemName.get(name.trim().toLowerCase()) ?? null,
    })),
    ...items
      .filter((item) => item.max_quantity != null && !orderedItemKeys.has(item.name.trim().toLowerCase()))
      .map((item) => ({ name: item.name, count: 0, cap: item.max_quantity as number })),
  ];

  const handleToggleFulfillment = async (orderId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'fulfilled' ? 'confirmed' : 'fulfilled';
    try {
      const { error } = await supabase
        .from('mcn_preorder_orders')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', orderId);

      if (error) throw error;
      Toast.show({
        type: 'success',
        text1: nextStatus === 'fulfilled' ? 'Marked Delivered & Fulfilled' : 'Reset to Confirmed',
      });
      fetchDropManagerData();
    } catch (err) {
      console.error(err);
      Toast.show({ type: 'error', text1: 'Failed to update order status' });
    }
  };

  const handleCloseDropEarly = async () => {
    const doClose = async () => {
      try {
        const { error } = await supabase
          .from('mcn_preorder_drops')
          .update({ status: 'closed', updated_at: new Date().toISOString() })
          .eq('id', dropId);
        if (error) throw error;
        Toast.show({ type: 'success', text1: 'Pre-orders closed early' });
        fetchDropManagerData();
      } catch (err) {
        console.error(err);
        Toast.show({ type: 'error', text1: 'Failed to close drop' });
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Close Pre-Orders Early?\n\nAre you sure you want to stop accepting new pre-orders right now?')) {
        doClose();
      }
    } else {
      Alert.alert(
        'Close Pre-Orders Early',
        'Are you sure you want to stop accepting new pre-orders right now?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Close Orders', onPress: doClose },
        ]
      );
    }
  };

  const handleCompleteDrop = async () => {
    const doComplete = async () => {
      try {
        const { error } = await supabase
          .from('mcn_preorder_drops')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', dropId);
        if (error) throw error;
        Toast.show({ type: 'success', text1: 'Food drop marked completed!' });
        fetchDropManagerData();
      } catch (err) {
        console.error(err);
        Toast.show({ type: 'error', text1: 'Failed to complete drop' });
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Complete Drop?\n\nMark this entire food drop as completed and delivered?')) {
        doComplete();
      }
    } else {
      Alert.alert(
        'Complete Drop',
        'Mark this entire food drop as completed and delivered?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Complete Drop', onPress: doComplete },
        ]
      );
    }
  };

  const handleCall = (phone: string) => {
    if (!phone) return;
    const clean = phone.replace(/\D/g, '');
    Linking.openURL(`tel:${clean}`);
  };

  const handleWhatsApp = (phone: string, flat: string) => {
    if (!phone) return;
    const clean = phone.replace(/\D/g, '');
    const text = encodeURIComponent(
      `Hello! Regarding your food pre-order (${drop?.title}) for Flat ${flat}: `
    );
    const url = `https://wa.me/91${clean}?text=${text}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank');
      return;
    }
    Linking.openURL(url);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <Stack.Screen
          options={buildMcnHeaderOptions({
            title: 'Food drop dashboard',
            // See the note in drops/[id].tsx — a bare Stack.Screen restores the
            // default back button and bypasses goBackSmart().
            onBack: () => goBackSmart(router, '/mcn/drops/manage/' + String(dropId || '')),
          })}
        />
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </View>
    );
  }

  if (!drop) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <Stack.Screen
          options={buildMcnHeaderOptions({
            title: 'Food drop dashboard',
            // See the note in drops/[id].tsx — a bare Stack.Screen restores the
            // default back button and bypasses goBackSmart().
            onBack: () => goBackSmart(router, '/mcn/drops/manage/' + String(dropId || '')),
          })}
        />
        <View style={styles.loaderWrap}>
          <Text style={{ color: colors.textSecondary }}>Drop not found.</Text>
        </View>
      </View>
    );
  }

  const now = new Date();
  const cutoffDate = new Date(drop.cutoff_at);
  const isCutoffPassed = now >= cutoffDate;
  const isOpen = drop.status === 'open' && !isCutoffPassed;

  const confirmedOrders = orders.filter((o) => o.status === 'confirmed');
  const fulfilledOrders = orders.filter((o) => o.status === 'fulfilled');
  const cancelledOrders = orders.filter((o) => o.status === 'cancelled');

  const handleDeleteDrop = () => {
    if (!drop) return;
    const confirmDelete = async () => {
      try {
        const { error } = await supabase.from('mcn_preorder_drops').delete().eq('id', drop.id);
        if (error) throw error;
        Toast.show({ type: 'success', text1: 'Food drop deleted' });
        replaceTracked(router, '/mcn/drops' as any);
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

  const handleBack = () => {
    goBackSmart(router, '/mcn/drops/manage/' + String(dropId || ''));
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: 'Food Drop Dashboard',
          onBack: handleBack,
        })}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Title Header */}
        <View style={styles.headerCard}>
          <Text style={styles.dropTitle}>{drop.title}</Text>
          <Text style={styles.dropSub}>
            Delivery Date: {new Date(drop.fulfillment_date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })} ({drop.fulfillment_time})
          </Text>

          {/* Action Row */}
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.editDropBtn}
              onPress={() => router.push(`/mcn/drops/add?dropId=${drop.id}` as any)}
            >
              <Edit01 size={14} color={Verandah.primary} aria-hidden={true} />
              <Text style={styles.editDropBtnText} numberOfLines={1}>Edit drop</Text>
            </TouchableOpacity>

            {isOpen ? (
              <TouchableOpacity style={styles.closeBtn} onPress={handleCloseDropEarly}>
                <Lock01 size={14} color="#D97706" aria-hidden={true} />
                <Text style={styles.closeBtnText} numberOfLines={1}>Close early</Text>
              </TouchableOpacity>
            ) : null}

            {drop.status !== 'completed' ? (
              <TouchableOpacity style={styles.completeBtn} onPress={handleCompleteDrop}>
                <CheckCircle size={16} color={Verandah.green600} aria-hidden={true} />
                <Text style={styles.completeBtnText} numberOfLines={1}>Mark completed</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.completedBadge}>
                <CheckCircle size={16} color={Verandah.green600} aria-hidden={true} />
                <Text style={styles.completedBadgeText} numberOfLines={1}>Completed</Text>
              </View>
            )}

            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: '#FEE2E2', borderColor: '#F87171' }]} onPress={handleDeleteDrop}>
              <Trash01 size={14} color="#DC2626" aria-hidden={true} />
              <Text style={[styles.closeBtnText, { color: '#DC2626' }]} numberOfLines={1}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Financial & Order Metric Cards */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricVal}>{confirmedOrders.length}</Text>
            <Text style={styles.metricLabel}>Pending Delivery</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricVal}>{fulfilledOrders.length}</Text>
            <Text style={styles.metricLabel}>Delivered</Text>
          </View>

          <View style={styles.metricCard}>
            <Rupees amount={grandTotalRevenue} size="md" tone="in" />
            <Text style={styles.metricLabel}>Est. Revenue</Text>
          </View>
        </View>

        {/* Kitchen Prep Aggregation Section */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Kitchen Prep Aggregation Summary</Text>
          <Text style={styles.sectionSub}>
            Total items needed for cooking / preparation across all active pre-orders:
          </Text>

          {prepRows.length === 0 ? (
            <Text style={styles.emptyText}>No active pre-orders placed yet.</Text>
          ) : (
            <View style={styles.prepGrid}>
              {prepRows.map((row, idx) => {
                const isFull = row.cap != null && row.count >= row.cap;
                return (
                  <View key={`${row.name}_${idx}`} style={[styles.prepCard, isFull ? styles.prepCardFull : null]}>
                    <Text style={styles.prepCount}>{row.count}x</Text>
                    <Text style={styles.prepItemName}>{row.name}</Text>
                    {row.cap != null ? (
                      <Text style={[styles.prepCapText, isFull ? styles.prepCapTextFull : null]}>
                        {isFull ? `max ${row.cap} · full` : `of ${row.cap} max`}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Active Resident Pre-Orders Section */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Active Pre-Orders ({confirmedOrders.length})</Text>
          <Text style={styles.sectionSub}>
            Deliver to residents by flat number. Click "Mark delivered" when handed over.
          </Text>

          {confirmedOrders.length === 0 ? (
            <Text style={styles.emptyText}>No active pre-orders pending delivery.</Text>
          ) : (
            confirmedOrders.map((order) => (
              <View key={order.id} style={styles.orderCard}>
                {/* Order Header */}
                <View style={styles.orderHeader}>
                  <View style={styles.flatBadge}>
                    <Text style={styles.flatBadgeText}>Flat {order.flat_number}</Text>
                  </View>

                  <Text style={styles.orderBuyerName}>{order.buyer_name}</Text>

                  <View style={styles.contactActions}>
                    <TouchableOpacity
                      style={styles.iconCircle}
                      onPress={() => handleCall(order.buyer_phone)}
                    >
                      <Phone01 size={16} color={colors.primary} aria-hidden={true} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconCircle}
                      onPress={() => handleWhatsApp(order.buyer_phone, order.flat_number)}
                    >
                      <MessageCircle01 size={16} color="#10B981" aria-hidden={true} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Order Items */}
                <View style={styles.orderItemsBox}>
                  {(order.mcn_preorder_order_items || []).map((line) => (
                    <View key={line.id} style={styles.lineRow}>
                      <Text style={styles.lineText}>
                        {line.quantity}x {line.item_name}
                      </Text>
                      <Rupees amount={line.quantity * line.unit_price} size="sm" />
                    </View>
                  ))}

                  {order.buyer_note ? (
                    <Text style={styles.buyerNote}>Note: "{order.buyer_note}"</Text>
                  ) : null}
                </View>

                {/* Order Footer & Action */}
                <View style={styles.orderFooter}>
                  <View style={styles.orderTotalWrap}>
                    <Text style={styles.totalLabel}>Collect on Delivery:</Text>
                    <Rupees amount={order.total_amount} size="md" tone="in" />
                  </View>

                  <TouchableOpacity
                    style={styles.fulfillmentBtn}
                    onPress={() => handleToggleFulfillment(order.id, order.status)}
                  >
                    <CheckCircle
                      size={15}
                      color="#FFFFFF"
                      aria-hidden={true}
                    />
                    <Text style={styles.fulfillmentBtnText}>Mark delivered</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Delivered / Completed Orders Section (Collapsible) */}
        {fulfilledOrders.length > 0 ? (
          <View style={styles.sectionCard}>
            <TouchableOpacity
              style={styles.collapsibleHeader}
              onPress={() => setShowDeliveredSection(!showDeliveredSection)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <CheckCircle size={18} color={Verandah.green600} aria-hidden={true} />
                <Text style={styles.sectionTitle}>Delivered & Completed Orders ({fulfilledOrders.length})</Text>
              </View>
              {showDeliveredSection ? (
                <ChevronUp size={20} color={colors.textSecondary} aria-hidden={true} />
              ) : (
                <ChevronDown size={20} color={colors.textSecondary} aria-hidden={true} />
              )}
            </TouchableOpacity>

            {showDeliveredSection ? (
              <View style={{ marginTop: 8 }}>
                {fulfilledOrders.map((order) => (
                  <View key={order.id} style={[styles.orderCard, styles.orderCardFulfilled]}>
                    <View style={styles.orderHeader}>
                      <View style={[styles.flatBadge, { backgroundColor: Verandah.accentSoft }]}>
                        <Text style={[styles.flatBadgeText, { color: Verandah.green600 }]}>Flat {order.flat_number}</Text>
                      </View>
                      <Text style={styles.orderBuyerName}>{order.buyer_name}</Text>
                      <View style={styles.contactActions}>
                        <TouchableOpacity style={styles.iconCircle} onPress={() => handleCall(order.buyer_phone)}>
                          <Phone01 size={16} color={colors.primary} aria-hidden={true} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.iconCircle} onPress={() => handleWhatsApp(order.buyer_phone, order.flat_number)}>
                          <MessageCircle01 size={16} color="#10B981" aria-hidden={true} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.orderItemsBox}>
                      {(order.mcn_preorder_order_items || []).map((line) => (
                        <View key={line.id} style={styles.lineRow}>
                          <Text style={styles.lineText}>{line.quantity}x {line.item_name}</Text>
                          <Rupees amount={line.quantity * line.unit_price} size="sm" />
                        </View>
                      ))}
                      {order.buyer_note ? <Text style={styles.buyerNote}>Note: "{order.buyer_note}"</Text> : null}
                    </View>

                    <View style={styles.orderFooter}>
                      <View style={styles.orderTotalWrap}>
                        <Text style={styles.totalLabel}>Total Collected:</Text>
                        <Rupees amount={order.total_amount} size="md" tone="in" />
                      </View>

                      <TouchableOpacity
                        style={[styles.fulfillmentBtn, styles.fulfillmentBtnDone]}
                        onPress={() => handleToggleFulfillment(order.id, order.status)}
                      >
                        <CheckCircle size={15} color={Verandah.green600} aria-hidden={true} />
                        <Text style={[styles.fulfillmentBtnText, styles.fulfillmentBtnTextDone]}>Delivered</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Cancelled Orders Section (Collapsible) */}
        {cancelledOrders.length > 0 ? (
          <View style={styles.sectionCard}>
            <TouchableOpacity
              style={styles.collapsibleHeader}
              onPress={() => setShowCancelledSection(!showCancelledSection)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <XCircle size={18} color="#9CA3AF" aria-hidden={true} />
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                  Cancelled Orders ({cancelledOrders.length})
                </Text>
              </View>
              {showCancelledSection ? (
                <ChevronUp size={20} color={colors.textSecondary} aria-hidden={true} />
              ) : (
                <ChevronDown size={20} color={colors.textSecondary} aria-hidden={true} />
              )}
            </TouchableOpacity>

            {showCancelledSection ? (
              <View style={{ marginTop: 8 }}>
                {cancelledOrders.map((order) => (
                  <View key={order.id} style={[styles.orderCard, styles.orderCardCancelled]}>
                    <View style={styles.orderHeader}>
                      <View style={[styles.flatBadge, { backgroundColor: '#F3F4F6' }]}>
                        <Text style={[styles.flatBadgeText, { color: '#6B7280' }]}>Flat {order.flat_number}</Text>
                      </View>
                      <Text style={[styles.orderBuyerName, { color: colors.textSecondary }]}>{order.buyer_name}</Text>
                      <View style={styles.contactActions}>
                        <TouchableOpacity style={styles.iconCircle} onPress={() => handleCall(order.buyer_phone)}>
                          <Phone01 size={16} color={colors.textSecondary} aria-hidden={true} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.iconCircle} onPress={() => handleWhatsApp(order.buyer_phone, order.flat_number)}>
                          <MessageCircle01 size={16} color="#9CA3AF" aria-hidden={true} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={[styles.orderItemsBox, { backgroundColor: '#F3F4F6' }]}>
                      {(order.mcn_preorder_order_items || []).map((line) => (
                        <View key={line.id} style={styles.lineRow}>
                          <Text style={[styles.lineText, { color: colors.textSecondary }]}>
                            {line.quantity}x {line.item_name}
                          </Text>
                          <Rupees amount={line.quantity * line.unit_price} size="sm" />
                        </View>
                      ))}
                      {order.buyer_note ? <Text style={styles.buyerNote}>Note: "{order.buyer_note}"</Text> : null}
                    </View>

                    <View style={styles.orderFooter}>
                      <View style={styles.orderTotalWrap}>
                        <Text style={styles.totalLabel}>Cancelled Order:</Text>
                        <Rupees amount={order.total_amount} size="md" tone="in" />
                      </View>

                      <View style={styles.cancelledBadgePill}>
                        <Text style={styles.cancelledBadgePillText}>Cancelled</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
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
    padding: 10,
    paddingBottom: 30,
  },
  headerCard: {
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    padding: 8,
    marginBottom: 6,
  },
  dropTitle: {
    ...VerandahType.title,
    fontSize: 15,
    color: Verandah.textPrimary,
    marginBottom: 1,
  },
  dropSub: {
    fontSize: 11,
    color: Verandah.textSecondary,
    marginBottom: 6,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'nowrap',
    alignItems: 'center',
  },
  editDropBtn: {
    backgroundColor: '#EEF2FF',
    borderWidth: 0.5,
    borderColor: '#C7D2FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: VerandahRadius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  editDropBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.accent,
  },
  closeBtn: {
    backgroundColor: '#FEF3C7',
    borderWidth: 0.5,
    borderColor: '#F59E0B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: VerandahRadius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  closeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D97706',
  },
  completeBtn: {
    backgroundColor: '#D1FAE5',
    borderWidth: 0.5,
    borderColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: VerandahRadius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  completeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.green600,
  },
  completedBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: VerandahRadius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  completedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.green600,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  metricCard: {
    flex: 1,
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    padding: 6,
    alignItems: 'center',
  },
  metricVal: {
    fontSize: 17,
    fontWeight: '700',
    color: Verandah.textPrimary,
  },
  metricRevenueVal: {
    fontSize: 14,
    fontWeight: '700',
    color: Verandah.accent,
  },
  metricLabel: {
    fontSize: 10,
    color: Verandah.textSecondary,
    marginTop: 1,
  },
  sectionCard: {
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    padding: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    ...VerandahType.title,
    fontSize: 14,
    color: Verandah.textPrimary,
    marginBottom: 1,
  },
  sectionSub: {
    fontSize: 11,
    color: Verandah.textSecondary,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 12,
    color: Verandah.textMuted,
    fontStyle: 'italic',
  },
  prepGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  prepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  prepCount: {
    fontSize: 13,
    fontWeight: '700',
    color: Verandah.accent,
  },
  prepItemName: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
  prepCardFull: {
    backgroundColor: '#FEE2E2',
  },
  prepCapText: {
    fontSize: 10,
    fontWeight: '600',
    color: Verandah.textSecondary,
  },
  prepCapTextFull: {
    color: '#DC2626',
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 0.5,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  orderCardFulfilled: {
    backgroundColor: '#F9FAFB',
    borderColor: '#D1D5DB',
    opacity: 0.85,
  },
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  flatBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
  },
  flatBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Verandah.accent,
  },
  orderBuyerName: {
    fontSize: 13,
    fontWeight: '600',
    color: Verandah.textPrimary,
    flex: 1,
  },
  contactActions: {
    flexDirection: 'row',
    gap: 4,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderItemsBox: {
    backgroundColor: '#F9FAFB',
    padding: 6,
    borderRadius: 6,
    marginBottom: 6,
  },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 1,
  },
  lineText: {
    fontSize: 12,
    color: Verandah.textPrimary,
  },
  linePrice: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  buyerNote: {
    fontSize: 11,
    fontStyle: 'italic',
    color: Verandah.textSecondary,
    marginTop: 2,
  },
  orderFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#E5E7EB',
    paddingTop: 4,
  },
  orderTotalWrap: {
    flex: 1,
    marginRight: 8,
  },
  totalLabel: {
    fontSize: 10,
    color: Verandah.textSecondary,
  },
  totalVal: {
    fontSize: 14,
    fontWeight: '700',
    color: Verandah.textPrimary,
  },
  fulfillmentBtn: {
    backgroundColor: Verandah.accent,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: VerandahRadius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minWidth: 122,
    alignSelf: 'flex-end',
  },
  fulfillmentBtnDone: {
    backgroundColor: '#D1FAE5',
  },
  fulfillmentBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  fulfillmentBtnTextDone: {
    color: Verandah.green600,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderCardCancelled: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    opacity: 0.75,
  },
  cancelledBadgePill: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  cancelledBadgePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
});
