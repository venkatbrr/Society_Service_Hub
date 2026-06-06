import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
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

  const isFull = maxJoiners ? joinerCount >= maxJoiners : false;

  return (
    <BaseCard padding={16} onPress={onPress}>
      {/* Creator Row */}
      <View style={styles.creatorRow}>
        <Avatar name={creatorName} size={36} />
        <View style={styles.creatorInfo}>
          <Text style={styles.creatorName}>{creatorName} {creatorFlat ? `· ${creatorFlat}` : ''}</Text>
          <Text style={styles.relativeTime}>{getRelativeTime(createdAt)}</Text>
        </View>
        <VisitStatusBadge status={status} />
      </View>

      {/* Main Info */}
      <View style={styles.mainInfo}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.providerRow}>
          <Text style={styles.providerText}>
            Provider: <Text style={styles.providerName}>{providerName}</Text>
          </Text>
          {hasProviderProfile && <Ionicons name="link" size={14} color={Verandah.accent} style={{ marginLeft: 4 }} />}
        </View>

        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Ionicons name="calendar-outline" size={14} color={Verandah.textTertiary} />
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
        <View style={styles.joinerCount}>
          <Ionicons name="people-outline" size={16} color={Verandah.accent} />
          <Text style={styles.joinerText}>
            {joinerCount} {maxJoiners ? `/ ${maxJoiners}` : ''} {joinerCount === 1 ? 'neighbor' : 'neighbors'} joined
          </Text>
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
    gap: VerandahSpace.md,
    marginBottom: VerandahSpace.md,
  },
  creatorInfo: {
    flex: 1,
  },
  creatorName: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
  },
  relativeTime: {
    ...VerandahType.caption,
    color: Verandah.textMuted,
    marginTop: 2,
  },
  mainInfo: {
    marginBottom: VerandahSpace.lg,
  },
  title: {
    ...VerandahType.title,
    color: Verandah.textPrimary,
    marginBottom: VerandahSpace.sm,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: VerandahSpace.sm,
  },
  providerText: {
    ...VerandahType.body,
    color: Verandah.textSecondary,
  },
  providerName: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
  },
  detailsRow: {
    marginBottom: VerandahSpace.sm + 2,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: VerandahSpace.xs + 2,
  },
  detailText: {
    ...VerandahType.body,
    color: Verandah.textPrimary,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: VerandahSpace.md,
  },
  categoryPill: {
    paddingHorizontal: VerandahSpace.sm + 2,
    paddingVertical: VerandahSpace.xs,
    borderRadius: VerandahRadius.sm,
    backgroundColor: Verandah.cardMuted,
  },
  categoryText: {
    ...VerandahType.caption,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  costText: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: VerandahSpace.md,
    borderTopWidth: 0.5,
    borderTopColor: Verandah.border,
  },
  joinerCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: VerandahSpace.xs + 2,
  },
  joinerText: {
    ...VerandahType.caption,
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
  joinBtn: {
    paddingHorizontal: VerandahSpace.xl,
    paddingVertical: VerandahSpace.sm + 2,
    borderRadius: VerandahRadius.md + 2,
    backgroundColor: Verandah.primary,
  },
  joinBtnText: {
    ...VerandahType.bodyBold,
    color: Verandah.primaryFg,
    textAlign: 'center',
  },
  joinedBtn: {
    paddingHorizontal: VerandahSpace.lg,
    paddingVertical: VerandahSpace.sm,
    borderRadius: VerandahRadius.md + 2,
    borderWidth: 0.5,
    borderColor: Verandah.borderStrong,
  },
  joinedBtnText: {
    ...VerandahType.bodyBold,
    color: Verandah.primary,
  },
  hostLabel: {
    paddingHorizontal: VerandahSpace.md,
    paddingVertical: VerandahSpace.xs + 2,
    borderRadius: VerandahRadius.sm + 2,
    backgroundColor: Verandah.accentSoft,
  },
  hostLabelText: {
    ...VerandahType.caption,
    fontWeight: '500',
    color: Verandah.accent,
  },
  fullBadge: {
    paddingHorizontal: VerandahSpace.md + 2,
    paddingVertical: VerandahSpace.sm,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.cardMuted,
  },
  fullText: {
    ...VerandahType.caption,
    fontWeight: '500',
    color: Verandah.textMuted,
  },
});
