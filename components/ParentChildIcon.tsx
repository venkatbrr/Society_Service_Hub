import React from 'react';

/**
 * Parent Corner glyph — a tall adult beside a small child.
 *
 * Bespoke because `@untitledui/icons` has no family or child icon: every
 * `Users*` variant is two adults at the same height, which reads as
 * "neighbours", not "a parent and their kid" — the whole point of the section.
 * Same reasoning as the three hand-drawn glyphs in `NavIcons.tsx`.
 *
 * Matches Untitled UI's drawing contract exactly so it sits flush with the
 * icons around it: 24×24 viewBox, `strokeWidth: 2`, round caps and joins,
 * `currentColor`, no fill, `size`/`color` props. Renders as DOM SVG, the same
 * as `@untitledui/icons` does.
 *
 * Geometry notes, since the two figures are tuned against each other:
 * - Both stand on a shared baseline at y 21, and the child tops out at y 10.2
 *   against the adult's y 3.8 — roughly 63% of the height. That ratio is the
 *   whole illusion: any closer and it reads as a short adult.
 * - The 3.2 unit gap between the bodies is **stroke clearance, not spacing** —
 *   at `strokeWidth: 2` each outline eats 1 unit, so anything tighter smears
 *   the two silhouettes into one shape at tile size.
 * - Neck gaps are 2.6 units (adult) and 1.2 (child) of visible space — kept
 *   proportional to each head, so the child gets the shorter neck a child has.
 *   Widen them and the heads float away from the shoulders.
 */

export interface ParentChildIconProps {
  size?: number;
  color?: string;
  [key: string]: any;
}

const path = (d: string, key: string) => React.createElement('path' as any, { d, key });

export function ParentChildIcon({
  size = 24,
  color = 'currentColor',
  ...rest
}: ParentChildIconProps) {
  return React.createElement(
    'svg' as any,
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      stroke: color,
      strokeWidth: '2',
      fill: 'none',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
      ...rest,
    },
    [
      // Adult: head r3.2 at (8.3, 7), shoulders spanning x 2.6 → 14.
      path('M11.5 7a3.2 3.2 0 1 1-6.4 0 3.2 3.2 0 0 1 6.4 0Z', 'adult-head'),
      path('M14 21v-2a4.2 4.2 0 0 0-4.2-4.2H6.8A4.2 4.2 0 0 0 2.6 19V21', 'adult-body'),
      // Child: head r2 at (19.6, 12.2), shoulders spanning x 17.2 → 22.
      path('M21.6 12.2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z', 'child-head'),
      path('M22 21v-1.2a2.4 2.4 0 0 0-2.4-2.4 2.4 2.4 0 0 0-2.4 2.4V21', 'child-body'),
    ]
  );
}

export default ParentChildIcon;
