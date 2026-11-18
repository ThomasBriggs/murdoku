import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm(): void;
  onCancel(): void;
  testId?: string;
  /** Test ids of the two buttons (default: the reset dialog's). */
  confirmTestId?: string;
  cancelTestId?: string;
  /** Plain (not red) confirm button, for actions that are not destructive. */
  neutral?: boolean;
}

/** Accessible modal: labelled, focus moves in and is trapped, Escape cancels, focus returns. */
export function ConfirmDialog(p: ConfirmDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      p.onCancel();
    } else if (e.key === 'Tab') {
      const items = ref.current?.querySelectorAll<HTMLElement>('button');
      if (!items || items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div className={styles.backdrop} onKeyDown={onKeyDown} data-testid={p.testId}>
      <div
        ref={ref}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
      >
        <h2 id="confirm-title" className={styles.title}>
          {p.title}
        </h2>
        <div id="confirm-body">{p.children}</div>
        <div className={styles.actions}>
          <button
            type="button"
            ref={cancelRef}
            data-testid={p.cancelTestId ?? 'cancel-reset'}
            onClick={p.onCancel}
          >
            {p.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            className={p.neutral ? undefined : styles.danger}
            data-testid={p.confirmTestId ?? 'confirm-reset'}
            onClick={p.onConfirm}
          >
            {p.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
