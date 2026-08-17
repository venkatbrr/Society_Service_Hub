import React from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';
import { MuteChannel, useNotificationMute } from '../lib/useNotificationMute';

type MuteToggleButtonProps = {
  channel: MuteChannel;
  style?: StyleProp<ViewStyle>;
};

/**
 * Per-channel notification switch for a module header.
 *
 * Deliberately NOT a bell in a circle: that is the shape of the global
 * notification bell (`NotificationBell`), which navigates to the notification
 * list, and users read a header-right bell as "open my notifications" rather
 * than "mute this section". A label plus a switch track reads as a setting.
 *
 * The label names its own channel ("Food alerts" / "Post alerts") rather than
 * relying on the screen title for scope, so it cannot be mistaken for an
 * app-wide notification switch.
 */
export function MuteToggleButton({ channel, style }: MuteToggleButtonProps) {
  const { muted, loading, toggle } = useNotificationMute(channel);
  const on = !muted;

  // Scoped per channel: a bare "Alerts" beside a switch still leaves the user
  // guessing whether it governs this section or the whole app.
  const label = channel === 'food_drops' ? 'Food alerts' : 'Post alerts';
  const what = channel === 'food_drops' ? 'new food drop' : 'Parent Corner';

  return (
    <TouchableOpacity
      style={[styles.container, style]}
      onPress={toggle}
      disabled={loading}
      activeOpacity={0.7}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: loading }}
      accessibilityLabel={`${what} alerts`}
      accessibilityHint={on ? `Turn off ${what} alerts` : `Turn on ${what} alerts`}
    >
      <Text
        style={[styles.label, { color: on ? Verandah.textPrimary : Verandah.textMuted }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <View style={[styles.track, { backgroundColor: on ? Verandah.accent : Verandah.borderHair }]}>
        <View style={[styles.knob, on ? styles.knobOn : styles.knobOff]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 10,
    // Vertical padding only: the row must not grow a tap target so tall that it
    // pushes the native stack header's height.
    paddingVertical: 4,
  },
  label: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 11,
    fontWeight: '600',
  },
  track: {
    width: 32,
    height: 18,
    borderRadius: VerandahRadius.pill,
    padding: 2,
    justifyContent: 'center',
  },
  knob: {
    width: 14,
    height: 14,
    borderRadius: VerandahRadius.pill,
    backgroundColor: Verandah.card,
  },
  knobOn: {
    alignSelf: 'flex-end',
  },
  knobOff: {
    alignSelf: 'flex-start',
  },
});
