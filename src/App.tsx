import { useEffect, useRef, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { Difficulty } from './engine/types';
import { GENERATOR_VERSION } from './engine/constants';
import {
  applyTheme,
  clearCurrent,
  connectPersistence,
  loadCurrent,
  type SavedGame,
  type StorageLike,
} from './state/persistence';
import { decideStartup, type StartupDecision, type UrlPuzzle } from './state/startup';
import { getGameStore, useGameStore, type GameStore } from './state/store';
import { StoreContext } from './ui/context';
import { Game } from './ui/Game';
import { Header } from './ui/Header';
import { NewGameDialog } from './ui/dialogs/NewGameDialog';
import { RulesDialog } from './ui/dialogs/RulesDialog';
import { StatsDialog } from './ui/dialogs/StatsDialog';
import { ChooseGameDialog, OutdatedSaveDialog } from './ui/dialogs/StartupDialogs';
import { UpdateBanner } from './ui/UpdateBanner';
import { onBeforeUpdate } from './pwa/register';
import { puzzleSearch } from './ui/url';
import { useGameTimer } from './ui/useGameTimer';
import styles from './App.module.css';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** The puzzle named by `?seed=&d=`, if any (a missing or unknown `d` means medium). */
function readParams(): UrlPuzzle | null {
  const q = new URLSearchParams(window.location.search);
  const seed = q.get('seed');
  if (!seed) return null;
  const d = q.get('d') as Difficulty | null;
  return { seed, difficulty: d && DIFFICULTIES.includes(d) ? d : 'medium' };
}

export interface AppProps {
  store?: StoreApi<GameStore>;
  /** Open the Rules dialog on load (first visit); remembering that is up to the caller. */
  showRulesOnLoad?: boolean;
  /**
   * Where to persist the game (localStorage in the real app). Omit it, as most unit tests do,
   * to run without persistence: the URL puzzle (or a random one) is simply started.
   */
  storage?: StorageLike | null;
}

export default function App({ store, showRulesOnLoad = false, storage }: AppProps = {}) {
  const s = store ?? getGameStore();
  const status = useGameStore(s, (g) => g.status);
  const puzzle = useGameStore(s, (g) => g.puzzle);
  const error = useGameStore(s, (g) => g.error);
  const theme = useGameStore(s, (g) => g.settings.theme);
  const [dialog, setDialog] = useState<'new' | 'rules' | 'stats' | null>(
    showRulesOnLoad ? 'rules' : null,
  );
  const [startup, setStartup] = useState<Extract<
    StartupDecision,
    { kind: 'choose' | 'outdated' }
  > | null>(null);
  const storageRef = useRef(storage);

  useGameTimer(s);

  // Keep the address bar shareable: it always names the puzzle on screen.
  const seed = puzzle?.seed;
  const difficulty = puzzle?.difficulty;
  useEffect(() => {
    if (seed === undefined || difficulty === undefined) return;
    const url = `${window.location.pathname}${puzzleSearch(seed, difficulty)}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', url);
  }, [seed, difficulty]);

  // Startup (SPEC §8): decide between resuming, the URL puzzle, a choice and a new game.
  useEffect(() => {
    const st = storageRef.current;
    const url = readParams();
    const run = (d: StartupDecision) => {
      const actions = s.getState();
      switch (d.kind) {
        case 'resume':
          void actions.resumeGame(d.save);
          break;
        case 'new':
        case 'start':
          if (d.discardSave) clearCurrent(st ?? null);
          void actions.newGame(d.seed, d.difficulty);
          break;
        default:
          setStartup(d);
      }
    };
    if (st === undefined) {
      run(
        url
          ? { kind: 'start', ...url, discardSave: false }
          : { kind: 'new', difficulty: 'medium', discardSave: false },
      );
      return;
    }
    run(decideStartup(url, loadCurrent(st), GENERATOR_VERSION));
  }, [s]);

  // Save progress (debounced), and flush when the page is hidden.
  useEffect(() => {
    if (storage === undefined) return;
    const p = connectPersistence(s, { storage });
    // Save the game right before an update reloads the page.
    const off = onBeforeUpdate(p.flush);
    return () => {
      off();
      p.dispose();
    };
  }, [s, storage]);

  const startUrlPuzzle = (save: SavedGame | null, url: UrlPuzzle | null, abandon: boolean) => {
    const actions = s.getState();
    if (save && abandon) actions.abandonSaved(save);
    clearCurrent(storage ?? null);
    setStartup(null);
    void actions.newGame(url?.seed, url?.difficulty ?? 'medium');
  };

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <StoreContext.Provider value={s}>
      <Header
        onNewGame={() => setDialog('new')}
        onRules={() => setDialog('rules')}
        onStats={() => setDialog('stats')}
      />
      <UpdateBanner />
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
      {dialog === 'stats' && <StatsDialog onClose={() => setDialog(null)} />}
      {startup?.kind === 'choose' && (
        <ChooseGameDialog
          sharedSeed={startup.url.seed}
          sharedDifficulty={startup.url.difficulty}
          onContinue={() => {
            const save = startup.save;
            setStartup(null);
            void s.getState().resumeGame(save);
          }}
          onShared={() => startUrlPuzzle(startup.save, startup.url, true)}
        />
      )}
      {startup?.kind === 'outdated' && (
        // An outdated save is discarded without touching the stats.
        <OutdatedSaveDialog onStart={() => startUrlPuzzle(null, startup.url, false)} />
      )}
    </StoreContext.Provider>
  );
}
