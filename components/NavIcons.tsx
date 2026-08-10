import React from 'react';

/**
 * Bottom-navigation glyphs for the "Threshold Rail" bar (Concept D).
 *
 * Drawn inline rather than pulled from `@untitledui/icons` because three of the five
 * are bespoke: the house carries a heart, the buildings pair is a Wooru-specific
 * silhouette, and the MCN mark is the brand threshold arch. They keep the Untitled UI
 * geometry (24x24, round caps/joins, `currentColor`) so they sit flush with the rest of
 * the icon set — only the stroke weight is driven from the caller, since the rail
 * thickens the active tab's outline.
 *
 * These render as DOM SVG, the same as `@untitledui/icons` does.
 */

export interface NavIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

type SvgProps = {
  size: number;
  color: string;
  strokeWidth: number;
  children: React.ReactNode;
};

function Glyph({ size, color, strokeWidth, children }: SvgProps) {
  return React.createElement(
    'svg' as any,
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: color,
      strokeWidth,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
      focusable: false,
    },
    children
  );
}

const path = (d: string, key: string, extra?: Record<string, unknown>) =>
  React.createElement('path' as any, { d, key, ...extra });

/** Help — a house with a small heart in the doorway. */
export function NavHomeHeart({ size = 24, color = 'currentColor', strokeWidth = 2 }: NavIconProps) {
  return (
    <Glyph size={size} color={color} strokeWidth={strokeWidth}>
      {[
        path('M3 10.4 12 3.2l9 7.2', 'roof'),
        path('M5.2 9.2V19.6A1.4 1.4 0 0 0 6.6 21h10.8a1.4 1.4 0 0 0 1.4-1.4V9.2', 'walls'),
        path(
          'M12 17.4c-2.15-1.5-3.22-2.55-3.22-3.82a1.72 1.72 0 0 1 3.22-.84 1.72 1.72 0 0 1 3.22.84c0 1.27-1.07 2.32-3.22 3.82Z',
          'heart'
        ),
      ]}
    </Glyph>
  );
}

/** Saved — bookmark. */
export function NavBookmark({ size = 24, color = 'currentColor', strokeWidth = 2 }: NavIconProps) {
  return (
    <Glyph size={size} color={color} strokeWidth={strokeWidth}>
      {[path('M6 4.6A1.6 1.6 0 0 1 7.6 3h8.8A1.6 1.6 0 0 1 18 4.6V21l-6-4.2L6 21Z', 'flag')]}
    </Glyph>
  );
}

/** Community — a short tower beside a taller one, windows and a door. */
export function NavBuildings({ size = 24, color = 'currentColor', strokeWidth = 2 }: NavIconProps) {
  return (
    <Glyph size={size} color={color} strokeWidth={strokeWidth}>
      {[
        path('M3 21h18', 'ground'),
        path('M4.4 21v-9.3a1 1 0 0 1 1-1h5.1', 'short-tower'),
        path('M10.5 21V4.5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1V21', 'tall-tower'),
        path('M13.4 7.6h1.1', 'win-tl'),
        path('M16.4 7.6h1.1', 'win-tr'),
        path('M13.4 11.6h1.1', 'win-bl'),
        path('M16.4 11.6h1.1', 'win-br'),
        path('M13.9 21v-3.6a1 1 0 0 1 1-1h1.6a1 1 0 0 1 1 1V21', 'door'),
      ]}
    </Glyph>
  );
}

/** Profile — person. */
export function NavPerson({ size = 24, color = 'currentColor', strokeWidth = 2 }: NavIconProps) {
  return (
    <Glyph size={size} color={color} strokeWidth={strokeWidth}>
      {[
        React.createElement('circle' as any, { cx: 12, cy: 8, r: 4, key: 'head' }),
        path('M4.5 20a7.5 7.5 0 0 1 15 0', 'shoulders'),
      ]}
    </Glyph>
  );
}

/*
 * There is deliberately no threshold-arch glyph here. The MCN tab renders the real logo
 * file (`assets/images/adaptive-icon.png` — the cream mark on transparent) as an `Image`,
 * per the "render the mark as an image, never as a substitute glyph" rule in
 * `docs/verandah.md`. A hand-traced arch drifts from the brand every time the logo is
 * revised; the asset cannot.
 */
