import { Bell01 } from '@untitledui/icons/Bell01';
import { BellOff01 } from '@untitledui/icons/BellOff01';
import React from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius } from '../constants/Verandah';
import { MuteChannel, useNotificationMute } from '../lib/useNotificationMute';

type MuteToggleButtonProps = {
  channel: MuteChannel;
  style?: StyleProp<ViewStyle>;
};

export function MuteToggleButton({ channel, style }: MuteToggleButtonProps) {
  const { muted, loading, toggle } = useNotificationMute(channel);

  const label =
    channel === 'food_drops'
      ? muted
        ? 'Unmute food drop notifications'
        : 'Mute food drop notifications'
      : muted
      ? 'Unmute Parent Corner notifications'
      : 'Mute Parent Corner notifications';

  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={toggle}
      disabled={loading}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {muted ? (
        <BellOff01 size={18} color={Verandah.textMuted} aria-hidden={true} />
      ) : (
        <Bell01 size={18} color={Verandah.textPrimary} aria-hidden={true} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: VerandahRadius.pill,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
});
