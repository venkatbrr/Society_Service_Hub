import React from 'react';
import { StyleSheet, View } from 'react-native';
import { dietMeta } from '../constants/diet';

/**
 * The square-outline-with-a-filled-dot mark that Indian menus use for veg /
 * non-veg. Drawn rather than imported as an icon because it is two nested
 * views and every packaged version of it is a raster.
 *
 * Purely decorative — it always sits beside the diet label as text, so it is
 * hidden from screen readers rather than given a label of its own.
 */
export function DietDot({ value, size = 12 }: { value: string | null | undefined; size?: number }) {
  const { color } = dietMeta(value);
  const inner = Math.round(size * 0.5);

  return (
    <View
      aria-hidden={true}
      style={[styles.box, { width: size, height: size, borderColor: color }]}
    >
      <View style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1.5,
    borderRadius: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
