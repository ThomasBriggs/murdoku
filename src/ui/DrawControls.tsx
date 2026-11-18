import type { PenKind } from '../state/store';
import styles from './Solving.module.css';

const PENS: { id: PenKind; label: string; glyph: string; help: string }[] = [
  { id: 'pen', label: 'Pen', glyph: '✒', help: 'Draw freehand lines' },
  { id: 'highlighter', label: 'Highlighter', glyph: '🖍', help: 'Wide, semi-transparent strokes' },
  { id: 'eraser', label: 'Eraser', glyph: '⌫', help: 'Wipe away strokes the pointer touches' },
];

export interface DrawControlsProps {
  pen: PenKind;
  size: 0 | 1 | 2;
  locked: boolean;
  visible: boolean;
  hasStrokes: boolean;
  onPen(pen: PenKind): void;
  onSize(size: 0 | 1 | 2): void;
  onLock(locked: boolean): void;
  onClear(): void;
}

/** Options of the draw tool: pen / highlighter / eraser, width, lock and clear (SPEC §6.5.6). */
export function DrawControls(p: DrawControlsProps) {
  return (
    <div
      className={styles.drawControls}
      role="toolbar"
      aria-label="Drawing"
      data-testid="draw-controls"
    >
      <div className={styles.group} role="group" aria-label="Drawing tool">
        {PENS.map((t) => (
          <button
            type="button"
            key={t.id}
            data-testid={`pen-${t.id}`}
            aria-pressed={p.pen === t.id}
            aria-label={t.label}
            title={`${t.label}: ${t.help}`}
            onClick={() => p.onPen(t.id)}
          >
            <span aria-hidden="true">{t.glyph}</span>
            <span className={styles.hideNarrow}>{t.label}</span>
          </button>
        ))}
      </div>
      {p.pen !== 'eraser' && (
        <div className={styles.group} role="group" aria-label="Width">
          {([0, 1, 2] as const).map((i) => (
            <button
              type="button"
              key={i}
              data-testid={`pen-size-${i}`}
              aria-pressed={p.size === i}
              aria-label={['Thin', 'Medium', 'Thick'][i]}
              title={`${['Thin', 'Medium', 'Thick'][i]} line`}
              onClick={() => p.onSize(i)}
            >
              <span
                aria-hidden="true"
                className={styles.dot}
                style={{ width: 4 + i * 4, height: 4 + i * 4 }}
              />
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        data-testid="draw-lock"
        aria-pressed={p.locked}
        title="Lock drawing: taps go to the cells instead of drawing"
        onClick={() => p.onLock(!p.locked)}
      >
        <span aria-hidden="true">{p.locked ? '🔒' : '🔓'}</span>
        <span className={styles.hideNarrow}>{p.locked ? 'Locked' : 'Lock'}</span>
      </button>
      <button
        type="button"
        data-testid="draw-clear"
        disabled={!p.hasStrokes}
        title="Clear drawing (undoable)"
        onClick={p.onClear}
      >
        <span aria-hidden="true">✕</span>
        <span className={styles.hideNarrow}>Clear drawing</span>
      </button>
      {!p.visible && (
        <span className={styles.hint} role="status" data-testid="draw-hidden-hint">
          Drawing layer is hidden (Layers menu).
        </span>
      )}
    </div>
  );
}
