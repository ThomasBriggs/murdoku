import { useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { Difficulty } from './engine/types';
import { getGameStore, useGameStore, type GameStore } from './state/store';

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
  const seed = useGameStore(s, (g) => g.puzzle?.seed);
  const error = useGameStore(s, (g) => g.error);

  useEffect(() => {
    const { seed, difficulty } = readParams();
    void s.getState().newGame(seed, difficulty);
  }, [s]);

  return (
    <>
      <header className="app-header">
        <h1 data-testid="app-title">Murdoku</h1>
      </header>
      <main className="app-main" data-testid="app-main">
        <p data-testid="puzzle-status">
          {status}
          {seed ? ` (seed: ${seed})` : ''}
        </p>
        {error && <p data-testid="puzzle-error">{error}</p>}
        <p>The board will appear here.</p>
      </main>
    </>
  );
}
