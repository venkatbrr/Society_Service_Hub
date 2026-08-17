import { AlertCircle } from '@untitledui/icons/AlertCircle';
import { ArrowUp } from '@untitledui/icons/ArrowUp';
import { Award01 } from '@untitledui/icons/Award01';
import { Bell01 } from '@untitledui/icons/Bell01';
import { BellOff01 } from '@untitledui/icons/BellOff01';
import { Calendar } from '@untitledui/icons/Calendar';
import { CalendarDate } from '@untitledui/icons/CalendarDate';
import { Car01 } from '@untitledui/icons/Car01';
import { CheckCircle } from '@untitledui/icons/CheckCircle';
import { File02 } from '@untitledui/icons/File02';
import { Flag01 } from '@untitledui/icons/Flag01';
import { ShoppingBag01 } from '@untitledui/icons/ShoppingBag01';
import { Tool01 } from '@untitledui/icons/Tool01';
import { Users01 } from '@untitledui/icons/Users01';
import { UserX01 } from '@untitledui/icons/UserX01';
import { Wallet02 } from '@untitledui/icons/Wallet02';
import { XCircle } from '@untitledui/icons/XCircle';

import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { HeaderBackButton } from '../components/HeaderBackButton';
import { Verandah } from '../constants/Colors';
import { VerandahBorder, VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
import { useNotifications } from '../context/NotificationContext';
import { useWebPullToRefresh } from '../components/useWebPullToRefresh';
import { WebPullIndicator } from '../components/WebPullIndicator';

export default function NotificationsScreen() {
  const router = useRouter();
  const { notifications, loading, markAsRead, markAllAsRead, fetchNotifications } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    if (fetchNotifications) await fetchNotifications();
    setRefreshing(false);
  };

  const pullToRefresh = useWebPullToRefresh(onRefresh, refreshing);

  const getNotificationIconComponent = (type: string) => {
    switch (type) {
      case 'new_visit':
      case 'visit_rescheduled':
        return Calendar;
      case 'community_approved':
      case 'funds_access_approved':
        return CheckCircle;
      case 'community_rejected':
      case 'funds_access_rejected':
        return XCircle;
      case 'new_community_request':
        return File02;
      case 'new_promotion_request':
      case 'promoted_to_admin':
      case 'promotion_approved':
        return ArrowUp;
      case 'promotion_rejected':
        return AlertCircle;
      case 'removed_from_community':
        return UserX01;
      case 'service_reminder':
        return Tool01;
      case 'funds_access_requested':
        return Wallet02;
      case 'community_lead_appointed':
        return Award01;
      case 'carpool_request':
      case 'carpool_request_accepted':
      case 'carpool_request_rejected':
      case 'carpool_request_cancelled':
      case 'carpool_cancelled':
      case 'carpool_paused':
        return Car01;
      case 'provider_reported':
      case 'listing_reported':
      case 'listing_auto_hidden':
      case 'drop_reported':
      case 'drop_auto_hidden':
      case 'drop_hidden_host':
      case 'drop_hidden_buyer':
        return Flag01;
      case 'drop_posted':
      case 'preorder_received':
        return ShoppingBag01;
      case 'parent_corner_posted':
        return Users01;
      case 'community_event_posted':
      case 'community_event_cancelled':
        return CalendarDate;
      default:
        return Bell01;
    }
  };

  const handleNotificationPress = async (notification: any) => {
    await markAsRead(notification.id);

    // Navigate based on type
    if (notification.type === 'provider_reported' && notification.data?.provider_id) {
      router.push(`/provider/${notification.data.provider_id}`);
      return;
    }

    if (notification.type === 'visit_rescheduled' && notification.data?.visit_id) {
      router.push(`/visits/${notification.data.visit_id}`);
      return;
    }

    if (notification.type === 'drop_posted' && notification.data?.drop_id) {
      router.push(`/mcn/drops/${notification.data.drop_id}` as any);
      return;
    }

    if (notification.type === 'preorder_received' && notification.data?.drop_id) {
      router.push(`/mcn/drops/manage/${notification.data.drop_id}` as any);
      return;
    }

    if (notification.type === 'parent_corner_posted') {
      router.push('/mcn/parents' as any);
      return;
    }

    // Moderation notices are the only route back to a hidden object: a hidden
    // drop is filtered out of the public catalog, and a hidden listing is
    // is_active = false. Without these the notification was a dead end.
    if (
      (notification.type === 'drop_reported' ||
       notification.type === 'drop_auto_hidden' ||
       notification.type === 'drop_hidden_host' ||
       notification.type === 'drop_hidden_buyer') &&
      notification.data?.drop_id
    ) {
      router.push(`/mcn/drops/${notification.data.drop_id}` as any);
      return;
    }


    if (
      (notification.type === 'listing_reported' ||
       notification.type === 'listing_auto_hidden') &&
      notification.data?.listing_id
    ) {
      router.push(`/mcn/listing/${notification.data.listing_id}` as any);
      return;
    }

    if (
      (notification.type === 'carpool_request' ||
       notification.type === 'carpool_request_accepted' ||
       notification.type === 'carpool_request_rejected' ||
       notification.type === 'carpool_request_cancelled' ||
       notification.type === 'carpool_cancelled' ||
       notification.type === 'carpool_paused') &&
      notification.data?.carpool_id
    ) {
      router.push(`/mcn/carpools/${notification.data.carpool_id}` as any);
      return;
    }

    if (
      (notification.type === 'community_event_posted' ||
       notification.type === 'community_event_cancelled') &&
      notification.data?.event_id
    ) {
      router.push(`/events/${notification.data.event_id}` as any);
      return;
    }

    if (notification.type === 'new_visit' && notification.data?.visit_id) {
      router.push(`/visits/${notification.data.visit_id}`);
      return;
    }

    if (notification.type === 'community_approved' || notification.type === 'community_rejected') {
      router.push('/community-select');
      return;
    }

    if (
      notification.type === 'promoted_to_admin' ||
      notification.type === 'promotion_approved' ||
      notification.type === 'promotion_rejected' ||
      notification.type === 'new_community_request' ||
      notification.type === 'new_promotion_request' ||
      notification.type === 'funds_access_requested'
    ) {
      router.push('/admin-redirect' as any);
      return;
    }

    if (
      notification.type === 'funds_access_approved' ||
      notification.type === 'funds_access_rejected' ||
      notification.type === 'community_lead_appointed' ||
      notification.type === 'funds_access_revoked'
    ) {
      router.push('/(tabs)/community');
      return;
    }

    if (notification.type === 'removed_from_community') {
      router.push('/community-select');
    }

    if (notification.type === 'service_reminder' && notification.data?.service_id) {
      router.push(`/services/${notification.data.service_id}` as any);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const isUnread = !item.is_read;
    const IconComp = getNotificationIconComponent(item.type);

    return (
      <TouchableOpacity
        style={[
          styles.notificationItem,
          {
            backgroundColor: isUnread ? Verandah.card : Verandah.cardMuted,
            borderColor: isUnread ? Verandah.borderStrong : Verandah.borderHair,
          },
          isUnread && styles.notificationItemUnread,
        ]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.iconContainer,
            {
              backgroundColor: isUnread ? Verandah.accentSoft : Verandah.cardMuted,
            },
          ]}
        >
          <IconComp
            size={22}
            color={isUnread ? Verandah.accent : Verandah.textMuted}
            aria-hidden={true}
          />
        </View>

        <View style={styles.content}>
          <View style={styles.row}>
            <Text
              style={[
                styles.notifTitle,
                {
                  color: isUnread ? Verandah.textPrimary : Verandah.textSecondary,
                  fontWeight: isUnread ? '600' : '400',
                },
              ]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            {isUnread && <View style={[styles.unreadDot, { backgroundColor: Verandah.accent }]} />}
          </View>

          <Text
            style={[
              styles.body,
              { color: isUnread ? Verandah.textPrimary : Verandah.textSecondary },
            ]}
            numberOfLines={2}
          >
            {item.body}
          </Text>

          <Text style={[styles.time, { color: Verandah.textTertiary }]}>
            {new Date(item.created_at).toLocaleDateString('en-IN', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: Verandah.paper }]}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: Verandah.textPrimary }]}>Notifications</Text>
        {notifications.length > 0 && (
          <TouchableOpacity
            onPress={markAllAsRead}
            style={[styles.markAllButton, { backgroundColor: Verandah.card, borderColor: Verandah.borderHair }]}
          >
            <Text style={[styles.markAll, { color: Verandah.primary }]}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Verandah.accent} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          {...pullToRefresh.pullProps}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Verandah.accent} />
          }
          ListHeaderComponent={
            <WebPullIndicator pullDistance={pullToRefresh.pullDistance} refreshing={refreshing} isPulling={pullToRefresh.isPulling} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconWrapper, { backgroundColor: Verandah.cardMuted, borderColor: Verandah.borderHair }]}>
                <BellOff01 size={40} color={Verandah.textSecondary} aria-hidden={true} />
              </View>
              <Text style={[styles.emptyText, { color: Verandah.textPrimary }]}>No notifications yet</Text>
              <Text style={[styles.emptySubtext, { color: Verandah.textSecondary }]}>
                We'll notify you when neighbors share new visits or community updates.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Verandah.paper,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: VerandahLayout.screenPaddingTop,
    paddingBottom: 14,
    gap: 12,
    backgroundColor: Verandah.paper,
  },
  headerTitle: {
    flex: 1,
    fontFamily: VerandahType.serifFamily,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '400',
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: VerandahRadius.button,
    borderWidth: 0.5,
  },
  markAll: {
    fontSize: 12.5,
    fontWeight: '600',
    fontFamily: VerandahType.sansFamily,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 8,
  },
  notificationItem: {
    flexDirection: 'row',
    padding: 14,
    gap: 12,
    marginBottom: 0,
    borderRadius: VerandahRadius.card,
    borderWidth: VerandahBorder.tile,
    ...Verandah.shadowCard,
  },
  notificationItemUnread: {
    elevation: 0,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    gap: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  notifTitle: {
    flex: 1,
    fontSize: 14.5,
    fontFamily: VerandahType.sansFamily,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: VerandahType.sansFamily,
  },
  time: {
    fontSize: 11.5,
    marginTop: 2,
    fontFamily: VerandahType.sansFamily,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    marginTop: 60,
  },
  emptyIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 0.5,
  },
  emptyText: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 22,
    fontWeight: '400',
    marginBottom: 6,
  },
  emptySubtext: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: VerandahType.sansFamily,
  },
});
