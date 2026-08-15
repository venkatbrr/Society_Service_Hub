import { Bell01 } from '@untitledui/icons/Bell01';
import { XClose } from '@untitledui/icons/XClose';
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';
import { isRunningAsInstalledPwa } from '../lib/pwaInstall';

/** How many days to wait before re-showing the banner after dismissal */
const DISMISS_COOLDOWN_DAYS = 3;

/** Check if the cooldown period since last dismissal has elapsed */
function isDismissCooldownOver(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const dismissedAt = localStorage.getItem('notif_permission_dismissed_at');
  if (!dismissedAt) return true;
  const elapsed = Date.now() - Number(dismissedAt);
  return elapsed >= DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
}

export function NotificationPermissionBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (typeof Notification === 'undefined') return;
    // Already granted, denied, or the browser doesn't support asking again
    if (Notification.permission !== 'default') return;
    if (!isDismissCooldownOver()) return;

    // iOS never fires `appinstalled` — being in standalone mode at all,
    // on any launch, is the only install signal it gives us.
    if (isRunningAsInstalledPwa()) {
      setVisible(true);
      return;
    }

    // Android / desktop: fires in the same tab right after the user accepts
    // the install prompt, before the page has switched to standalone.
    const handleAppInstalled = () => setVisible(true);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => window.removeEventListener('appinstalled', handleAppInstalled);
  }, []);

  const handleEnable = async () => {
    try {
      await Notification.requestPermission();
    } catch (err) {
      console.warn('[Notifications] permission request failed:', err);
    }
    setVisible(false);
  };

  const handleDismiss = () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('notif_permission_dismissed_at', String(Date.now()));
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <View style={styles.bannerContainer}>
      <View style={styles.contentRow}>
        <View style={styles.iconWrap}>
          <Bell01 size={18} color={Verandah.primaryFg} aria-hidden={true} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title}>Stay in the loop</Text>
          <Text style={styles.subtitle}>Enable notifications for visit updates, fund approvals and reminders</Text>
        </View>
        <TouchableOpacity style={styles.enableBtn} onPress={handleEnable}>
          <Text style={styles.enableBtnText}>Enable</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeBtn} onPress={handleDismiss} hitSlop={8}>
          <XClose size={16} color={Verandah.textMuted} aria-hidden={true} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    backgroundColor: Verandah.card,
    borderBottomWidth: 1,
    borderBottomColor: Verandah.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 9999,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Verandah.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
  },
  title: {
    ...VerandahType.captionBold,
    color: Verandah.textPrimary,
    fontSize: 13,
  },
  subtitle: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
    fontSize: 11,
  },
  enableBtn: {
    backgroundColor: Verandah.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: VerandahRadius.pill,
  },
  enableBtnText: {
    color: Verandah.primaryFg,
    fontSize: 12,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 4,
  },
});
