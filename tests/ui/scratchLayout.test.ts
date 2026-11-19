import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CORNERS,
  EDGE,
  FAB_SIZE,
  MIN_H,
  MIN_W,
  clampFab,
  clampRect,
  defaultFab,
  defaultSize,
  fabAtCorner,
  loadLayout,
  placePanel,
  saveLayout,
  type ScratchLayout,
} from '../../src/ui/scratchLayout';

const VP = { w: 1280, h: 720 };
const SIZE = { w: 340, h: 260 };

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('placePanel corner order', () => {
  it('prefers top-left (panel grows right and down from the button)', () => {
    const r = placePanel({ x: 100, y: 100 }, SIZE, VP);
    expect(r.corner).toBe('tl');
    expect(r.rect).toEqual({ x: 100, y: 100, ...SIZE });
  });

  it('falls to bottom-left when there is no room below', () => {
    const fab = { x: 100, y: 650 };
    const r = placePanel(fab, SIZE, VP);
    expect(r.corner).toBe('bl');
    expect(r.rect.x).toBe(100);
    expect(r.rect.y).toBe(fab.y + FAB_SIZE - SIZE.h);
  });

  it('falls to top-right when there is no room to the right', () => {
    const fab = { x: 1200, y: 100 };
    const r = placePanel(fab, SIZE, VP);
    expect(r.corner).toBe('tr');
    expect(r.rect.x).toBe(fab.x + FAB_SIZE - SIZE.w);
    expect(r.rect.y).toBe(100);
  });

  it('falls to bottom-right when neither right nor below has room', () => {
    const fab = { x: 1200, y: 650 };
    const r = placePanel(fab, SIZE, VP);
    expect(r.corner).toBe('br');
    expect(r.rect).toEqual({
      x: fab.x + FAB_SIZE - SIZE.w,
      y: fab.y + FAB_SIZE - SIZE.h,
      ...SIZE,
    });
  });

  it('exposes the corner order TL, BL, TR, BR', () => {
    expect([...CORNERS]).toEqual(['tl', 'bl', 'tr', 'br']);
  });

  it('keeps the first fitting corner even when a later one would also fit', () => {
    // Mid-screen: every corner fits, the first (tl) wins.
    expect(placePanel({ x: 600, y: 300 }, SIZE, VP).corner).toBe('tl');
  });
});

describe('placePanel fallback and clamping', () => {
  it('always returns a rect inside the viewport', () => {
    for (const fab of [
      { x: 0, y: 0 },
      { x: 1232, y: 0 },
      { x: 0, y: 672 },
      { x: 1232, y: 672 },
      { x: 640, y: 360 },
    ]) {
      const { rect } = placePanel(fab, SIZE, VP);
      expect(rect.x).toBeGreaterThanOrEqual(EDGE);
      expect(rect.y).toBeGreaterThanOrEqual(EDGE);
      expect(rect.x + rect.w).toBeLessThanOrEqual(VP.w - EDGE);
      expect(rect.y + rect.h).toBeLessThanOrEqual(VP.h - EDGE);
    }
  });

  it('picks the least-overflowing corner when none fits', () => {
    // A panel almost as wide as the viewport, button at the far left: tl overflows on the right
    // by little, tr overflows on the left by a lot.
    const vp = { w: 400, h: 600 };
    const size = { w: 380, h: 200 };
    const r = placePanel({ x: 20, y: 20 }, size, vp);
    expect(r.corner).toBe('tl');
    // Button at the right edge instead: tr (panel ends at the button) wins over tl.
    const r2 = placePanel({ x: 340, y: 20 }, size, vp);
    expect(r2.corner).toBe('tr');
  });

  it('shrinks a panel larger than the viewport and keeps it in view', () => {
    const vp = { w: 300, h: 300 };
    const { rect } = placePanel({ x: 10, y: 10 }, { w: 900, h: 900 }, vp);
    expect(rect.w).toBe(vp.w - 2 * EDGE);
    expect(rect.h).toBe(vp.h - 2 * EDGE);
    expect(rect.x).toBe(EDGE);
    expect(rect.y).toBe(EDGE);
  });

  it('never shrinks below the minimum size', () => {
    const { rect } = placePanel({ x: 10, y: 10 }, { w: 10, h: 10 }, VP);
    expect(rect.w).toBe(MIN_W);
    expect(rect.h).toBe(MIN_H);
  });
});

describe('clamp helpers', () => {
  it('clampFab keeps the button fully on screen', () => {
    expect(clampFab({ x: -50, y: -50 }, VP)).toEqual({ x: EDGE, y: EDGE });
    expect(clampFab({ x: 5000, y: 5000 }, VP)).toEqual({
      x: VP.w - FAB_SIZE - EDGE,
      y: VP.h - FAB_SIZE - EDGE,
    });
    expect(clampFab({ x: 200, y: 300 }, VP)).toEqual({ x: 200, y: 300 });
  });

  it('clampRect moves and limits a rect', () => {
    expect(clampRect({ x: -10, y: -10, w: 340, h: 260 }, VP)).toEqual({
      x: EDGE,
      y: EDGE,
      w: 340,
      h: 260,
    });
    const r = clampRect({ x: 1200, y: 700, w: 340, h: 260 }, VP);
    expect(r.x + r.w).toBe(VP.w - EDGE);
    expect(r.y + r.h).toBe(VP.h - EDGE);
    const small = clampRect({ x: 0, y: 0, w: 50, h: 50 }, VP);
    expect([small.w, small.h]).toEqual([MIN_W, MIN_H]);
    const big = clampRect({ x: 0, y: 0, w: 9999, h: 9999 }, VP);
    expect([big.w, big.h]).toEqual([VP.w - 2 * EDGE, VP.h - 2 * EDGE]);
  });
});

describe('defaults', () => {
  it('defaultFab sits bottom-left, with a smaller inset on phones', () => {
    const d = defaultFab(VP);
    expect(d).toEqual({ x: 16, y: 720 - 104 - FAB_SIZE });
    const m = defaultFab({ w: 375, h: 667 });
    expect(m).toEqual({ x: 10, y: 667 - 92 - FAB_SIZE });
  });

  it('defaultSize fills a phone width and is fixed on desktop', () => {
    expect(defaultSize(VP)).toEqual({ w: 340, h: 260 });
    expect(defaultSize({ w: 375, h: 667 })).toEqual({ w: 355, h: 220 });
  });
});

describe('fabAtCorner', () => {
  const rect = { x: 300, y: 200, w: 340, h: 260 };
  it('puts the button on the requested corner of the panel', () => {
    expect(fabAtCorner(rect, 'tl', VP)).toEqual({ x: 300, y: 200 });
    expect(fabAtCorner(rect, 'bl', VP)).toEqual({ x: 300, y: 200 + 260 - FAB_SIZE });
    expect(fabAtCorner(rect, 'tr', VP)).toEqual({ x: 300 + 340 - FAB_SIZE, y: 200 });
    expect(fabAtCorner(rect, 'br', VP)).toEqual({
      x: 300 + 340 - FAB_SIZE,
      y: 200 + 260 - FAB_SIZE,
    });
  });

  it('clamps to the viewport', () => {
    const edge = { x: 0, y: 0, w: 340, h: 260 };
    expect(fabAtCorner(edge, 'tl', VP)).toEqual({ x: EDGE, y: EDGE });
  });

  it('is the inverse of placePanel for a fitting placement', () => {
    const fab = { x: 700, y: 650 };
    const { rect: r, corner } = placePanel(fab, SIZE, VP);
    expect(fabAtCorner(r, corner, VP)).toEqual(fab);
  });
});

describe('layout persistence', () => {
  const layout: ScratchLayout = {
    open: true,
    fab: { x: 10, y: 20 },
    size: { w: 300, h: 200 },
    pos: { x: 50, y: 60 },
    corner: 'br',
  };

  it('round-trips', () => {
    saveLayout(layout);
    expect(loadLayout()).toEqual(layout);
  });

  it('returns defaults for nothing, garbage or malformed fields', () => {
    const empty = { open: false, fab: null, size: null, pos: null, corner: 'tl' };
    expect(loadLayout()).toEqual(empty);
    window.localStorage.setItem('murdoku.scratchpad.layout', '{nope');
    expect(loadLayout()).toEqual(empty);
    window.localStorage.setItem(
      'murdoku.scratchpad.layout',
      JSON.stringify({ open: 'yes', fab: { x: 'a', y: 1 }, size: 5, pos: null, corner: 'zz' }),
    );
    expect(loadLayout()).toEqual(empty);
  });

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => saveLayout(layout)).not.toThrow();
    expect(loadLayout().open).toBe(false);
  });
});
