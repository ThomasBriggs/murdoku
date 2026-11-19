/** Geometry and per-viewer persistence for the floating scratchpad. Pure, no React. */

export interface Pt {
  x: number;
  y: number;
}
export interface Rect extends Pt {
  w: number;
  h: number;
}
export interface Viewport {
  w: number;
  h: number;
}
export interface Size {
  w: number;
  h: number;
}
/** Which corner of the panel sits on the (minimised) button. */
export type Corner = 'tl' | 'bl' | 'tr' | 'br';
export const CORNERS: readonly Corner[] = ['tl', 'bl', 'tr', 'br'];
export interface ScratchLayout {
  open: boolean;
  /** Position of the minimised button (null: default spot). The source of truth for placement. */
  fab: Pt | null;
  /** Panel size (null: default for the viewport). */
  size: Size | null;
  /** Panel top-left after the user dragged or resized it while open (null: derived from the button). */
  pos: Pt | null;
  /** The anchor corner in use while the panel is open and positioned by `pos`. */
  corner: Corner;
}

export const FAB_SIZE = 48;
export const MIN_W = 200;
export const MIN_H = 140;
export const EDGE = 4;
const KEY = 'murdoku.scratchpad.layout';

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function loadLayout(): ScratchLayout {
  const empty: ScratchLayout = { open: false, fab: null, size: null, pos: null, corner: 'tl' };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty;
    const o = JSON.parse(raw) as Record<string, unknown>;
    const pt = (v: unknown): Pt | null => {
      const p = v as Partial<Pt> | null | undefined;
      return p && num(p.x) && num(p.y) ? { x: p.x, y: p.y } : null;
    };
    const sz = (v: unknown): Size | null => {
      const p = v as Partial<Size> | null | undefined;
      return p && num(p.w) && num(p.h) ? { w: p.w, h: p.h } : null;
    };
    return {
      open: o.open === true,
      fab: pt(o.fab),
      size: sz(o.size),
      pos: pt(o.pos),
      corner: CORNERS.includes(o.corner as Corner) ? (o.corner as Corner) : 'tl',
    };
  } catch {
    return empty;
  }
}

export function saveLayout(l: ScratchLayout): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    // storage unavailable: the pad still works, it just forgets its place
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

export function clampFab(p: Pt, vp: Viewport): Pt {
  return {
    x: clamp(p.x, EDGE, vp.w - FAB_SIZE - EDGE),
    y: clamp(p.y, EDGE, vp.h - FAB_SIZE - EDGE),
  };
}

export function clampRect(r: Rect, vp: Viewport): Rect {
  const w = clamp(r.w, MIN_W, vp.w - 2 * EDGE);
  const h = clamp(r.h, MIN_H, vp.h - 2 * EDGE);
  return {
    w,
    h,
    x: clamp(r.x, EDGE, vp.w - w - EDGE),
    y: clamp(r.y, EDGE, vp.h - h - EDGE),
  };
}

/**
 * Default button spot: bottom-left, above the dock area. On phones it sits just above the
 * bottom bar: `dockTop` is that bar's measured top edge (falls back to a fixed inset).
 */
export function defaultFab(vp: Viewport, dockTop?: number): Pt {
  const narrow = vp.w <= 600;
  // Landscape phones: the dock runs down the left edge, so the button sits just right of it.
  if (!narrow && vp.h <= 500) return clampFab({ x: 100, y: vp.h - FAB_SIZE - 8 }, vp);
  const above = narrow ? (dockTop === undefined ? 92 : vp.h - dockTop + 10) : 104;
  return clampFab({ x: narrow ? 10 : 16, y: vp.h - above - FAB_SIZE }, vp);
}

export function defaultSize(vp: Viewport): Size {
  const narrow = vp.w <= 600;
  return { w: narrow ? vp.w - 20 : 340, h: narrow ? 220 : 260 };
}

/** The panel rect when its `corner` sits on the button at `fab`. */
function anchoredRect(fab: Pt, size: Size, corner: Corner): Rect {
  const { w, h } = size;
  return {
    w,
    h,
    x: corner === 'tl' || corner === 'bl' ? fab.x : fab.x + FAB_SIZE - w,
    y: corner === 'tl' || corner === 'tr' ? fab.y : fab.y + FAB_SIZE - h,
  };
}

/** How far (px, summed over the four sides) a rect pokes outside the usable viewport. */
function overflow(r: Rect, vp: Viewport): number {
  return (
    Math.max(0, EDGE - r.x) +
    Math.max(0, EDGE - r.y) +
    Math.max(0, r.x + r.w - (vp.w - EDGE)) +
    Math.max(0, r.y + r.h - (vp.h - EDGE))
  );
}

/**
 * Where the panel opens from the button: the first corner, in the order
 * top-left, bottom-left, top-right, bottom-right, whose placement fits the
 * viewport; otherwise the least-overflowing one, clamped (and shrunk if the
 * viewport is smaller than the panel).
 */
export function placePanel(fab: Pt, size: Size, vp: Viewport): { rect: Rect; corner: Corner } {
  const sized: Size = {
    w: clamp(size.w, MIN_W, vp.w - 2 * EDGE),
    h: clamp(size.h, MIN_H, vp.h - 2 * EDGE),
  };
  let best: { rect: Rect; corner: Corner } | null = null;
  let bestOver = Infinity;
  for (const corner of CORNERS) {
    const rect = anchoredRect(fab, sized, corner);
    const o = overflow(rect, vp);
    if (o < bestOver) {
      best = { rect, corner };
      bestOver = o;
      if (o === 0) break;
    }
  }
  // CORNERS is non-empty, so `best` is set.
  const chosen = best as { rect: Rect; corner: Corner };
  return { rect: clampRect(chosen.rect, vp), corner: chosen.corner };
}

/** The button position that sits on the given corner of `rect` (clamped to the viewport). */
export function fabAtCorner(rect: Rect, corner: Corner, vp: Viewport): Pt {
  return clampFab(
    {
      x: corner === 'tl' || corner === 'bl' ? rect.x : rect.x + rect.w - FAB_SIZE,
      y: corner === 'tl' || corner === 'tr' ? rect.y : rect.y + rect.h - FAB_SIZE,
    },
    vp,
  );
}

/** CSS transform-origin for a corner. */
export const CORNER_ORIGIN: Record<Corner, string> = {
  tl: 'top left',
  bl: 'bottom left',
  tr: 'top right',
  br: 'bottom right',
};
