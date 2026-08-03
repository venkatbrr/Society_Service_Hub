import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius } from '../constants/Verandah';
import { getAvatarTint } from '../lib/avatarTint';

type Props = {
  name: string;
  url?: string | null;
  size?: number;
  shape?: 'circle' | 'square';
};

/**
 * Avatar component displaying image if available, else initials fallback.
 */
export const Avatar = React.memo(({ name, url, size = 36, shape = 'circle' }: Props) => {
  const borderRadius = shape === 'circle' ? size / 2 : VerandahRadius.sm + 2;

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{
          width: size,
          height: size,
          borderRadius,
        }}
        contentFit="cover"
        transition={150}
      />
    );
  }

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
