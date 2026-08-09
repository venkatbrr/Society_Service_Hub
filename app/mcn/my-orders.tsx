import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { goBackSmart } from '../../lib/navigation';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Rupees } from '../../components/Rupees';
import { Verandah } from '../../constants/Colors';
import { format12HourTime, VerandahRadius, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { confirmAction } from '../../lib/confirm';
import { buildMcnHeaderOptions } from '../../lib/mcnHeader';
import { buildWhatsAppUrl } from '../../lib/phone';
import { supabase } from '../../lib/supabase';

interface PreorderItem {
  id: string;
  item_name?: string | null;
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

  const [preorderOrders, setPreorderOrders] = useState<PreorderOrder[]>([]);
  const [preorderError, setPreorderError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchMyOrders = useCallback(
    async (isRefresh = false) => {
      if (!user?.id) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const { data: pData, error: pErr } = await supabase
          .from('mcn_preorder_orders')
          .select(`
            id, status, buyer_note, total_amount, created_at, drop_id,
            mcn_preorder_drops(
              id, title, fulfillment_date, fulfillment_time,
              profiles!created_by(full_name, flat_number, phone_number)
            ),
            mcn_preorder_order_items(
              id, item_name, quantity, unit_price,
              mcn_preorder_items(name, unit)
            )
          `)
          .eq('buyer_id', user.id)
          .order('created_at', { ascending: false });

        if (pErr) {
          console.error('Error fetching food pre-orders:', pErr);
          setPreorderError(pErr.message);
        } else {
          setPreorderError(null);
          setPreorderOrders(
            (pData || []).map((o: any) => ({ ...o, type: 'preorder' })) as PreorderOrder[]
          );
        }
      } catch (error: any) {
        console.error(error);
        Toast.show({ type: 'error', text1: 'Failed to load your orders', text2: error?.message });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id]
  );

  useFocusEffect(
    useCallback(() => {
      fetchMyOrders();
    }, [fetchMyOrders])
  );

  const handleCancelPreorder = (orderId: string) => {
    if (!user?.id || cancellingId) return;

    confirmAction({
      title: 'Cancel pre-order?',
      message: 'Are you sure you want to cancel your food pre-order?',
      confirmLabel: 'Yes, cancel',
      destructive: true,
      onConfirm: async () => {
        setCancellingId(orderId);
        try {
          const { data, error } = await supabase
            .from('mcn_preorder_orders')
            .update({ status: 'cancelled' })
            .eq('id', orderId)
            .eq('buyer_id', user.id)
            .eq('status', 'confirmed')
            .select('id')
            .maybeSingle();

          if (error) throw error;
          if (!data) {
            Toast.show({
              type: 'info',
              text1: 'Nothing to cancel',
              text2: 'This pre-order was already delivered or cancelled.',
            });
          } else {
            Toast.show({ type: 'success', text1: 'Pre-order cancelled' });
          }
        } catch (error: any) {
          console.error(error);
          Toast.show({ type: 'error', text1: 'Failed to cancel pre-order', text2: error?.message });
        } finally {
          setCancellingId(null);
          fetchMyOrders();
        }
      },
    });
  };

  const handleCall = (phone: string | null) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  };

  const handleWhatsApp = (phone: string | null, title: string, itemsText: string, total: number) => {
    const text = `Hi, I placed an order for "${title}" on Wooru:\n${itemsText}\nTotal: ₹${total.toFixed(0)}`;
    const url = buildWhatsAppUrl(phone, text);
    if (url) {
      Linking.openURL(url);
    } else {
      Toast.show({ type: 'error', text1: 'Invalid phone number for WhatsApp' });
    }
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
    goBackSmart(router, '/mcn/my-orders');
  };

  // Grouping: Sort confirmed/fulfilled first, cancelled at the bottom
  const sortedPreorderOrders = [...preorderOrders].sort((a, b) => {
    if (a.status === 'cancelled' && b.status !== 'cancelled') return 1;
    if (a.status !== 'cancelled' && b.status === 'cancelled') return -1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Render Pre-Order Card
  const renderPreorderCard = (order: PreorderOrder) => {
    const drop = order.mcn_preorder_drops;
    const isOutdatedOrMissing = !drop;
    const dropTitle = drop?.title || 'Food Drop';
    const hostName = drop?.profiles?.full_name || 'Host';
    const hostFlat = drop?.profiles?.flat_number ? `Flat ${drop.profiles.flat_number}` : '';
    const phone = drop?.profiles?.phone_number;

    const fulfillDateObj = drop?.fulfillment_date ? new Date(drop.fulfillment_date) : null;
    const fulfillFormatted = fulfillDateObj
      ? fulfillDateObj.toLocaleDateString('en-IN', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        })
      : null;

    const isFulfilled = order.status === 'fulfilled';
    const isCancelled = order.status === 'cancelled';
    const isCancelling = cancellingId === order.id;

    const itemsSummary = order.mcn_preorder_order_items
      .map(
        (i) =>
          `- ${i.item_name || i.mcn_preorder_items?.name || 'Item'} x ${i.quantity} ${i.mcn_preorder_items?.unit || ''}`
      )
      .join('\n');

    return (
      <View key={order.id} style={[styles.orderCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.businessName, { color: colors.textPrimary }]}>{dropTitle}</Text>
            {!isOutdatedOrMissing ? (
              <Text style={[styles.sellerInfo, { color: colors.textTertiary }]}>
                Hosted by: {hostName} {hostFlat ? `· ${hostFlat}` : ''}
              </Text>
            ) : (
              <Text style={[styles.sellerInfo, { color: colors.danger }]}>
                This food drop is no longer available in your community
              </Text>
            )}
          </View>
          <View
            style={[
              styles.statusBadgeWrap,
              isFulfilled
                ? styles.badgeFulfilled
                : isCancelled
                ? styles.badgeCancelled
                : styles.badgeConfirmed,
            ]}
          >
            <Ionicons
              name={isFulfilled ? 'checkmark-circle' : isCancelled ? 'close-circle' : 'time-outline'}
              size={13}
              color={isFulfilled ? '#059669' : isCancelled ? '#DC2626' : '#D97706'}
            />
            <Text
              style={[
                styles.statusBadgeText,
                { color: isFulfilled ? '#059669' : isCancelled ? '#DC2626' : '#D97706' },
              ]}
            >
              {isFulfilled ? 'Delivered' : isCancelled ? 'Cancelled' : 'Confirmed'}
            </Text>
          </View>
        </View>

        {/* Delivery Schedule Banner */}
        {fulfillFormatted && drop?.fulfillment_time && (
          <View style={styles.deliveryBanner}>
            <Ionicons name="calendar-outline" size={15} color={colors.accent} />
            <Text style={styles.deliveryBannerText}>
              Delivery: <Text style={{ fontWeight: '700' }}>{fulfillFormatted}</Text> ({format12HourTime(drop.fulfillment_time)})
            </Text>
          </View>
        )}

        {/* Items List */}
        <View style={styles.itemsList}>
          {order.mcn_preorder_order_items.map((item) => {
            const subtotal = Number(item.unit_price) * Number(item.quantity);
            const itemName = item.item_name || item.mcn_preorder_items?.name || 'Item';
            return (
              <View key={item.id} style={styles.itemRow}>
                <Text style={[styles.itemName, { color: colors.textSecondary }]}>
                  {itemName} <Text style={{ color: colors.textTertiary }}>×</Text> {item.quantity} {item.mcn_preorder_items?.unit}
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
        {!isOutdatedOrMissing ? (
          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={() => router.push(`/mcn/drops/${order.drop_id}` as any)}
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
                disabled={isCancelling}
                style={[styles.cancelBtn, { borderColor: colors.danger }]}
              >
                {isCancelling ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <>
                    <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
                    <Text style={[styles.cancelBtnText, { color: colors.danger }]}>Cancel pre-order</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: 'My Orders',
          onBack: handleBack,
        })}
      />

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchMyOrders(true)}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        >
          {preorderError ? (
            <View style={styles.errorWrap}>
              <Ionicons name="alert-circle-outline" size={44} color={colors.danger} />
              <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>Couldn't load your pre-orders</Text>
              <Text style={[styles.errorSubtitle, { color: colors.textSecondary }]}>{preorderError}</Text>
              <TouchableOpacity
                onPress={() => fetchMyOrders(true)}
                style={[styles.retryBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.retryBtnText, { color: colors.primaryFg }]}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : sortedPreorderOrders.length > 0 ? (
            sortedPreorderOrders.map(renderPreorderCard)
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="restaurant-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                You haven't placed any food pop-up pre-orders yet.
              </Text>
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
  orderCard: {
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  businessName: {
    ...VerandahType.title,
    fontSize: 16,
  },
  sellerInfo: {
    ...VerandahType.caption,
    fontSize: 12,
    marginTop: 2,
  },
  statusBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: VerandahRadius.pill,
    gap: 4,
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
    ...VerandahType.captionBold,
    fontSize: 11,
  },
  deliveryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    padding: 8,
    borderRadius: VerandahRadius.sm,
    marginBottom: 8,
    gap: 6,
  },
  deliveryBannerText: {
    ...VerandahType.caption,
    fontSize: 12,
    color: '#065F46',
  },
  itemsList: {
    marginVertical: 4,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  itemName: {
    ...VerandahType.body,
    fontSize: 13,
  },
  rowDivider: {
    height: 1,
    marginVertical: 8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    ...VerandahType.bodyBold,
    fontSize: 13,
  },
  dateText: {
    ...VerandahType.caption,
    fontSize: 11,
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
    gap: 8,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flex: 1,
    minWidth: 90,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: VerandahRadius.sm,
    borderWidth: 1,
    gap: 4,
  },
  actionBtnText: {
    ...VerandahType.bodyBold,
    fontSize: 12,
  },
  cancelBtn: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: VerandahRadius.sm,
    borderWidth: 1,
    gap: 4,
  },
  cancelBtnText: {
    ...VerandahType.bodyBold,
    fontSize: 12,
  },
  emptyWrap: {
    paddingTop: 60,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    ...VerandahType.body,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
  errorWrap: {
    paddingTop: 50,
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  errorTitle: {
    ...VerandahType.title,
    fontSize: 16,
    textAlign: 'center',
  },
  errorSubtitle: {
    ...VerandahType.body,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: VerandahRadius.md,
  },
  retryBtnText: {
    ...VerandahType.bodyBold,
    fontSize: 13,
  },
});
