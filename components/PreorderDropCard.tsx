import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { Platform, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Avatar } from './Avatar';
import { BaseCard } from './BaseCard';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';

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

  // Format Cut-off Display
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

  // Format Fulfillment Date
  const fulfillDateObj = new Date(drop.fulfillment_date);
  const fulfillFormatted = fulfillDateObj.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const creatorName = drop.profiles?.full_name || drop.mcn_listings?.name || 'Local Food Host';
  const flatNo = drop.profiles?.flat_number ? `Flat ${drop.profiles.flat_number}` : null;

  const handleShare = async (e: any) => {
    e.stopPropagation();
    const cutoffFormatted = cutoffDate.toLocaleDateString('en-IN', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    const shareUrl =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? `${window.location.origin}/network/drops?id=${drop.id}`
        : `https://society-service-hub.app/network/drops?id=${drop.id}`;

    const messageLines = [
      `🍕 *Food Drop: ${drop.title}*`,
      `Hosted by ${creatorName}${flatNo ? ` (${flatNo})` : ''}`,
      ``,
      `📅 Delivery: ${fulfillFormatted} (${drop.fulfillment_time})`,
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
        await (navigator as any).share({ title: drop.title, text: message, url: shareUrl });
      } else {
        await Share.share({ message, title: drop.title, url: shareUrl });
      }
    } catch (err) {
      console.error('Error sharing drop:', err);
    }
  };

  return (
    <BaseCard padding={16} style={styles.card}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {/* Top Creator Header */}
        <View style={styles.header}>
          <Avatar name={creatorName} size={38} />
          <View style={styles.headerText}>
            <Text style={styles.creatorName} numberOfLines={1}>
              {creatorName}
            </Text>
            <Text style={styles.flatNo}>
              {flatNo ? `${flatNo} · ` : ''}Food Drop
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity style={styles.shareIconBtn} onPress={handleShare} hitSlop={8}>
              <Ionicons name="share-outline" size={18} color={Verandah.accent} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Cover Photo */}
        {drop.image_url ? (
          <View style={styles.coverImageWrap}>
            <Image source={{ uri: drop.image_url }} style={styles.coverImage} contentFit="cover" transition={200} />
          </View>
        ) : null}

        {/* Cutoff Badge Banner */}
        <View style={[styles.badgeBanner, { backgroundColor: badge.bgColor, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
          {drop.status === 'completed' ? (
            <Ionicons name="checkmark-circle" size={15} color="#059669" />
          ) : null}
          <Text style={[styles.badgeText, { color: badge.color }]}>
            {drop.status === 'completed' ? 'Delivered & Completed' : badge.label}
          </Text>
        </View>

        {/* Title & Description */}
        <Text style={styles.title}>{drop.title}</Text>
        {drop.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {drop.description}
          </Text>
        ) : null}

        {/* Delivery Schedule Row */}
        <View style={styles.scheduleRow}>
          <Ionicons name="calendar-outline" size={16} color={Verandah.accent} />
          <Text style={styles.scheduleText}>
            Delivery: <Text style={styles.scheduleBold}>{fulfillFormatted}</Text> ({drop.fulfillment_time})
          </Text>
        </View>

        {/* Action Row */}
        <View style={styles.footer}>
          {drop.order_count !== undefined ? (
            <Text style={styles.orderStats}>
              📦 {drop.order_count} {drop.order_count === 1 ? 'pre-order' : 'pre-orders'}
            </Text>
          ) : <View />}

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
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
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
    fontSize: 11,
    color: Verandah.textSecondary,
    marginTop: 1,
  },
  shareIconBtn: {
    padding: 4,
  },
  manageBadgeBtn: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: VerandahRadius.pill,
  },
  manageBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.accent,
  },
  coverImageWrap: {
    height: 140,
    borderRadius: VerandahRadius.md,
    overflow: 'hidden',
    marginBottom: 10,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  badgeBanner: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  title: {
    ...VerandahType.title,
    fontSize: 16,
    color: Verandah.textPrimary,
    marginBottom: 4,
  },
  description: {
    ...VerandahType.body,
    fontSize: 13,
    color: Verandah.textSecondary,
    marginBottom: 10,
    lineHeight: 18,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F9FAFB',
    padding: 8,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  scheduleText: {
    fontSize: 12,
    color: Verandah.textSecondary,
  },
  scheduleBold: {
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: Verandah.border,
    paddingTop: 10,
  },
  orderStats: {
    fontSize: 11,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  actionBtn: {
    backgroundColor: Verandah.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: VerandahRadius.md,
  },
  actionBtnDisabled: {
    backgroundColor: Verandah.cardMuted,
  },
  actionBtnText: {
    ...VerandahType.captionBold,
    fontSize: 12,
    color: '#FFFFFF',
  },
});
