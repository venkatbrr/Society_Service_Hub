import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/Colors';
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
  const colors = Colors.light;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
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

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  const isFull = maxJoiners ? joinerCount >= maxJoiners : false;

  return (
    <BaseCard padding={24} onPress={onPress}>
      {/* Creator Row */}
      <View style={styles.creatorRow}>
        {creatorAvatarUrl ? (
          <Image source={{ uri: creatorAvatarUrl }} style={styles.creatorAvatar} />
        ) : (
          <View style={[styles.creatorAvatarPlaceholder, { backgroundColor: colors.primary + '20', borderColor: colors.primary + '35' }]}>
            <Text style={[styles.creatorInitials, { color: colors.primary }]}>{getInitials(creatorName)}</Text>
          </View>
        )}
        <View style={styles.creatorInfo}>
          <Text style={[styles.creatorName, { color: colors.text }]}>{creatorName} {creatorFlat ? `· ${creatorFlat}` : ''}</Text>
          <Text style={[styles.relativeTime, { color: colors.textMuted }]}>{getRelativeTime(createdAt)}</Text>
        </View>
        <VisitStatusBadge status={status} />
      </View>

      {/* Main Info */}
      <View style={styles.mainInfo}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <View style={styles.providerRow}>
          <Text style={[styles.providerText, { color: colors.textMuted }]}>
            Provider: <Text style={{ color: colors.text, fontWeight: '600' }}>{providerName}</Text>
          </Text>
          {hasProviderProfile && <Ionicons name="link" size={14} color={colors.primary} style={{ marginLeft: 4 }} />}
        </View>

        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Ionicons name="calendar-outline" size={16} color={colors.icon} />
            <Text style={[styles.detailText, { color: colors.text }]}>{formatDate(visitDate)} · {visitTimeSlot}</Text>
          </View>
        </View>

        <View style={styles.tagRow}>
          <View style={[styles.categoryPill, { backgroundColor: colors.glass, borderColor: colors.glassBorder, borderWidth: 1 }]}>
            <Text style={[styles.categoryText, { color: colors.textMuted }]}>{category}</Text>
          </View>
          {estimatedCost && (
            <Text style={[styles.costText, { color: colors.text }]}>~{estimatedCost}</Text>
          )}
        </View>
      </View>

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <View style={styles.joinerCount}>
          <Ionicons name="people-outline" size={18} color={colors.primary} />
          <Text style={[styles.joinerText, { color: colors.text }]}>
            {joinerCount} {maxJoiners ? `/ ${maxJoiners}` : ''} {joinerCount === 1 ? 'neighbor' : 'neighbors'} joined
          </Text>
        </View>

        {isCreator ? (
          <View style={[styles.hostLabel, { backgroundColor: '#10B98112' }]}>
            <Text style={styles.hostLabelText}>You're hosting</Text>
          </View>
        ) : hasUserJoined ? (
          <TouchableOpacity style={[styles.joinedBtn, { borderColor: colors.primary }]} onPress={onUnjoin}>
            <Text style={[styles.joinedBtnText, { color: colors.primary }]}>Joined</Text>
          </TouchableOpacity>
        ) : status === 'upcoming' && !isFull ? (
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.joinBtn}
          >
            <TouchableOpacity onPress={onJoin} activeOpacity={0.8}>
              <Text style={styles.joinBtnText}>Join</Text>
            </TouchableOpacity>
          </LinearGradient>
        ) : isFull ? (
          <View style={[styles.fullBadge, { backgroundColor: colors.border }]}>
            <Text style={[styles.fullText, { color: colors.textMuted }]}>Full</Text>
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
    marginBottom: 16,
  },
  creatorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  creatorAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  creatorInitials: {
    fontSize: 16,
    fontWeight: '700',
  },
  creatorInfo: {
    flex: 1,
    marginLeft: 14,
  },
  creatorName: {
    fontSize: 15,
    fontWeight: '700',
  },
  relativeTime: {
    fontSize: 13,
    marginTop: 2,
  },
  mainInfo: {
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  providerText: {
    fontSize: 14,
  },
  detailsRow: {
    marginBottom: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 14,
    fontWeight: '500',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  costText: {
    fontSize: 13,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
  },
  joinerCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  joinerText: {
    fontSize: 13,
    fontWeight: '600',
  },
  joinBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 14,
  },
  joinBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  joinedBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  joinedBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  hostLabel: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  hostLabelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
  fullBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  fullText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
