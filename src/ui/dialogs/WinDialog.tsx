import { useState } from 'react';
import type { Difficulty } from '../../engine/types';
import { Modal } from '../ConfirmDialog';
import { formatTime } from '../time';
import { copyText, shareUrl } from '../url';
import styles from './Dialogs.module.css';

export interface WinDialogProps {
  elapsedMs: number;
  difficulty: Difficulty;
  seed: string;
  hints: number;
  checks: number;
  assists: number;
  /** This win set a new best time for its difficulty. */
  newBest?: boolean;
  onNewGame(): void;
  onClose(): void;
}

export function WinDialog(p: WinDialogProps) {
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const share = async () =>
    setCopied((await copyText(shareUrl(p.seed, p.difficulty))) ? 'ok' : 'fail');
  return (
    <Modal
      title="Case solved!"
      testId="win-dialog"
      onCancel={p.onClose}
      wide
      actions={
        <>
          <button type="button" data-testid="win-share" onClick={() => void share()}>
            Copy link to this puzzle
          </button>
          <button type="button" data-testid="win-close" onClick={p.onClose}>
            View board
          </button>
          <button
            type="button"
            className={styles.primary}
            data-testid="win-new-game"
            onClick={p.onNewGame}
          >
            New game
          </button>
        </>
      }
    >
      <p>Everyone is in the right place and you named the murderer.</p>
      {p.newBest && (
        <p>
          <span data-testid="win-new-best" className={styles.badge}>
            New best time!
          </span>
        </p>
      )}
      <dl className={styles.stats}>
        <dt>Time</dt>
        <dd data-testid="win-time">{formatTime(p.elapsedMs)}</dd>
        <dt>Difficulty</dt>
        <dd data-testid="win-difficulty" style={{ textTransform: 'capitalize' }}>
          {p.difficulty}
        </dd>
        <dt>Hints used</dt>
        <dd data-testid="win-hints">{p.hints}</dd>
        <dt>Checks used</dt>
        <dd data-testid="win-checks">{p.checks}</dd>
        <dt>Assists used</dt>
        <dd data-testid="win-assists">{p.assists}</dd>
      </dl>
      <p className={styles.muted} role="status" data-testid="win-share-status">
        {copied === 'ok' && 'Link copied to the clipboard.'}
        {copied === 'fail' && `Could not copy automatically: ${shareUrl(p.seed, p.difficulty)}`}
        {copied === 'idle' && `Seed: ${p.seed}`}
      </p>
    </Modal>
  );
}
