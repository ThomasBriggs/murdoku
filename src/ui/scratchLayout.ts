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
export interface ScratchLayout {
  open: boolean;
  /** Dragged position of the minimised button (null: default corner). */
  fab: Pt | null;
  /** Dragged position / size of the open panel (null: anchored to the button, default size). */
  panel: Partial<Rect> | null;
}

export const FAB_SIZE = 48;
export const MIN_W = 200;
export const MIN_H = 140;
export const EDGE = 4;
const KEY = 'murdoku.scratchpad.layout';

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function loadLayout(): ScratchLayout {
  const empty: ScratchLayout = { open: false, fab: null, panel: null };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty;
    const o = JSON.parse(raw) as Record<string, unknown>;
    const fab = o.fab as Partial<Pt> | null | undefined;
    const pn = o.panel as Partial<Rect> | null | undefined;
    const panel: Partial<Rect> = {};
    if (pn) {
      if (num(pn.x)) panel.x = pn.x;
      if (num(pn.y)) panel.y = pn.y;
      if (num(pn.w)) panel.w = pn.w;
      if (num(pn.h)) panel.h = pn.h;
    }
    return {
      open: o.open === true,
      fab: fab && num(fab.x) && num(fab.y) ? { x: fab.x, y: fab.y } : null,
      panel: Object.keys(panel).length ? panel : null,
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

/** Default button spot: bottom-left, above the dock area (phones: above the bottom bar). */
export function defaultFab(vp: Viewport): Pt {
  const narrow = vp.w <= 600;
  return clampFab({ x: narrow ? 10 : 16, y: vp.h - (narrow ? 92 : 104) - FAB_SIZE }, vp);
}

/** The panel's rect: stored size/position, else sized by viewport and anchored to the button. */
export function panelRect(stored: Partial<Rect> | null, fab: Pt, vp: Viewport): Rect {
  const narrow = vp.w <= 600;
  const w = stored?.w ?? (narrow ? vp.w - 20 : 340);
  const h = stored?.h ?? (narrow ? 220 : 260);
  const x = stored?.x ?? (narrow ? 10 : fab.x);
  const y = stored?.y ?? fab.y + FAB_SIZE - h;
  return clampRect({ x, y, w, h }, vp);
}
