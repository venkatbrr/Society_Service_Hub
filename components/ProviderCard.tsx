import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
import { APP_EMOJIS, getServiceCategoryEmoji } from '../constants/emojis';
import { ProviderWithInteraction } from '../lib/database.types';
import { Avatar } from './Avatar';
import { BaseCard } from './BaseCard';

type ProviderCardProps = {
  provider: ProviderWithInteraction;
  onPress: () => void;
  onToggleFavorite: (id: string, isCurrentlyFavorite: boolean) => void;
  isLightMode?: boolean;
};

export const ProviderCard = React.memo(({ provider, onPress, onToggleFavorite, isLightMode }: ProviderCardProps) => {
  return (
    <BaseCard
      onPress={onPress}
      padding={14}
      style={styles.card}
    >
      <View style={styles.content}>
        <Avatar name={provider.name} size={40} />
        <View style={styles.mainInfo}>
          <View style={styles.headerRow}>
            <Text style={styles.name} numberOfLines={1}>
              {provider.name}
            </Text>
          </View>
          <Text style={styles.subInfo} numberOfLines={1}>
            {getServiceCategoryEmoji(provider.category)} {provider.category}
            {provider.is_verified ? '  ✓ Verified' : ''}
          </Text>
          <View style={styles.pillsRow}>
            {provider.is_verified && (
              <View style={styles.pillVerified}>
                <Text style={styles.pillVerifiedText}>Verified</Text>
              </View>
            )}
            {(provider.hire_count ?? 0) > 0 && (
              <View style={styles.pillHires}>
                <Text style={styles.pillHiresText}>{provider.hire_count} hires</Text>
              </View>
            )}
          </View>
        </View>
        <TouchableOpacity
          style={styles.favoriteBtn}
          onPress={() => onToggleFavorite(provider.id, !!provider.is_favorite)}
        >
          <Ionicons
            name={provider.is_favorite ? 'bookmark' : 'bookmark-outline'}
            size={20}
            color={provider.is_favorite ? Verandah.accent : Verandah.textMuted}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <View style={styles.ratingRow}>
          <Text style={styles.ratingIcon}>{APP_EMOJIS.starFilled}</Text>
          <Text style={styles.ratingText}>
            {Number(provider.avg_rating).toFixed(1)}
          </Text>
          <Text style={styles.ratingCount}>({provider.rating_count})</Text>
        </View>
        <Text style={styles.trustText}>
          Used by {provider.hire_count || 0} homes
        </Text>
      </View>
    </BaseCard>
  );
});

const styles = StyleSheet.create({
  card: {
    marginBottom: VerandahSpace.sm + 2,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: VerandahSpace.md,
    marginBottom: VerandahSpace.md,
  },
  mainInfo: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: VerandahSpace.xs + 2,
    marginBottom: 2,
  },
  name: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
    flex: 1,
  },
  subInfo: {
    ...VerandahType.caption,
    color: Verandah.textTertiary,
    marginBottom: VerandahSpace.xs,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: VerandahSpace.xs,
    flexWrap: 'wrap',
  },
  pillVerified: {
    backgroundColor: Verandah.accentSoft,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: VerandahSpace.sm,
    paddingVertical: 3,
  },
  pillVerifiedText: {
    ...VerandahType.micro,
    fontWeight: '500',
    color: Verandah.accent,
  },
  pillHires: {
    backgroundColor: Verandah.cautionSoft,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: VerandahSpace.sm,
    paddingVertical: 3,
  },
  pillHiresText: {
    ...VerandahType.micro,
    fontWeight: '500',
    color: Verandah.caution,
  },
  favoriteBtn: {
    paddingVertical: 4,
    paddingLeft: 10,
  },
  footer: {
    borderTopWidth: 0.5,
    borderTopColor: Verandah.border,
    paddingTop: VerandahSpace.sm + 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingIcon: {
    fontSize: 13,
    lineHeight: 15,
    color: Verandah.caution,
  },
  ratingText: {
    ...VerandahType.caption,
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
  ratingCount: {
    ...VerandahType.caption,
    color: Verandah.textTertiary,
  },
  trustText: {
    ...VerandahType.caption,
    color: Verandah.textTertiary,
  },
});
