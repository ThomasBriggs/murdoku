import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import styles from './ConfirmDialog.module.css';

export interface ModalProps {
  title: string;
  children: ReactNode;
  /** Escape / backdrop-less close handler. */
  onCancel(): void;
  testId?: string;
  /** Buttons row (right aligned). */
  actions?: ReactNode;
  /** Wider dialog for forms and reference text. */
  wide?: boolean;
  /** Where focus starts: the first focusable element (default), the first action button, or the dialog itself (long reading content: stays scrolled to the top). */
  initialFocus?: 'first' | 'actions' | 'dialog';
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), a[href], textarea:not(:disabled)';

/** Accessible modal: labelled, focus moves in and is trapped, Escape cancels, focus returns. */
export function Modal(p: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    if (p.initialFocus === 'dialog') ref.current?.focus();
    else {
      const scope = p.initialFocus === 'actions' ? actionsRef.current : ref.current;
      scope?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }
    return () => previous?.focus?.();
    // Only on mount: the dialog's content may re-render while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      p.onCancel();
    } else if (e.key === 'Tab') {
      const items = ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
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
        className={`${styles.dialog} ${p.wide ? styles.wide : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId} className={styles.title}>
          {p.title}
        </h2>
        <div>{p.children}</div>
        {p.actions && (
          <div ref={actionsRef} className={styles.actions}>
            {p.actions}
          </div>
        )}
      </div>
    </div>
  );
}

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

/** Two-button confirmation; focus starts on Cancel. */
export function ConfirmDialog(p: ConfirmDialogProps) {
  return (
    <Modal
      title={p.title}
      testId={p.testId}
      onCancel={p.onCancel}
      initialFocus="actions"
      actions={
        <>
          <button type="button" data-testid={p.cancelTestId ?? 'cancel-reset'} onClick={p.onCancel}>
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
        </>
      }
    >
      {p.children}
    </Modal>
  );
}
