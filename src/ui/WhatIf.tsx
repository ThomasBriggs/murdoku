import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { WHATIF_MAX_DEPTH } from '../state/store';
import styles from './Solving.module.css';

export type WhatIfEnd = 'keep' | 'abandon' | 'choose';

/** Banner above the board while a what-if is open: level, breadcrumbs, Keep / Abandon / nest. */
export function WhatIfBanner({
  level,
  onKeep,
  onAbandon,
  onNest,
}: {
  level: number;
  onKeep(): void;
  onAbandon(): void;
  onNest(): void;
}) {
  return (
    <div
      className={styles.whatIfBanner}
      role="status"
      data-testid="whatif-banner"
      data-level={level}
    >
      <strong data-testid="whatif-level">What-if (level {level})</strong>
      <nav aria-label="What-if levels" className={styles.crumbs} data-testid="whatif-breadcrumbs">
        <ol>
          <li>Main board</li>
          {Array.from({ length: level }, (_, i) => (
            <li key={i} aria-current={i === level - 1 ? 'step' : undefined}>
              What-if {i + 1}
            </li>
          ))}
        </ol>
      </nav>
      <span className={styles.spacer} />
      <button
        type="button"
        data-testid="whatif-nest"
        disabled={level >= WHATIF_MAX_DEPTH}
        onClick={onNest}
        title="Start a what-if inside this one (up to 3 levels)"
      >
        Nest another
      </button>
      <button
        type="button"
        data-testid="whatif-keep"
        onClick={onKeep}
        title="Merge this hypothesis into the board"
      >
        Keep
      </button>
      <button
        type="button"
        data-testid="whatif-abandon"
        onClick={onAbandon}
        title="Revert to where this what-if started"
      >
        Abandon
      </button>
    </div>
  );
}

/** Ends a what-if with an optional note that is appended to the scratchpad. */
export function WhatIfEndDialog({
  mode,
  level,
  onCancel,
  onEnd,
}: {
  mode: WhatIfEnd;
  level: number;
  onCancel(): void;
  onEnd(outcome: 'keep' | 'abandon', note: string): void;
}) {
  const [note, setNote] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => previous?.focus?.();
  }, []);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    }
  };
  return (
    <div className={styles.backdrop} onKeyDown={onKeyDown} data-testid="whatif-dialog">
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="whatif-title">
        <h2 id="whatif-title">End what-if (level {level})</h2>
        <p>
          {mode === 'keep'
            ? 'Keep merges this hypothesis into the board.'
            : mode === 'abandon'
              ? 'Abandon puts the board back the way it was when this what-if started.'
              : 'Keep merges this hypothesis into the board; Abandon puts the board back.'}
        </p>
        <label className={styles.noteWhy}>
          Note why (optional, added to the scratchpad)
          <input
            ref={inputRef}
            type="text"
            data-testid="whatif-note"
            value={note}
            maxLength={120}
            placeholder="C in Kitchen → contradiction"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && mode !== 'choose') onEnd(mode, note);
            }}
          />
        </label>
        <div className={styles.dialogActions}>
          <button type="button" data-testid="whatif-cancel" onClick={onCancel}>
            Cancel
          </button>
          {mode !== 'keep' && (
            <button
              type="button"
              data-testid="whatif-abandon-confirm"
              onClick={() => onEnd('abandon', note)}
            >
              Abandon
            </button>
          )}
          {mode !== 'abandon' && (
            <button
              type="button"
              data-testid="whatif-keep-confirm"
              onClick={() => onEnd('keep', note)}
            >
              Keep
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
