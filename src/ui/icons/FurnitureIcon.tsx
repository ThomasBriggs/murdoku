import type { ReactNode, SVGProps } from 'react';
import type { FurnitureType } from '../../engine/types';

/**
 * Simple line/flat furniture glyphs on a 24x24 canvas. They draw in
 * `currentColor` (strokes) and `--icon-fill` (soft fills) so they follow the theme.
 */
const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;
const F = { fill: 'var(--icon-fill, rgba(127,127,127,0.25))' } as const;

export const ICON_PATHS: Record<FurnitureType, ReactNode> = {
  chair: (
    <>
      <path d="M8 4h8v8H8z" {...F} />
      <path d="M7 12h10v3H7zM8 15v5M16 15v5" />
    </>
  ),
  armchair: (
    <>
      <path d="M5 10a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7H5z" {...F} />
      <path d="M3 12h3v6H3zM18 12h3v6h-3zM6 18v2M18 18v2" />
    </>
  ),
  sofa: (
    <>
      <path d="M5 8h14a1 1 0 0 1 1 1v3H4V9a1 1 0 0 1 1-1z" {...F} />
      <path d="M2.5 12H6v5H2.5zM18 12h3.5v5H18zM6 14h12v3H6zM5 17v2M19 17v2" />
    </>
  ),
  bed: (
    <>
      <path d="M3 18V6M3 14h18v4M21 14v-2a2 2 0 0 0-2-2h-8v4" />
      <path d="M5.5 10.5h3.5a1.5 1.5 0 0 1 0 3H5.5a1.5 1.5 0 0 1 0-3z" {...F} />
    </>
  ),
  rug: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="1.5" {...F} />
      <rect x="6" y="9" width="12" height="6" strokeDasharray="2 2" />
      <path d="M3 8H1.5M3 12H1.5M3 16H1.5M21 8h1.5M21 12h1.5M21 16h1.5" />
    </>
  ),
  table: (
    <>
      <rect x="3" y="8" width="18" height="4" rx="1" {...F} />
      <path d="M6 12v7M18 12v7" />
    </>
  ),
  plant: (
    <>
      <path d="M8 15h8l-1 6H9z" {...F} />
      <path d="M12 15V9M12 11c-4 0-5-3-5-5 4 0 5 2 5 5zM12 9c0-3 1-5 5-5 0 3-1 5-5 5z" {...F} />
    </>
  ),
  bookshelf: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M4 9h16M4 15h16" />
      <path d="M7 4.5v3.5M10 5.5v2.5M7 10.5v3.5M13 11v3M16 10.5v3.5M9 16.5v3.5M12 17v3" />
    </>
  ),
  wardrobe: (
    <>
      <rect x="5" y="3" width="14" height="17" rx="1" {...F} />
      <path d="M12 3v17M10 11v2M14 11v2M7 20v1.5M17 20v1.5" />
    </>
  ),
  tv: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="1.5" {...F} />
      <path d="M8 20h8M12 17v3" />
    </>
  ),
  stove: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <circle cx="9" cy="8" r="2" {...F} />
      <circle cx="15" cy="8" r="2" {...F} />
      <rect x="7" y="12" width="10" height="6" rx="1" {...F} />
    </>
  ),
  bathtub: (
    <>
      <path d="M3 11h18v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" {...F} />
      <path d="M5 11V6a2 2 0 0 1 4 0M7 18v2M17 18v2" />
    </>
  ),
  piano: (
    <>
      <rect x="3" y="7" width="18" height="11" rx="1.5" {...F} />
      <path d="M3 13h18M7 13v5M11 13v5M15 13v5M19 13v5" />
      <path d="M6 7v3M10 7v3M14 7v3M18 7v3" strokeWidth={2.4} />
    </>
  ),
  car: (
    <>
      <path d="M3 15v-3l2.5-4.5a1 1 0 0 1 .9-.5h11.2a1 1 0 0 1 .9.5L21 12v3z" {...F} />
      <path d="M3 12h18M3 15v2h3v-2M18 15v2h3v-2" />
      <circle cx="7.5" cy="13.5" r="0.6" />
      <circle cx="16.5" cy="13.5" r="0.6" />
    </>
  ),
};

export function FurnitureIcon({
  type,
  ...rest
}: { type: FurnitureType } & Omit<SVGProps<SVGSVGElement>, 'children'>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...S} {...rest}>
      {ICON_PATHS[type]}
    </svg>
  );
}
