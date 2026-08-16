import { Download01 } from '@untitledui/icons/Download01';
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';
import { isRunningAsInstalledPwa } from '../lib/pwaInstall';

/**
 * The banner has no dismiss control on purpose.
 *
 * It only ever renders when the browser has actually offered an install
 * (`beforeinstallprompt`), and it clears itself as soon as the resident taps
 * Install — whichever way they answer Chrome's own prompt. That is the single
 * exit, so the offer cannot be buried and then forgotten.
 *
 * The old X wrote a `pwa_install_dismissed_at` key and suppressed the banner
 * for three days. Both it and the cooldown check are gone; leaving the check
 * behind would have kept the banner hidden for anyone who had already tapped
 * the X, which is the opposite of the intent here.
 */
export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    // Don't show if already installed as PWA
    if (isRunningAsInstalledPwa()) return;

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent automatic browser prompt bar
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    // Resolves for "dismissed" as well as "accepted", and the event is
    // single-use either way — so the banner goes whatever the resident picks.
    // Chrome fires a fresh event on a later visit if they declined.
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  if (!deferredPrompt) return null;

  return (
    <View style={styles.bannerContainer}>
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
});
