import { describe, expect, it } from 'vitest';
import {
  averageHints,
  emptyStats,
  normaliseStats,
  recordAbandon,
  recordWin,
} from '../../src/state/stats';
import { solved, startedStore, truth, wrongCells } from './persistence-helpers';

describe('stats rules', () => {
  it('counts wins, best time per difficulty, streaks and average hints', () => {
    let s = emptyStats();
    let r = recordWin(s, 'easy', 90_000, 2);
    expect(r.newBest).toBe(true);
    s = r.stats;
    r = recordWin(s, 'easy', 120_000, 0);
    expect(r.newBest).toBe(false);
    s = r.stats;
    r = recordWin(s, 'easy', 60_000, 1);
    expect(r.newBest).toBe(true);
    s = r.stats;
    r = recordWin(s, 'hard', 300_000, 3);
    s = r.stats;
    expect(s).toMatchObject({ played: 4, won: 4, streak: 4, bestStreak: 4 });
    expect(s.bestTimeMs).toEqual({ easy: 60_000, medium: null, hard: 300_000 });
    expect(averageHints(s)).toBe(1.5);
  });

  it('abandoning a game with a placement counts as played and resets the streak', () => {
    let s = recordWin(emptyStats(), 'easy', 1000, 0).stats;
    s = recordWin(s, 'easy', 1000, 0).stats;
    s = recordAbandon(s, true);
    expect(s).toMatchObject({ played: 3, won: 2, streak: 0, bestStreak: 2 });
    s = recordWin(s, 'easy', 1000, 0).stats;
    expect(s.streak).toBe(1);
    expect(s.bestStreak).toBe(2);
  });

  it('abandoning an empty game changes nothing', () => {
    const s = recordWin(emptyStats(), 'easy', 1000, 0).stats;
    expect(recordAbandon(s, false)).toBe(s);
  });

  it('average hints is null with no wins; malformed stats normalise', () => {
    expect(averageHints(emptyStats())).toBeNull();
    expect(normaliseStats({ played: 'x', won: -3, bestTimeMs: { easy: 5, hard: 'q' } })).toEqual({
      ...emptyStats(),
      bestTimeMs: { easy: 5, medium: null, hard: null },
    });
    expect(normaliseStats(null)).toEqual(emptyStats());
  });
});

describe('stats in the store', () => {
  it('records a win with the elapsed time and hints, and flags a new best', async () => {
    const store = await startedStore();
    store.getState().tick(65_000);
    await store.getState().hint();
    truth.puzzle.people.forEach((p) => store.getState().place(p.id, solved[p.id]!));
    await store.getState().accuse(truth.solution.murdererId);
    const s = store.getState();
    expect(s.stats).toMatchObject({ played: 1, won: 1, streak: 1, winHints: 1 });
    expect(s.stats.bestTimeMs.easy).toBe(65_000);
    expect(s.newBest).toBe(true);
    // a new game clears the flag and a won game is not an abandon
    await store.getState().newGame('another', 'easy');
    expect(store.getState().newBest).toBe(false);
    expect(store.getState().stats).toMatchObject({ played: 1, streak: 1 });
  });

  it('starting a new game over one with a placement abandons it; over marks only does not', async () => {
    const store = await startedStore();
    store.getState().applyMark([wrongCells(store, 1)[0]!], 'cross');
    await store.getState().newGame('two', 'easy');
    expect(store.getState().stats.played).toBe(0);
    store.getState().place(0, wrongCells(store, 1)[0]!);
    await store.getState().newGame('three', 'easy');
    expect(store.getState().stats).toMatchObject({ played: 1, won: 0, streak: 0 });
  });

  it('abandonSaved counts only unwon saves with a placement; resetStats clears', async () => {
    const store = await startedStore();
    const placements = { ...store.getState().placements, 0: 0 as never };
    store.getState().abandonSaved({ placements, status: 'won' });
    expect(store.getState().stats.played).toBe(0);
    store.getState().abandonSaved({ placements: store.getState().placements, status: 'playing' });
    expect(store.getState().stats.played).toBe(0);
    store.getState().abandonSaved({ placements, status: 'playing' });
    expect(store.getState().stats.played).toBe(1);
    store.getState().resetStats();
    expect(store.getState().stats).toEqual(emptyStats());
  });
});
