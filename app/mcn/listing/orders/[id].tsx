import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import Toast from 'react-native-toast-message';
import { Avatar } from '../../../../components/Avatar';
import { Rupees } from '../../../../components/Rupees';
import { McnOrderStatusBadge } from '../../../../components/McnOrderStatusBadge';
import { Verandah } from '../../../../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../../../../constants/Verandah';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../lib/supabase';

interface OrderItem {
  quantity: number;
  unit_price: number;
  mcn_products: {
    name: string;
    unit: string;
  } | null;
}

interface Order {
  id: string;
  status: 'pending' | 'fulfilled' | 'cancelled';
  buyer_note: string | null;
  buyer_phone: string | null;
  created_at: string;
  updated_at: string;
  profiles: {
    full_name: string;
    flat_number: string | null;
    phone_number: string | null;
  } | null;
  mcn_order_items: OrderItem[];
}

export default function OrdersReceivedScreen() {
  const { id: listingId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const colors = Verandah;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    if (!listingId) return;
    try {
      const { data, error } = await supabase
        .from('mcn_orders')
        .select(`
          id, status, buyer_note, buyer_phone, created_at, updated_at,
          profiles!buyer_id(full_name, flat_number, phone_number),
          mcn_order_items(
            quantity, unit_price,
            mcn_products(name, unit)
          )
        `)
        .eq('listing_id', listingId);

      if (error) throw error;
      setOrders((data || []) as unknown as Order[]);
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to load orders' });
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleUpdateStatus = async (orderId: string, newStatus: 'fulfilled' | 'cancelled') => {
    try {
      const { error } = await supabase
        .from('mcn_orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;
      Toast.show({ type: 'success', text1: `Order marked as ${newStatus}` });
      fetchOrders();
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to update order status' });
    }
  };

  const confirmCancel = (orderId: string) => {
    Alert.alert(
      'Cancel order',
      'Are you sure you want to cancel this order?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, cancel',
          style: 'destructive',
          onPress: () => handleUpdateStatus(orderId, 'cancelled'),
        },
      ]
    );
  };

  const handleCall = (phone: string | null) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  };

  const handleWhatsApp = (buyerName: string, phone: string | null, items: OrderItem[]) => {
    if (!phone) return;
    const productLines = items
      .map(item => `- ${item.mcn_products?.name || 'Item'} x ${item.quantity} ${item.mcn_products?.unit || ''}`)
      .join('\n');
    const total = items.reduce((sum, item) => sum + Number(item.unit_price) * Number(item.quantity), 0);
    const text = encodeURIComponent(
      `Hi ${buyerName}, thanks for your order on Society Service Hub!\n${productLines}\nTotal: ₹${total.toFixed(0)}`
    );
    Linking.openURL(`whatsapp://send?phone=91${phone}&text=${text}`);
  };

  // Grouping
  const pendingOrders = orders.filter(o => o.status === 'pending');
  const fulfilledOrders = orders.filter(o => o.status === 'fulfilled');
  const cancelledOrders = orders.filter(o => o.status === 'cancelled');

  const pendingCount = pendingOrders.length;
  const headerTitle = `Orders (${pendingCount} pending)`;

  const renderOrderRow = (order: Order) => {
    const total = order.mcn_order_items.reduce(
      (sum, item) => sum + Number(item.unit_price) * Number(item.quantity),
      0
    );
    const buyerName = order.profiles?.full_name || 'Resident';
    const flatNo = order.profiles?.flat_number ? `Flat ${order.profiles.flat_number}` : 'Resident';
    const buyerPhone = order.buyer_phone || order.profiles?.phone_number;

    return (
      <View key={order.id} style={[styles.orderCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View style={styles.cardHeader}>
          <Avatar name={buyerName} size={36} />
          <View style={styles.headerInfo}>
            <Text style={[styles.buyerName, { color: colors.textPrimary }]}>{buyerName}</Text>
            <Text style={[styles.buyerFlat, { color: colors.textTertiary }]}>{flatNo}</Text>
          </View>

          {buyerPhone ? (
            <View style={styles.contactActions}>
              <TouchableOpacity onPress={() => handleCall(buyerPhone)} style={[styles.contactBtn, { borderColor: colors.border }]}>
                <Ionicons name="call-outline" size={16} color={colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleWhatsApp(buyerName, buyerPhone, order.mcn_order_items)}
                style={[styles.contactBtn, { borderColor: colors.border }]}
              >
                <Ionicons name="logo-whatsapp" size={16} color={colors.accent} />
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={[styles.noContact, { color: colors.textMuted }]}>No phone</Text>
          )}
        </View>

        <View style={styles.itemsList}>
          {order.mcn_order_items.map((item, idx) => {
            const subtotal = Number(item.unit_price) * Number(item.quantity);
            return (
              <View key={idx} style={styles.itemRow}>
                <Text style={[styles.itemName, { color: colors.textSecondary }]}>
                  {item.mcn_products?.name || 'Deleted product'} <Text style={{ color: colors.textTertiary }}>×</Text> {item.quantity} {item.mcn_products?.unit}
                </Text>
                <Rupees amount={subtotal} size="sm" />
              </View>
            );
          })}
        </View>

        <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />

        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: colors.textPrimary }]}>Total</Text>
          <Rupees amount={total} size="sm" tone="in" />
        </View>

        {order.buyer_note ? (
          <View style={[styles.noteContainer, { backgroundColor: colors.surface }]}>
            <Text style={[styles.noteLabel, { color: colors.textTertiary }]}>Note from buyer:</Text>
            <Text style={[styles.noteText, { color: colors.textSecondary }]}>"{order.buyer_note}"</Text>
          </View>
        ) : null}

        {order.status === 'pending' && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={() => confirmCancel(order.id)}
              style={[styles.cancelBtn, { borderColor: colors.danger }]}
            >
              <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
              <Text style={[styles.cancelBtnText, { color: colors.danger }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleUpdateStatus(order.id, 'fulfilled')}
              style={[styles.fulfillBtn, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.primaryFg} />
              <Text style={[styles.fulfillBtnText, { color: colors.primaryFg }]}>Mark fulfilled</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Stack.Screen options={{ title: headerTitle }} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {pendingOrders.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.caution }]}>Pending</Text>
            {pendingOrders.map(renderOrderRow)}
          </View>
        )}

        {fulfilledOrders.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.accent }]}>Fulfilled</Text>
            {fulfilledOrders.map(renderOrderRow)}
          </View>
        )}

        {cancelledOrders.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.danger }]}>Cancelled</Text>
            {cancelledOrders.map(renderOrderRow)}
          </View>
        )}

        {orders.length === 0 && (
          <View style={styles.emptyWrap}>
            <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No orders placed for this listing yet.
            </Text>
          </View>
        )}
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
    padding: 24,
    paddingBottom: 80,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    ...VerandahType.captionBold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  orderCard: {
    borderWidth: 0.5,
    borderRadius: VerandahRadius.lg,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 10,
  },
  buyerName: {
    ...VerandahType.bodyBold,
  },
  buyerFlat: {
    ...VerandahType.caption,
    marginTop: 2,
  },
  contactActions: {
    flexDirection: 'row',
    gap: 8,
  },
  contactBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noContact: {
    ...VerandahType.caption,
  },
  itemsList: {
    marginBottom: 12,
    gap: 6,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    ...VerandahType.caption,
    flex: 1,
    marginRight: 8,
  },
  rowDivider: {
    height: 0.5,
    marginBottom: 10,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    ...VerandahType.captionBold,
  },
  noteContainer: {
    marginTop: 12,
    padding: 10,
    borderRadius: VerandahRadius.sm,
  },
  noteLabel: {
    ...VerandahType.micro,
    fontWeight: '500',
    marginBottom: 2,
  },
  noteText: {
    ...VerandahType.caption,
    fontStyle: 'italic',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: VerandahRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
  },
  cancelBtnText: {
    ...VerandahType.captionBold,
  },
  fulfillBtn: {
    flex: 1.2,
    flexDirection: 'row',
    borderRadius: VerandahRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
  },
  fulfillBtnText: {
    ...VerandahType.captionBold,
  },
  emptyWrap: {
    paddingTop: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    ...VerandahType.body,
    textAlign: 'center',
  },
});
