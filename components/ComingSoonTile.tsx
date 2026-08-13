import { Stars02 } from '@untitledui/icons/Stars02';
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahType } from '../constants/Verandah';
import { BaseCard } from './BaseCard';

/**
 * Placeholder card for a section that is built but hidden
 * (see `constants/featureFlags.ts` and `docs/hidden-features/`).
 *
 * Deliberately **not pressable** — there is nothing to open yet, and a tap that
 * does nothing reads as a bug. The motion is what makes it read as "coming",
 * rather than as an empty slot: two rings ping outward from the glyph, the
 * glyph itself breathes, two sparkles twinkle off-beat, and the subtitle
 * cross-fades between teasers.
 *
 * Motion follows the house rules in `docs/verandah.md`: React Native's built-in
 * `Animated` (not Reanimated, which is unconfigured for web) with
 * `useNativeDriver: false`, since the web target cannot use the native driver.
 */

const PING_DURATION = 2800;
const BREATHE_DURATION = 2800;
const TWINKLE_DURATION = 1900;
const COPY_INTERVAL = 3400;
const COPY_FADE_OUT = 200;
const COPY_FADE_IN = 280;

const DEFAULT_LINES = [
  'Something interesting is on the way',
  'New neighbourhood features in the making',
  'Worth checking back for',
];

export interface ComingSoonTileProps {
  title?: string;
  /** Cross-faded one at a time under the title. A single entry stays static. */
  lines?: string[];
  description?: string;
  style?: StyleProp<ViewStyle>;
}

export function ComingSoonTile({
  title = 'Watch this space',
  lines = DEFAULT_LINES,
  description = "We're putting the finishing touches on the next set of neighbourhood features. They'll show up right here when they're ready.",
  style,
}: ComingSoonTileProps) {
  const colors = Verandah;

  // A perpetual loop is exactly what a motion-sensitive user asks the OS to
  // stop, so honour the setting rather than animating regardless.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      sub?.remove();
    };
  }, []);

  const pingA = useRef(new Animated.Value(0)).current;
  const pingB = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const twinkleA = useRef(new Animated.Value(0)).current;
  const twinkleB = useRef(new Animated.Value(0)).current;
  const copyOpacity = useRef(new Animated.Value(1)).current;

  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;

    const ramp = (value: Animated.Value, duration: number, delay = 0) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: false }),
        ])
      );

    const loops = [
      // Ring B trails ring A by half a cycle, so the ping never has a gap.
      ramp(pingA, PING_DURATION),
      ramp(pingB, PING_DURATION, PING_DURATION / 2),
      Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, {
            toValue: 1,
            duration: BREATHE_DURATION / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
          Animated.timing(breathe, {
            toValue: 0,
            duration: BREATHE_DURATION / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
        ])
      ),
      // Off-beat delays keep the two sparkles from reading as a metronome.
      ramp(twinkleA, TWINKLE_DURATION, 420),
      ramp(twinkleB, TWINKLE_DURATION, 1340),
    ];

    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [reduceMotion, pingA, pingB, breathe, twinkleA, twinkleB]);

  useEffect(() => {
    if (reduceMotion || lines.length < 2) return;

    const timer = setInterval(() => {
      Animated.timing(copyOpacity, {
        toValue: 0,
        duration: COPY_FADE_OUT,
        easing: Easing.in(Easing.quad),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (!finished) return;
        setLineIndex((i) => (i + 1) % lines.length);
        Animated.timing(copyOpacity, {
          toValue: 1,
          duration: COPY_FADE_IN,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }).start();
      });
    }, COPY_INTERVAL);

    return () => clearInterval(timer);
  }, [reduceMotion, lines.length, copyOpacity]);

  // A line list that shrinks under a paused index would render `undefined`.
  const safeLine = lines[lineIndex] ?? lines[0] ?? '';

  // `BaseCard` sets `overflow: 'hidden'`, and the 40px glyph slot sits at the
  // card's 14px padding — so 1.65 is the largest ping that does not get its
  // left edge clipped by the card border.
  const ringStyle = (value: Animated.Value) => ({
    opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
    transform: [
      { scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 1.65] }) },
    ],
  });

  const sparkleStyle = (value: Animated.Value) => ({
    opacity: value.interpolate({
      inputRange: [0, 0.35, 0.7, 1],
      outputRange: [0, 1, 0.4, 0],
    }),
    transform: [
      {
        scale: value.interpolate({
          inputRange: [0, 0.35, 1],
          outputRange: [0.4, 1, 0.5],
        }),
      },
    ],
  });

  return (
    <BaseCard padding={14} style={style}>
      <View style={styles.headerRow}>
        <View style={styles.glyphSlot}>
          {!reduceMotion && (
            <>
              <Animated.View
                style={[styles.ring, { borderColor: colors.accent }, ringStyle(pingA)]}
                pointerEvents="none"
              />
              <Animated.View
                style={[styles.ring, { borderColor: colors.accent }, ringStyle(pingB)]}
                pointerEvents="none"
              />
            </>
          )}

          <View style={[styles.iconCircle, { backgroundColor: colors.accentSoft }]}>
            <Animated.View
              style={{
                transform: [
                  {
                    scale: breathe.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.14],
                    }),
                  },
                  {
                    rotate: breathe.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['-7deg', '7deg'],
                    }),
                  },
                ],
              }}
            >
              <Stars02 size={20} color={colors.accent} aria-hidden={true} />
            </Animated.View>
          </View>

          {!reduceMotion && (
            <>
              <Animated.View
                style={[
                  styles.sparkle,
                  styles.sparkleTopRight,
                  { backgroundColor: colors.accent },
                  sparkleStyle(twinkleA),
                ]}
                pointerEvents="none"
              />
              <Animated.View
                style={[
                  styles.sparkle,
                  styles.sparkleBottomLeft,
                  { backgroundColor: colors.accent },
                  sparkleStyle(twinkleB),
                ]}
                pointerEvents="none"
              />
            </>
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          <Animated.Text
            style={[styles.badgeText, { color: colors.accent, opacity: copyOpacity }]}
            numberOfLines={1}
          >
            {safeLine}
          </Animated.Text>
        </View>
      </View>

      <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text>
    </BaseCard>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  // Matches the 40px icon circle of the real section cards, so the tile lines
  // up with them. The pings overflow it, which is fine — nothing between here
  // and the card clips.
  glyphSlot: {
    width: 40,
    height: 40,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sparkle: {
    position: 'absolute',
    borderRadius: 999,
  },
  sparkleTopRight: {
    width: 5,
    height: 5,
    top: -1,
    right: -2,
  },
  sparkleBottomLeft: {
    width: 3.5,
    height: 3.5,
    bottom: 1,
    left: -3,
  },
  title: {
    fontFamily: VerandahType.sansFamily,
    fontWeight: '600',
    fontSize: 15,
  },
  badgeText: {
    fontFamily: VerandahType.sansFamily,
    fontWeight: '500',
    fontSize: 12,
    marginTop: 2,
  },
  description: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 12.5,
    lineHeight: 17,
  },
});

export default ComingSoonTile;
