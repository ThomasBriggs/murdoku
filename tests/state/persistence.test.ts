import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HISTORY_SAVE_CAP,
  KEY_CURRENT,
  KEY_SEEN_RULES,
  KEY_SETTINGS,
  KEY_STATS,
  SAVE_SCHEMA,
  clearCurrent,
  connectPersistence,
  hasSeenRules,
  hydrateStore,
  loadCurrent,
  loadSettings,
  loadStats,
  markRulesSeen,
  parseSavedGame,
  saveCurrent,
  serialiseGame,
  toSavedGame,
} from '../../src/state/persistence';
import { emptyAnnotations } from '../../src/state/annotations';
import {
  MemoryStorage,
  SEED,
  ThrowingStorage,
  buildComplexState,
  makeStore,
  solved,
  startedStore,
  truth,
  wrongCells,
} from './persistence-helpers';

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.removeAttribute('data-theme');
});

describe('saved game round trip', () => {
  it('restores a complex state exactly (incl. history, what-if depth 2, all annotation kinds)', async () => {
    const a = await startedStore();
    buildComplexState(a);
    a.getState().tick(12345);
    await a.getState().check();
    const before = a.getState();
    expect(before.whatIfStack).toHaveLength(2);
    expect(before.history.past.length).toBeGreaterThan(10);
    // undo one step so redo history is saved too
    a.getState().undo();
    const s = a.getState();

    const storage = new MemoryStorage();
    expect(saveCurrent(storage, toSavedGame(s)!)).toBe(true);
    const loaded = loadCurrent(storage)!;
    expect(loaded).not.toBeNull();

    const b = makeStore();
    await b.getState().resumeGame(loaded);
    const r = b.getState();
    expect(r.status).toBe('playing');
    expect(r.puzzle).toEqual(s.puzzle);
    expect(r.placements).toEqual(s.placements);
    expect(r.tentativePlacements).toEqual(s.tentativePlacements);
    expect(r.annotations).toEqual(s.annotations);
    expect(r.whatIfStack).toEqual(s.whatIfStack);
    expect(r.history).toEqual(s.history);
    expect(r.elapsedMs).toBe(12345);
    expect(r.checksUsed).toBe(1);
    expect(r.startedAt).toBe(s.startedAt);
    expect(r.running).toBe(true);

    // undo still works after the reload
    expect(b.getState().undo()).toBe(true);
    expect(b.getState().redo()).toBe(true);
    expect(b.getState().annotations).toEqual(s.annotations);
  });

  it('restores a won game as solved and read-only, without a win being re-recorded', async () => {
    const a = await startedStore();
    truth.puzzle.people.forEach((p) => a.getState().place(p.id, solved[p.id]!));
    const killer = truth.solution.murdererId;
    await a.getState().accuse(killer);
    expect(a.getState().status).toBe('won');
    expect(a.getState().stats.won).toBe(1);

    const saved = toSavedGame(a.getState())!;
    const b = makeStore();
    await b.getState().resumeGame(saved);
    expect(b.getState().status).toBe('won');
    expect(b.getState().running).toBe(false);
    expect(b.getState().stats.won).toBe(0); // stats come from storage, not from restoring
    expect(b.getState().place(0, wrongCells(b, 1)[0]!)).toBe('refused');
  });

  it('a generator version mismatch on resume ends in an error, not a corrupted board', async () => {
    const a = await startedStore();
    const saved = { ...toSavedGame(a.getState())!, generatorVersion: 999 };
    const b = makeStore();
    await b.getState().resumeGame(saved);
    expect(b.getState().status).toBe('idle');
    expect(b.getState().error).toMatch(/different puzzle generator/);
  });
});

describe('solution never stored', () => {
  it('saved JSON has no solution, puzzle view or unplaced-person cells', async () => {
    const a = await startedStore();
    buildComplexState(a);
    for (let i = 0; i < 3; i++) await a.getState().check(); // checks must not leak either
    const storage = new MemoryStorage();
    saveCurrent(storage, toSavedGame(a.getState())!);
    const text = storage.getItem(KEY_CURRENT)!;
    for (const word of ['solution', 'murdererId', 'cellOf', 'solutionHash', 'clues', 'furniture'])
      expect(text).not.toContain(`"${word}"`);
    const saved = JSON.parse(text) as { placements: Record<number, number | null> };
    // Exactly what the player placed: people 0 and 1 (and 5 inside the what-if), nobody else.
    const placed = Object.entries(saved.placements).filter(([, c]) => c !== null);
    expect(placed.map(([id]) => Number(id)).sort()).toEqual([0, 1, 5]);
    for (const [id, cell] of placed) expect(cell).not.toBe(solved[Number(id)]);
    // None of the solution cells of the unplaced people appears as a placement value.
    const values = Object.values(saved.placements);
    for (const id of [2, 3, 4, 6, 7, 8]) expect(values).not.toContain(solved[id]);
  });
});

describe('history cap and size budget', () => {
  it('stores only the last 500 undo steps', async () => {
    const a = await startedStore();
    const cells = wrongCells(a, 5);
    for (let i = 0; i < 520; i++) a.getState().applyMark([cells[i % 2]!], 'cross');
    expect(a.getState().history.past.length).toBe(500);
    const game = toSavedGame(a.getState())!;
    game.history.past = [...game.history.past, ...game.history.past.slice(0, 50)];
    const json = JSON.parse(serialiseGame(game)) as { history: { past: unknown[] } };
    expect(json.history.past).toHaveLength(HISTORY_SAVE_CAP);
  });

  it('over budget drops the oldest history first and never the board', async () => {
    const a = await startedStore();
    buildComplexState(a);
    const cells = wrongCells(a, 20);
    for (let i = 0; i < 60; i++) a.getState().applyMark([cells[i % 20]!], 'dot');
    const game = toSavedGame(a.getState())!;
    const full = serialiseGame(game, Infinity);
    const budget = Math.floor(full.length / 2);
    const small = serialiseGame(game, budget);
    expect(small.length).toBeLessThanOrEqual(budget);
    const parsed = JSON.parse(small) as typeof game;
    expect(parsed.history.past.length).toBeLessThan(game.history.past.length);
    // the newest steps are the ones kept
    expect(parsed.history.past.at(-1)).toEqual(
      JSON.parse(JSON.stringify(game.history.past.at(-1))),
    );
    // board untouched
    expect(parsed.placements).toEqual(game.placements);
    expect(parsed.annotations).toEqual(JSON.parse(JSON.stringify(game.annotations)));
    expect(parsed.whatIfStack).toEqual(JSON.parse(JSON.stringify(game.whatIfStack)));

    // even a tiny budget keeps the board and empties the history
    const tiny = JSON.parse(serialiseGame(game, 10)) as typeof game;
    expect(tiny.history.past).toHaveLength(0);
    expect(tiny.history.future).toHaveLength(0);
    expect(tiny.placements).toEqual(game.placements);
    expect(parseSavedGame(tiny)).not.toBeNull();
  });
});

describe('debounce and flush', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('saves ~500 ms after the last change, once', async () => {
    const store = await startedStore();
    vi.useFakeTimers();
    const p = connectPersistence(store, { storage });
    const cells = wrongCells(store, 3);
    store.getState().applyMark([cells[0]!], 'cross');
    vi.advanceTimersByTime(300);
    store.getState().applyMark([cells[1]!], 'cross');
    vi.advanceTimersByTime(300);
    expect(storage.getItem(KEY_CURRENT)).toBeNull(); // debounced: nothing yet
    vi.advanceTimersByTime(250);
    const saved = loadCurrent(storage)!;
    expect(Object.keys(saved.annotations.cellMarks)).toHaveLength(2);
    p.dispose();
  });

  it('flushes immediately on pagehide and when the tab is hidden', async () => {
    const store = await startedStore();
    vi.useFakeTimers();
    const p = connectPersistence(store, { storage });
    store.getState().applyMark([wrongCells(store, 1)[0]!], 'cross');
    expect(storage.getItem(KEY_CURRENT)).toBeNull();
    window.dispatchEvent(new Event('pagehide'));
    expect(loadCurrent(storage)!.annotations.cellMarks).not.toEqual({});

    storage.removeItem(KEY_CURRENT);
    store.getState().applyMark([wrongCells(store, 2)[1]!], 'dot');
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    expect(loadCurrent(storage)).not.toBeNull();
    p.dispose();
  });

  it('timer ticks alone save only every few seconds', async () => {
    const store = await startedStore();
    vi.useFakeTimers();
    let t = 1_000;
    const p = connectPersistence(store, { storage, now: () => t });
    store.getState().tick(250);
    vi.advanceTimersByTime(600);
    expect(storage.getItem(KEY_CURRENT)).toBeNull();
    t += 6000;
    store.getState().tick(250);
    vi.advanceTimersByTime(600);
    expect(loadCurrent(storage)!.elapsedMs).toBe(500);
    p.dispose();
  });

  it('does not save while no puzzle is ready, and stops after dispose', async () => {
    const store = makeStore();
    vi.useFakeTimers();
    const p = connectPersistence(store, { storage });
    window.dispatchEvent(new Event('pagehide'));
    expect(storage.getItem(KEY_CURRENT)).toBeNull();
    p.dispose();
    window.dispatchEvent(new Event('pagehide'));
    expect(storage.getItem(KEY_CURRENT)).toBeNull();
  });

  it('saves settings and stats as they change', async () => {
    const store = await startedStore();
    const p = connectPersistence(store, { storage });
    store.getState().updateSettings({ theme: 'dark', autoCross: false });
    expect(loadSettings(storage)).toMatchObject({ theme: 'dark', autoCross: false });
    store.getState().setStats({ ...store.getState().stats, played: 4 });
    expect(loadStats(storage).played).toBe(4);
    p.dispose();
  });
});

describe('throwing storage', () => {
  it('never throws and the game keeps working', async () => {
    const bad = new ThrowingStorage();
    expect(loadCurrent(bad)).toBeNull();
    expect(loadSettings(bad).theme).toBe('system');
    expect(loadStats(bad).played).toBe(0);
    expect(hasSeenRules(bad)).toBe(false);
    expect(() => markRulesSeen(bad)).not.toThrow();
    expect(() => clearCurrent(bad)).not.toThrow();

    const store = await startedStore();
    expect(saveCurrent(bad, toSavedGame(store.getState())!)).toBe(false);
    vi.useFakeTimers();
    const p = connectPersistence(store, { storage: bad });
    store.getState().updateSettings({ theme: 'dark' });
    store.getState().place(0, wrongCells(store, 1)[0]!);
    vi.advanceTimersByTime(1000);
    window.dispatchEvent(new Event('pagehide'));
    expect(store.getState().placements[0]).not.toBeNull();
    expect(() => hydrateStore(store, bad)).not.toThrow();
    p.dispose();
    // null storage (localStorage inaccessible) behaves the same
    expect(loadCurrent(null)).toBeNull();
    expect(saveCurrent(null, toSavedGame(store.getState())!)).toBe(false);
  });
});

describe('loading and migration', () => {
  it('ignores corrupt or malformed saves', () => {
    const s = new MemoryStorage();
    s.setItem(KEY_CURRENT, '{not json');
    expect(loadCurrent(s)).toBeNull();
    s.setItem(KEY_CURRENT, JSON.stringify({ seed: 'x' }));
    expect(loadCurrent(s)).toBeNull();
    s.setItem(KEY_CURRENT, JSON.stringify([1, 2]));
    expect(loadCurrent(s)).toBeNull();
  });

  it('calls the migration hook for older schemas and refuses newer ones', async () => {
    const a = await startedStore();
    const base = toSavedGame(a.getState())!;
    const old = { ...base, schema: 0, placements: undefined, legacyPlacements: base.placements };
    const migrate = vi.fn((raw: Record<string, unknown>) => ({
      ...raw,
      placements: raw.legacyPlacements,
    }));
    const storage = new MemoryStorage();
    storage.setItem(KEY_CURRENT, JSON.stringify(old));
    // no migration registered: unusable
    expect(loadCurrent(storage, {}, SAVE_SCHEMA)).toBeNull();
    const ok = loadCurrent(storage, { 0: migrate }, SAVE_SCHEMA);
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(ok?.schema).toBe(SAVE_SCHEMA);
    expect(ok?.placements).toEqual(base.placements);
    // a save from a newer app is left alone
    storage.setItem(KEY_CURRENT, JSON.stringify({ ...base, schema: SAVE_SCHEMA + 1 }));
    expect(loadCurrent(storage)).toBeNull();
  });

  it('fills defaults for missing annotation fields', async () => {
    const a = await startedStore();
    const base = toSavedGame(a.getState())!;
    const raw = { ...base, annotations: { scratchpad: 'hi' } };
    const g = parseSavedGame(raw)!;
    expect(g.annotations.scratchpad).toBe('hi');
    expect(g.annotations.logicGrid).toEqual(emptyAnnotations().logicGrid);
  });
});

describe('settings, stats storage and the rules flag', () => {
  it('hydrates settings before render and applies the theme', async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      KEY_SETTINGS,
      JSON.stringify({ theme: 'dark', autoCross: false, linkLogicGrid: true, bogus: 1 }),
    );
    const store = makeStore();
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    hydrateStore(store, storage);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(store.getState().settings).toMatchObject({
      theme: 'dark',
      autoCross: false,
      linkLogicGrid: true,
      conflictHighlight: true,
    });
  });

  it('rejects bad setting values', () => {
    const s = new MemoryStorage();
    s.setItem(KEY_SETTINGS, JSON.stringify({ theme: 'neon', autoCross: 'yes' }));
    expect(loadSettings(s)).toMatchObject({ theme: 'system', autoCross: true });
  });

  it('defaults the quick bar to Erase and Cross, and keeps only known items in bar order', () => {
    const s = new MemoryStorage();
    expect(loadSettings(s).quickBar).toEqual(['erase', 'cross']);
    s.setItem(
      KEY_SETTINGS,
      JSON.stringify({ quickBar: ['logic', 'notes', 'dot', 'place', 'dot', 42, 'erase'] }),
    );
    expect(loadSettings(s).quickBar).toEqual(['erase', 'dot', 'logic']);
    s.setItem(KEY_SETTINGS, JSON.stringify({ quickBar: [] }));
    expect(loadSettings(s).quickBar).toEqual([]);
    s.setItem(KEY_SETTINGS, JSON.stringify({ quickBar: 'cross' }));
    expect(loadSettings(s).quickBar).toEqual(['erase', 'cross']);
  });

  it('remembers that the rules were seen', () => {
    const s = new MemoryStorage();
    expect(hasSeenRules(s)).toBe(false);
    markRulesSeen(s);
    expect(hasSeenRules(s)).toBe(true);
    expect(s.getItem(KEY_SEEN_RULES)).toBe('true');
  });

  it('uses the keys from the spec', () => {
    expect([KEY_CURRENT, KEY_STATS, KEY_SETTINGS]).toEqual([
      'murdoku:v1:current',
      'murdoku:v1:stats',
      'murdoku:v1:settings',
    ]);
  });
});

describe('seed identity', () => {
  it('records the seed and generator version of the puzzle', async () => {
    const a = await startedStore();
    const g = toSavedGame(a.getState())!;
    expect(g.seed).toBe(SEED);
    expect(g.generatorVersion).toBe(truth.puzzle.version);
    expect(g.difficulty).toBe('easy');
  });
});
