import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';

type EmptyStateProps = {
  icon: string;
  title?: string;
  message: string;
  isLightMode?: boolean;
  /** Optional Ionicons name for the icon (preferred over emoji icon) */
  ionicon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Optional secondary action */
  actionLabel?: string;
  onAction?: () => void;
};

/**
 * Verandah empty state pattern.
 *
 * No illustrations. A small Ionicons outline icon at textTertiary.
 * One sentence in body textSecondary, sentence case, friendly but never cute.
 * Optional secondary action button below.
 */
export const EmptyState = ({ icon, title, message, isLightMode, ionicon, actionLabel, onAction }: EmptyStateProps) => {
  return (
    <View style={styles.container}>
      {ionicon ? (
        <Ionicons name={ionicon} size={32} color={Verandah.textTertiary} style={styles.icon} />
      ) : (
        <Text style={styles.iconText}>{icon}</Text>
      )}
      {title ? (
        <Text style={styles.title}>{title}</Text>
      ) : null}
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity style={styles.actionBtn} onPress={onAction} activeOpacity={0.8}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: VerandahSpace.xxxl,
    marginTop: 48,
  },
  icon: {
    marginBottom: VerandahSpace.lg,
  },
  iconText: {
    fontSize: 32,
    lineHeight: 36,
    marginBottom: VerandahSpace.lg,
    color: Verandah.textTertiary,
  },
  title: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
    marginBottom: VerandahSpace.xs,
    textAlign: 'center',
  },
  message: {
    ...VerandahType.body,
    color: Verandah.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  actionBtn: {
    marginTop: VerandahSpace.xl,
    borderWidth: 0.5,
    borderColor: Verandah.borderStrong,
    borderRadius: VerandahRadius.md + 2,
    paddingVertical: VerandahSpace.md,
    paddingHorizontal: VerandahSpace.xxl,
  },
  actionText: {
    ...VerandahType.bodyBold,
    color: Verandah.primary,
  },
});
