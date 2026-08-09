import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Verandah } from '../constants/Colors';
import { useAuth } from '../context/AuthContext';
import { normalizeRoute, pushTracked } from '../lib/navigation';

type TabDef = {
  key: string;
  label: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  isActive: (pathname: string) => boolean;
};

const TABS: TabDef[] = [
  {
    key: 'help',
    label: 'Help',
    route: '/',
    icon: 'home-outline',
    iconActive: 'home',
    isActive: (p) => p === '/',
  },
  {
    key: 'saved',
    label: 'Saved',
    route: '/favorites',
    icon: 'bookmark-outline',
    iconActive: 'bookmark',
    isActive: (p) => p === '/favorites',
  },
  {
    key: 'mcn',
    label: 'MCN',
    route: '/network',
    icon: 'people-outline',
    iconActive: 'people',
    isActive: (p) => p === '/network' || p.startsWith('/mcn/'),
  },
  {
    key: 'community',
    label: 'Community',
    route: '/community',
    icon: 'business-outline',
    iconActive: 'business',
    isActive: (p) =>
      p === '/community' ||
      p.startsWith('/funds') ||
      p === '/sos' ||
      p === '/residents' ||
      p.startsWith('/community/'),
  },
  {
    key: 'profile',
    label: 'Profile',
    route: '/profile',
    icon: 'person-outline',
    iconActive: 'person',
    isActive: (p) => p === '/profile' || p.startsWith('/services'),
  },
];

/**
 * Persistent bottom navigation rendered once at the root layout so it stays
 * visible on every screen, not just the five `(tabs)` routes — expo-router's
 * own `Tabs` bar only renders for screens inside that group. The `(tabs)`
 * Tabs navigator itself is still what actually switches screens; this bar
 * just draws the chrome and pushes to the same tab-root routes.
 */
export function GlobalBottomNav() {
  const rawPathname = usePathname();
  const pathname = normalizeRoute(rawPathname || '/');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, communityId, isLoading } = useAuth();

  if (isLoading || !session || !communityId) {
    return null;
  }

  const activeKey = TABS.find((tab) => tab.isActive(pathname))?.key ?? null;

  return (
    <View
      style={[
        styles.container,
        {
          height: (Platform.OS === 'web' ? 52 : 46) + (Platform.OS === 'web' ? 0 : insets.bottom),
          paddingBottom: Platform.OS === 'web' ? 0 : insets.bottom,
        },
      ]}
    >
      {TABS.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tabButton}
            // pushTracked, not router.push: tapping back to a tab you were just
            // on (Home -> Network -> Home) pushes a route that is already the
            // entry beneath the current one. On native that is indistinguishable
            // from a pop, so the push has to declare itself.
            onPress={() => pushTracked(router, tab.route as any)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isActive ? tab.iconActive : tab.icon}
              size={19}
              color={isActive ? Verandah.accent : Verandah.textMuted}
            />
            <Text style={[styles.label, { color: isActive ? Verandah.accent : Verandah.textMuted }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Verandah.card,
    borderTopWidth: 0.5,
    borderTopColor: Verandah.border,
    paddingTop: 5,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
  },
});
