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
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} 
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <View style={styles.titleContainer}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {provider.name}
          </Text>
          <View style={[styles.categoryBadge, { backgroundColor: categoryColor + '10' }]}>
            <Text style={[styles.categoryText, { color: categoryColor }]}>{provider.category}</Text>
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

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.cardFooter}>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="call" size={14} color={colors.textMuted} />
            <Text style={[styles.metaText, { color: colors.textMuted }]}>{provider.phone}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="star" size={14} color={colors.warning} />
            <Text style={[styles.metaText, { color: colors.text }]}>
              {Number(provider.avg_rating).toFixed(1)}
              <Text style={styles.ratingCount}> ({provider.rating_count})</Text>
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.border} />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  titleContainer: {
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  favoriteBtn: {
    padding: 4,
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    fontWeight: '500',
  },
  ratingCount: {
    fontSize: 11,
    fontWeight: '400',
    color: '#718096',
  },
});
