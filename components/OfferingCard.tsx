import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';

interface OfferingCardProps {
  id: string;
  name: string;
  description?: string;
  price: number;
  priceUnit: string;
  photoUrl?: string | null;
  category?: string | null;
  availability: string;
  isAvailable?: boolean;
}

export const OfferingCard = ({ 
  name, 
  description, 
  price, 
  priceUnit, 
  photoUrl, 
  category, 
  availability,
  isAvailable = true 
}: OfferingCardProps) => {
  const colors = Colors.light;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.imageContainer}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.image} />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.surface2 }]}>
            <Ionicons name="fast-food-outline" size={24} color={colors.primary} />
          </View>
        )}
        {!isAvailable && (
          <View style={styles.unavailableOverlay}>
            <Text style={styles.unavailableText}>Sold Out</Text>
          </View>
        )}
      </View>
      
      <View style={styles.info}>
        <View style={styles.headerRow}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{name}</Text>
          {category && (
            <View style={[styles.categoryBadge, { backgroundColor: colors.surface2 }]}>
              <Text style={[styles.categoryText, { color: colors.textMuted }]}>{category}</Text>
            </View>
          )}
        </View>
        
        {description && (
          <Text style={[styles.description, { color: colors.textMuted }]} numberOfLines={2}>
            {description}
          </Text>
        )}
        
        <View style={styles.footer}>
          <Text style={[styles.price, { color: colors.primary }]}>
            ₹{price} <Text style={styles.unit}>{priceUnit}</Text>
          </Text>
          <View style={styles.availability}>
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.availabilityText, { color: colors.textMuted }]}>{availability}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  imageContainer: {
    width: 90,
    height: 90,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unavailableOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unavailableText: {
    color: '#EF4444',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  info: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '600',
  },
  description: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  price: {
    fontSize: 16,
    fontWeight: '800',
  },
  unit: {
    fontSize: 12,
    fontWeight: '400',
    color: '#9CA3AF',
  },
  availability: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  availabilityText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
