import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { APP_EMOJIS, getServiceCategoryEmoji } from '../constants/emojis';
import { ProviderWithInteraction } from '../lib/database.types';
import { BaseCard } from './BaseCard';

type ProviderCardProps = {
  provider: ProviderWithInteraction;
  onPress: () => void;
  onToggleFavorite: (id: string, isCurrentlyFavorite: boolean) => void;
  isLightMode: boolean;
};

export const ProviderCard = React.memo(({ provider, onPress, onToggleFavorite, isLightMode }: ProviderCardProps) => {
  const colors = isLightMode ? Colors.light : Colors.dark;

  return (
    <BaseCard
      onPress={onPress}
      isLightMode={isLightMode}
      padding={20}
    >
      <View style={styles.content}>
        <View style={[styles.imagePlaceholder, { backgroundColor: colors.primary + '24', borderColor: colors.primary + '38' }]}>
          <Text style={styles.avatarEmoji}>{getServiceCategoryEmoji(provider.category)}</Text>
        </View>

        <View style={styles.mainInfo}>
          <View style={styles.headerRow}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {provider.name}
            </Text>
            {provider.is_verified && (
              <Text style={styles.verifiedIcon}>{APP_EMOJIS.verified}</Text>
            )}
          </View>

          <View style={[styles.categoryBadge, { backgroundColor: colors.primary + '12' }]}>
            <Text style={[styles.category, { color: colors.primary }]}>{`${getServiceCategoryEmoji(provider.category)} ${provider.category}`}</Text>
          </View>

          <View style={styles.ratingRow}>
            <Text style={styles.ratingIcon}>{APP_EMOJIS.starFilled}</Text>
            <Text style={[styles.ratingText, { color: colors.text }]}>
              {Number(provider.avg_rating).toFixed(1)}
              <Text style={[styles.ratingCount, { color: colors.textMuted }]}> ({provider.rating_count})</Text>
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.favoriteBtn}
          onPress={() => onToggleFavorite(provider.id, !!provider.is_favorite)}
        >
          <Text style={styles.favoriteIcon}>{provider.is_favorite ? APP_EMOJIS.favoritesFilled : APP_EMOJIS.favoritesEmpty}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <View style={styles.trustIndicators}>
          <View style={styles.trustItem}>
            <Text style={styles.trustIcon}>{APP_EMOJIS.house}</Text>
            <Text style={[styles.trustText, { color: colors.textMuted }]}>
              Used by {provider.hire_count || 0} homes
            </Text>
          </View>
          {provider.is_trending && (
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.trendingTag}
            >
              <Text style={styles.trendingText}>Trending</Text>
            </LinearGradient>
          )}
        </View>
      </View>
    </BaseCard>
  );
});

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  imagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    overflow: 'hidden',
  },
  avatarEmoji: {
    fontSize: 28,
    lineHeight: 32,
    backgroundColor: 'transparent',
  },
  mainInfo: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  verifiedIcon: {
    marginTop: 1,
    fontSize: 16,
    lineHeight: 18,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  category: {
    fontSize: 12,
    fontWeight: '600',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingIcon: {
    fontSize: 14,
    lineHeight: 16,
    color: '#FFB347',
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '600',
  },
  ratingCount: {
    fontWeight: '400',
  },
  favoriteBtn: {
    padding: 8,
  },
  favoriteIcon: {
    fontSize: 22,
    lineHeight: 24,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: 12,
  },
  trustIndicators: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trustIcon: {
    fontSize: 14,
    lineHeight: 16,
  },
  trustText: {
    fontSize: 12,
    fontWeight: '500',
  },
  trendingTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  trendingText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#FFF',
  },
});
