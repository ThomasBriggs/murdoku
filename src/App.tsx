import { useEffect, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { Difficulty } from './engine/types';
import { getGameStore, useGameStore, type GameStore } from './state/store';
import { StoreContext } from './ui/context';
import { Game } from './ui/Game';
import { Header } from './ui/Header';
import { NewGameDialog } from './ui/dialogs/NewGameDialog';
import { RulesDialog } from './ui/dialogs/RulesDialog';
import { puzzleSearch } from './ui/url';
import { useGameTimer } from './ui/useGameTimer';
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

export interface AppProps {
  store?: StoreApi<GameStore>;
  /** Open the Rules dialog on load (first visit); remembering that is up to the caller. */
  showRulesOnLoad?: boolean;
}

export default function App({ store, showRulesOnLoad = false }: AppProps = {}) {
  const s = store ?? getGameStore();
  const status = useGameStore(s, (g) => g.status);
  const puzzle = useGameStore(s, (g) => g.puzzle);
  const error = useGameStore(s, (g) => g.error);
  const theme = useGameStore(s, (g) => g.settings.theme);
  const [dialog, setDialog] = useState<'new' | 'rules' | null>(showRulesOnLoad ? 'rules' : null);

  useGameTimer(s);

  // Keep the address bar shareable: it always names the puzzle on screen.
  const seed = puzzle?.seed;
  const difficulty = puzzle?.difficulty;
  useEffect(() => {
    if (seed === undefined || difficulty === undefined) return;
    const url = `${window.location.pathname}${puzzleSearch(seed, difficulty)}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', url);
  }, [seed, difficulty]);

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
      <Header onNewGame={() => setDialog('new')} onRules={() => setDialog('rules')} />
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
        <Game onNewGame={() => setDialog('new')} />
      </main>
      {dialog === 'new' && <NewGameDialog onClose={() => setDialog(null)} />}
      {dialog === 'rules' && <RulesDialog onClose={() => setDialog(null)} />}
    </StoreContext.Provider>
  );
}
