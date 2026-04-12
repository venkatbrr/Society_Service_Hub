import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';

type RatingStarsProps = {
  rating: number;
  onRating: (rating: number) => void;
  size?: number;
  readonly?: boolean;
  isLightMode: boolean;
};

export const RatingStars = ({ rating, onRating, size = 24, readonly = false, isLightMode }: RatingStarsProps) => {
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
          <Ionicons
            name={star <= rating ? 'star' : 'star-outline'}
            size={size}
            color={colors.warning}
            style={styles.star}
          />
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
