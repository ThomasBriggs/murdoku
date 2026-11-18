import { useEffect, useRef, useState } from 'react';
import styles from './Solving.module.css';

export const SCRATCHPAD_DEBOUNCE_MS = 1200;

export interface ScratchpadProps {
  value: string;
  open: boolean;
  onToggle(open: boolean): void;
  /** Commit the text: one undo step per call (callers ignore unchanged text). */
  onCommit(text: string): void;
}

/**
 * Collapsible free-text notepad for the whole puzzle (SPEC §6.5.7). Typing
 * edits a local draft; it is committed to the store on blur and after a pause,
 * so the history gets one step per edit session, not one per keystroke.
 */
export function Scratchpad({ value, open, onToggle, onCommit }: ScratchpadProps) {
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

  return (
    <section className={styles.scratch} aria-label="Scratchpad" data-testid="scratchpad">
      <button
        type="button"
        className={styles.scratchToggle}
        data-testid="scratchpad-toggle"
        aria-expanded={open}
        aria-controls="scratchpad-text"
        onClick={() => {
          if (open) flush();
          onToggle(!open);
        }}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span> Scratchpad
        {!open && value !== '' && <span className={styles.hint}> (has notes)</span>}
      </button>
      {open && (
        <textarea
          id="scratchpad-text"
          className={styles.scratchText}
          data-testid="scratchpad-text"
          aria-label="Scratchpad notes for the whole puzzle"
          placeholder="Longer reasoning: If C is in the Kitchen then…"
          rows={5}
          value={draft}
          onChange={(e) => {
            draftRef.current = e.target.value;
            setDraft(e.target.value);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(flush, SCRATCHPAD_DEBOUNCE_MS);
          }}
          onBlur={flush}
        />
      )}
    </section>
  );
}
