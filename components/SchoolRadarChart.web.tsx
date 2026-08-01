import { motion } from 'framer-motion';
import React, { useMemo } from 'react';
import { Verandah } from '../constants/Colors';
import { SCHOOL_ASPECTS } from '../constants/schoolReviewAspects';
import { SchoolAspectIcon } from './SchoolAspectIcon';

export interface AspectScores {
  avg_academics: number;
  avg_teachers: number;
  avg_infrastructure: number;
  avg_sports_activities: number;
  avg_safety: number;
  avg_transport: number;
  avg_value: number;
  avg_happiness: number;
}

interface SchoolRadarChartProps {
  scores: AspectScores;
  size?: number;
}

type Point = { x: number; y: number; angle: number };

const clampScore = (score: number) => Math.max(1, Math.min(5, score || 0));
const motionEase = [0.16, 1, 0.3, 1] as const;

export const SchoolRadarChart: React.FC<SchoolRadarChartProps> = ({
  scores,
  size = 260,
}) => {
  const idSuffix = React.useId().replace(/:/g, '');
  const gradientId = `school-radar-gradient-${idSuffix}`;
  const glowId = `school-radar-glow-${idSuffix}`;

  const center = size / 2;
  const radius = size * 0.32;
  const aspectList = SCHOOL_ASPECTS;
  const totalAxes = aspectList.length;
  const aspectKeys: (keyof AspectScores)[] = aspectList.map(
    (aspect) => `avg_${aspect.key}` as keyof AspectScores
  );

  const getCoordinates = (index: number, score: number): Point => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / totalAxes;
    const distance = (score / 5) * radius;
    const x = center + distance * Math.cos(angle);
    const y = center + distance * Math.sin(angle);
    return { x, y, angle };
  };

  const gridLevels = [1.66, 3.33, 5];

  const gridPolygons = useMemo(
    () =>
      gridLevels.map((level) =>
        aspectList
          .map((_, idx) => {
            const p = getCoordinates(idx, level);
            return `${p.x},${p.y}`;
          })
          .join(' ')
      ),
    [size]
  );

  const dataPoints = useMemo(
    () =>
      aspectList.map((_, idx) => {
        const val = clampScore(scores[aspectKeys[idx]] || 0);
        return getCoordinates(idx, val);
      }),
    [scores, size]
  );

  const dataPath = useMemo(() => {
    if (dataPoints.length === 0) return '';
    const start = dataPoints[0];
    const rest = dataPoints
      .slice(1)
      .map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} ${rest} Z`;
  }, [dataPoints]);

  return (
    <div
      style={{
        width: size,
        height: size,
        position: 'relative',
        margin: '12px auto',
      }}
    >
      <motion.svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.28, ease: motionEase }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={Verandah.accent} stopOpacity="0.34" />
            <stop offset="100%" stopColor={Verandah.accent} stopOpacity="0.06" />
          </linearGradient>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <motion.circle
          cx={center}
          cy={center}
          r={radius + 7}
          fill="none"
          stroke={Verandah.accent}
          strokeOpacity={0.18}
          strokeWidth={1.25}
          strokeDasharray="5 8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7, strokeDashoffset: [0, -52] }}
          transition={{ opacity: { duration: 0.28, ease: motionEase }, strokeDashoffset: { repeat: Infinity, duration: 3.8, ease: 'linear' } }}
        />

        {gridPolygons.map((points, idx) => (
          <motion.polygon
            key={`grid-${idx}`}
            points={points}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth={1}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            transition={{ duration: 0.24, delay: idx * 0.035, ease: motionEase }}
          />
        ))}

        {aspectList.map((_, idx) => {
          const outer = getCoordinates(idx, 5);
          return (
            <motion.line
              key={`axis-${idx}`}
              x1={center}
              y1={center}
              x2={outer.x}
              y2={outer.y}
              stroke="#D1D5DB"
              strokeWidth={1}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.55 }}
              transition={{ duration: 0.28, delay: idx * 0.022, ease: motionEase }}
            />
          );
        })}

        <motion.g
          style={{ transformOrigin: `${center}px ${center}px` }}
          animate={{ scale: [1, 1.014, 1] }}
          transition={{ repeat: Infinity, duration: 2.8, ease: 'easeInOut' }}
        >
          <motion.path
            d={dataPath}
            fill={`url(#${gradientId})`}
            stroke={Verandah.accent}
            strokeWidth={2.6}
            filter={`url(#${glowId})`}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.97 }}
            transition={{ duration: 0.58, ease: motionEase, delay: 0.12 }}
          />
        </motion.g>

        <motion.circle
          cx={center}
          cy={center}
          r={3}
          fill={Verandah.accent}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.2, 0.45, 0.2], r: [3, 5.2, 3] }}
          transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut', delay: 0.15 }}
        />

        {aspectList.map((_, idx) => {
          const point = dataPoints[idx];
          return (
            <motion.circle
              key={`dot-${idx}`}
              cx={point.x}
              cy={point.y}
              r={5}
              fill={Verandah.accent}
              stroke="#FFFFFF"
              strokeWidth={2}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 560, damping: 26, delay: 0.22 + idx * 0.03 }}
            />
          );
        })}
      </motion.svg>

      {aspectList.map((aspect, idx) => {
        const labelPos = getCoordinates(idx, 5.8);
        const scoreVal = scores[aspectKeys[idx]] || 0;
        return (
          <motion.div
            key={`label-${aspect.key}`}
            style={{
              position: 'absolute',
              width: 76,
              left: labelPos.x - 38,
              top: labelPos.y - 14,
              textAlign: 'center',
              pointerEvents: 'none',
            }}
            initial={{ opacity: 0, y: 6, scale: 0.985 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 440, damping: 30, delay: 0.28 + idx * 0.028 }}
          >
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                lineHeight: '12px',
                color: Verandah.textPrimary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
              }}
            >
              <SchoolAspectIcon aspectKey={aspect.key} size={10} />
              <span>{aspect.label}</span>
            </div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                lineHeight: '11px',
                color: Verandah.accent,
              }}
            >
              {scoreVal > 0 ? scoreVal.toFixed(1) : '-'}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
