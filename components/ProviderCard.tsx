import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CATEGORY_COLORS } from '../constants/categories';
import { Colors } from '../constants/Colors';
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
  const categoryColor = CATEGORY_COLORS[provider.category] || colors.primary;

  return (
    <BaseCard
      onPress={onPress}
      isLightMode={isLightMode}
      padding={20}
    >
      <View style={styles.content}>
        <View style={[styles.imagePlaceholder, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
           <Ionicons name="person" size={28} color={colors.icon} />
        </View>

        <View style={styles.mainInfo}>
          <View style={styles.headerRow}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {provider.name}
            </Text>
            {provider.is_verified && (
              <Ionicons name="checkmark-circle" size={18} color={colors.primary} style={styles.verifiedIcon} />
            )}
          </View>

          <View style={[styles.categoryBadge, { backgroundColor: colors.primary + '12' }]}>
            <Text style={[styles.category, { color: colors.primary }]}>{provider.category}</Text>
          </View>

          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color="#FFB347" />
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
          <Ionicons
            name={provider.is_favorite ? 'heart' : 'heart-outline'}
            size={22}
            color={provider.is_favorite ? '#FF6B6B' : colors.icon}
          />
        </TouchableOpacity>
      </View>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <View style={styles.trustIndicators}>
          <View style={styles.trustItem}>
            <Ionicons name="home-outline" size={14} color={colors.textMuted} />
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
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
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
