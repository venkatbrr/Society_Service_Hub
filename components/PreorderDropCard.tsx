import { Share07 } from '@untitledui/icons/Share07';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { format12HourTime, getNetworkTileImageHeight, VerandahRadius, VerandahType } from '../constants/Verandah';
import { cloudinaryUrl } from '../lib/cloudinary';
import { shareOrCopy } from '../lib/share';
import { siteUrl } from '../lib/siteUrl';
import { Avatar } from './Avatar';

const NETWORK_TILE_IMAGE_HEIGHT = getNetworkTileImageHeight();

export interface PreorderDropItem {
  id: string;
  title: string;
  description: string | null;
  fulfillment_date: string;
  fulfillment_time: string;
  cutoff_at: string;
  max_orders: number | null;
  status: 'open' | 'closed' | 'completed' | 'cancelled';
  image_url?: string | null;
  created_by: string;
  created_at: string;
  profiles?: {
    full_name: string | null;
    flat_number: string | null;
  } | null;
  mcn_listings?: {
    name: string;
    image_url: string | null;
  } | null;
  item_count?: number;
  order_count?: number;
}

interface PreorderDropCardProps {
  drop: PreorderDropItem;
  isCreator?: boolean;
  onPress: () => void;
}

export const PreorderDropCard: React.FC<PreorderDropCardProps> = ({
  drop,
  isCreator = false,
  onPress,
}) => {
  const now = new Date();
  const cutoffDate = new Date(drop.cutoff_at);
  const isCutoffPassed = now >= cutoffDate;
  const isOpen = drop.status === 'open' && !isCutoffPassed;

  const getCutoffBadge = () => {
    if (drop.status === 'completed') {
      return {
        label: 'Delivered & Completed',
        color: Verandah.green600,
        bgColor: '#D1FAE5',
      };
    }
    if (drop.status === 'cancelled') {
      return {
        label: 'Drop Cancelled',
        color: '#DC2626',
        bgColor: '#FEE2E2',
      };
    }
    if (drop.status === 'closed' || isCutoffPassed) {
      return {
        label: 'Pre-Orders Closed',
        color: '#4B5563',
        bgColor: '#F3F4F6',
      };
    }

    // Time remaining until cut-off
    const diffMs = cutoffDate.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    let timeText = '';
    if (diffDays > 0) {
      timeText = `Closes in ${diffDays}d`;
    } else if (diffHours > 0) {
      timeText = `Closes in ${diffHours}h`;
    } else {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      timeText = `Closes in ${Math.max(1, diffMins)}m`;
    }

    const cutoffFormatted = cutoffDate.toLocaleDateString('en-IN', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    return {
      label: `${timeText} (${cutoffFormatted})`,
      color: '#854F0B',
      bgColor: '#FBEAD0',
    };
  };

  const badge = getCutoffBadge();

  const cutoffFormatted = cutoffDate.toLocaleDateString('en-IN', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const fulfillDateObj = new Date(drop.fulfillment_date);
  const fulfillFormatted = fulfillDateObj.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  // Delivery reads in the same "Wed, 01:00 pm" shape as the cut-off chip, so the
  // two pills sitting side by side stay comparable at a glance.
  const fulfillDateTime = new Date(`${drop.fulfillment_date}T${drop.fulfillment_time}`);
  const deliveryFormatted = isNaN(fulfillDateTime.getTime())
    ? `${fulfillFormatted} · ${format12HourTime(drop.fulfillment_time)}`
    : fulfillDateTime.toLocaleDateString('en-IN', {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });

  const hostFullName = drop.profiles?.full_name?.trim() || null;
  const listingName = drop.mcn_listings?.name?.trim() || null;
  const rawHostName = hostFullName || listingName || 'Resident Host';
  const creatorName = rawHostName === 'Host' ? 'Resident Host' : rawHostName;
  const flatNo = drop.profiles?.flat_number ? `Flat ${drop.profiles.flat_number}` : null;
  const hostDisplay = flatNo ? `${creatorName} (${flatNo})` : creatorName;

  // Second line: where the food comes from. Prefer a linked business listing,
  // otherwise it is a resident cooking from home.
  const hostSubtitle = [flatNo, listingName && listingName !== creatorName ? listingName : 'Home kitchen']
    .filter(Boolean)
    .join(' · ');

  const handleShare = async (e: any) => {
    e.stopPropagation();
    // Route through the OG-preview endpoint (api/share-drop.ts) so WhatsApp/
    // Facebook/etc. crawlers render the drop's title, description, and photo.
    const shareUrl = siteUrl(`/api/share-drop?id=${drop.id}`);

    const messageLines = [
      `*Food Drop: ${drop.title}*`,
      `Hosted by ${hostDisplay}`,
      ``,
      `Delivery: ${fulfillFormatted} (${format12HourTime(drop.fulfillment_time)})`,
      `Pre-Orders Close: ${cutoffFormatted}`,
      ``,
      `View Menu & Place Pre-Order:`,
      shareUrl,
    ];

    const message = messageLines.join('\n');
    await shareOrCopy({ title: drop.title, message });
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
        {/* Cover photo with overlaid cut-off badge */}
        <View style={styles.coverImageWrap}>
          {drop.image_url ? (
            <Image source={{ uri: cloudinaryUrl(drop.image_url) }} style={styles.coverImage} contentFit="cover" transition={200} />
          ) : (
            <View style={styles.coverPlaceholder}>
              <Text style={styles.coverPlaceholderText}>food photo</Text>
            </View>
          )}
        </View>

        {/* Body */}
        <View style={styles.body}>
          {/* Host row */}
          <View style={styles.header}>
            <Avatar name={creatorName} size={32} />
            <View style={styles.headerText}>
              <Text style={styles.creatorName} numberOfLines={1}>
                {creatorName}
              </Text>
              <Text style={styles.flatNo} numberOfLines={1}>
                {hostSubtitle}
              </Text>
            </View>
            <TouchableOpacity style={styles.shareHeaderBtn} onPress={handleShare} hitSlop={8} activeOpacity={0.85}>
              <Share07 size={14} color={Verandah.primaryFg} aria-hidden={true} />
              <Text style={styles.shareHeaderText}>Share</Text>
            </TouchableOpacity>
          </View>

          {/* Title */}
          <Text style={styles.title}>{drop.title}</Text>

          {/* Cut-off + delivery, side by side */}
          <View style={styles.metaRow}>
            <View style={[styles.cutoffBadge, { backgroundColor: badge.bgColor }]}>
              <Text style={[styles.cutoffBadgeText, { color: badge.color }]} numberOfLines={1}>
                {drop.status === 'completed' ? 'Completed' : `Closes ${cutoffFormatted}`}
              </Text>
            </View>

            <View style={styles.deliveryChip}>
              <Text style={styles.deliveryText} numberOfLines={1}>
                Delivery {deliveryFormatted}
              </Text>
            </View>

          </View>

          {drop.description ? (
            <Text style={styles.description} numberOfLines={2}>
              {drop.description}
            </Text>
          ) : null}

          {/* Hosts manage their own drop from inside the detail screen, so the
              card carries no action for them — tapping it opens the drop. */}
          {isCreator ? null : (
            <>
              <View style={styles.divider} />
              <TouchableOpacity
                style={[styles.actionBtn, !isOpen && styles.actionBtnDisabled]}
                onPress={onPress}
                activeOpacity={0.85}
              >
                <Text style={[styles.actionBtnText, !isOpen && styles.actionBtnTextDisabled]}>
                  {isOpen ? 'Reserve now' : 'View Menu Details'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    borderRadius: VerandahRadius.card,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.card,
    overflow: 'hidden',
    ...Verandah.shadowCard,
  },
  body: {
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerText: {
    flex: 1,
    marginLeft: 10,
  },
  creatorName: {
    ...VerandahType.bodyBold,
    fontSize: 14,
    color: Verandah.textPrimary,
  },
  flatNo: {
    ...VerandahType.caption,
    fontSize: 11.5,
    color: Verandah.textSecondary,
    marginTop: 1,
  },
  shareHeaderBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: VerandahRadius.pill,
    backgroundColor: Verandah.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  shareHeaderText: {
    ...VerandahType.captionBold,
    color: Verandah.primaryFg,
    fontSize: 12.5,
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Verandah.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverPlaceholderText: {
    ...VerandahType.caption,
    fontSize: 11.5,
    color: Verandah.textFaint,
    backgroundColor: Verandah.card,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: VerandahRadius.pill,
    overflow: 'hidden',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  cutoffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: VerandahRadius.pill,
  },
  cutoffBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: VerandahType.sansFamily,
  },
  deliveryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: VerandahRadius.pill,
    backgroundColor: Verandah.accentSoft,
    flexShrink: 1,
  },
  deliveryText: {
    fontSize: 11,
    fontWeight: '700',
    color: Verandah.green600,
    fontFamily: VerandahType.sansFamily,
    flexShrink: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Verandah.borderHair,
    marginTop: 10,
    marginBottom: 10,
  },
  manageBadgeBtn: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: VerandahRadius.pill,
  },
  manageBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.accent,
  },
  coverImageWrap: {
    height: NETWORK_TILE_IMAGE_HEIGHT,
    width: '100%',
    position: 'relative',
    backgroundColor: Verandah.cream,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '400',
    letterSpacing: -0.3,
    color: Verandah.textPrimary,
  },
  description: {
    ...VerandahType.body,
    fontSize: 12.5,
    color: Verandah.textSecondary,
    marginTop: 6,
    lineHeight: 17,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: Verandah.border,
    paddingTop: 6,
  },
  footerLeft: {
    flex: 1,
    paddingRight: 8,
  },
  orderStats: {
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.textSecondary,
    fontFamily: VerandahType.sansFamily,
    flexShrink: 1,
  },
  shareInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  shareInlineText: {
    ...VerandahType.captionBold,
    color: Verandah.accent,
    fontSize: 10,
  },
  actionBtn: {
    backgroundColor: Verandah.primary,
    paddingVertical: 11,
    borderRadius: VerandahRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDisabled: {
    backgroundColor: Verandah.cardMuted,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Verandah.primaryFg,
    fontFamily: VerandahType.sansFamily,
  },
  actionBtnTextDisabled: {
    color: Verandah.textSecondary,
  },
});
