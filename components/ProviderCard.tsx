import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { ProviderWithInteraction } from '../lib/database.types';
import { CATEGORY_COLORS } from '../constants/categories';

type ProviderCardProps = {
  provider: ProviderWithInteraction;
  onPress: () => void;
  onToggleFavorite: (id: string, isCurrentlyFavorite: boolean) => void;
  isLightMode: boolean;
};

export const ProviderCard = ({ provider, onPress, onToggleFavorite, isLightMode }: ProviderCardProps) => {
  const colors = isLightMode ? Colors.light : Colors.dark;
  const categoryColor = CATEGORY_COLORS[provider.category] || colors.primary;

  return (
    <TouchableOpacity 
      style={[styles.card, { backgroundColor: colors.card, shadowColor: '#000' }]} 
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={styles.content}>
        <View style={styles.imagePlaceholder}>
           <Ionicons name="person" size={24} color={colors.icon} />
        </View>

        <View style={styles.mainInfo}>
          <View style={styles.headerRow}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {provider.name}
            </Text>
            {provider.is_verified && (
              <Ionicons name="checkmark-circle" size={18} color={Colors.light.primary} style={styles.verifiedIcon} />
            )}
          </View>
          
          <Text style={[styles.category, { color: colors.textMuted }]}>{provider.category}</Text>

          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color={colors.warning} />
            <Text style={[styles.ratingText, { color: colors.text }]}>
              {Number(provider.avg_rating).toFixed(1)}
              <Text style={styles.ratingCount}> ({provider.rating_count})</Text>
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
            color={provider.is_favorite ? colors.accent : colors.icon} 
          />
        </TouchableOpacity>
      </View>

      <View style={[styles.footer, { borderTopColor: colors.surface2 }]}>
        <View style={styles.trustIndicators}>
          <View style={styles.trustItem}>
            <Ionicons name="home-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.trustText, { color: colors.textMuted }]}>
              Used by {provider.hire_count || 0} homes
            </Text>
          </View>
          {provider.is_trending && (
            <View style={[styles.trendingTag, { backgroundColor: Colors.light.primary + '15' }]}>
              <Text style={[styles.trendingText, { color: Colors.light.primary }]}>Trending</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  imagePlaceholder: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#F3F4F6',
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
    gap: 4,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  verifiedIcon: {
    marginLeft: 2,
  },
  category: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 4,
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
    color: '#9CA3AF',
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
  },
});
