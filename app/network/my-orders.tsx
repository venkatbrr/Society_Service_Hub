import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import Toast from 'react-native-toast-message';
import { Rupees } from '../../components/Rupees';
import { McnOrderStatusBadge } from '../../components/McnOrderStatusBadge';
import { Verandah } from '../../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

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
  created_at: string;
  mcn_listings: {
    name: string;
    contact_phone: string | null;
    profiles: {
      full_name: string;
      flat_number: string | null;
    } | null;
  } | null;
  mcn_order_items: OrderItem[];
}

export default function MyOrdersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const colors = Verandah;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMyOrders = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('mcn_orders')
        .select(`
          id, status, buyer_note, created_at,
          mcn_listings(
            name, contact_phone,
            profiles!owner_id(full_name, flat_number)
          ),
          mcn_order_items(
            quantity, unit_price,
            mcn_products(name, unit)
          )
        `)
        .eq('buyer_id', user.id);

      if (error) throw error;
      setOrders((data || []) as unknown as Order[]);
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to load your orders' });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchMyOrders();
  }, [fetchMyOrders]);

  const handleCancelOrder = (orderId: string) => {
    Alert.alert(
      'Cancel order',
      'Are you sure you want to cancel this order?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, cancel',
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            try {
              const { error } = await supabase
                .from('mcn_orders')
                .delete()
                .eq('id', orderId)
                .eq('buyer_id', user.id);

              if (error) throw error;
              Toast.show({ type: 'success', text1: 'Order cancelled' });
              fetchMyOrders();
            } catch (error) {
              console.error(error);
              Toast.show({ type: 'error', text1: 'Failed to cancel order' });
            }
          },
        },
      ]
    );
  };

  const handleCall = (phone: string | null) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  };

  const handleWhatsApp = (phone: string | null, listingName: string, items: OrderItem[]) => {
    if (!phone) return;
    const productLines = items
      .map(item => `- ${item.mcn_products?.name || 'Item'} x ${item.quantity} ${item.mcn_products?.unit || ''}`)
      .join('\n');
    const total = items.reduce((sum, item) => sum + Number(item.unit_price) * Number(item.quantity), 0);
    const text = encodeURIComponent(
      `Hi, I placed an order with ${listingName} on Society Service Hub:\n${productLines}\nTotal: ₹${total.toFixed(0)}`
    );
    Linking.openURL(`whatsapp://send?phone=91${phone}&text=${text}`);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Grouping
  const pendingOrders = orders.filter(o => o.status === 'pending');
  const fulfilledOrders = orders.filter(o => o.status === 'fulfilled');
  const cancelledOrders = orders.filter(o => o.status === 'cancelled');

  const renderOrderCard = (order: Order) => {
    const total = order.mcn_order_items.reduce(
      (sum, item) => sum + Number(item.unit_price) * Number(item.quantity),
      0
    );
    const listingName = order.mcn_listings?.name || 'Deleted business';
    const ownerName = order.mcn_listings?.profiles?.full_name || 'Resident';
    const ownerFlat = order.mcn_listings?.profiles?.flat_number
      ? `Flat ${order.mcn_listings.profiles.flat_number}`
      : 'Resident';
    const phone = order.mcn_listings?.contact_phone;

    return (
      <View key={order.id} style={[styles.orderCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.businessName, { color: colors.textPrimary }]}>{listingName}</Text>
            <Text style={[styles.sellerInfo, { color: colors.textTertiary }]}>
              Seller: {ownerName} · {ownerFlat}
            </Text>
          </View>
          <McnOrderStatusBadge status={order.status} />
        </View>

        <View style={styles.itemsList}>
          {order.mcn_order_items.map((item, idx) => {
            const subtotal = Number(item.unit_price) * Number(item.quantity);
            return (
              <View key={idx} style={styles.itemRow}>
                <Text style={[styles.itemName, { color: colors.textSecondary }]}>
                  {item.mcn_products?.name || 'Deleted item'} <Text style={{ color: colors.textTertiary }}>×</Text> {item.quantity} {item.mcn_products?.unit}
                </Text>
                <Rupees amount={subtotal} size="sm" />
              </View>
            );
          })}
        </View>

        <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />

        <View style={styles.footerRow}>
          <View>
            <Text style={[styles.totalLabel, { color: colors.textPrimary }]}>Total amount</Text>
            <Rupees amount={total} size="sm" tone="in" />
          </View>
          <Text style={[styles.dateText, { color: colors.textTertiary }]}>
            Placed: {formatDate(order.created_at)}
          </Text>
        </View>

        {order.buyer_note ? (
          <View style={[styles.noteContainer, { backgroundColor: colors.surface }]}>
            <Text style={[styles.noteLabel, { color: colors.textTertiary }]}>Your note:</Text>
            <Text style={[styles.noteText, { color: colors.textSecondary }]}>"{order.buyer_note}"</Text>
          </View>
        ) : null}

        <View style={styles.actionRow}>
          {phone ? (
            <>
              <TouchableOpacity
                onPress={() => handleCall(phone)}
                style={[styles.actionBtn, { borderColor: colors.border }]}
              >
                <Ionicons name="call-outline" size={16} color={colors.accent} />
                <Text style={[styles.actionBtnText, { color: colors.accent }]}>Call seller</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleWhatsApp(phone, listingName, order.mcn_order_items)}
                style={[styles.actionBtn, { borderColor: colors.border }]}
              >
                <Ionicons name="logo-whatsapp" size={16} color={colors.accent} />
                <Text style={[styles.actionBtnText, { color: colors.accent }]}>WhatsApp</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {order.status === 'pending' && (
            <TouchableOpacity
              onPress={() => handleCancelOrder(order.id)}
              style={[styles.cancelBtn, { borderColor: colors.danger }]}
            >
              <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
              <Text style={[styles.cancelBtnText, { color: colors.danger }]}>Cancel order</Text>
            </TouchableOpacity>
          )}
        </View>
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
      <Stack.Screen options={{ title: 'My orders' }} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {pendingOrders.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.caution }]}>Pending</Text>
            {pendingOrders.map(renderOrderCard)}
          </View>
        )}

        {fulfilledOrders.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.accent }]}>Fulfilled</Text>
            {fulfilledOrders.map(renderOrderCard)}
          </View>
        )}

        {cancelledOrders.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.danger }]}>Cancelled</Text>
            {cancelledOrders.map(renderOrderCard)}
          </View>
        )}

        {orders.length === 0 && (
          <View style={styles.emptyWrap}>
            <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              You haven't placed any orders yet.
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
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  businessName: {
    ...VerandahType.bodyBold,
  },
  sellerInfo: {
    ...VerandahType.caption,
    marginTop: 2,
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
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    ...VerandahType.micro,
    color: Verandah.textSecondary,
    marginBottom: 2,
  },
  dateText: {
    ...VerandahType.micro,
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
    gap: 8,
    marginTop: 16,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionBtnText: {
    ...VerandahType.captionBold,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelBtnText: {
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
