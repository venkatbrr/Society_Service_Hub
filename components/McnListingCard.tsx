import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';
import { Avatar } from './Avatar';
import { BaseCard } from './BaseCard';

export interface McnListingItem {
  id: string;
  name: string;
  description: string | null;
  contact_phone: string | null;
  is_active: boolean;
  owner_id: string;
  created_at: string;
  profiles: { full_name: string; flat_number: string | null } | null;
  category: { name: string; emoji: string } | null;
  mcn_products: Array<{
    id: string;
    name: string;
    unit: string;
    price: number | null;
    is_available: boolean;
    item_type?: 'product' | 'service';
  }>;
  ratings?: Array<{ rating: number }>;
  image_url?: string | null;
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
  const [showImageViewer, setShowImageViewer] = useState(false);
  const isOwner = listing.owner_id === currentUserId;
  const ratings = listing.ratings || [];
  const ratingCount = ratings.length;
  const avgRating = ratingCount > 0 ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratingCount : 0;

  return (
    <BaseCard
      style={[styles.card, !listing.is_active && styles.inactiveCard]}
      padding={listing.image_url ? 0 : 16}
      onPress={() => onPress(listing.id)}
    >
      {listing.image_url ? (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={(e) => {
            e.stopPropagation();
            setShowImageViewer(true);
          }}
        >
          <Image
            source={{ uri: listing.image_url }}
            style={styles.coverImage}
            contentFit="cover"
            transition={200}
          />
        </TouchableOpacity>
      ) : null}
      <View style={listing.image_url ? styles.cardContentWithImage : undefined}>
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
          {listing.category ? (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>
                {listing.category.emoji} {listing.category.name}
              </Text>
            </View>
          ) : null}
          {!listing.is_active ? (
            <View style={styles.inactiveBadge}>
              <Text style={styles.inactiveBadgeText}>Inactive</Text>
            </View>
          ) : null}
        </View>
        {(isOwner || isCommunityLead) && (
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
      <Modal visible={showImageViewer} transparent animationType="fade" onRequestClose={() => setShowImageViewer(false)}>
        <Pressable style={styles.viewerOverlay} onPress={() => setShowImageViewer(false)}>
          <TouchableOpacity style={styles.viewerCloseBtn} onPress={() => setShowImageViewer(false)}>
            <Ionicons name="close" size={24} color={Verandah.surface} />
          </TouchableOpacity>
          <Image
            source={{ uri: listing.image_url || '' }}
            style={styles.viewerImage}
            contentFit="contain"
            transition={200}
          />
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
    overflow: 'hidden',
  },
  inactiveCard: {
    opacity: 0.72,
  },
  coverImage: {
    width: '100%',
    height: 120,
  },
  cardContentWithImage: {
    padding: 16,
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
  categoryBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: Verandah.cardMuted,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryBadgeText: {
    ...VerandahType.micro,
    color: Verandah.textSecondary,
  },
  inactiveBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderRadius: VerandahRadius.pill,
    backgroundColor: Verandah.cardMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  inactiveBadgeText: {
    ...VerandahType.micro,
    color: Verandah.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  description: {
    ...VerandahType.body,
    marginBottom: 12,
    lineHeight: 20,
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
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerCloseBtn: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
