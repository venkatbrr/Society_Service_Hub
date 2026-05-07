import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { useNotifications } from '../context/NotificationContext';

export default function NotificationsScreen() {
  const router = useRouter();
  const { notifications, loading, markAsRead, markAllAsRead } = useNotifications();
  const colors = Colors.light;

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
      case 'funds_access_revoked':
        return 'ban';
      default:
        return 'notifications';
    }
  };

  const handleNotificationPress = async (notification: any) => {
    await markAsRead(notification.id);

    // Navigate based on type
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
      router.push('/platform/approvals' as any);
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
          backgroundColor: item.is_read ? 'transparent' : colors.glass,
          borderColor: item.is_read ? colors.border : colors.glassBorder,
        },
        !item.is_read && styles.notificationItemUnread,
      ]}
      onPress={() => handleNotificationPress(item)}
    >
      <View style={[
        styles.iconContainer,
        { backgroundColor: item.is_read ? colors.surface2 : colors.primary + '18' }
      ]}>
        {!item.is_read ? (
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            style={styles.iconGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons
              name={getNotificationIcon(item.type) as any}
              size={22}
              color="#FFF"
            />
          </LinearGradient>
        ) : (
          <Ionicons
            name={getNotificationIcon(item.type) as any}
            size={22}
            color={colors.textMuted}
          />
        )}
      </View>
      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={[styles.notifTitle, { color: colors.text }, !item.is_read && { fontWeight: '700' }]}>
            {item.title}
          </Text>
          {!item.is_read && (
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              style={styles.unreadDot}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
          )}
        </View>
        <Text style={[styles.body, { color: colors.textMuted }]} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={[styles.time, { color: colors.textMuted }]}>
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Gradient header tint */}
      <LinearGradient
        colors={[colors.gradientStart + '10', colors.gradientEnd + '06', 'transparent']}
        style={styles.headerGradient}
      />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
        {notifications.length > 0 && (
          <TouchableOpacity
            onPress={markAllAsRead}
            style={[styles.markAllButton, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          >
            <Text style={[styles.markAll, { color: colors.primary }]}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconWrapper, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
                <Ionicons name="notifications-off-outline" size={48} color={colors.icon} />
              </View>
              <Text style={[styles.emptyText, { color: colors.text }]}>No notifications yet</Text>
              <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
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
    paddingTop: 60,
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
    fontWeight: '800',
  },
  markAllButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  markAll: {
    fontSize: 13,
    fontWeight: '700',
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
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
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
  iconGradient: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
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
    fontWeight: '600',
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
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 0,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
