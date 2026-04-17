import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from '../context/NotificationContext';
import { Colors } from '../constants/Colors';

export default function NotificationsScreen() {
  const router = useRouter();
  const { notifications, loading, markAsRead, markAllAsRead } = useNotifications();
  const colors = Colors.light;

  useEffect(() => {
    // Optionally mark all as read when leaving the screen
    // return () => markAllAsRead();
  }, []);

  const handleNotificationPress = async (notification: any) => {
    await markAsRead(notification.id);
    
    // Navigate based on type
    if (notification.type === 'new_visit' && notification.data?.visit_id) {
      router.push(`/visits/${notification.data.visit_id}`);
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={[
        styles.notificationItem, 
        { borderBottomColor: colors.border },
        !item.is_read && { backgroundColor: colors.primary + '05' }
      ]}
      onPress={() => handleNotificationPress(item)}
    >
      <View style={[styles.iconContainer, { backgroundColor: item.is_read ? colors.surface2 : colors.primary + '15' }]}>
        <Ionicons 
          name={item.type === 'new_visit' ? 'calendar' : 'notifications'} 
          size={22} 
          color={item.is_read ? colors.textMuted : colors.primary} 
        />
      </View>
      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={[styles.title, { color: colors.text }, !item.is_read && { fontWeight: '700' }]}>
            {item.title}
          </Text>
          {!item.is_read && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
        {notifications.length > 0 && (
          <TouchableOpacity onPress={markAllAsRead}>
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
              <View style={[styles.emptyIconWrapper, { backgroundColor: colors.surface2 }]}>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    gap: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
  },
  markAll: {
    fontSize: 14,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    flexGrow: 1,
  },
  notificationItem: {
    flexDirection: 'row',
    padding: 20,
    gap: 16,
    borderBottomWidth: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
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
