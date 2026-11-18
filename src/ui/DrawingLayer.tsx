import { useRef, useState, type PointerEvent } from 'react';
import type { ColorId, Stroke } from '../state/annotations';
import {
  HIGHLIGHTER_WIDTH,
  PEN_WIDTHS,
  strokePath,
  strokesTouched,
  toGridPoint,
  type Pt,
} from '../state/drawing';
import type { PenKind } from '../state/store';
import styles from './DrawingLayer.module.css';

export interface DrawingProps {
  strokes: readonly Stroke[];
  /** Layer visibility (Layers menu). A hidden layer cannot be drawn on. */
  visible: boolean;
  /** Draw tool selected and not locked: the overlay then captures the pointer. */
  active: boolean;
  pen: PenKind;
  size: 0 | 1 | 2;
  color: ColorId;
  onStroke(stroke: Stroke): void;
  /** One call per eraser gesture, with every stroke index it touched. */
  onErase(indices: number[]): void;
}

export function strokeWidth(pen: Exclude<PenKind, 'eraser'>, size: 0 | 1 | 2): number {
  return pen === 'pen' ? PEN_WIDTHS[size] : HIGHLIGHTER_WIDTH * (1 + size * 0.4);
}

/**
 * Transparent SVG over the 9x9 grid (viewBox 0..9, so strokes are in grid
 * units and scale with the board). It only intercepts pointer events while the
 * draw tool is active and unlocked, so otherwise taps reach the cells.
 */
export function DrawingLayer(p: DrawingProps) {
  const ref = useRef<SVGSVGElement>(null);
  const live = useRef<Pt[] | null>(null);
  const [livePts, setLivePts] = useState<Pt[] | null>(null);
  const erasing = useRef<Set<number> | null>(null);
  const lastPoint = useRef<Pt | null>(null);
  const [erased, setErased] = useState<ReadonlySet<number>>(new Set());
  const enabled = p.active && p.visible;

  const point = (e: PointerEvent): Pt =>
    toGridPoint(e.clientX, e.clientY, ref.current!.getBoundingClientRect());

  const sweep = (from: Pt, to: Pt) => {
    const set = erasing.current!;
    const hit = strokesTouched(p.strokes, from, to, undefined, set);
    if (hit.length === 0) return;
    for (const i of hit) set.add(i);
    setErased(new Set(set));
  };

  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already released pointer: events still arrive on the overlay */
    }
    const pt = point(e);
    lastPoint.current = pt;
    if (p.pen === 'eraser') {
      erasing.current = new Set();
      sweep(pt, pt);
    } else {
      live.current = [pt];
      setLivePts([pt]);
    }
  };

  const move = (e: PointerEvent<SVGSVGElement>) => {
    const pt = point(e);
    const prev = lastPoint.current;
    if (erasing.current && prev) {
      sweep(prev, pt);
      lastPoint.current = pt;
    } else if (live.current && prev && (pt[0] !== prev[0] || pt[1] !== prev[1])) {
      live.current.push(pt);
      lastPoint.current = pt;
      setLivePts([...live.current]);
    }
  };

  const finish = () => {
    if (erasing.current) {
      const hit = [...erasing.current];
      erasing.current = null;
      setErased(new Set());
      if (hit.length > 0) p.onErase(hit);
    } else if (live.current && p.pen !== 'eraser') {
      const pts = live.current;
      p.onStroke({
        tool: p.pen,
        color: p.color,
        width: strokeWidth(p.pen, p.size),
        pts,
      });
    }
    live.current = null;
    lastPoint.current = null;
    setLivePts(null);
  };

  return (
    <svg
      ref={ref}
      className={styles.layer}
      viewBox="0 0 9 9"
      preserveAspectRatio="none"
      data-testid="drawing-layer"
      data-active={enabled ? 'true' : 'false'}
      data-visible={p.visible ? 'true' : 'false'}
      aria-hidden="true"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      {p.visible && (
        <>
          {p.strokes.map((s, i) =>
            erased.has(i) ? null : (
              <path
                key={i}
                d={strokePath(s.pts)}
                className={styles.stroke}
                data-testid={`stroke-${i}`}
                data-tool={s.tool}
                style={{
                  stroke: `var(--hc-${s.color})`,
                  strokeWidth: s.width,
                  opacity: s.tool === 'highlighter' ? 0.4 : 1,
                }}
              />
            ),
          )}
          {livePts && p.pen !== 'eraser' && (
            <path
              d={strokePath(livePts)}
              className={styles.stroke}
              data-testid="stroke-live"
              style={{
                stroke: `var(--hc-${p.color})`,
                strokeWidth: strokeWidth(p.pen, p.size),
                opacity: p.pen === 'highlighter' ? 0.4 : 1,
              }}
            />
          )}
        </>
      )}
    </svg>
  );
}
