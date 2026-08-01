import React from 'react';
import { Text, TextStyle } from 'react-native';
import { AspectKey, SCHOOL_ASPECTS } from '../constants/schoolReviewAspects';

interface SchoolAspectIconProps {
  aspectKey: AspectKey;
  size?: number;
  style?: TextStyle;
}

export function SchoolAspectIcon({ aspectKey, size = 16, style }: SchoolAspectIconProps) {
  const aspect = SCHOOL_ASPECTS.find((item) => item.key === aspectKey);
  return <Text style={[{ fontSize: size, lineHeight: size + 2 }, style]}>{aspect?.emoji || ''}</Text>;
}
