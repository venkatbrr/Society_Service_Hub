import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { Platform, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { format12HourTime, getNetworkTileImageHeight, VerandahRadius, VerandahType } from '../constants/Verandah';
import { Avatar } from './Avatar';
import { BaseCard } from './BaseCard';

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
  onManage?: () => void;
}

export const PreorderDropCard: React.FC<PreorderDropCardProps> = ({
  drop,
  isCreator = false,
  onPress,
  onManage,
}) => {
  const now = new Date();
  const cutoffDate = new Date(drop.cutoff_at);
  const isCutoffPassed = now >= cutoffDate;
  const isOpen = drop.status === 'open' && !isCutoffPassed;

  const getCutoffBadge = () => {
    if (drop.status === 'completed') {
      return {
        label: '✅ Delivered & Completed',
        color: '#059669',
        bgColor: '#D1FAE5',
      };
    }
    if (drop.status === 'cancelled') {
      return {
        label: '❌ Drop Cancelled',
        color: '#DC2626',
        bgColor: '#FEE2E2',
      };
    }
    if (drop.status === 'closed' || isCutoffPassed) {
      return {
        label: '🔒 Pre-Orders Closed (Preparing)',
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
      label: `⏳ ${timeText} (${cutoffFormatted})`,
      color: '#D97706',
      bgColor: '#FEF3C7',
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

  const rawHostName = drop.profiles?.full_name?.trim() || drop.mcn_listings?.name?.trim() || 'Resident Host';
  const creatorName = rawHostName === 'Host' ? 'Resident Host' : rawHostName;
  const flatNo = drop.profiles?.flat_number ? `Flat ${drop.profiles.flat_number}` : null;
  const hostDisplay = flatNo ? `${creatorName} (${flatNo})` : creatorName;

  const handleShare = async (e: any) => {
    e.stopPropagation();
    const cutoffFormatted = cutoffDate.toLocaleDateString('en-IN', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    const shareUrl =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? `${window.location.origin}/mcn/drops?id=${drop.id}`
        : `https://society-service-hub.app/mcn/drops?id=${drop.id}`;

    const messageLines = [
      `🍲 *Food Drop: ${drop.title}*`,
      `Hosted by ${hostDisplay}`,
      ``,
      `📅 Delivery: ${fulfillFormatted} (${format12HourTime(drop.fulfillment_time)})`,
      `⏰ Pre-Orders Close: ${cutoffFormatted}`,
    ];

    if (drop.image_url) {
      messageLines.push(`🖼️ Photo: ${drop.image_url}`);
    }

    messageLines.push(``);
    messageLines.push(`🔗 View Menu & Place Pre-Order:`);
    messageLines.push(shareUrl);

    const message = messageLines.join('\n');

    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({ title: drop.title, text: message });
      } else {
        await Share.share({ message, title: drop.title });
      }
    } catch (err) {
      console.error('Error sharing drop:', err);
    }
  };

  return (
    <BaseCard padding={10} style={styles.card}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {/* Top Creator Header */}
        <View style={styles.header}>
          <Avatar name={creatorName} size={36} />
          <View style={styles.headerText}>
            <Text style={styles.creatorName} numberOfLines={1}>
              {creatorName}
            </Text>
            <Text style={styles.flatNo}>{hostDisplay}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <TouchableOpacity style={styles.shareHeaderBtn} onPress={handleShare} hitSlop={8}>
              <Ionicons name="share-outline" size={16} color={Verandah.accent} />
              <Text style={styles.shareHeaderText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Cover Photo */}
        {drop.image_url ? (
          <View style={styles.coverImageWrap}>
            <Image source={{ uri: drop.image_url }} style={styles.coverImage} contentFit="cover" transition={200} />
          </View>
        ) : null}

        {/* Delivery and cut-off info */}
        <View style={styles.metaRow}>
          <View style={[styles.metaChip, { backgroundColor: badge.bgColor }]}> 
            {drop.status === 'completed' ? (
              <Ionicons name="checkmark-circle" size={13} color="#059669" />
            ) : null}
            <Text style={[styles.metaChipText, { color: badge.color }]} numberOfLines={1}>
              {drop.status === 'completed' ? 'Completed' : `Closes: ${cutoffFormatted}`}
            </Text>
          </View>
          <View style={styles.metaChipNeutral}>
            <Ionicons name="calendar-outline" size={13} color={Verandah.accent} />
            <Text style={styles.metaChipNeutralText} numberOfLines={1}>
              Delivery: {fulfillFormatted} ({format12HourTime(drop.fulfillment_time)})
            </Text>
          </View>
        </View>

        {/* Title & Description */}
        <Text style={styles.title}>{drop.title}</Text>
        {drop.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {drop.description}
          </Text>
        ) : null}

        {/* Action Row */}
        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            {drop.item_count !== undefined ? (
              <Text style={styles.orderStats}>
                🍲 {drop.item_count}
                {drop.max_orders ? ` / ${drop.max_orders}` : ''}{' '}
                {drop.item_count === 1 ? 'item ordered' : 'items ordered'}
              </Text>
            ) : null}
            <TouchableOpacity style={styles.shareInlineBtn} onPress={handleShare}>
              <Ionicons name="share-social-outline" size={13} color={Verandah.accent} />
              <Text style={styles.shareInlineText}>Share drop</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.actionBtn,
              !isOpen && !isCreator && styles.actionBtnDisabled,
            ]}
            onPress={isCreator && onManage ? onManage : onPress}
          >
            <Text style={styles.actionBtnText}>
              {isCreator
                ? 'Manage Drop →'
                : isOpen
                ? 'Place Pre-Order →'
                : 'View Menu Details →'}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </BaseCard>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  headerText: {
    flex: 1,
    marginLeft: 8,
  },
  creatorName: {
    ...VerandahType.bodyBold,
    fontSize: 13,
    color: Verandah.textPrimary,
  },
  flatNo: {
    ...VerandahType.caption,
    fontSize: 11,
    color: Verandah.textSecondary,
    marginTop: 0,
  },
  shareHeaderBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: VerandahRadius.pill,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  shareHeaderText: {
    ...VerandahType.captionBold,
    color: Verandah.accent,
    fontSize: 11,
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
    borderRadius: VerandahRadius.md,
    overflow: 'hidden',
    marginBottom: 6,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  metaChipText: {
    fontSize: 10,
    fontWeight: '600',
  },
  metaChipNeutral: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F9FAFB',
    borderWidth: 0.5,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  metaChipNeutralText: {
    fontSize: 10,
    fontWeight: '500',
    color: Verandah.textPrimary,
    flexShrink: 1,
  },
  title: {
    ...VerandahType.title,
    fontSize: 15,
    color: Verandah.textPrimary,
    marginBottom: 2,
  },
  description: {
    ...VerandahType.body,
    fontSize: 12,
    color: Verandah.textSecondary,
    marginBottom: 6,
    lineHeight: 16,
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
    fontSize: 10,
    fontWeight: '500',
    color: Verandah.textSecondary,
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
    backgroundColor: Verandah.accent,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: VerandahRadius.md,
  },
  actionBtnDisabled: {
    backgroundColor: Verandah.cardMuted,
  },
  actionBtnText: {
    ...VerandahType.captionBold,
    fontSize: 11,
    color: '#FFFFFF',
  },
});
