import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';
import { getEmojiForScore, SCHOOL_ASPECTS } from '../constants/schoolReviewAspects';
import { Avatar } from './Avatar';

export interface SchoolReviewItem {
  id: string;
  user_id: string;
  child_grade: string;
  academics_score: number;
  teachers_score: number;
  infrastructure_score: number;
  sports_activities_score: number;
  safety_score: number;
  transport_score: number;
  value_score: number;
  happiness_score: number;
  academics_comment?: string | null;
  teachers_comment?: string | null;
  infrastructure_comment?: string | null;
  sports_activities_comment?: string | null;
  safety_comment?: string | null;
  transport_comment?: string | null;
  value_comment?: string | null;
  happiness_comment?: string | null;
  overall_comment?: string | null;
  created_at: string;
  profiles?: {
    full_name: string | null;
    flat_number: string | null;
  } | null;
}

interface SchoolReviewCardProps {
  review: SchoolReviewItem;
  isOwnReview?: boolean;
  onEdit?: () => void;
}

export const SchoolReviewCard: React.FC<SchoolReviewCardProps> = ({
  review,
  isOwnReview = false,
  onEdit,
}) => {
  const [expanded, setExpanded] = useState(false);

  const parentName = review.profiles?.full_name || 'Resident Parent';
  const flatNumber = review.profiles?.flat_number ? `Flat ${review.profiles.flat_number}` : null;

  const scoreMap: Record<string, number> = {
    academics: review.academics_score,
    teachers: review.teachers_score,
    infrastructure: review.infrastructure_score,
    sports_activities: review.sports_activities_score,
    safety: review.safety_score,
    transport: review.transport_score,
    value: review.value_score,
    happiness: review.happiness_score,
  };

  const commentMap: Record<string, string | null | undefined> = {
    academics: review.academics_comment,
    teachers: review.teachers_comment,
    infrastructure: review.infrastructure_comment,
    sports_activities: review.sports_activities_comment,
    safety: review.safety_comment,
    transport: review.transport_comment,
    value: review.value_comment,
    happiness: review.happiness_comment,
  };

  const hasComments = Object.values(commentMap).some((c) => c && c.trim().length > 0);

  // Overall average score for this parent
  const totalScore = Object.values(scoreMap).reduce((a, b) => a + b, 0);
  const avgScore = (totalScore / SCHOOL_ASPECTS.length).toFixed(1);

  return (
    <View
      style={[
        styles.card,
        isOwnReview && styles.ownCard,
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Avatar name={parentName} size={36} />
        <View style={styles.headerMeta}>
          <View style={styles.nameRow}>
            <Text style={styles.parentName} numberOfLines={1}>
              {parentName}
            </Text>
            {isOwnReview ? (
              <View style={styles.youBadge}>
                <Text style={styles.youBadgeText}>You</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.subText}>
            {flatNumber ? `${flatNumber} · ` : ''}Child in {review.child_grade}
          </Text>
        </View>
        <View style={styles.scorePill}>
          <Text style={styles.scorePillEmoji}>{getEmojiForScore(parseFloat(avgScore))}</Text>
          <Text style={styles.scorePillVal}>{avgScore}</Text>
        </View>
      </View>

      {/* Aspect Grid */}
      <View style={styles.aspectGrid}>
        {SCHOOL_ASPECTS.map((aspect) => {
          const score = scoreMap[aspect.key];
          return (
            <View key={aspect.key} style={styles.aspectGridItem}>
              <Text style={styles.aspectEmoji}>{aspect.emoji}</Text>
              <Text style={styles.aspectLabel} numberOfLines={1}>
                {aspect.label}
              </Text>
              <Text style={styles.aspectScore}>
                {getEmojiForScore(score)} {score}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Overall Comment / Parent Advice Box */}
      {review.overall_comment ? (
        <View style={styles.overallCommentBox}>
          <Text style={styles.overallCommentTitle}>💬 Parent Note & Advice:</Text>
          <Text style={styles.overallCommentText}>"{review.overall_comment}"</Text>
        </View>
      ) : null}

      {/* Per-Aspect Comments (Expandable) */}
      {hasComments ? (
        <View style={styles.commentsSection}>
          <TouchableOpacity
            onPress={() => setExpanded(!expanded)}
            style={styles.expandBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.expandBtnText}>
              {expanded ? 'Hide parent notes' : 'View parent notes'}
            </Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={Verandah.accent}
            />
          </TouchableOpacity>

          {expanded ? (
            <View style={styles.commentsList}>
              {SCHOOL_ASPECTS.map((aspect) => {
                const comment = commentMap[aspect.key];
                if (!comment || !comment.trim()) return null;
                return (
                  <View key={`comment-${aspect.key}`} style={styles.commentRow}>
                    <Text style={styles.commentHeader}>
                      {aspect.emoji} {aspect.label}:
                    </Text>
                    <Text style={styles.commentBody}>{comment}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Edit CTA for own review */}
      {isOwnReview && onEdit ? (
        <TouchableOpacity style={styles.editBtn} onPress={onEdit} activeOpacity={0.7}>
          <Ionicons name="create-outline" size={14} color={Verandah.accent} />
          <Text style={styles.editBtnText}>Edit your report card</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    padding: 14,
    marginBottom: 12,
  },
  ownCard: {
    borderColor: Verandah.accent,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerMeta: {
    flex: 1,
    marginLeft: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  parentName: {
    ...VerandahType.bodyBold,
    fontSize: 14,
    color: Verandah.textPrimary,
  },
  youBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  youBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Verandah.accent,
  },
  subText: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
    marginTop: 1,
  },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: VerandahRadius.pill,
  },
  scorePillEmoji: {
    fontSize: 13,
  },
  scorePillVal: {
    fontSize: 13,
    fontWeight: '700',
    color: Verandah.textPrimary,
  },
  aspectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  aspectGridItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    width: '48%',
    justifyContent: 'space-between',
  },
  aspectEmoji: {
    fontSize: 12,
    marginRight: 4,
  },
  aspectLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Verandah.textSecondary,
    flex: 1,
  },
  aspectScore: {
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  commentsSection: {
    marginTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: Verandah.border,
    paddingTop: 8,
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  expandBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.accent,
  },
  commentsList: {
    marginTop: 8,
    gap: 6,
  },
  commentRow: {
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#E5E7EB',
  },
  commentHeader: {
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.textPrimary,
    marginBottom: 2,
  },
  commentBody: {
    fontSize: 12,
    color: Verandah.textSecondary,
    lineHeight: 17,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: Verandah.border,
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Verandah.accent,
  },
  overallCommentBox: {
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: '#F0FDF4',
    borderWidth: 0.5,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    padding: 10,
  },
  overallCommentTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
    marginBottom: 2,
  },
  overallCommentText: {
    fontSize: 12,
    color: '#047857',
    fontStyle: 'italic',
    lineHeight: 17,
  },
});
