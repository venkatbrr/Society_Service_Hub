import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent automatic browser prompt bar
      e.preventDefault();
      setDeferredPrompt(e);
      // Check if user previously dismissed prompt
      const dismissed = localStorage.getItem('pwa_install_dismissed');
      if (!dismissed) {
        setVisible(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

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
      localStorage.setItem('pwa_install_dismissed', 'true');
    }
    setVisible(false);
  };

  if (!visible || !deferredPrompt) return null;

  return (
    <View style={styles.bannerContainer}>
      <View style={styles.contentRow}>
        <View style={styles.iconWrap}>
          <Ionicons name="download-outline" size={20} color={Verandah.primaryFg} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title}>Install Society Hub</Text>
          <Text style={styles.subtitle}>Install app on your device for fast access</Text>
        </View>
        <TouchableOpacity style={styles.installBtn} onPress={handleInstall}>
          <Text style={styles.installBtnText}>Install</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeBtn} onPress={handleDismiss} hitSlop={8}>
          <Ionicons name="close" size={18} color={Verandah.textMuted} />
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
