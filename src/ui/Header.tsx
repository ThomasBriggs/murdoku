import { useEffect, useState } from 'react';
import { useGame, useStoreApi } from './context';
import { copyText, shareUrl } from './url';
import styles from '../App.module.css';
import { formatTime } from './time';
import { SettingsMenu } from './Toolbar';
import { CheckIcon, PlusIcon, ShareIcon, StatsIcon } from './icons/glyphs';

/** Slim one-line header: title, difficulty + timer, and icon buttons for the app-level actions. */
export function Header({
  onNewGame,
  onRules,
  onStats,
}: {
  onNewGame(): void;
  onRules(): void;
  onStats(): void;
}) {
  const store = useStoreApi();
  const settings = useGame((g) => g.settings);
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
      {puzzle ? (
        <p className={styles.meta}>
          <span data-testid="puzzle-difficulty" className={styles.difficulty}>
            {puzzle.difficulty}
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
          <span className={styles.seed}>
            seed <code data-testid="puzzle-seed">{puzzle.seed}</code>
          </span>
        </p>
      ) : (
        <span className={styles.meta} />
      )}
      <span className="sr-only" role="status" data-testid="share-status">
        {shared === 'ok' && 'Link to this puzzle copied.'}
        {shared === 'fail' && 'Could not copy the link.'}
      </span>
      <div className={styles.hActions}>
        <button
          type="button"
          className={styles.hBtn}
          data-testid="new-game-button"
          aria-label="New game"
          title="New game"
          onClick={onNewGame}
        >
          <PlusIcon />
        </button>
        <button
          type="button"
          className={styles.hBtn}
          data-testid="share-button"
          disabled={!puzzle}
          aria-label={shared === 'ok' ? 'Link copied' : 'Share'}
          title={
            shared === 'ok'
              ? 'Link copied'
              : shared === 'fail'
                ? 'Copy failed'
                : 'Share: copy a link to this puzzle (no progress included)'
          }
          onClick={() => void share()}
        >
          {shared === 'ok' ? <CheckIcon /> : <ShareIcon />}
        </button>
        <button
          type="button"
          className={styles.hBtn}
          data-testid="stats-button"
          aria-label="Statistics"
          title="Statistics"
          onClick={onStats}
        >
          <StatsIcon />
        </button>
        <button
          type="button"
          className={styles.hBtn}
          data-testid="rules-button"
          aria-label="Rules"
          title="Rules and shortcuts"
          onClick={onRules}
        >
          <span aria-hidden="true">?</span>
        </button>
        <SettingsMenu
          iconOnly
          className={styles.hBtn}
          settings={settings}
          onSettings={(patch) => store.getState().updateSettings(patch)}
        />
      </div>
    </header>
  );
}
