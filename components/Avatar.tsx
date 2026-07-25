import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius } from '../constants/Verandah';
import { getAvatarTint } from '../lib/avatarTint';

type Props = {
  name: string;
  size?: number;
  shape?: 'circle' | 'square';
};

/**
 * Deterministic initials avatar.
 *
 * Initials = first letter of first name + first letter of last word.
 * One initial if only one name. Background and foreground from
 * getAvatarTint(name). Same person always gets the same tint.
 *
 * Use this component for every person reference. Do not show photos —
 * most residents will not upload one and the inconsistency reads worse
 * than uniform initials.
 */
export const Avatar = React.memo(({ name, size = 36, shape = 'circle' }: Props) => {
  const tint = getAvatarTint(name);

  const parts = name.trim().split(/\s+/).filter(Boolean);
  let initials = '';
  if (parts.length >= 2) {
    initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  } else if (parts.length === 1) {
    initials = parts[0][0].toUpperCase();
  }

  const borderRadius = shape === 'circle' ? size / 2 : VerandahRadius.sm + 2;
  const fontSize = size * 0.38;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor: tint.bg,
        },
      ]}
    >
      <Text
        style={[
          styles.initials,
          {
            fontSize,
            color: tint.fg,
          },
        ]}
      >
        {initials}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});
