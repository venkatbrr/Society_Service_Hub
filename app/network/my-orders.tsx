import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { McnOrderStatusBadge } from '../../components/McnOrderStatusBadge';
import { Rupees } from '../../components/Rupees';
import { Verandah } from '../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

interface BusinessOrderItem {
  quantity: number;
  unit_price: number;
  mcn_products: {
    name: string;
    unit: string;
  } | null;
}

interface BusinessOrder {
  id: string;
  type: 'business';
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
  mcn_order_items: BusinessOrderItem[];
}

interface PreorderItem {
  id: string;
  quantity: number;
  unit_price: number;
  mcn_preorder_items: {
    name: string;
    unit: string;
  } | null;
}

interface PreorderOrder {
  id: string;
  type: 'preorder';
  drop_id: string;
  status: 'confirmed' | 'fulfilled' | 'cancelled';
  buyer_note: string | null;
  total_amount: number;
  created_at: string;
  mcn_preorder_drops: {
    id: string;
    title: string;
    fulfillment_date: string;
    fulfillment_time: string;
    profiles: {
      full_name: string;
      flat_number: string | null;
      phone_number: string | null;
    } | null;
  } | null;
  mcn_preorder_order_items: PreorderItem[];
}

export default function MyOrdersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const colors = Verandah;

  const [activeTab, setActiveTab] = useState<'preorder' | 'business'>('preorder');
  const [businessOrders, setBusinessOrders] = useState<BusinessOrder[]>([]);
  const [preorderOrders, setPreorderOrders] = useState<PreorderOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMyOrders = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    try {
      // 1. Fetch Business Orders
      const { data: bData, error: bErr } = await supabase
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
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: false });

      if (bErr) console.error('Error fetching business orders:', bErr);
      else if (bData) {
        setBusinessOrders(
          bData.map((o: any) => ({ ...o, type: 'business' })) as BusinessOrder[]
        );
      }

      // 2. Fetch Food Pre-Orders
      const { data: pData, error: pErr } = await supabase
        .from('mcn_preorder_orders')
        .select(`
          id, status, buyer_note, total_amount, created_at, drop_id,
          mcn_preorder_drops(
            id, title, fulfillment_date, fulfillment_time,
            profiles!created_by(full_name, flat_number, phone_number)
          ),
          mcn_preorder_order_items(
            id, quantity, unit_price,
            mcn_preorder_items(name, unit)
          )
        `)
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: false });

      if (pErr) console.error('Error fetching food pre-orders:', pErr);
      else if (pData) {
        setPreorderOrders(
          pData.map((o: any) => ({ ...o, type: 'preorder' })) as PreorderOrder[]
        );
      }
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

  const handleCancelBusinessOrder = (orderId: string) => {
    const doCancel = async () => {
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
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Cancel order?\n\nAre you sure you want to cancel this order?')) {
        doCancel();
      }
    } else {
      Alert.alert('Cancel order', 'Are you sure you want to cancel this order?', [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, cancel', style: 'destructive', onPress: doCancel },
      ]);
    }
  };

  const handleCancelPreorder = (orderId: string) => {
    const doCancel = async () => {
      if (!user?.id) return;
      try {
        const { error } = await supabase
          .from('mcn_preorder_orders')
          .update({ status: 'cancelled' })
          .eq('id', orderId)
          .eq('buyer_id', user.id);

        if (error) throw error;
        Toast.show({ type: 'success', text1: 'Pre-order cancelled' });
        fetchMyOrders();
      } catch (error) {
        console.error(error);
        Toast.show({ type: 'error', text1: 'Failed to cancel pre-order' });
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Cancel pre-order?\n\nAre you sure you want to cancel your food pre-order?')) {
        doCancel();
      }
    } else {
      Alert.alert('Cancel pre-order', 'Are you sure you want to cancel your food pre-order?', [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, cancel', style: 'destructive', onPress: doCancel },
      ]);
    }
  };

  const handleCall = (phone: string | null) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  };

  const handleWhatsApp = (phone: string | null, title: string, itemsText: string, total: number) => {
    if (!phone) return;
    const text = encodeURIComponent(
      `Hi, I placed a pre-order for "${title}" on Society Service Hub:\n${itemsText}\nTotal: ₹${total.toFixed(0)}`
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

  const handleBack = () => {
    router.replace('/(tabs)/network' as any);
  };

  // Render Pre-Order Card
  const renderPreorderCard = (order: PreorderOrder) => {
    const drop = order.mcn_preorder_drops;
    const dropTitle = drop?.title || 'Food Drop';
    const hostName = drop?.profiles?.full_name || 'Host';
    const hostFlat = drop?.profiles?.flat_number ? `Flat ${drop.profiles.flat_number}` : '';
    const phone = drop?.profiles?.phone_number;

    const fulfillDateObj = new Date(drop?.fulfillment_date || Date.now());
    const fulfillFormatted = fulfillDateObj.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });

    const isFulfilled = order.status === 'fulfilled';
    const isCancelled = order.status === 'cancelled';

    const itemsSummary = order.mcn_preorder_order_items
      .map(
        (i) => `- ${i.mcn_preorder_items?.name || 'Item'} x ${i.quantity} ${i.mcn_preorder_items?.unit || ''}`
      )
      .join('\n');

    return (
      <View key={order.id} style={[styles.orderCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.businessName, { color: colors.textPrimary }]}>{dropTitle}</Text>
            <Text style={[styles.sellerInfo, { color: colors.textTertiary }]}>
              Hosted by: {hostName} {hostFlat ? `· ${hostFlat}` : ''}
            </Text>
          </View>
          <View style={[styles.statusBadgeWrap, isFulfilled ? styles.badgeFulfilled : isCancelled ? styles.badgeCancelled : styles.badgeConfirmed]}>
            <Ionicons
              name={isFulfilled ? 'checkmark-circle' : isCancelled ? 'close-circle' : 'time-outline'}
              size={13}
              color={isFulfilled ? '#059669' : isCancelled ? '#DC2626' : '#D97706'}
            />
            <Text style={[styles.statusBadgeText, { color: isFulfilled ? '#059669' : isCancelled ? '#DC2626' : '#D97706' }]}>
              {isFulfilled ? 'Delivered' : isCancelled ? 'Cancelled' : 'Confirmed'}
            </Text>
          </View>
        </View>

        {/* Delivery Schedule Banner */}
        <View style={styles.deliveryBanner}>
          <Ionicons name="calendar-outline" size={15} color={colors.accent} />
          <Text style={styles.deliveryBannerText}>
            Delivery: <Text style={{ fontWeight: '700' }}>{fulfillFormatted}</Text> ({drop?.fulfillment_time})
          </Text>
        </View>

        {/* Items List */}
        <View style={styles.itemsList}>
          {order.mcn_preorder_order_items.map((item) => {
            const subtotal = Number(item.unit_price) * Number(item.quantity);
            return (
              <View key={item.id} style={styles.itemRow}>
                <Text style={[styles.itemName, { color: colors.textSecondary }]}>
                  {item.mcn_preorder_items?.name || 'Item'} <Text style={{ color: colors.textTertiary }}>×</Text> {item.quantity} {item.mcn_preorder_items?.unit}
                </Text>
                <Rupees amount={subtotal} size="sm" />
              </View>
            );
          })}
        </View>

        <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />

        {/* Total & Date */}
        <View style={styles.footerRow}>
          <View>
            <Text style={[styles.totalLabel, { color: colors.textPrimary }]}>Total amount</Text>
            <Rupees amount={order.total_amount} size="sm" tone="in" />
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

        {/* Action Row */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            onPress={() => router.push(`/network/drops/${order.drop_id}` as any)}
            style={[styles.actionBtn, { borderColor: colors.accent, backgroundColor: '#F0FDF4' }]}
          >
            <Ionicons name="eye-outline" size={16} color={colors.accent} />
            <Text style={[styles.actionBtnText, { color: colors.accent }]}>View Drop</Text>
          </TouchableOpacity>

          {phone ? (
            <>
              <TouchableOpacity
                onPress={() => handleCall(phone)}
                style={[styles.actionBtn, { borderColor: colors.border }]}
              >
                <Ionicons name="call-outline" size={16} color={colors.accent} />
                <Text style={[styles.actionBtnText, { color: colors.accent }]}>Call Host</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleWhatsApp(phone, dropTitle, itemsSummary, order.total_amount)}
                style={[styles.actionBtn, { borderColor: colors.border }]}
              >
                <Ionicons name="logo-whatsapp" size={16} color={colors.accent} />
                <Text style={[styles.actionBtnText, { color: colors.accent }]}>WhatsApp</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {order.status === 'confirmed' && (
            <TouchableOpacity
              onPress={() => handleCancelPreorder(order.id)}
              style={[styles.cancelBtn, { borderColor: colors.danger }]}
            >
              <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
              <Text style={[styles.cancelBtnText, { color: colors.danger }]}>Cancel pre-order</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // Render Business Order Card
  const renderBusinessOrderCard = (order: BusinessOrder) => {
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
                onPress={() => handleWhatsApp(phone, listingName, '', total)}
                style={[styles.actionBtn, { borderColor: colors.border }]}
              >
                <Ionicons name="logo-whatsapp" size={16} color={colors.accent} />
                <Text style={[styles.actionBtnText, { color: colors.accent }]}>WhatsApp</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {order.status === 'pending' && (
            <TouchableOpacity
              onPress={() => handleCancelBusinessOrder(order.id)}
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
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Stack.Screen
        options={{
          title: 'My Orders',
          headerLeft: () => (
            <TouchableOpacity onPress={handleBack} style={{ marginRight: 12 }}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Segmented Control Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'preorder' && styles.tabBtnActive]}
          onPress={() => setActiveTab('preorder')}
        >
          <Ionicons
            name="restaurant-outline"
            size={16}
            color={activeTab === 'preorder' ? colors.accent : colors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'preorder' && styles.tabTextActive]}>
            Food drops ({preorderOrders.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'business' && styles.tabBtnActive]}
          onPress={() => setActiveTab('business')}
        >
          <Ionicons
            name="storefront-outline"
            size={16}
            color={activeTab === 'business' ? colors.accent : colors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'business' && styles.tabTextActive]}>
            Business Orders ({businessOrders.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'preorder' ? (
          preorderOrders.length > 0 ? (
            preorderOrders.map(renderPreorderCard)
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="restaurant-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                You haven't placed any food pop-up pre-orders yet.
              </Text>
            </View>
          )
        ) : businessOrders.length > 0 ? (
          businessOrders.map(renderBusinessOrderCard)
        ) : (
          <View style={styles.emptyWrap}>
            <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              You haven't placed any business orders yet.
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
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
    gap: 10,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: VerandahRadius.pill,
    backgroundColor: '#F3F4F6',
  },
  tabBtnActive: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  tabTextActive: {
    fontWeight: '700',
    color: Verandah.accent,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 80,
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
    marginBottom: 10,
  },
  businessName: {
    ...VerandahType.bodyBold,
  },
  sellerInfo: {
    ...VerandahType.caption,
    marginTop: 2,
  },
  statusBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeConfirmed: {
    backgroundColor: '#FEF3C7',
  },
  badgeFulfilled: {
    backgroundColor: '#D1FAE5',
  },
  badgeCancelled: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  deliveryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    borderWidth: 0.5,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  deliveryBannerText: {
    fontSize: 12,
    color: Verandah.textPrimary,
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
    paddingTop: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    ...VerandahType.body,
    textAlign: 'center',
  },
});
