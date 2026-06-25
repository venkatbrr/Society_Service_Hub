import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Avatar } from './Avatar';
import { BaseCard } from './BaseCard';
import { Rupees } from './Rupees';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';

export interface McnListingItem {
  id: string;
  name: string;
  description: string | null;
  contact_phone: string | null;
  is_active: boolean;
  owner_id: string;
  created_at: string;
  profiles: { full_name: string; flat_number: string | null } | null;
  mcn_products: Array<{
    id: string;
    name: string;
    unit: string;
    price: number;
    is_available: boolean;
  }>;
  ratings?: Array<{ rating: number }>;
}

interface McnListingCardProps {
  listing: McnListingItem;
  currentUserId: string;
  isCommunityLead: boolean;
  onPress: (listingId: string) => void;
  onManage: (listingId: string) => void;
  onRemove: (listingId: string) => void;
}

export const McnListingCard = React.memo(({
  listing,
  currentUserId,
  isCommunityLead,
  onPress,
  onManage,
  onRemove,
}: McnListingCardProps) => {
  const [showMenu, setShowMenu] = useState(false);
  const isOwner = listing.owner_id === currentUserId;
  const availableProducts = (listing.mcn_products || []).filter(p => p.is_available);
  const ratings = listing.ratings || [];
  const ratingCount = ratings.length;
  const avgRating = ratingCount > 0 ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratingCount : 0;

  return (
    <BaseCard style={styles.card} padding={16} onPress={() => onPress(listing.id)}>
      <View style={styles.header}>
        <Avatar name={listing.profiles?.full_name || 'Resident'} size={40} />
        <View style={styles.headerText}>
          <Text style={[styles.name, { color: Verandah.textPrimary }]}>{listing.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <Text style={[styles.ownerMeta, { color: Verandah.textTertiary }]}>
              {listing.profiles?.full_name || 'Resident'}
              {listing.profiles?.flat_number ? ` · ${listing.profiles.flat_number}` : ''}
            </Text>
            {ratingCount > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 8 }}>
                <Ionicons name="star" size={12} color="#F59E0B" />
                <Text style={{ fontSize: 12, color: Verandah.textPrimary, marginLeft: 2, fontWeight: '500' }}>
                  {avgRating.toFixed(1)}
                </Text>
                <Text style={{ fontSize: 12, color: Verandah.textTertiary, marginLeft: 1 }}>
                  ({ratingCount})
                </Text>
              </View>
            )}
          </View>
        </View>
        {isCommunityLead && (
          <TouchableOpacity onPress={(e) => { e.stopPropagation(); setShowMenu(true); }} style={styles.menuBtn}>
            <Ionicons name="ellipsis-vertical" size={20} color={Verandah.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {listing.description ? (
        <Text style={[styles.description, { color: Verandah.textSecondary }]} numberOfLines={2}>
          {listing.description}
        </Text>
      ) : null}

      <View style={styles.productsContainer}>
        {availableProducts.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScroll}
          >
            {availableProducts.map((product) => (
              <View key={product.id} style={styles.chip}>
                <Text style={styles.chipText}>{product.name} · </Text>
                <Rupees amount={product.price} size="sm" />
                <Text style={styles.chipText}>/{product.unit}</Text>
              </View>
            ))}
          </ScrollView>
        ) : (
          <Text style={[styles.noItemsText, { color: Verandah.textMuted }]}>
            No items available right now
          </Text>
        )}
      </View>

      <View style={styles.footer}>
        {isOwner ? (
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation(); onManage(listing.id); }}
            style={styles.actionBtn}
          >
            <Text style={[styles.actionBtnText, { color: Verandah.accent }]}>Manage</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => onPress(listing.id)}
            style={styles.actionBtn}
          >
            <Text style={[styles.actionBtnText, { color: Verandah.accent }]}>View details →</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowMenu(false)}>
          <View style={styles.menuContainer}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                onRemove(listing.id);
              }}
            >
              <Ionicons name="trash-outline" size={20} color={Verandah.danger} />
              <Text style={[styles.menuText, { color: Verandah.danger }]}>Remove listing</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </BaseCard>
  );
});

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    shadowColor: 'transparent',
    elevation: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerText: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  name: {
    ...VerandahType.bodyBold,
    marginBottom: 2,
  },
  ownerMeta: {
    ...VerandahType.caption,
  },
  menuBtn: {
    padding: 4,
    marginRight: -4,
  },
  description: {
    ...VerandahType.body,
    marginBottom: 16,
    lineHeight: 20,
  },
  productsContainer: {
    marginBottom: 16,
  },
  chipsScroll: {
    gap: VerandahSpace.sm,
    paddingRight: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Verandah.accentSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: VerandahRadius.pill,
  },
  chipText: {
    ...VerandahType.caption,
    color: Verandah.accent,
  },
  noItemsText: {
    ...VerandahType.caption,
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  actionBtn: {
    paddingVertical: 4,
  },
  actionBtnText: {
    ...VerandahType.captionBold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Verandah.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContainer: {
    backgroundColor: Verandah.surface,
    borderRadius: VerandahRadius.lg,
    width: 220,
    padding: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  menuText: {
    fontSize: 15,
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
});
