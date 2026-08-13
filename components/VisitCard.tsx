import { Calendar } from '@untitledui/icons/Calendar';
import { Link01 } from '@untitledui/icons/Link01';
import { Share07 } from '@untitledui/icons/Share07';
import { Users01 } from '@untitledui/icons/Users01';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
import { shareOrCopy } from '../lib/share';
import { siteUrl } from '../lib/siteUrl';
import { Avatar } from './Avatar';
import { BaseCard } from './BaseCard';
import { VisitStatusBadge } from './VisitStatusBadge';

interface VisitCardProps {
  id: string;
  title: string;
  providerName: string;
  hasProviderProfile: boolean;
  category: string;
  visitDate: string;
  visitTimeSlot: string;
  estimatedCost?: string;
  creatorName: string;
  creatorFlat?: string;
  creatorAvatarUrl?: string;
  createdAt: string;
  isCreator: boolean;
  joinerCount: number;
  maxJoiners?: number;
  hasUserJoined: boolean;
  status: 'upcoming' | 'in_progress' | 'completed' | 'cancelled';
  onJoin: () => void;
  onUnjoin: () => void;
  onPress: () => void;
}

export const VisitCard = React.memo(({
  id,
  title,
  providerName,
  hasProviderProfile,
  category,
  visitDate,
  visitTimeSlot,
  estimatedCost,
  creatorName,
  creatorFlat,
  creatorAvatarUrl,
  createdAt,
  isCreator,
  joinerCount,
  maxJoiners,
  hasUserJoined,
  status,
  onJoin,
  onUnjoin,
  onPress,
}: VisitCardProps) => {
  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map((part) => Number(part));
    const date = year && month && day
      ? new Date(year, month - 1, day)
      : new Date(dateStr);
    return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const getRelativeTime = (timeStr: string) => {
    const now = new Date();
    const then = new Date(timeStr);
    const diffInMs = now.getTime() - then.getTime();
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return `${Math.floor(diffInHours / 24)}d ago`;
  };

  const handleShare = async (e: any) => {
    e?.stopPropagation?.();
    try {
      const formattedDate = formatDate(visitDate);
      const shareUrl = siteUrl(`/visits/${id}`);

      const messageLines = [
        `*Service Visit: ${title}*`,
        `Provider: ${providerName}`,
        `Date: ${formattedDate}`,
        `Time: ${visitTimeSlot}`,
        estimatedCost ? `Estimated Cost: ~${estimatedCost}` : '',
        ``,
        `View Visit & Join:`,
        shareUrl,
      ];

      const message = messageLines.filter(Boolean).join('\n');
      await shareOrCopy({ title, message });
    } catch (error: any) {
      console.error('Error sharing:', error);
    }
  };

  const isFull = maxJoiners ? joinerCount >= maxJoiners : false;

  return (
    <BaseCard padding={12} onPress={onPress}>
      {/* Creator Row */}
      <View style={styles.creatorRow}>
        <Avatar name={creatorName} size={30} />
        <View style={styles.creatorInfo}>
          <Text style={styles.creatorName}>{creatorName} {creatorFlat ? `· ${creatorFlat}` : ''}</Text>
          <Text style={styles.relativeTime}>{getRelativeTime(createdAt)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity style={styles.shareHeaderBtn} onPress={handleShare} hitSlop={8}>
            <Share07 size={14} color={Verandah.accent} aria-hidden={true} />
            <Text style={styles.shareHeaderText}>Share</Text>
          </TouchableOpacity>
          <VisitStatusBadge status={status} />
        </View>
      </View>

      {/* Main Info */}
      <View style={styles.mainInfo}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.providerRow}>
          <Text style={styles.providerText}>
            Provider: <Text style={styles.providerName}>{providerName}</Text>
          </Text>
          {hasProviderProfile && <Link01 size={12} color={Verandah.accent} style={{ marginLeft: 4 }} aria-hidden={true} />}
        </View>

        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Calendar size={13} color={Verandah.textTertiary} aria-hidden={true} />
            <Text style={styles.detailText}>{formatDate(visitDate)} · {visitTimeSlot}</Text>
          </View>
        </View>

        <View style={styles.tagRow}>
          <View style={styles.categoryPill}>
            <Text style={styles.categoryText}>{category}</Text>
          </View>
          {estimatedCost && (
            <Text style={styles.costText}>~{estimatedCost}</Text>
          )}
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <View style={styles.joinerCount}>
            <Users01 size={14} color={Verandah.accent} aria-hidden={true} />
            <Text style={styles.joinerText}>
              {joinerCount} {maxJoiners ? `/ ${maxJoiners}` : ''} {joinerCount === 1 ? 'neighbor' : 'neighbors'} joined
            </Text>
          </View>
          <TouchableOpacity onPress={handleShare} style={styles.shareInlineBtn}>
            <Share07 size={13} color={Verandah.accent} aria-hidden={true} />
            <Text style={styles.shareInlineText}>Share visit</Text>
          </TouchableOpacity>
        </View>

        {isCreator ? (
          <View style={styles.hostLabel}>
            <Text style={styles.hostLabelText}>You're hosting</Text>
          </View>
        ) : hasUserJoined ? (
          <TouchableOpacity style={styles.joinedBtn} onPress={onUnjoin}>
            <Text style={styles.joinedBtnText}>Joined</Text>
          </TouchableOpacity>
        ) : status === 'upcoming' && !isFull ? (
          <TouchableOpacity style={styles.joinBtn} onPress={onJoin} activeOpacity={0.8}>
            <Text style={styles.joinBtnText}>Join</Text>
          </TouchableOpacity>
        ) : isFull ? (
          <View style={styles.fullBadge}>
            <Text style={styles.fullText}>Full</Text>
          </View>
        ) : null}
      </View>
    </BaseCard>
  );
});

const styles = StyleSheet.create({
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  creatorInfo: {
    flex: 1,
  },
  creatorName: {
    fontSize: 13,
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
  relativeTime: {
    fontSize: 11,
    color: Verandah.textMuted,
    marginTop: 1,
  },
  mainInfo: {
    marginBottom: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    color: Verandah.textPrimary,
    marginBottom: 2,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  providerText: {
    fontSize: 12,
    color: Verandah.textSecondary,
  },
  providerName: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
  detailsRow: {
    marginBottom: 4,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    color: Verandah.textPrimary,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  categoryPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: VerandahRadius.sm,
    backgroundColor: Verandah.cardMuted,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  costText: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: Verandah.border,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shareHeaderBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: VerandahRadius.pill,
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  shareHeaderText: {
    ...VerandahType.captionBold,
    color: Verandah.accent,
    fontSize: 12,
  },
  shareInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 4,
  },
  shareInlineText: {
    ...VerandahType.captionBold,
    color: Verandah.accent,
    fontSize: 11,
  },
  joinerCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  joinerText: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
  joinBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.primary,
  },
  joinBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.primaryFg,
    textAlign: 'center',
  },
  joinedBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
  },
  joinedBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.primary,
  },
  hostLabel: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: VerandahRadius.sm,
    backgroundColor: Verandah.accentSoft,
  },
  hostLabelText: {
    fontSize: 11,
    fontWeight: '500',
    color: Verandah.accent,
  },
  fullBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: VerandahRadius.sm,
    backgroundColor: Verandah.cardMuted,
  },
  fullText: {
    fontSize: 11,
    fontWeight: '500',
    color: Verandah.textMuted,
  },
});
