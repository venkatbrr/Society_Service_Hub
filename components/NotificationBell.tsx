import { Bell01 } from '@untitledui/icons/Bell01';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';
import { useNotifications } from '../context/NotificationContext';

type NotificationBellProps = {
  style?: StyleProp<ViewStyle>;
  color?: string;
  iconSize?: number;
};

export function NotificationBell({ style, color = Verandah.primary, iconSize = 18 }: NotificationBellProps) {
  const router = useRouter();
  const { unreadCount } = useNotifications();

  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={() => router.push('/notifications')}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Notifications"
    >
      <Bell01 size={iconSize} color={color} aria-hidden={true} />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: VerandahRadius.pill,
    backgroundColor: Verandah.surface,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: Verandah.accent,
    borderRadius: VerandahRadius.pill,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Verandah.paper,
  },
  badgeText: {
    color: Verandah.primaryFg,
    fontSize: 9,
    fontWeight: '700',
    fontFamily: VerandahType.sansFamily,
  },
});
