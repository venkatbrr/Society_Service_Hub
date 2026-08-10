import { Star01 } from '@untitledui/icons/Star01';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';

type RatingStarsProps = {
  rating: number;
  onRating?: (rating: number) => void;
  size?: number;
  readonly?: boolean;
  isLightMode?: boolean;
};

export const RatingStars = ({
  rating,
  onRating = () => {},
  size = 18,
  readonly = false,
}: RatingStarsProps) => {
  const goldColor = Verandah.goldInk; // #854F0B
  const emptyColor = Verandah.textDisabled; // #9A988F

  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = star <= Math.round(rating);
        return (
          <TouchableOpacity
            key={star}
            disabled={readonly}
            onPress={() => onRating(star)}
            activeOpacity={readonly ? 1 : 0.7}
            style={styles.star}
          >
            <Star01
              size={size}
              color={isFilled ? goldColor : emptyColor}
              fill={isFilled ? goldColor : 'none'}
              aria-hidden={true}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  star: {
    padding: 1,
  },
});
