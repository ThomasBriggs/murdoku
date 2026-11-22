import { useEffect, useRef, useState, type RefObject } from 'react';
import { NotepadIcon } from './icons/glyphs';
import {
  CORNER_ORIGIN,
  clampFab,
  clampRect,
  defaultFab,
  defaultSize,
  fabAtCorner,
  loadLayout,
  placePanel,
  saveLayout,
  type Corner,
  type Pt,
  type Rect,
  type ScratchLayout,
  type Viewport,
} from './scratchLayout';
import styles from './Scratchpad.module.css';

export const SCRATCHPAD_DEBOUNCE_MS = 1200;
/** Pointer travel (px) before a press on the button counts as a drag, not a click. */
const DRAG_THRESHOLD = 5;

export interface ScratchpadProps {
  value: string;
  open: boolean;
  onToggle(open: boolean): void;
  /** Commit the text: one undo step per call (callers ignore unchanged text). */
  onCommit(text: string): void;
  /**
   * Phones: no floating button. The page shows its own trigger (in the clue header) and passes
   * a ref to it, which gets the focus when the panel is minimised.
   */
  triggerRef?: RefObject<HTMLElement | null>;
}

/** Safety net if `animationend` never fires (hidden tab, interrupted animation). */
const CLOSE_MS = 260;
const reducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The visible area: shrinks with the on-screen keyboard where the browser reports it. */
const viewport = (): Viewport => ({
  w: window.innerWidth,
  h: Math.round(Math.min(window.innerHeight, window.visualViewport?.height ?? Infinity)),
});
/** Top edge of the phone bottom bar (null when the desktop dock is showing). */
const phoneDockTop = (): number | undefined =>
  document.querySelector('[data-testid="mobile-dock"]')?.getBoundingClientRect().top;

interface Gesture {
  kind: 'fab' | 'panel' | 'resize';
  id: number;
  sx: number;
  sy: number;
  start: Rect;
  moved: boolean;
  /** Latest geometry computed by a move (the render closure can lag a frame). */
  last?: { fab?: Pt; panel?: Rect };
}

/**
 * Free-floating notepad for the whole puzzle (SPEC §6.5.7). Minimised it is a
 * round button; open it is a draggable, resizable panel. Typing edits a local
 * draft that is committed to the store on blur and after a pause, so the
 * history gets one step per edit session, not one per keystroke. Position,
 * size and open state are remembered per viewer in localStorage.
 */
export function Scratchpad({ value, open, onToggle, onCommit, triggerRef }: ScratchpadProps) {
  const external = triggerRef !== undefined;
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const timer = useRef<number | undefined>(undefined);
  const commit = useRef(onCommit);
  useEffect(() => {
    commit.current = onCommit;
  });

  // Follow the stored value (undo, redo, what-if abandon, a note appended by a what-if).
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  useEffect(() => {
    window.clearTimeout(timer.current);
    draftRef.current = value;
  }, [value]);

  const flush = () => {
    window.clearTimeout(timer.current);
    commit.current(draftRef.current);
  };
  // Never fire a stale timer after unmount (the panel flushes on blur and on collapse).
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // ---- layout -----------------------------------------------------------
  const [vp, setVp] = useState<Viewport>(viewport);
  const [dockTop, setDockTop] = useState<number | undefined>(undefined);
  useEffect(() => {
    const onResize = () => {
      setVp(viewport());
      setDockTop(phoneDockTop());
    };
    onResize();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, []);
  const [layout, setLayout] = useState<ScratchLayout>(() => loadLayout());
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  });
  // While a gesture runs, `live` overrides the stored geometry.
  const [live, setLive] = useState<{ fab?: Pt; panel?: Rect } | null>(null);
  const gesture = useRef<Gesture | null>(null);

  const fab = clampFab(live?.fab ?? layout.fab ?? defaultFab(vp, dockTop), vp);
  const size = layout.size ?? defaultSize(vp);
  const placed = placePanel(fab, size, vp);
  const dragged = layout.pos !== null;
  const rect =
    live?.panel ?? (layout.pos ? clampRect({ ...layout.pos, ...size }, vp) : placed.rect);
  const corner: Corner = dragged ? layout.corner : placed.corner;
  // Ghost of the panel while it shrinks back into the button.
  const [closing, setClosing] = useState<{ rect: Rect; corner: Corner } | null>(null);
  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => setClosing(null), CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [closing]);

  const persist = (patch: Partial<ScratchLayout>) => {
    const next = { ...layoutRef.current, ...patch };
    layoutRef.current = next;
    setLayout(next);
    saveLayout(next);
  };
  // Remember the open state (the parent owns it; it starts from loadLayout()).
  useEffect(() => {
    if (layoutRef.current.open !== open) persist({ open });
  }, [open]);

  // Focus: into the text on open, back onto the button on close (not on first mount).
  const fabRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const prevOpen = useRef(open);
  useEffect(() => {
    if (open && !prevOpen.current) textRef.current?.focus();
    if (!open && prevOpen.current) (triggerRef?.current ?? fabRef.current)?.focus();
    prevOpen.current = open;
  }, [open, triggerRef]);

  const minimise = () => {
    flush();
    // Dragged panel: the button lands on the panel's anchor corner, where the panel is now.
    if (dragged) persist({ fab: fabAtCorner(rect, corner, vp), pos: null });
    if (!reducedMotion() && !external) setClosing({ rect, corner });
    onToggle(false);
  };

  // ---- pointer gestures -------------------------------------------------
  const begin = (e: React.PointerEvent<HTMLElement>, kind: Gesture['kind'], start: Rect) => {
    if (e.button !== 0 || gesture.current) return;
    if (kind === 'panel' && (e.target as HTMLElement).closest('button')) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // not an active pointer (synthetic events): the gesture still tracks via the element
    }
    gesture.current = { kind, id: e.pointerId, sx: e.clientX, sy: e.clientY, start, moved: false };
  };
  const move = (e: React.PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    g.moved = true;
    const v = viewport();
    let next: { fab?: Pt; panel?: Rect };
    if (g.kind === 'fab') next = { fab: clampFab({ x: g.start.x + dx, y: g.start.y + dy }, v) };
    else if (g.kind === 'panel')
      next = { panel: clampRect({ ...g.start, x: g.start.x + dx, y: g.start.y + dy }, v) };
    else next = { panel: clampRect({ ...g.start, w: g.start.w + dx, h: g.start.h + dy }, v) };
    g.last = next;
    setLive(next);
  };
  const end = (e: React.PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // capture already gone
    }
    if (g.moved && g.last) {
      if (g.last.fab)
        persist({ fab: g.last.fab, pos: null }); // the panel re-anchors to the button
      else if (g.last.panel) {
        // Resizing keeps the top-left fixed (the grip follows the pointer); the anchor corner
        // stays as it was, so minimising still lands the button on that corner of the panel.
        const r = g.last.panel;
        persist({
          pos: { x: r.x, y: r.y },
          corner,
          ...(g.kind === 'resize' ? { size: { w: r.w, h: r.h } } : {}),
        });
      }
    }
    setLive(null);
    // A drag must not also toggle the button.
    if (g.moved && g.kind === 'fab') suppressClick.current = true;
  };
  const suppressClick = useRef(false);

  return (
    <div data-testid="scratchpad">
      {open ? (
        <section
          className={styles.panel}
          data-testid="scratchpad-panel"
          aria-label="Scratchpad"
          data-corner={corner}
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
            transformOrigin: CORNER_ORIGIN[corner],
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              minimise();
            }
          }}
        >
          <div
            className={styles.head}
            data-testid="scratchpad-drag"
            onPointerDown={(e) => begin(e, 'panel', rect)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          >
            <NotepadIcon className={styles.headIcon} />
            <span className={styles.title}>Scratchpad</span>
            <button
              type="button"
              className={styles.min}
              data-testid="scratchpad-toggle"
              aria-label="Minimise scratchpad"
              title="Minimise (Esc)"
              aria-expanded
              aria-controls="scratchpad-text"
              onClick={minimise}
            >
              <span aria-hidden="true">&minus;</span>
            </button>
          </div>
          <textarea
            id="scratchpad-text"
            ref={textRef}
            className={styles.text}
            data-testid="scratchpad-text"
            aria-label="Scratchpad notes for the whole puzzle"
            placeholder="Longer reasoning: If C is in the Kitchen then…"
            value={draft}
            onChange={(e) => {
              draftRef.current = e.target.value;
              setDraft(e.target.value);
              window.clearTimeout(timer.current);
              timer.current = window.setTimeout(flush, SCRATCHPAD_DEBOUNCE_MS);
            }}
            onBlur={flush}
          />
          <div
            className={styles.resize}
            data-testid="scratchpad-resize"
            role="separator"
            aria-label="Resize scratchpad"
            onPointerDown={(e) => begin(e, 'resize', rect)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
        </section>
      ) : (
        <>
          {closing && !external && (
            <div
              className={`${styles.panel} ${styles.ghost}`}
              aria-hidden="true"
              style={{
                left: closing.rect.x,
                top: closing.rect.y,
                width: closing.rect.w,
                height: closing.rect.h,
                transformOrigin: CORNER_ORIGIN[closing.corner],
              }}
              onAnimationEnd={() => setClosing(null)}
            >
              <div className={styles.head}>
                <NotepadIcon className={styles.headIcon} />
                <span className={styles.title}>Scratchpad</span>
              </div>
            </div>
          )}
          {!external && (
            <button
              ref={fabRef}
              type="button"
              className={`${styles.fab} ${closing ? styles.fabIn : ''}`}
              data-testid="scratchpad-toggle"
              data-has-text={value !== '' ? 'true' : undefined}
              aria-label="Open scratchpad"
              aria-expanded={false}
              aria-controls="scratchpad-text"
              title={value !== '' ? 'Scratchpad (has notes)' : 'Scratchpad'}
              style={{ left: fab.x, top: fab.y }}
              onPointerDown={(e) => begin(e, 'fab', { ...fab, w: 0, h: 0 })}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                onToggle(true);
              }}
            >
              <NotepadIcon />
              {value !== '' && <span className={styles.dot} aria-hidden="true" />}
            </button>
          )}
        </>
      )}
    </div>
  );
}
