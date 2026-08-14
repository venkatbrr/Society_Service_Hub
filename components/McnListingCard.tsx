import { Share07 } from '@untitledui/icons/Share07';
import { Star01 } from '@untitledui/icons/Star01';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { getNetworkTileImageHeight, VerandahRadius, VerandahType } from '../constants/Verandah';
import { cloudinaryUrl } from '../lib/cloudinary';
import { shareOrCopy } from '../lib/share';
import { siteUrl } from '../lib/siteUrl';
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
}

export const McnListingCard = React.memo(({
  listing,
  onPress,
}: McnListingCardProps) => {
  const { height: windowHeight } = useWindowDimensions();
  const coverHeight = getNetworkTileImageHeight(windowHeight);
  const ratings = listing.ratings || [];
  const ratingCount = ratings.length;
  const avgRating = ratingCount > 0 ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratingCount : 0;

  const handleShare = async (e: any) => {
    e.stopPropagation();
    const ownerName = listing.profiles?.full_name || 'Resident';
    const flatNo = listing.profiles?.flat_number ? `Flat ${listing.profiles.flat_number}` : '';
    const catLabel = listing.category?.name || '';

    // Route through the OG-preview endpoint (api/share-listing.ts) so WhatsApp/
    // Facebook/etc. crawlers render the listing's name, description, and photo.
    const shareUrl = siteUrl(`/api/share-listing?id=${listing.id}`);

    const messageLines = [
      `*Community Business: ${listing.name}*`,
      catLabel ? `Category: ${catLabel}` : '',
      `Owner: ${ownerName} ${flatNo ? `(${flatNo})` : ''}`,
    ];

    if (listing.description) {
      messageLines.push(`About: "${listing.description}"`);
    }

    if (listing.contact_phone) {
      messageLines.push(`Phone/WhatsApp: ${listing.contact_phone}`);
    }

    messageLines.push(``);
    messageLines.push(`View Offerings & Order:`);
    messageLines.push(shareUrl);

    const message = messageLines.filter(Boolean).join('\n');
    await shareOrCopy({ title: listing.name, message });
  };

  return (
    <BaseCard
      style={[styles.card, !listing.is_active && styles.inactiveCard]}
      padding={listing.image_url ? 0 : 12}
      onPress={() => onPress(listing.id)}
    >
      {listing.image_url ? (
        <Image
          source={{ uri: cloudinaryUrl(listing.image_url) }}
          style={[styles.coverImage, { height: coverHeight }]}
          contentFit="cover"
          contentPosition="top"
          transition={200}
        />
      ) : null}
      <View style={listing.image_url ? styles.cardContentWithImage : undefined}>
      <View style={styles.header}>
        <Avatar name={listing.profiles?.full_name || 'Resident'} size={36} />
        <View style={styles.headerText}>
          <Text style={[styles.name, { color: Verandah.textPrimary }]}>{listing.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <Text style={[styles.ownerMeta, { color: Verandah.textTertiary }]}>
              {listing.profiles?.full_name || 'Resident'}
              {listing.profiles?.flat_number ? ` · ${listing.profiles.flat_number}` : ''}
            </Text>
            {ratingCount > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 8, gap: 2 }}>
                <Star01 size={12} color={Verandah.goldInk} fill={Verandah.goldInk} aria-hidden={true} />
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
                {listing.category.name}
              </Text>
            </View>
          ) : null}
          {!listing.is_active ? (
            <View style={styles.inactiveBadge}>
              <Text style={styles.inactiveBadgeText}>Inactive</Text>
            </View>
          ) : null}
        </View>
        {/* Share sits where the overflow menu used to. Removing a listing lives on
            the manage screen and My Submissions, so the card carries no destructive
            action, and "View details" is redundant with tapping the card. */}
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn} hitSlop={8} activeOpacity={0.85}>
          <Share07 size={14} color={Verandah.primaryFg} aria-hidden={true} />
          <Text style={styles.shareBtnText}>Share</Text>
        </TouchableOpacity>
      </View>

      </View>
    </BaseCard>
  );
});

const styles = StyleSheet.create({
  card: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    overflow: 'hidden',
  },
  inactiveCard: {
    opacity: 0.72,
  },
  coverImage: {
    width: '100%',
  },
  cardContentWithImage: {
    padding: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerText: {
    flex: 1,
    marginLeft: 10,
    marginRight: 6,
  },
  name: {
    ...VerandahType.bodyBold,
    marginBottom: 2,
  },
  ownerMeta: {
    ...VerandahType.caption,
    fontSize: 12,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 3,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  inactiveBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 3,
  },
  inactiveBadgeText: {
    ...VerandahType.micro,
    color: Verandah.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: VerandahRadius.pill,
    backgroundColor: Verandah.primary,
  },
  shareBtnText: {
    ...VerandahType.captionBold,
    color: Verandah.primaryFg,
    fontSize: 12.5,
  },
  description: {
    ...VerandahType.body,
    marginBottom: 8,
    lineHeight: 18,
  },
});
