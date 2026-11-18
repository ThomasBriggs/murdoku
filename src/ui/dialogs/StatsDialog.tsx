import { useState } from 'react';
import { averageHints } from '../../state/stats';
import { ConfirmDialog, Modal } from '../ConfirmDialog';
import { useGame, useStoreApi } from '../context';
import { formatTime } from '../time';
import styles from './Dialogs.module.css';

const LEVELS = ['easy', 'medium', 'hard'] as const;

export function StatsDialog({ onClose }: { onClose(): void }) {
  const store = useStoreApi();
  const stats = useGame((g) => g.stats);
  const [confirming, setConfirming] = useState(false);
  const avg = averageHints(stats);

  if (confirming)
    return (
      <ConfirmDialog
        title="Reset statistics?"
        testId="stats-reset-confirm"
        confirmLabel="Reset"
        confirmTestId="stats-reset-yes"
        cancelTestId="stats-reset-no"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          store.getState().resetStats();
          setConfirming(false);
        }}
      >
        <p>This clears games played, wins, best times and streaks. It cannot be undone.</p>
      </ConfirmDialog>
    );

  return (
    <Modal
      title="Statistics"
      testId="stats-dialog"
      onCancel={onClose}
      actions={
        <>
          <button type="button" data-testid="stats-reset" onClick={() => setConfirming(true)}>
            Reset stats
          </button>
          <button
            type="button"
            className={styles.primary}
            data-autofocus
            data-testid="stats-close"
            onClick={onClose}
          >
            Close
          </button>
        </>
      }
    >
      <dl className={styles.stats}>
        <dt>Games played</dt>
        <dd data-testid="stats-played">{stats.played}</dd>
        <dt>Games won</dt>
        <dd data-testid="stats-won">{stats.won}</dd>
        <dt>Current streak</dt>
        <dd data-testid="stats-streak">{stats.streak}</dd>
        <dt>Best streak</dt>
        <dd data-testid="stats-best-streak">{stats.bestStreak}</dd>
        <dt>Average hints per win</dt>
        <dd data-testid="stats-avg-hints">{avg === null ? '–' : avg.toFixed(1)}</dd>
        {LEVELS.map((d) => (
          <Best key={d} level={d} ms={stats.bestTimeMs[d]} />
        ))}
      </dl>
      <p className={styles.muted}>
        A game counts as played when you win it or abandon it after placing someone. Abandoning such
        a game resets your streak.
      </p>
    </Modal>
  );
}

function Best({ level, ms }: { level: string; ms: number | null }) {
  return (
    <>
      <dt style={{ textTransform: 'capitalize' }}>Best time, {level}</dt>
      <dd data-testid={`stats-best-${level}`}>{ms === null ? '–' : formatTime(ms)}</dd>
    </>
  );
}
