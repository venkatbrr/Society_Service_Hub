import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { Colors } from '../constants/Colors';
import { APP_EMOJIS } from '../constants/emojis';

type RatingStarsProps = {
  rating: number;
  onRating?: (rating: number) => void;
  size?: number;
  readonly?: boolean;
  isLightMode: boolean;
};

export const RatingStars = ({ 
  rating, 
  onRating = () => {}, 
  size = 24, 
  readonly = false, 
  isLightMode 
}: RatingStarsProps) => {
  const colors = isLightMode ? Colors.light : Colors.dark;

  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          disabled={readonly}
          onPress={() => onRating(star)}
          activeOpacity={readonly ? 1 : 0.7}
        >
          <Text
            style={[
              styles.star,
              {
                fontSize: size,
                color:
                  star <= Math.floor(rating)
                    ? colors.warning
                    : star - rating <= 0.5 && star > rating
                      ? colors.warning
                      : colors.border,
              },
            ]}
          >
            {star <= Math.floor(rating)
              ? APP_EMOJIS.starFilled
              : star - rating <= 0.5 && star > rating
                ? APP_EMOJIS.starHalf
                : APP_EMOJIS.starEmpty}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  star: {
    marginRight: 4,
  },
});
