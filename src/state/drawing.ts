/**
 * Pure geometry for the freehand pen layer (SPEC §6.5.6).
 *
 * Strokes live in grid units: the 9x9 board spans (0,0)..(9,9), so a stroke
 * keeps its place and thickness relative to the cells whatever the board size.
 */
import type { Stroke } from './annotations';

export const GRID_UNITS = 9;
/** Pen widths (small, medium, large) in grid units (1 unit = one cell). */
export const PEN_WIDTHS = [0.05, 0.1, 0.18] as const;
export const HIGHLIGHTER_WIDTH = 0.5;
/** Ramer-Douglas-Peucker tolerance in grid units (about 0.3 px on a 300 px board). */
export const RDP_EPSILON = 0.03;
/** Eraser radius in grid units. */
export const ERASER_RADIUS = 0.22;

export type Pt = [number, number];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Screen point to grid units, clamped to the board and rounded to 0.01. */
export function toGridPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): Pt {
  const w = rect.width || 1;
  const h = rect.height || 1;
  const clamp = (v: number) => Math.min(GRID_UNITS, Math.max(0, v));
  return [
    round2(clamp(((clientX - rect.left) / w) * GRID_UNITS)),
    round2(clamp(((clientY - rect.top) / h) * GRID_UNITS)),
  ];
}

/** Distance from `p` to the segment a-b. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Ramer-Douglas-Peucker polyline simplification; keeps both end points. */
export function simplifyRDP(pts: readonly Pt[], epsilon = RDP_EPSILON): Pt[] {
  if (pts.length <= 2) return pts.map((p) => [p[0], p[1]]);
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop()!;
    let worst = -1;
    let at = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = distToSegment(pts[i]!, pts[lo]!, pts[hi]!);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (at >= 0 && worst > epsilon) {
      keep[at] = true;
      stack.push([lo, at], [at, hi]);
    }
  }
  return pts.filter((_, i) => keep[i]).map((p) => [p[0], p[1]]);
}

/** Does the eraser disc at `p` touch the stroke (including half its thickness)? */
export function strokeHit(stroke: Stroke, p: Pt, radius = ERASER_RADIUS): boolean {
  const reach = radius + stroke.width / 2;
  const pts = stroke.pts;
  if (pts.length === 0) return false;
  if (pts.length === 1) return Math.hypot(p[0] - pts[0]![0], p[1] - pts[0]![1]) <= reach;
  for (let i = 0; i < pts.length - 1; i++)
    if (distToSegment(p, pts[i]!, pts[i + 1]!) <= reach) return true;
  return false;
}

/**
 * Indices of strokes touched by an eraser moving from `from` to `to` (sampled
 * every half radius so quick moves do not skip over thin strokes).
 */
export function strokesTouched(
  strokes: readonly Stroke[],
  from: Pt,
  to: Pt,
  radius = ERASER_RADIUS,
  skip: ReadonlySet<number> = new Set(),
): number[] {
  const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const steps = Math.max(1, Math.ceil(dist / (radius / 2)));
  const hit = new Set<number>();
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const p: Pt = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    strokes.forEach((st, i) => {
      if (!skip.has(i) && !hit.has(i) && strokeHit(st, p, radius)) hit.add(i);
    });
  }
  return [...hit].sort((a, b) => a - b);
}

/** SVG path data for a stroke in grid units (a single point becomes a dot). */
export function strokePath(pts: readonly Pt[]): string {
  if (pts.length === 0) return '';
  const body = pts.length === 1 ? [...pts, [pts[0]![0] + 0.001, pts[0]![1]]] : pts;
  return body.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]} ${p[1]}`).join(' ');
}
