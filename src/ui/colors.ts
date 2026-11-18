import type { ColorId } from '../state/annotations';

/**
 * Highlight colours (SPEC §6.5.2). Colour is never the only signal: each one
 * also has its own fill pattern and corner glyph (see Annotations.module.css).
 */
export const COLOR_INFO: Record<ColorId, { label: string; glyph: string; pattern: string }> = {
  amber: { label: 'Amber', glyph: '●', pattern: 'diagonal stripes' },
  red: { label: 'Red', glyph: '■', pattern: 'back stripes' },
  green: { label: 'Green', glyph: '▲', pattern: 'dots' },
  blue: { label: 'Blue', glyph: '◆', pattern: 'horizontal stripes' },
  purple: { label: 'Purple', glyph: '★', pattern: 'vertical stripes' },
  orange: { label: 'Orange', glyph: '✚', pattern: 'cross-hatch' },
};
