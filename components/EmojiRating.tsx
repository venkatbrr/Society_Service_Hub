import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { EMOJI_SCALE } from '../constants/schoolReviewAspects';

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
              <Text
                style={[
                  styles.emojiText,
                  { fontSize: size },
                  readonly && !isSelected && styles.emojiDimmed,
                ]}
              >
                {item.emoji}
              </Text>
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
  emojiText: {
    textAlign: 'center',
  },
  emojiDimmed: {
    opacity: 0.35,
  },
  scoreLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.accent,
  },
});
