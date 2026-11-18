import { useEffect, useState } from 'react';
import { useGame } from './context';
import { copyText, shareUrl } from './url';
import styles from '../App.module.css';
import { formatTime } from './time';

/** Title, New Game, difficulty, timer and Rules (Settings lives in the toolbar). */
export function Header({
  onNewGame,
  onRules,
  onStats,
}: {
  onNewGame(): void;
  onRules(): void;
  onStats(): void;
}) {
  const puzzle = useGame((g) => g.puzzle);
  const elapsed = useGame((g) => g.elapsedMs);
  const status = useGame((g) => g.status);
  const [shared, setShared] = useState<'idle' | 'ok' | 'fail'>('idle');
  useEffect(() => {
    if (shared === 'idle') return;
    const id = window.setTimeout(() => setShared('idle'), 4000);
    return () => window.clearTimeout(id);
  }, [shared]);
  // Puzzle link only: seed and difficulty, never any progress.
  const share = async () => {
    if (!puzzle) return;
    setShared((await copyText(shareUrl(puzzle.seed, puzzle.difficulty))) ? 'ok' : 'fail');
  };
  return (
    <header className={`${styles.header} print-hide`}>
      <h1 data-testid="app-title" className={styles.hTitle}>
        Murdoku
      </h1>
      <button
        type="button"
        className={styles.hNew}
        data-testid="new-game-button"
        onClick={onNewGame}
      >
        New game
      </button>
      {puzzle && (
        <p className={styles.meta}>
          <span data-testid="puzzle-difficulty" className={styles.difficulty}>
            {puzzle.difficulty}
          </span>
          <span className={styles.seed}>
            seed <code data-testid="puzzle-seed">{puzzle.seed}</code>
          </span>
          <span
            className={styles.timer}
            data-testid="timer"
            data-running={status === 'playing' ? 'true' : 'false'}
            role="timer"
            aria-label="Elapsed time"
          >
            {formatTime(elapsed)}
          </span>
        </p>
      )}
      <span className={styles.grow} />
      <span className="sr-only" role="status" data-testid="share-status">
        {shared === 'ok' && 'Link to this puzzle copied.'}
        {shared === 'fail' && 'Could not copy the link.'}
      </span>
      <button
        type="button"
        className={styles.hShare}
        data-testid="share-button"
        disabled={!puzzle}
        title="Copy a link to this puzzle (no progress included)"
        onClick={() => void share()}
      >
        {shared === 'ok' ? 'Link copied' : shared === 'fail' ? 'Copy failed' : 'Share'}
      </button>
      <button
        type="button"
        className={styles.hStats}
        data-testid="stats-button"
        title="Statistics"
        onClick={onStats}
      >
        Stats
      </button>
      <button
        type="button"
        className={styles.hRules}
        data-testid="rules-button"
        aria-label="Rules"
        title="Rules and shortcuts"
        onClick={onRules}
      >
        <span aria-hidden="true">?</span>
        <span>Rules</span>
      </button>
    </header>
  );
}
