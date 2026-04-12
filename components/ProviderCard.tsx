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
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {provider.name}
          </Text>
          <View style={[styles.badge, { backgroundColor: categoryColor + '20' }]}>
            <Text style={[styles.badgeText, { color: categoryColor }]}>{provider.category}</Text>
          </View>
        </View>
        <TouchableOpacity 
          style={styles.favoriteButton} 
          onPress={() => onToggleFavorite(provider.id, !!provider.is_favorite)}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons 
            name={provider.is_favorite ? 'heart' : 'heart-outline'} 
            size={24} 
            color={provider.is_favorite ? colors.accent : colors.icon} 
          />
        </TouchableOpacity>
      </View>

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Ionicons name="call-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.detailText, { color: colors.textMuted }]}>{provider.phone}</Text>
        </View>
        
        <View style={styles.detailRow}>
          <Ionicons name="star" size={16} color={colors.warning} />
          <Text style={[styles.detailText, { color: colors.textMuted }]}>
            {Number(provider.avg_rating).toFixed(1)} ({provider.rating_count})
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3.84,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  titleContainer: {
    flex: 1,
    paddingRight: 12,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  favoriteButton: {
    padding: 4,
  },
  details: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 14,
  },
});
