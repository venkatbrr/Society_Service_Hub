import React, { useMemo } from 'react';
import { Verandah } from '../constants/Colors';
import { SCHOOL_ASPECTS } from '../constants/schoolReviewAspects';
import { SchoolAspectIcon } from './SchoolAspectIcon';

/**
 * The school review radar, animated with plain CSS keyframes.
 *
 * This used `framer-motion`, which was the single largest avoidable item in the
 * web bundle: ~86 KB gzipped (~11% of the whole bundle) downloaded by every
 * visitor on every cold load, for a chart that only appears inside the schools
 * catalog — a feature currently hidden behind `SCHOOLS_CATALOG_ENABLED`. The
 * motion here is entrance staggers, two idle loops and a stroke draw-on, all of
 * which CSS does natively, so the dependency bought nothing this file needed.
 *
 * Each animated element's *base* style is its final state and the keyframes run
 * with `animation-fill-mode: both`, which is what lets the reduce-motion block
 * at the end of the sheet simply switch every animation off and land on a
 * correct static chart.
 *
 * Stroke draw-on uses SVG's `pathLength="1"`, which renormalises the path's
 * length to 1 so `stroke-dasharray`/`stroke-dashoffset` can be expressed in
 * units of "the whole path" — the CSS equivalent of framer's `pathLength`.
 */

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

// Matches the previous [0.16, 1, 0.3, 1] entrance curve; the two "spring" cases
// become a mild overshoot rather than a real simulation.
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const SPRING = 'cubic-bezier(0.34, 1.42, 0.5, 1)';

const RADAR_CSS = `
.wrc-svg { opacity: 1; transform: scale(1); animation: wrc-in 0.28s ${EASE} both; }
@keyframes wrc-in { from { opacity: 0; transform: scale(0.985); } }

.wrc-ring {
  opacity: 0.7;
  animation: wrc-fade-ring 0.28s ${EASE} both, wrc-dash 3.8s linear infinite;
}
@keyframes wrc-fade-ring { from { opacity: 0; } to { opacity: 0.7; } }
@keyframes wrc-dash { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -52; } }

.wrc-grid { opacity: 0.7; animation: wrc-fade-grid 0.24s ${EASE} both; }
@keyframes wrc-fade-grid { from { opacity: 0; } to { opacity: 0.7; } }

.wrc-axis {
  opacity: 0.55;
  stroke-dasharray: 1;
  stroke-dashoffset: 0;
  animation: wrc-draw-axis 0.28s ${EASE} both;
}
@keyframes wrc-draw-axis { from { opacity: 0; stroke-dashoffset: 1; } to { opacity: 0.55; stroke-dashoffset: 0; } }

.wrc-pulse { transform-box: view-box; animation: wrc-breathe 2.8s ease-in-out infinite; }
@keyframes wrc-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.014); } }

.wrc-shape {
  opacity: 0.97;
  stroke-dasharray: 1;
  stroke-dashoffset: 0;
  animation: wrc-draw-shape 0.58s ${EASE} 0.12s both;
}
@keyframes wrc-draw-shape { from { opacity: 0; stroke-dashoffset: 1; } to { opacity: 0.97; stroke-dashoffset: 0; } }

.wrc-core {
  transform-box: fill-box;
  transform-origin: center;
  animation: wrc-core-pulse 2.2s ease-in-out 0.15s infinite;
}
@keyframes wrc-core-pulse {
  0%, 100% { opacity: 0.2; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(1.73); }
}

.wrc-dot {
  opacity: 1;
  transform-box: fill-box;
  transform-origin: center;
  animation: wrc-pop 0.34s ${SPRING} both;
}
@keyframes wrc-pop { from { opacity: 0; transform: scale(0); } }

.wrc-label { opacity: 1; transform: translateY(0); animation: wrc-rise 0.38s ${SPRING} both; }
@keyframes wrc-rise { from { opacity: 0; transform: translateY(6px) scale(0.985); } }

@media (prefers-reduced-motion: reduce) {
  .wrc-svg, .wrc-ring, .wrc-grid, .wrc-axis, .wrc-pulse,
  .wrc-shape, .wrc-core, .wrc-dot, .wrc-label { animation: none; }
}
`;

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
      <style dangerouslySetInnerHTML={{ __html: RADAR_CSS }} />

      <svg
        className="wrc-svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
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

        <circle
          className="wrc-ring"
          cx={center}
          cy={center}
          r={radius + 7}
          fill="none"
          stroke={Verandah.accent}
          strokeWidth={1.25}
          strokeDasharray="5 8"
        />

        {gridPolygons.map((points, idx) => (
          <polygon
            key={`grid-${idx}`}
            className="wrc-grid"
            style={{ animationDelay: `${(idx * 0.035).toFixed(3)}s` }}
            points={points}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth={1}
          />
        ))}

        {aspectList.map((_, idx) => {
          const outer = getCoordinates(idx, 5);
          return (
            <line
              key={`axis-${idx}`}
              className="wrc-axis"
              style={{ animationDelay: `${(idx * 0.022).toFixed(3)}s` }}
              pathLength={1}
              x1={center}
              y1={center}
              x2={outer.x}
              y2={outer.y}
              stroke="#D1D5DB"
              strokeWidth={1}
            />
          );
        })}

        <g className="wrc-pulse" style={{ transformOrigin: `${center}px ${center}px` }}>
          <path
            className="wrc-shape"
            pathLength={1}
            d={dataPath}
            fill={`url(#${gradientId})`}
            stroke={Verandah.accent}
            strokeWidth={2.6}
            filter={`url(#${glowId})`}
          />
        </g>

        <circle
          className="wrc-core"
          cx={center}
          cy={center}
          r={3}
          fill={Verandah.accent}
        />

        {aspectList.map((_, idx) => {
          const point = dataPoints[idx];
          return (
            <circle
              key={`dot-${idx}`}
              className="wrc-dot"
              style={{ animationDelay: `${(0.22 + idx * 0.03).toFixed(3)}s` }}
              cx={point.x}
              cy={point.y}
              r={5}
              fill={Verandah.accent}
              stroke="#FFFFFF"
              strokeWidth={2}
            />
          );
        })}
      </svg>

      {aspectList.map((aspect, idx) => {
        const labelPos = getCoordinates(idx, 5.8);
        const scoreVal = scores[aspectKeys[idx]] || 0;
        return (
          <div
            key={`label-${aspect.key}`}
            className="wrc-label"
            style={{
              position: 'absolute',
              width: 76,
              left: labelPos.x - 38,
              top: labelPos.y - 14,
              textAlign: 'center',
              pointerEvents: 'none',
              animationDelay: `${(0.28 + idx * 0.028).toFixed(3)}s`,
            }}
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
          </div>
        );
      })}
    </div>
  );
};
