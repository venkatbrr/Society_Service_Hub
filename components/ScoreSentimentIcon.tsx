import React from 'react';
import { Text, TextStyle } from 'react-native';
import { getEmojiForScore } from '../constants/schoolReviewAspects';

interface ScoreSentimentIconProps {
  score: number;
  size?: number;
  style?: TextStyle;
}

export function ScoreSentimentIcon({ score, size = 14, style }: ScoreSentimentIconProps) {
  return <Text style={[{ fontSize: size, lineHeight: size + 2 }, style]}>{getEmojiForScore(score)}</Text>;
}
