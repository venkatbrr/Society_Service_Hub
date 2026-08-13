import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { NetworkTileIcon, NetworkTileIconKind } from './NetworkTileIcon';
import { useReduceMotion } from './useReduceMotion';

/**
 * The MCN hub's section-card glyph, with a slow idle motion suited to what the
 * card is about — the bag sways as if carried, the car drifts forward, the
 * people breathe together.
 *
 * Deliberately tiny: nothing moves more than 2px, 5°, or 7%. These loop
 * forever on a screen residents open with intent, so the bar is "alive when
 * you look at it", not "asking for attention". If you can read the animation
 * from across the room it is too big.
 *
 * The durations are **mutually prime-ish on purpose** and each glyph starts on
 * its own delay: with a shared cycle the three cards pulse in unison and the
 * whole screen appears to breathe, which is exactly the effect this avoids.
 *
 * Motion rules per `docs/verandah.md`: built-in `Animated` (not Reanimated),
 * `useNativeDriver: false`, and a static render under reduce-motion.
 */

type GlyphMotion = {
  duration: number;
  /** Start offset, so sibling glyphs never share a phase. */
  delay: number;
  rotate?: [string, string];
  translateX?: [number, number];
  translateY?: [number, number];
  scale?: [number, number];
};

const MOTION_BY_KIND: Record<NetworkTileIconKind, GlyphMotion> = {
  // A shopping bag swinging in the hand.
  food: { duration: 2000, delay: 0, rotate: ['-5deg', '5deg'], translateY: [0, -1] },
  // A car easing forward and back.
  carpool: { duration: 1600, delay: 150, translateX: [-2, 2] },
  // A group drawing together.
  parents: { duration: 1850, delay: 300, scale: [1, 1.07] },
  // A cap tossed and caught. (Hidden today — see constants/featureFlags.ts.)
  schools: { duration: 1750, delay: 100, translateY: [1, -2] },
  // Two things trading places. (Hidden today.)
  borrow: { duration: 1700, delay: 380, translateX: [2, -2] },
};

export interface AnimatedTileGlyphProps {
  kind: NetworkTileIconKind;
  size?: number;
  color?: string;
}

export function AnimatedTileGlyph({ kind, size, color }: AnimatedTileGlyphProps) {
  const reduceMotion = useReduceMotion();
  const drive = useRef(new Animated.Value(0)).current;
  const motion = MOTION_BY_KIND[kind];

  useEffect(() => {
    if (reduceMotion) return;

    const half = motion.duration / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(motion.delay),
        Animated.timing(drive, {
          toValue: 1,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(drive, {
          toValue: 0,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [reduceMotion, drive, motion.duration, motion.delay]);

  if (reduceMotion) {
    return <NetworkTileIcon kind={kind} size={size} color={color} />;
  }

  const range = (pair: [number, number] | [string, string]) =>
    drive.interpolate({ inputRange: [0, 1], outputRange: pair as any });

  const transform: any[] = [];
  if (motion.translateX) transform.push({ translateX: range(motion.translateX) });
  if (motion.translateY) transform.push({ translateY: range(motion.translateY) });
  if (motion.rotate) transform.push({ rotate: range(motion.rotate) });
  if (motion.scale) transform.push({ scale: range(motion.scale) });

  return (
    <Animated.View style={{ transform }}>
      <NetworkTileIcon kind={kind} size={size} color={color} />
    </Animated.View>
  );
}

export default AnimatedTileGlyph;
