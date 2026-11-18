import type { PersonId } from '../engine/types';
import { cellKey, type Cell } from '../engine/types';
import type { HintDeduction as Deduction } from '../worker/protocol';
import { COLUMN_LETTERS } from './types';
import styles from './Feedback.module.css';

/** What the hint panel shows (derived from the worker's HintResult). */
export type HintView =
  | { kind: 'deduction'; deduction: Deduction }
  | { kind: 'wrong'; count: number; person?: PersonId }
  | { kind: 'none'; complete: boolean };

export interface HintPanelProps {
  view: HintView;
  personName(id: PersonId): string;
  onShowOne(): void;
  /** Apply a deduction to the board: place the person, or cross out eliminated cells. */
  onApply(d: Deduction): void;
  onDismiss(): void;
}

export const cellName = (c: Cell) => `${COLUMN_LETTERS[c.c]}${c.r + 1}`;

/** Cells a hint lights up: the answer(s) and the cells the reasoning is about. */
export function hintHighlights(view: HintView | null): {
  target: Set<number>;
  involved: Set<number>;
} {
  const target = new Set<number>();
  const involved = new Set<number>();
  if (view?.kind === 'deduction') {
    for (const c of view.deduction.cells) target.add(cellKey(c.r, c.c));
    for (const c of view.deduction.involvedCells) involved.add(cellKey(c.r, c.c));
  }
  return { target, involved };
}

/** A non-blocking card shown above the board (never a modal). */
export function HintPanel(p: HintPanelProps) {
  const v = p.view;
  const d = v.kind === 'deduction' ? v.deduction : null;
  const place = d && d.kind === 'place' && d.person !== undefined ? d : null;
  const cell = place?.cells[0];
  return (
    <section
      className={styles.card}
      data-testid="hint-panel"
      data-hint-kind={d ? d.kind : v.kind}
      data-hint-person={place?.person}
      data-hint-cell={cell ? cellKey(cell.r, cell.c) : undefined}
      data-hint-row={cell?.r}
      data-hint-col={cell?.c}
      role="status"
      aria-label="Hint"
    >
      <div className={styles.body}>
        <strong className={styles.head}>Hint</strong>
        {d && <p data-testid="hint-text">{d.explanation}</p>}
        {v.kind === 'wrong' &&
          (v.person === undefined ? (
            <>
              <p data-testid="hint-text">Something on the board is wrong.</p>
              <p className={styles.sub}>
                {v.count === 1 ? 'One placement' : `${v.count} placements`} could be in the wrong
                place.
              </p>
            </>
          ) : (
            <p data-testid="hint-text">
              {p.personName(v.person)} is not in the right place. Their token is marked on the
              board.
            </p>
          ))}
        {v.kind === 'none' && (
          <p data-testid="hint-text">
            {v.complete
              ? 'Everyone is placed. Accuse the murderer when you are ready.'
              : 'I can’t find a next step from here. Try the notes, the logic grid or a what-if.'}
          </p>
        )}
      </div>
      <div className={styles.actions}>
        {v.kind === 'wrong' && v.person === undefined && (
          <button type="button" data-testid="hint-show-one" onClick={p.onShowOne}>
            Show me one
          </button>
        )}
        {d && (
          <button type="button" data-testid="hint-apply" onClick={() => p.onApply(d)}>
            {d.kind === 'place' ? 'Place them' : 'Cross out'}
          </button>
        )}
        <button type="button" data-testid="hint-dismiss" onClick={p.onDismiss}>
          Dismiss
        </button>
      </div>
    </section>
  );
}

export interface CheckSummaryProps {
  correct: number;
  wrong: number;
  showWrong: boolean;
  onToggleWrong(show: boolean): void;
  onDismiss(): void;
}

export function CheckSummary(p: CheckSummaryProps) {
  return (
    <section className={styles.card} data-testid="check-summary" role="status" aria-label="Check">
      <div className={styles.body}>
        <strong className={styles.head}>Check</strong>
        <p data-testid="check-text">
          {p.correct} correct, {p.wrong} wrong
        </p>
        {p.wrong > 0 && (
          <label className={styles.toggle}>
            <input
              type="checkbox"
              data-testid="check-show-wrong"
              checked={p.showWrong}
              onChange={(e) => p.onToggleWrong(e.target.checked)}
            />
            Mark the wrong ones on the board
          </label>
        )}
      </div>
      <div className={styles.actions}>
        <button type="button" data-testid="check-dismiss" onClick={p.onDismiss}>
          Dismiss
        </button>
      </div>
    </section>
  );
}
