import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { SCHOOL_ASPECTS } from '../constants/schoolReviewAspects';

export interface AspectScores {
  avg_academics: number;
  avg_teachers: number;
  avg_infrastructure: number;
  avg_safety: number;
  avg_transport: number;
  avg_value: number;
  avg_happiness: number;
}

interface SchoolRadarChartProps {
  scores: AspectScores;
  size?: number;
}

export const SchoolRadarChart: React.FC<SchoolRadarChartProps> = ({
  scores,
  size = 260,
}) => {
  const center = size / 2;
  const radius = size * 0.32; // Leaving space for labels

  const aspectKeys: (keyof AspectScores)[] = [
    'avg_academics',
    'avg_teachers',
    'avg_infrastructure',
    'avg_safety',
    'avg_transport',
    'avg_value',
    'avg_happiness',
  ];

  const aspectList = SCHOOL_ASPECTS;
  const totalAxes = aspectList.length;

  // Calculate coordinates for an axis at given angle and score (1..5)
  const getCoordinates = (index: number, score: number) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / totalAxes;
    const distance = (score / 5) * radius;
    const x = center + distance * Math.cos(angle);
    const y = center + distance * Math.sin(angle);
    return { x, y, angle };
  };

  // Helper to render a straight line between two points using a rotated View
  const renderLine = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    thickness = 1,
    opacity = 1
  ) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    return (
      <View
        key={`line-${x1.toFixed(1)}-${y1.toFixed(1)}-${x2.toFixed(1)}-${y2.toFixed(1)}`}
        style={{
          position: 'absolute',
          left: x1,
          top: y1 - thickness / 2,
          width: length,
          height: thickness,
          backgroundColor: color,
          opacity,
          transform: [
            { translateX: 0 },
            { translateY: 0 },
            { rotate: `${angle}rad` },
          ],
          transformOrigin: '0% 50%',
        }}
      />
    );
  };

  // Concentric grid rings (at scores 1.66, 3.33, 5.0)
  const gridLevels = [1.66, 3.33, 5];

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Background Grid Rings */}
      {gridLevels.map((lvlLevel, lvlIdx) => {
        return aspectList.map((_, idx) => {
          const nextIdx = (idx + 1) % totalAxes;
          const p1 = getCoordinates(idx, lvlLevel);
          const p2 = getCoordinates(nextIdx, lvlLevel);
          return renderLine(p1.x, p1.y, p2.x, p2.y, '#E5E7EB', 1, 0.7);
        });
      })}

      {/* Radial Axis Lines */}
      {aspectList.map((_, idx) => {
        const outer = getCoordinates(idx, 5);
        return renderLine(center, center, outer.x, outer.y, '#D1D5DB', 1, 0.5);
      })}

      {/* Filled Score Polygon Edges */}
      {aspectList.map((_, idx) => {
        const nextIdx = (idx + 1) % totalAxes;
        const s1 = Math.max(1, Math.min(5, scores[aspectKeys[idx]] || 0));
        const s2 = Math.max(1, Math.min(5, scores[aspectKeys[nextIdx]] || 0));
        const p1 = getCoordinates(idx, s1);
        const p2 = getCoordinates(nextIdx, s2);
        return renderLine(p1.x, p1.y, p2.x, p2.y, Verandah.accent, 2.5, 0.9);
      })}

      {/* Data Vertex Dots */}
      {aspectList.map((aspect, idx) => {
        const score = Math.max(1, Math.min(5, scores[aspectKeys[idx]] || 0));
        const p = getCoordinates(idx, score);
        return (
          <View
            key={`dot-${aspect.key}`}
            style={[
              styles.vertexDot,
              {
                left: p.x - 5,
                top: p.y - 5,
                backgroundColor: Verandah.accent,
              },
            ]}
          />
        );
      })}

      {/* Axis Labels & Emoji */}
      {aspectList.map((aspect, idx) => {
        const labelPos = getCoordinates(idx, 5.8);
        const scoreVal = scores[aspectKeys[idx]] || 0;
        return (
          <View
            key={`label-${aspect.key}`}
            style={[
              styles.labelWrap,
              {
                left: labelPos.x - 38,
                top: labelPos.y - 14,
              },
            ]}
          >
            <Text style={styles.labelText}>
              {aspect.emoji} {aspect.label}
            </Text>
            <Text style={styles.scoreText}>{scoreVal > 0 ? scoreVal.toFixed(1) : '-'}</Text>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    position: 'relative',
    marginVertical: 12,
  },
  vertexDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    zIndex: 10,
  },
  labelWrap: {
    position: 'absolute',
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  labelText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: Verandah.textPrimary,
    textAlign: 'center',
  },
  scoreText: {
    fontSize: 9,
    fontWeight: '700',
    color: Verandah.accent,
  },
});
