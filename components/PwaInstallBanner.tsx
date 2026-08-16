import { Download01 } from '@untitledui/icons/Download01';
import { XClose } from '@untitledui/icons/XClose';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';
import { isRunningAsInstalledPwa } from '../lib/pwaInstall';

/** How many days to wait before re-showing the install banner after dismissal */
const DISMISS_COOLDOWN_DAYS = 3;

/** Check if the cooldown period since last dismissal has elapsed */
function isDismissCooldownOver(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const dismissedAt = localStorage.getItem('pwa_install_dismissed_at');
  if (!dismissedAt) return true;
  const elapsed = Date.now() - Number(dismissedAt);
  return elapsed >= DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [visible, setVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    // Don't show if already installed as PWA
    if (isRunningAsInstalledPwa()) return;

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent automatic browser prompt bar
      e.preventDefault();
      setDeferredPrompt(e);
      // Show banner if cooldown has elapsed since last dismiss
      if (isDismissCooldownOver()) {
        setVisible(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }, [visible, slideAnim]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    if (choiceResult.outcome === 'accepted') {
      console.log('User accepted the PWA install prompt');
    }
    setDeferredPrompt(null);
    setVisible(false);
  };

  const handleDismiss = () => {
    if (typeof localStorage !== 'undefined') {
      // Store the timestamp of dismissal for cooldown-based re-prompting
      localStorage.setItem('pwa_install_dismissed_at', String(Date.now()));
    }
    setVisible(false);
  };

  if (!visible || !deferredPrompt) return null;

  return (
    <Animated.View style={[styles.bannerContainer, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.contentRow}>
        <View style={styles.iconWrap}>
          <Download01 size={18} color={Verandah.primaryFg} aria-hidden={true} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title}>Install Wooru</Text>
          <Text style={styles.subtitle}>Install app on your device for fast access</Text>
        </View>
        <TouchableOpacity style={styles.installBtn} onPress={handleInstall}>
          <Text style={styles.installBtnText}>Install</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeBtn} onPress={handleDismiss} hitSlop={8}>
          <XClose size={16} color={Verandah.textMuted} aria-hidden={true} />
        </TouchableOpacity>
      </View>
    </Animated.View>
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
  installBtn: {
    backgroundColor: Verandah.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: VerandahRadius.pill,
  },
  installBtnText: {
    color: Verandah.primaryFg,
    fontSize: 12,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 4,
  },
});
