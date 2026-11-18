import { useGame } from './context';
import styles from '../App.module.css';
import { formatTime } from './time';

/** Title, New Game, difficulty, timer and Rules (Settings lives in the toolbar). */
export function Header({ onNewGame, onRules }: { onNewGame(): void; onRules(): void }) {
  const puzzle = useGame((g) => g.puzzle);
  const elapsed = useGame((g) => g.elapsedMs);
  const status = useGame((g) => g.status);
  return (
    <header className={`${styles.header} print-hide`}>
      <h1 data-testid="app-title">Murdoku</h1>
      <button type="button" data-testid="new-game-button" onClick={onNewGame}>
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
      <button
        type="button"
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
