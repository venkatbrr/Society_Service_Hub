import { FaceContent } from '@untitledui/icons/FaceContent';
import { FaceFrown } from '@untitledui/icons/FaceFrown';
import { FaceNeutral } from '@untitledui/icons/FaceNeutral';
import { FaceSad } from '@untitledui/icons/FaceSad';
import { FaceSmile } from '@untitledui/icons/FaceSmile';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { EMOJI_SCALE } from '../constants/schoolReviewAspects';

type FaceIcon = React.ComponentType<{ size?: number; color?: string; 'aria-hidden'?: boolean }>;

const ICON_BY_SCORE: Record<number, FaceIcon> = {
  1: FaceFrown,
  2: FaceSad,
  3: FaceNeutral,
  4: FaceSmile,
  5: FaceContent,
};

interface EmojiRatingProps {
  score: number;
  onScoreSelect?: (score: number) => void;
  readonly?: boolean;
  size?: number;
  showLabel?: boolean;
}

export const EmojiRating: React.FC<EmojiRatingProps> = ({
  score,
  onScoreSelect,
  readonly = false,
  size = 28,
  showLabel = true,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.emojiRow}>
        {EMOJI_SCALE.map((item) => {
          const isSelected = item.score === score;
          const Icon = ICON_BY_SCORE[item.score];
          return (
            <TouchableOpacity
              key={item.score}
              disabled={readonly}
              onPress={() => onScoreSelect?.(item.score)}
              activeOpacity={readonly ? 1 : 0.7}
              style={[
                styles.emojiBtn,
                isSelected && !readonly && styles.emojiBtnSelected,
              ]}
            >
              <View style={readonly && !isSelected ? styles.iconDimmed : undefined}>
                <Icon size={size} color="currentColor" aria-hidden="true" />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      {showLabel && score > 0 ? (
        <Text style={styles.scoreLabel}>
          {EMOJI_SCALE.find((e) => e.score === score)?.label || ''}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  emojiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emojiBtn: {
    padding: 6,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiBtnSelected: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: Verandah.accent,
  },
  iconDimmed: {
    opacity: 0.35,
  },
  scoreLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.accent,
  },
});
