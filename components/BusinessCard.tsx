import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { BusinessStatusBadge } from './BusinessStatusBadge';
import { RatingStars } from './RatingStars';

interface BusinessCardProps {
  id: string;
  name: string;
  category: string;
  coverPhotoUrl?: string | null;
  ownerName: string;
  ownerFlat?: string | null;
  avgRating: number;
  ratingCount: number;
  isAcceptingOrders: boolean;
  operatingHours?: string | null;
  orderCutoff?: string | null;
  isFavorited: boolean;
  onToggleFavorite: () => void;
  onPress: () => void;
}

export const BusinessCard = React.memo(({
  name,
  category,
  coverPhotoUrl,
  ownerName,
  ownerFlat,
  avgRating,
  ratingCount,
  isAcceptingOrders,
  operatingHours,
  orderCutoff,
  isFavorited,
  onToggleFavorite,
  onPress
}: BusinessCardProps) => {
  const colors = Colors.light;

  return (
    <TouchableOpacity 
      style={[styles.card, { backgroundColor: colors.card }]} 
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={styles.coverContainer}>
        {coverPhotoUrl ? (
          <Image source={{ uri: coverPhotoUrl }} style={styles.coverImage} />
        ) : (
          <View style={[styles.coverPlaceholder, { backgroundColor: colors.surface2 }]}>
            <Ionicons name="storefront-outline" size={40} color={colors.primary} />
          </View>
        )}
        <View style={styles.badgeContainer}>
          <BusinessStatusBadge isAcceptingOrders={isAcceptingOrders} />
        </View>
        <TouchableOpacity 
          style={[styles.favoriteBtn, { backgroundColor: 'white' }]} 
          onPress={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
        >
          <Ionicons 
            name={isFavorited ? "heart" : "heart-outline"} 
            size={20} 
            color={isFavorited ? colors.accent : colors.icon} 
          />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.nameContainer}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{name}</Text>
            <View style={[styles.categoryBadge, { backgroundColor: colors.primary + '10' }]}>
              <Text style={[styles.categoryText, { color: colors.primary }]}>{category}</Text>
            </View>
          </View>
        </View>

        <View style={styles.ownerRow}>
          <Ionicons name="person-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.ownerText, { color: colors.textMuted }]}>
            {ownerName} {ownerFlat ? `• ${ownerFlat}` : ''}
          </Text>
        </View>

        <View style={styles.ratingRow}>
          <RatingStars rating={avgRating} size={16} isLightMode={true} readonly={true} />
          <Text style={[styles.ratingCount, { color: colors.textMuted }]}>({ratingCount})</Text>
        </View>

        {(operatingHours || orderCutoff) && (
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            {operatingHours && (
              <View style={styles.footerItem}>
                <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                <Text style={[styles.footerText, { color: colors.textMuted }]} numberOfLines={1}>
                  {operatingHours}
                </Text>
              </View>
            )}
            {orderCutoff && (
              <View style={styles.footerItem}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.textMuted} />
                <Text style={[styles.footerText, { color: colors.textMuted }]} numberOfLines={1}>
                  Cutoff: {orderCutoff}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    marginBottom: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  coverContainer: {
    height: 160,
    width: '100%',
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeContainer: {
    position: 'absolute',
    top: 12,
    left: 12,
  },
  favoriteBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  content: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  nameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  ownerText: {
    fontSize: 13,
    fontWeight: '500',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  ratingCount: {
    fontSize: 12,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 16,
  },
  footerItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
