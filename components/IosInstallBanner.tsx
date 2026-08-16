import { Upload01 } from '@untitledui/icons/Upload01';
import { XClose } from '@untitledui/icons/XClose';
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahType } from '../constants/Verandah';
import { isIOSSafari, isRunningAsInstalledPwa } from '../lib/pwaInstall';

/**
 * iOS Safari never fires `beforeinstallprompt`, so `PwaInstallBanner` never
 * renders there — this is the separate, instructional surface Safari needs.
 * There is no JS API to trigger "Add to Home Screen"; this can only explain
 * where to find it. Mirrors `public/landing.html`'s `#wn-ios-install` banner
 * (search `wn-ios-install`) for the signed-out marketing page.
 */

/** Longer than PwaInstallBanner's 3 days — this ask is manual, higher-friction */
const DISMISS_COOLDOWN_DAYS = 7;
const DISMISS_KEY = 'wooru_ios_install_dismissed_at';
/** iOS gives no way to detect an existing install from a Safari tab
 * (`navigator.standalone` reads false in the tab even once installed), so a
 * manual "already added" exit is the only way to stop nagging a user who has. */
const DISMISS_PERMANENT_KEY = 'wooru_ios_install_dismissed_permanently';

/** iOS private-mode localStorage can throw on read/write even though the
 * object exists — fail open (keep showing) rather than crash the render tree. */
function tryStorage<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

function isDismissCooldownOver(): boolean {
  const dismissedAt = tryStorage(() => localStorage.getItem(DISMISS_KEY));
  if (!dismissedAt) return true;
  const elapsed = Date.now() - Number(dismissedAt);
  return elapsed >= DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
}

export function IosInstallBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!isIOSSafari()) return;
    if (isRunningAsInstalledPwa()) return;
    if (tryStorage(() => localStorage.getItem(DISMISS_PERMANENT_KEY)) === '1') return;
    if (!isDismissCooldownOver()) return;

    setVisible(true);
  }, []);

  const handleDismiss = () => {
    tryStorage(() => localStorage.setItem(DISMISS_KEY, String(Date.now())));
    setVisible(false);
  };

  const handleAlreadyAdded = () => {
    tryStorage(() => localStorage.setItem(DISMISS_PERMANENT_KEY, '1'));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <View style={styles.bannerContainer}>
      <View style={styles.contentRow}>
        <View style={styles.iconWrap}>
          <Upload01 size={18} color={Verandah.primaryFg} aria-hidden={true} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title}>Add Wooru to your home screen</Text>
          <Text style={styles.subtitle}>Tap Share, then &quot;Add to Home Screen&quot;</Text>
          <TouchableOpacity onPress={handleAlreadyAdded} hitSlop={4}>
            <Text style={styles.alreadyAddedText}>Already added</Text>
          </TouchableOpacity>
        </View>
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
  alreadyAddedText: {
    ...VerandahType.captionBold,
    color: Verandah.accent,
    fontSize: 11,
    marginTop: 3,
    textDecorationLine: 'underline',
  },
  closeBtn: {
    padding: 4,
  },
});
