import styles from './Feedback.module.css';

/** A non-blocking card shown above the board (never a modal). */
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
