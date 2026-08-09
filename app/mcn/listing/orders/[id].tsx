import { useFocusEffect } from '@react-navigation/native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import Toast from 'react-native-toast-message';
import { Avatar } from '../../../../components/Avatar';
import { Rupees } from '../../../../components/Rupees';
import { Verandah } from '../../../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../../../constants/Verandah';
import { useAuth } from '../../../../context/AuthContext';
import { confirmAction } from '../../../../lib/confirm';
import { buildMcnHeaderOptions } from '../../../../lib/mcnHeader';
import { goBackSmart } from '../../../../lib/navigation';
import { buildWhatsAppUrl } from '../../../../lib/phone';
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
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

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
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to load orders', text2: error?.message });
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [fetchOrders])
  );

  const handleUpdateStatus = async (orderId: string, newStatus: 'fulfilled' | 'cancelled') => {
    if (updatingOrderId) return;
    setUpdatingOrderId(orderId);

    try {
      const { data, error } = await supabase
        .from('mcn_orders')
        .update({ status: newStatus })
        .eq('id', orderId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        Toast.show({
          type: 'info',
          text1: 'Nothing to update',
          text2: 'This order was already updated or cancelled.',
        });
      } else {
        Toast.show({ type: 'success', text1: `Order marked as ${newStatus}` });
      }
      fetchOrders();
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to update order status', text2: error?.message });
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const confirmCancel = (orderId: string) => {
    confirmAction({
      title: 'Cancel order',
      message: 'Are you sure you want to cancel this order?',
      confirmLabel: 'Yes, cancel',
      destructive: true,
      onConfirm: () => handleUpdateStatus(orderId, 'cancelled'),
    });
  };

  const handleCall = (phone: string | null) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  };

  const handleWhatsApp = (buyerName: string, phone: string | null, items: OrderItem[]) => {
    const productLines = items
      .map(
        (item) =>
          `- ${item.mcn_products?.name || 'Item'} x ${item.quantity} ${item.mcn_products?.unit || ''}`
      )
      .join('\n');
    const total = items.reduce(
      (sum, item) => sum + Number(item.unit_price) * Number(item.quantity),
      0
    );
    const text = `Hi ${buyerName}, thanks for your order on Wooru!\n${productLines}\nTotal: ₹${total.toFixed(0)}`;
    const url = buildWhatsAppUrl(phone, text);
    if (url) {
      Linking.openURL(url);
    } else {
      Toast.show({ type: 'error', text1: 'Invalid phone number for WhatsApp' });
    }
  };

  const pendingOrders = orders.filter((o) => o.status === 'pending');
  const fulfilledOrders = orders.filter((o) => o.status === 'fulfilled');
  const cancelledOrders = orders.filter((o) => o.status === 'cancelled');

  const pendingCount = pendingOrders.length;
  const headerTitle = `Orders (${pendingCount} pending)`;

  const handleBack = () => {
    goBackSmart(router, `/mcn/listing/orders/${listingId}`);
  };

  const renderOrderRow = (order: Order) => {
    const total = order.mcn_order_items.reduce(
      (sum, item) => sum + Number(item.unit_price) * Number(item.quantity),
      0
    );
    const buyerName = order.profiles?.full_name || 'Resident';
    const flatNo = order.profiles?.flat_number ? `Flat ${order.profiles.flat_number}` : 'Resident';
    const buyerPhone = order.buyer_phone || order.profiles?.phone_number;
    const isBusy = updatingOrderId === order.id;

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
                  {item.mcn_products?.name || 'Item'} <Text style={{ color: colors.textTertiary }}>×</Text> {item.quantity} {item.mcn_products?.unit}
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
              disabled={isBusy}
              style={[styles.cancelBtn, { borderColor: colors.danger }]}
            >
              <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
              <Text style={[styles.cancelBtnText, { color: colors.danger }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleUpdateStatus(order.id, 'fulfilled')}
              disabled={isBusy}
              style={[styles.fulfillBtn, { backgroundColor: colors.primary }]}
            >
              {isBusy ? (
                <ActivityIndicator size="small" color={colors.primaryFg} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={16} color={colors.primaryFg} />
                  <Text style={[styles.fulfillBtnText, { color: colors.primaryFg }]}>Mark fulfilled</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: headerTitle,
          onBack: handleBack,
        })}
      />

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
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
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No orders received yet.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loaderWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    ...VerandahType.captionBold,
    fontSize: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  orderCard: {
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 10,
  },
  buyerName: {
    ...VerandahType.bodyBold,
    fontSize: 15,
  },
  buyerFlat: {
    ...VerandahType.caption,
    fontSize: 12,
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  noContact: {
    ...VerandahType.caption,
    fontSize: 11,
  },
  itemsList: {
    marginVertical: 6,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  itemName: {
    ...VerandahType.body,
    fontSize: 13,
  },
  rowDivider: {
    height: 1,
    marginVertical: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    ...VerandahType.bodyBold,
    fontSize: 14,
  },
  noteContainer: {
    padding: 8,
    borderRadius: VerandahRadius.sm,
    marginTop: 8,
  },
  noteLabel: {
    ...VerandahType.captionBold,
    fontSize: 11,
  },
  noteText: {
    ...VerandahType.body,
    fontSize: 12,
    marginTop: 2,
    fontStyle: 'italic',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  cancelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: VerandahRadius.sm,
    borderWidth: 1,
    gap: 6,
  },
  cancelBtnText: {
    ...VerandahType.bodyBold,
    fontSize: 13,
  },
  fulfillBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: VerandahRadius.sm,
    gap: 6,
  },
  fulfillBtnText: {
    ...VerandahType.bodyBold,
    fontSize: 13,
  },
  emptyWrap: {
    paddingTop: 60,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    ...VerandahType.body,
    fontSize: 14,
  },
});
