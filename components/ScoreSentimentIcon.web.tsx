import { FaceContent } from '@untitledui/icons/FaceContent';
import { FaceFrown } from '@untitledui/icons/FaceFrown';
import { FaceNeutral } from '@untitledui/icons/FaceNeutral';
import { FaceSad } from '@untitledui/icons/FaceSad';
import { FaceSmile } from '@untitledui/icons/FaceSmile';
import React from 'react';

type IconCmp = React.ComponentType<{ size?: number; color?: string; 'aria-hidden'?: boolean }>;

function iconForScore(score: number): IconCmp {
  const rounded = Math.round(score);
  if (rounded <= 1) return FaceFrown;
  if (rounded === 2) return FaceSad;
  if (rounded === 3) return FaceNeutral;
  if (rounded === 4) return FaceSmile;
  return FaceContent;
}

interface ScoreSentimentIconProps {
  score: number;
  size?: number;
}

export function ScoreSentimentIcon({ score, size = 14 }: ScoreSentimentIconProps) {
  const Icon = iconForScore(score);
  return <Icon size={size} color="currentColor" aria-hidden={true} />;
}
