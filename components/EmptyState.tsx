import { Car01 } from '@untitledui/icons/Car01';
import { CloudBlank01 } from '@untitledui/icons/CloudBlank01';
import { File02 } from '@untitledui/icons/File02';
import { GraduationHat02 } from '@untitledui/icons/GraduationHat02';
import { SearchLg } from '@untitledui/icons/SearchLg';
import { ShoppingBag01 } from '@untitledui/icons/ShoppingBag01';
import { ShoppingBag02 } from '@untitledui/icons/ShoppingBag02';
import { Tool01 } from '@untitledui/icons/Tool01';
import { Users01 } from '@untitledui/icons/Users01';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';

type IconCmp = React.ComponentType<{ size?: number; color?: string; 'aria-hidden'?: boolean }>;

type EmptyStateProps = {
  icon?: string;
  IconComponent?: IconCmp;
  title?: string;
  message: string;
  isLightMode?: boolean;
  ionicon?: string;
  actionLabel?: string;
  onAction?: () => void;
};

// Back-compat: some screens still pass the old Ionicons name string via `icon`.
const LEGACY_ICON_MAP: Record<string, IconCmp> = {
  'storefront-outline': ShoppingBag01,
  'car-sport-outline': Car01,
  'restaurant-outline': ShoppingBag02,
  'document-text-outline': File02,
  'construct-outline': Tool01,
  'cloud-offline-outline': CloudBlank01,
  'people-outline': Users01,
  'school-outline': GraduationHat02,
};

/**
 * Verandah empty state pattern.
 *
 * No illustrations. An Untitled UI line icon at textTertiary.
 * One sentence in body textSecondary, sentence case.
 * Optional secondary action button below.
 */
export const EmptyState = ({
  icon,
  IconComponent,
  title,
  message,
  actionLabel,
  onAction,
}: EmptyStateProps) => {
  const Icon = IconComponent ?? (icon ? LEGACY_ICON_MAP[icon] : undefined) ?? SearchLg;

  return (
    <View style={styles.container}>
      <View style={styles.iconWrapper}>
        <Icon size={32} color={Verandah.textTertiary} aria-hidden={true} />
      </View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
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
    padding: VerandahSpace.xxl,
    marginTop: 32,
  },
  iconWrapper: {
    marginBottom: VerandahSpace.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
    marginBottom: VerandahSpace.xs,
    textAlign: 'center',
    fontFamily: VerandahType.sansFamily,
  },
  message: {
    ...VerandahType.body,
    color: Verandah.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    fontFamily: VerandahType.sansFamily,
  },
  actionBtn: {
    marginTop: VerandahSpace.lg,
    borderWidth: 0.5,
    borderColor: Verandah.borderStrong,
    borderRadius: VerandahRadius.button,
    paddingVertical: VerandahSpace.sm + 2,
    paddingHorizontal: VerandahSpace.xl,
    backgroundColor: Verandah.card,
  },
  actionText: {
    ...VerandahType.bodyBold,
    color: Verandah.primary,
    fontFamily: VerandahType.sansFamily,
  },
});
