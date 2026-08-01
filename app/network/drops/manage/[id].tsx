import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
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
import { VerandahRadius, VerandahType } from '../../../../constants/Verandah';
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
}

export default function ManagePreorderDropScreen() {
  const { id: dropId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = Verandah;

  const [drop, setDrop] = useState<any | null>(null);
  const [items, setItems] = useState<DropItem[]>([]);
  const [orders, setOrders] = useState<DropOrder[]>([]);
  const [loading, setLoading] = useState(true);

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
      setItems(itemsData || []);

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
        <Stack.Screen options={{ title: 'Food drop dashboard' }} />
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </View>
    );
  }

  if (!drop) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <Stack.Screen options={{ title: 'Food drop dashboard' }} />
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

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(`/network/drops/${dropId}` as any);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
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
              onPress={() => router.push(`/network/drops/add?dropId=${drop.id}` as any)}
            >
              <Ionicons name="create-outline" size={14} color={Verandah.accent} />
              <Text style={styles.editDropBtnText} numberOfLines={1}>Edit drop</Text>
            </TouchableOpacity>

            {isOpen ? (
              <TouchableOpacity style={styles.closeBtn} onPress={handleCloseDropEarly}>
                <Ionicons name="lock-closed-outline" size={14} color="#D97706" />
                <Text style={styles.closeBtnText} numberOfLines={1}>Close early</Text>
              </TouchableOpacity>
            ) : null}

            {drop.status !== 'completed' ? (
              <TouchableOpacity style={styles.completeBtn} onPress={handleCompleteDrop}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#059669" />
                <Text style={styles.completeBtnText} numberOfLines={1}>Mark completed</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.completedBadge}>
                <Ionicons name="checkmark-circle" size={16} color="#059669" />
                <Text style={styles.completedBadgeText} numberOfLines={1}>Completed</Text>
              </View>
            )}
          </View>
        </View>

        {/* Financial & Order Metric Cards */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricVal}>{orders.length}</Text>
            <Text style={styles.metricLabel}>Total Orders</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricVal}>{totalItemsCount}</Text>
            <Text style={styles.metricLabel}>Items Ordered</Text>
          </View>

          <View style={styles.metricCard}>
            <Rupees amount={grandTotalRevenue} size="md" tone="in" />
            <Text style={styles.metricLabel}>Est. Revenue</Text>
          </View>
        </View>

        {/* Kitchen Prep Aggregation Section */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>👩‍🍳 Kitchen Prep Aggregation Summary</Text>
          <Text style={styles.sectionSub}>
            Total items needed for cooking / preparation across all pre-orders:
          </Text>

          {Object.keys(itemPrepAggregates).length === 0 ? (
            <Text style={styles.emptyText}>No pre-orders placed yet.</Text>
          ) : (
            <View style={styles.prepGrid}>
              {Object.entries(itemPrepAggregates).map(([itemName, count]) => (
                <View key={itemName} style={styles.prepCard}>
                  <Text style={styles.prepCount}>{count}x</Text>
                  <Text style={styles.prepItemName}>{itemName}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Resident Delivery Roster Section */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>📍 Resident Delivery Roster ({orders.length})</Text>
          <Text style={styles.sectionSub}>
            Deliver to residents by flat number. Mark fulfilled upon delivery.
          </Text>

          {orders.length === 0 ? (
            <Text style={styles.emptyText}>No resident pre-orders yet.</Text>
          ) : (
            orders.map((order) => {
              const isFulfilled = order.status === 'fulfilled';
              return (
                <View key={order.id} style={[styles.orderCard, isFulfilled && styles.orderCardFulfilled]}>
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
                        <Ionicons name="call-outline" size={16} color={colors.accent} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.iconCircle}
                        onPress={() => handleWhatsApp(order.buyer_phone, order.flat_number)}
                      >
                        <Ionicons name="logo-whatsapp" size={16} color="#10B981" />
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
                      style={[styles.fulfillmentBtn, isFulfilled && styles.fulfillmentBtnDone]}
                      onPress={() => handleToggleFulfillment(order.id, order.status)}
                    >
                      <Ionicons
                        name={isFulfilled ? "checkmark-circle" : "checkmark-circle-outline"}
                        size={15}
                        color={isFulfilled ? "#059669" : colors.accent}
                      />
                      <Text style={[styles.fulfillmentBtnText, isFulfilled && styles.fulfillmentBtnTextDone]}>
                        {isFulfilled ? 'Delivered' : 'Mark delivered'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>
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
    padding: 20,
    paddingBottom: 60,
  },
  headerCard: {
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    padding: 16,
    marginBottom: 14,
  },
  dropTitle: {
    ...VerandahType.title,
    fontSize: 18,
    color: Verandah.textPrimary,
    marginBottom: 4,
  },
  dropSub: {
    fontSize: 12,
    color: Verandah.textSecondary,
    marginBottom: 12,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'nowrap',
    alignItems: 'center',
  },
  editDropBtn: {
    backgroundColor: '#EEF2FF',
    borderWidth: 0.5,
    borderColor: '#C7D2FE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: VerandahRadius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: VerandahRadius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: VerandahRadius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  completeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  completedBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: VerandahRadius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  completedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    padding: 12,
    alignItems: 'center',
  },
  metricVal: {
    fontSize: 20,
    fontWeight: '700',
    color: Verandah.textPrimary,
  },
  metricRevenueVal: {
    fontSize: 16,
    fontWeight: '700',
    color: Verandah.accent,
  },
  metricLabel: {
    fontSize: 11,
    color: Verandah.textSecondary,
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    ...VerandahType.title,
    fontSize: 15,
    color: Verandah.textPrimary,
    marginBottom: 2,
  },
  sectionSub: {
    fontSize: 12,
    color: Verandah.textSecondary,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 13,
    color: Verandah.textMuted,
    fontStyle: 'italic',
  },
  prepGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  prepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  prepCount: {
    fontSize: 14,
    fontWeight: '700',
    color: Verandah.accent,
  },
  prepItemName: {
    fontSize: 13,
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 0.5,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  orderCardFulfilled: {
    backgroundColor: '#F9FAFB',
    borderColor: '#D1D5DB',
    opacity: 0.85,
  },
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  flatBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 8,
  },
  flatBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Verandah.accent,
  },
  orderBuyerName: {
    fontSize: 14,
    fontWeight: '600',
    color: Verandah.textPrimary,
    flex: 1,
  },
  contactActions: {
    flexDirection: 'row',
    gap: 6,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderItemsBox: {
    backgroundColor: '#F9FAFB',
    padding: 8,
    borderRadius: 6,
    marginBottom: 10,
  },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
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
    marginTop: 4,
  },
  orderFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
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
    color: '#059669',
  },
});
