import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import {
  Animated,
  Easing,
  Image,
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Verandah } from '../constants/Colors';
import { useAuth } from '../context/AuthContext';
import { normalizeRoute, pushTracked } from '../lib/navigation';
import { NavBookmark, NavBuildings, NavHomeHeart, NavIconProps, NavPerson } from './NavIcons';

// The real logo file, not a traced glyph — cream mark on transparent, already inset to
// the safe zone, so it centres itself inside the disc at full bleed.
const THRESHOLD_MARK = require('../assets/images/adaptive-icon.png');

type TabDef = {
  key: string;
  label: string;
  route: string;
  /** Omitted for MCN, which renders the logo image inside its disc instead of a glyph. */
  Icon?: React.ComponentType<NavIconProps>;
  isActive: (pathname: string) => boolean;
};

const TABS: TabDef[] = [
  {
    key: 'help',
    label: 'Help',
    route: '/',
    Icon: NavHomeHeart,
    isActive: (p) => p === '/',
  },
  {
    key: 'saved',
    label: 'Saved',
    route: '/favorites',
    Icon: NavBookmark,
    isActive: (p) => p === '/favorites',
  },
  {
    key: 'mcn',
    label: 'MCN',
    route: '/network',
    isActive: (p) => p === '/network' || p.startsWith('/mcn/'),
  },
  {
    key: 'community',
    label: 'Community',
    route: '/community',
    Icon: NavBuildings,
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
    Icon: NavPerson,
    isActive: (p) => p === '/profile' || p.startsWith('/services'),
  },
];

// Geometry — every value here is load-bearing for the "nothing moves" rule: the icon row
// and the label row are both fixed height, so revealing the active label cannot nudge the
// icons off their shared baseline.
const BAR_HEIGHT = 60;
const COLUMN_HEIGHT = 48;
const ICON_ROW_HEIGHT = 24;
const LABEL_ROW_HEIGHT = 12;
const ICON_LABEL_GAP = 2;
const HIGHLIGHT_INSET_Y = (BAR_HEIGHT - COLUMN_HEIGHT) / 2; // 6
const HIGHLIGHT_INSET_X = 12;
const DISC_SIZE = 38;

// Springy overshoot shared by the highlight slide and the icon pop.
const SPRING = Easing.bezier(0.34, 1.5, 0.5, 1);

const ACTIVE_COLOR = Verandah.primary; // #0F3732
const INACTIVE_COLOR = Verandah.textDisabled; // #9A988F
const ACTIVE_STROKE = 2.2;
const INACTIVE_STROKE = 1.9;

const discShadow = Platform.select({
  web: { boxShadow: '0 8px 20px rgba(15, 55, 50, 0.30)' } as any,
  default: {
    shadowColor: '#0F3732',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
});

type NavTabProps = {
  tab: TabDef;
  isActive: boolean;
  onPress: () => void;
};

function NavTab({ tab, isActive, onPress }: NavTabProps) {
  const isCentre = tab.key === 'mcn';
  const scale = React.useRef(new Animated.Value(isActive ? 1.1 : 1)).current;
  const labelOpacity = React.useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const lift = React.useRef(new Animated.Value(isActive && isCentre ? -3 : 0)).current;

  React.useEffect(() => {
    Animated.timing(scale, {
      toValue: isActive ? 1.1 : 1,
      duration: 400,
      easing: SPRING,
      useNativeDriver: false,
    }).start();
    Animated.timing(labelOpacity, {
      toValue: isActive ? 1 : 0,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [isActive, scale, labelOpacity]);

  // The centre disc settles at -3px and then breathes between -3 and -6 for as long as
  // MCN is the active tab.
  React.useEffect(() => {
    if (!isCentre) return;

    if (!isActive) {
      lift.stopAnimation();
      Animated.timing(lift, {
        toValue: 0,
        duration: 420,
        easing: Easing.bezier(0.34, 1.4, 0.5, 1),
        useNativeDriver: false,
      }).start();
      return;
    }

    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(lift, {
          toValue: -6,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(lift, {
          toValue: -3,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    );

    Animated.timing(lift, {
      toValue: -3,
      duration: 420,
      easing: Easing.bezier(0.34, 1.4, 0.5, 1),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) float.start();
    });

    return () => {
      float.stop();
      lift.stopAnimation();
    };
  }, [isActive, isCentre, lift]);

  const IconComponent = tab.Icon;
  const iconColor = isActive ? ACTIVE_COLOR : INACTIVE_COLOR;
  const strokeWidth = isActive ? ACTIVE_STROKE : INACTIVE_STROKE;

  return (
    <TouchableOpacity
      style={styles.tabButton}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={tab.label}
    >
      <View style={styles.iconRow}>
        {isCentre ? (
          <Animated.View
            style={[
              styles.disc,
              discShadow,
              { transform: [{ translateY: lift }, { scale }] },
            ]}
          >
            <Image
              source={THRESHOLD_MARK}
              style={styles.discMark}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </Animated.View>
        ) : (
          IconComponent && (
            <Animated.View style={{ transform: [{ scale }] }}>
              <IconComponent size={24} color={iconColor} strokeWidth={strokeWidth} />
            </Animated.View>
          )
        )}
      </View>
      <View style={styles.labelRow}>
        <Animated.Text
          style={[
            styles.label,
            isCentre && styles.labelCentre,
            { opacity: labelOpacity },
          ]}
          numberOfLines={1}
        >
          {tab.label}
        </Animated.Text>
      </View>
    </TouchableOpacity>
  );
}

/**
 * Persistent bottom navigation ("Threshold Rail") rendered once at the root layout.
 * Tab set/routes match the pre-redesign nav exactly (Help · Saved · MCN · Community · Profile).
 * An arch-topped highlight slides behind whichever tab is active, and the centre MCN disc
 * floats while it holds focus.
 */
export function GlobalBottomNav() {
  const rawPathname = usePathname();
  const pathname = normalizeRoute(rawPathname || '/');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, communityId, isLoading } = useAuth();

  const [barWidth, setBarWidth] = React.useState(0);
  const highlightX = React.useRef(new Animated.Value(0)).current;

  const activeIndex = TABS.findIndex((tab) => tab.isActive(pathname));
  const tabWidth = barWidth > 0 ? barWidth / TABS.length : 0;

  React.useEffect(() => {
    if (tabWidth <= 0 || activeIndex < 0) return;
    Animated.timing(highlightX, {
      toValue: activeIndex * tabWidth + HIGHLIGHT_INSET_X,
      duration: 460,
      easing: SPRING,
      useNativeDriver: false,
    }).start();
  }, [activeIndex, tabWidth, highlightX]);

  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    setBarWidth(e.nativeEvent.layout.width);
  }, []);

  const isExcludedRoute =
    pathname === '/community-select' ||
    pathname === '/community-request' ||
    pathname === '/community-request-submitted' ||
    pathname === '/community-join-block' ||
    pathname === '/login' ||
    pathname === '/forgot-password' ||
    pathname === '/admin-redirect';

  if (isLoading || !session || !communityId || isExcludedRoute) {
    return null;
  }

  // Home-indicator padding sits below the 60px bar, never inside it. The raw safe-area
  // inset (34px on gesture-bar iPhones, more on some Androids) leaves a visibly dead
  // strip under the rail, so it is capped — enough to clear the indicator, no more.
  const bottomInset =
    insets.bottom > 0 ? Math.min(insets.bottom, 12) : Platform.OS === 'web' ? 4 : 10;
  const showHighlight = tabWidth > 0 && activeIndex >= 0;

  return (
    <View style={[styles.container, { paddingBottom: bottomInset }]}>
      <View style={styles.bar} onLayout={onLayout}>
        {showHighlight && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.highlight,
              {
                width: tabWidth - HIGHLIGHT_INSET_X * 2,
                transform: [{ translateX: highlightX }],
              },
            ]}
          />
        )}
        {TABS.map((tab, index) => (
          <NavTab
            key={tab.key}
            tab={tab}
            isActive={index === activeIndex}
            onPress={() => pushTracked(router, tab.route as any)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Verandah.paper, // #FAF8F4
    borderTopWidth: 0.5,
    borderTopColor: Verandah.borderHair,
  },
  bar: {
    flexDirection: 'row',
    height: BAR_HEIGHT,
    alignItems: 'center',
  },
  highlight: {
    position: 'absolute',
    left: 0,
    top: HIGHLIGHT_INSET_Y,
    height: BAR_HEIGHT - HIGHLIGHT_INSET_Y * 2,
    backgroundColor: 'rgba(15, 55, 50, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(15, 55, 50, 0.08)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  tabButton: {
    flex: 1,
    height: COLUMN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: ICON_LABEL_GAP,
  },
  iconRow: {
    height: ICON_ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelRow: {
    height: LABEL_ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    lineHeight: 12,
    color: ACTIVE_COLOR,
  },
  labelCentre: {
    fontWeight: '800',
  },
  // The asset insets its mark to the inner ~58%, so the image box is oversized past the
  // disc to land the visible arch at ~65% of it. The overhang is transparent.
  discMark: {
    width: 44,
    height: 44,
  },
  disc: {
    position: 'absolute',
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: 13,
    backgroundColor: Verandah.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
