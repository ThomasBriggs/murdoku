import { useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { Difficulty } from './engine/types';
import { getGameStore, useGameStore, type GameStore } from './state/store';
import { StoreContext } from './ui/context';
import { Game } from './ui/Game';
import styles from './App.module.css';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

function readParams(): { seed: string | undefined; difficulty: Difficulty } {
  const q = new URLSearchParams(window.location.search);
  const d = q.get('d') as Difficulty | null;
  return {
    seed: q.get('seed') || undefined,
    difficulty: d && DIFFICULTIES.includes(d) ? d : 'medium',
  };
}

export default function App({ store }: { store?: StoreApi<GameStore> } = {}) {
  const s = store ?? getGameStore();
  const status = useGameStore(s, (g) => g.status);
  const puzzle = useGameStore(s, (g) => g.puzzle);
  const error = useGameStore(s, (g) => g.error);
  const theme = useGameStore(s, (g) => g.settings.theme);

  useEffect(() => {
    const { seed, difficulty } = readParams();
    void s.getState().newGame(seed, difficulty);
  }, [s]);

  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <StoreContext.Provider value={s}>
      <header className={styles.header}>
        <h1 data-testid="app-title">Murdoku</h1>
        {puzzle && (
          <p className={styles.meta}>
            <span data-testid="puzzle-difficulty" className={styles.difficulty}>
              {puzzle.difficulty}
            </span>
            <span className={styles.seed}>
              seed <code data-testid="puzzle-seed">{puzzle.seed}</code>
            </span>
          </p>
        )}
      </header>
      <main data-testid="app-main">
        <p className="sr-only" role="status" data-testid="puzzle-status">
          {status}
          {puzzle ? ` (seed: ${puzzle.seed})` : ''}
        </p>
        {status === 'generating' && (
          <p className={styles.notice} data-testid="generating">
            Generating…
          </p>
        )}
        {error && (
          <p className={`${styles.notice} ${styles.error}`} role="alert" data-testid="puzzle-error">
            Could not generate a puzzle: {error}
          </p>
        )}
        <Game />
      </main>
    </StoreContext.Provider>
  );
}
