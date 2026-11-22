import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { GENERATOR_VERSION } from '../../src/engine/constants';
import {
  KEY_CURRENT,
  KEY_SETTINGS,
  hydrateStore,
  loadCurrent,
  saveCurrent,
  toSavedGame,
} from '../../src/state/persistence';
import {
  MemoryStorage,
  makeStore,
  solved,
  startedStore,
  truth,
  wrongCells,
} from '../state/persistence-helpers';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  document.documentElement.removeAttribute('data-theme');
  vi.restoreAllMocks();
});

const tid = (id: string) => screen.getByTestId(id);
const q = (id: string) => screen.queryByTestId(id);

/** Seed `storage` with a saved game for SEED (easy) with one placement. */
async function seedSave(storage: MemoryStorage, over: Record<string, unknown> = {}) {
  const s = await startedStore();
  s.getState().place(0, wrongCells(s, 1)[0]!);
  s.getState().tick(42_000);
  saveCurrent(storage, { ...toSavedGame(s.getState())!, ...over } as never);
}

async function boot(url: string, storage: MemoryStorage, props = {}) {
  window.history.replaceState(null, '', url);
  const store = makeStore();
  hydrateStore(store, storage);
  render(<App store={store} storage={storage} {...props} />);
  return store;
}
const boardShown = () => waitFor(() => expect(q('board')).toBeInTheDocument(), { timeout: 20000 });

describe('startup', () => {
  it('no URL and a saved game: restores progress, timer and undo history', async () => {
    const storage = new MemoryStorage();
    await seedSave(storage);
    const store = await boot('/', storage);
    await boardShown();
    expect(store.getState().puzzle?.seed).toBe('persist-test');
    expect(store.getState().placements[0]).not.toBeNull();
    expect(store.getState().elapsedMs).toBeGreaterThanOrEqual(42_000);
    expect(store.getState().history.past).toHaveLength(1);
    expect(window.location.search).toBe('?seed=persist-test&d=easy');
  });

  it('a matching URL restores without asking', async () => {
    const storage = new MemoryStorage();
    await seedSave(storage);
    const store = await boot('/?seed=persist-test&d=easy', storage);
    await boardShown();
    expect(q('startup-choose')).toBeNull();
    expect(store.getState().placements[0]).not.toBeNull();
  });

  it('a different URL with progress asks; "continue" restores the saved game', async () => {
    const storage = new MemoryStorage();
    await seedSave(storage);
    const store = await boot('/?seed=shared&d=hard', storage);
    expect(tid('startup-choose')).toBeInTheDocument();
    expect(store.getState().puzzle).toBeNull();
    fireEvent.click(tid('startup-continue'));
    await boardShown();
    expect(store.getState().puzzle?.seed).toBe('persist-test');
    expect(store.getState().placements[0]).not.toBeNull();
    expect(q('startup-choose')).toBeNull();
  });

  it('a different URL with progress asks; "shared" starts it, abandons the save in the stats', async () => {
    const storage = new MemoryStorage();
    await seedSave(storage);
    const store = await boot('/?seed=shared&d=hard', storage);
    fireEvent.click(tid('startup-shared'));
    await boardShown();
    expect(store.getState().puzzle?.seed).toBe('shared');
    expect(store.getState().puzzle?.difficulty).toBe('hard');
    expect(store.getState().stats).toMatchObject({ played: 1, streak: 0 });
    expect(storage.getItem(KEY_CURRENT)).toBeNull(); // old save gone until the new game saves
  });

  it('a different URL without progress just starts the shared puzzle', async () => {
    const storage = new MemoryStorage();
    const s = await startedStore();
    saveCurrent(storage, toSavedGame(s.getState())!);
    const store = await boot('/?seed=shared&d=easy', storage);
    await boardShown();
    expect(q('startup-choose')).toBeNull();
    expect(store.getState().puzzle?.seed).toBe('shared');
  });

  it('an outdated save offers a new game and discards the save', async () => {
    const storage = new MemoryStorage();
    await seedSave(storage, { generatorVersion: GENERATOR_VERSION + 1 });
    const store = await boot('/', storage);
    expect(tid('startup-outdated')).toHaveTextContent(/generator was updated/);
    fireEvent.click(tid('startup-outdated-new'));
    await boardShown();
    expect(store.getState().puzzle?.seed).not.toBe('persist-test');
    expect(store.getState().stats.played).toBe(0);
    expect(loadCurrent(storage)?.seed ?? 'gone').not.toBe('persist-test');
  });

  it('no save, no URL: a new random medium game', async () => {
    const store = await boot('/', new MemoryStorage());
    await boardShown();
    expect(store.getState().puzzle?.difficulty).toBe('medium');
  });

  it('a won save is shown solved, read-only, without the win dialog', async () => {
    const storage = new MemoryStorage();
    const s = await startedStore();
    truth.puzzle.people.forEach((p) => s.getState().place(p.id, solved[p.id]!));
    await s.getState().accuse(truth.solution.murdererId);
    saveCurrent(storage, toSavedGame(s.getState())!);
    await boot('/', storage);
    await boardShown();
    expect(tid('solved-banner')).toBeInTheDocument();
    expect(q('win-dialog')).toBeNull();
    expect(tid('board')).toHaveAttribute('data-solved', 'true');
  });

  it('works without storage (unavailable localStorage)', async () => {
    window.history.replaceState(null, '', '/?seed=persist-test&d=easy');
    const store = makeStore();
    render(<App store={store} storage={null} />);
    await boardShown();
    expect(store.getState().status).toBe('playing');
  });
});

describe('settings before first render', () => {
  it('applies the saved theme synchronously, before anything renders', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY_SETTINGS, JSON.stringify({ theme: 'dark', autoCross: false }));
    const store = makeStore();
    hydrateStore(store, storage);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(store.getState().settings.autoCross).toBe(false);
  });
});

describe('stats dialog and share', () => {
  it('shows stats, resets them after confirming', async () => {
    const storage = new MemoryStorage();
    const store = await boot('/?seed=persist-test&d=easy', storage);
    await boardShown();
    act(() =>
      store.getState().setStats({
        played: 3,
        won: 2,
        streak: 2,
        bestStreak: 2,
        bestTimeMs: { easy: 61_000, medium: null, hard: null },
      }),
    );
    fireEvent.click(tid('stats-button'));
    expect(tid('stats-played')).toHaveTextContent('3');
    expect(tid('stats-won')).toHaveTextContent('2');
    expect(tid('stats-best-easy')).toHaveTextContent('01:01');
    expect(tid('stats-best-hard')).toHaveTextContent('–');
    expect(screen.queryByTestId('stats-avg-hints')).toBeNull();
    fireEvent.click(tid('stats-reset'));
    fireEvent.click(tid('stats-reset-no'));
    expect(store.getState().stats.won).toBe(2);
    fireEvent.click(tid('stats-reset'));
    fireEvent.click(tid('stats-reset-yes'));
    await waitFor(() => expect(store.getState().stats.won).toBe(0));
  });

  it('Share copies a link with seed and difficulty only', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await boot('/?seed=persist-test&d=easy', new MemoryStorage());
    await boardShown();
    fireEvent.click(tid('share-button'));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0]![0]).toMatch(/\?seed=persist-test&d=easy$/);
  });

  it('opens the rules on first visit via showRulesOnLoad', async () => {
    await boot('/?seed=persist-test&d=easy', new MemoryStorage(), { showRulesOnLoad: true });
    expect(tid('rules-dialog')).toBeInTheDocument();
  });
});
