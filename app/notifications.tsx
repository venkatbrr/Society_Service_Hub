import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { HeaderBackButton } from '../components/HeaderBackButton';
import { Verandah } from '../constants/Colors';
import { VerandahLayout } from '../constants/Verandah';
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

  useEffect(() => {
    // Optionally mark all as read when leaving the screen
    // return () => markAllAsRead();
  }, []);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'new_visit':
        return 'calendar';
      case 'community_approved':
        return 'checkmark-circle';
      case 'community_rejected':
        return 'close-circle';
      case 'new_community_request':
        return 'document-text';
      case 'new_promotion_request':
      case 'promoted_to_admin':
      case 'promotion_approved':
        return 'arrow-up-circle';
      case 'promotion_rejected':
        return 'alert-circle';
      case 'removed_from_community':
        return 'person-remove';
      case 'service_reminder':
        return 'construct';
      case 'funds_access_requested':
        return 'cash';
      case 'funds_access_approved':
        return 'checkmark-done-circle';
      case 'funds_access_rejected':
        return 'close-circle';
      case 'community_lead_appointed':
        return 'ribbon';
      case 'carpool_request':
      case 'carpool_request_accepted':
      case 'carpool_request_rejected':
      case 'carpool_request_cancelled':
      case 'carpool_cancelled':
      case 'carpool_paused':
        return 'car-outline';
      case 'provider_reported':
        return 'flag';
      case 'visit_rescheduled':
        return 'calendar';
      default:
        return 'notifications';
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
      router.push({ pathname: '/services/[id]', params: { id: notification.data.service_id } } as any);
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[
        styles.notificationItem,
        {
          backgroundColor: item.is_read ? 'transparent' : Verandah.card,
          borderColor: item.is_read ? Verandah.border : Verandah.borderStrong,
        },
        !item.is_read && styles.notificationItemUnread,
      ]}
      onPress={() => handleNotificationPress(item)}
    >
      <View style={[
        styles.iconContainer,
        { backgroundColor: item.is_read ? Verandah.cardMuted : Verandah.primary }
      ]}>
        <Ionicons
          name={getNotificationIcon(item.type) as any}
          size={22}
          color={item.is_read ? Verandah.textSecondary : Verandah.primaryFg}
        />
      </View>
      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={[styles.notifTitle, { color: Verandah.textPrimary }, !item.is_read && { fontWeight: '500' }]}>
            {item.title}
          </Text>
          {!item.is_read && (
            <View style={[styles.unreadDot, { backgroundColor: Verandah.accent }]} />
          )}
        </View>
        <Text style={[styles.body, { color: Verandah.textSecondary }]} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={[styles.time, { color: Verandah.textSecondary }]}>
          {new Date(item.created_at).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: Verandah.surface }]}>
      <View style={styles.header}>
        <HeaderBackButton
          onPress={() => router.back()}
          color={Verandah.textPrimary}
          style={[styles.backButton, { backgroundColor: Verandah.card, borderColor: Verandah.border }] as any}
        />
        <Text style={[styles.headerTitle, { color: Verandah.textPrimary }]}>Notifications</Text>
        {notifications.length > 0 && (
          <TouchableOpacity
            onPress={markAllAsRead}
            style={[styles.markAllButton, { backgroundColor: Verandah.card, borderColor: Verandah.border }]}
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
              <View style={[styles.emptyIconWrapper, { backgroundColor: Verandah.card, borderColor: Verandah.border }]}>
                <Ionicons name="notifications-off-outline" size={48} color={Verandah.textSecondary} />
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
  },
  headerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    zIndex: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: VerandahLayout.screenPaddingTop,
    paddingBottom: 20,
    gap: 16,
    zIndex: 1,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '500',
  },
  markAllButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  markAll: {
    fontSize: 13,
    fontWeight: '500',
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
  },
  notificationItem: {
    flexDirection: 'row',
    padding: 16,
    gap: 14,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  notificationItemUnread: {
    elevation: 0,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  notifTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  time: {
    fontSize: 12,
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    marginTop: 80,
  },
  emptyIconWrapper: {
    width: 100,
    height: 100,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    elevation: 0,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '500',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
