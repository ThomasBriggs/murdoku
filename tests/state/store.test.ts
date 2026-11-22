import { beforeEach, describe, expect, it } from 'vitest';
import { generatePuzzle } from '../../src/engine/generator';
import { cellKey, type CellKey } from '../../src/engine/types';
import { allPlaced, createGameStore, selectConflicts, selectUnplaced } from '../../src/state/store';
import { HISTORY_CAP } from '../../src/state/history';
import { toSavedGame } from '../../src/state/persistence';
import { createEngineClient } from '../../src/worker/client';
import { createInProcessWorker } from '../../src/worker/inprocess';

const SEED = 'cy-test';
const truth = generatePuzzle(SEED, 'easy');
const solved: CellKey[] = truth.solution.cellOf.map((c) => cellKey(c));

function setup() {
  return createGameStore({
    client: createEngineClient({ workerFactory: createInProcessWorker }),
    randomSeed: () => 'random-seed',
  });
}
async function started() {
  const store = setup();
  await store.getState().newGame(SEED, 'easy');
  return store;
}

describe('game store', () => {
  let store: ReturnType<typeof setup>;
  beforeEach(async () => {
    store = await started();
  });

  it('newGame generates, uses a random seed when none is given', async () => {
    expect(store.getState().status).toBe('playing');
    expect(store.getState().puzzle?.seed).toBe(SEED);
    expect(store.getState().running).toBe(true);
    await store.getState().newGame(undefined, 'easy');
    expect(store.getState().puzzle?.seed).toBe('random-seed');
  });

  it('newGame failure returns to idle with an error', async () => {
    const bad = createGameStore({
      client: createEngineClient({
        workerFactory: () => {
          throw new Error('boom');
        },
      }),
    });
    await bad.getState().newGame('x', 'easy');
    expect(bad.getState().status).toBe('idle');
    expect(bad.getState().error).toContain('boom');
  });

  it('ignores a stale generate result', async () => {
    const s = setup();
    const first = s.getState().newGame('a', 'easy');
    const second = s.getState().newGame(SEED, 'easy');
    await Promise.all([first, second]);
    expect(s.getState().puzzle?.seed).toBe(SEED);
  });

  it('selectPerson, place, move, displace and remove', () => {
    const g = () => store.getState();
    g().selectPerson(2);
    expect(g().selectedPerson).toBe(2);
    expect(g().place(0, solved[0]!)).toBe('placed');
    expect(g().placements[0]).toBe(solved[0]);
    expect(g().place(0, solved[0]!)).toBe('noop');
    expect(g().place(0, solved[1]!)).toBe('moved');
    expect(g().placements[0]).toBe(solved[1]);
    expect(g().place(1, solved[1]!)).toBe('displaced');
    expect(g().placements[0]).toBeNull();
    expect(g().placements[1]).toBe(solved[1]);
    expect(g().remove(1)).toBe(true);
    expect(g().remove(1)).toBe(false);
    expect(g().placements[1]).toBeNull();
  });

  it('refuses blocking cells and leaves state and history untouched', () => {
    const puzzle = store.getState().puzzle!;
    let blocked: CellKey | null = null;
    for (let r = 0; r < 9 && blocked === null; r++)
      for (let c = 0; c < 9; c++) {
        const f = puzzle.furniture[r]![c];
        if (f === 'table' || f === 'bed' || f === 'piano' || f === 'car' || f === 'wardrobe') {
          if (store.getState().place(0, cellKey(r, c)) === 'refused') {
            blocked = cellKey(r, c);
            break;
          }
          store.getState().undo();
        }
      }
    expect(blocked).not.toBeNull();
    expect(store.getState().placements[0]).toBeNull();
    expect(store.getState().history.past).toHaveLength(0);
  });

  it('undo / redo / reset', () => {
    const g = () => store.getState();
    g().place(0, solved[0]!);
    g().place(1, solved[1]!);
    expect(g().undo()).toBe(true);
    expect(g().placements[1]).toBeNull();
    expect(g().placements[0]).toBe(solved[0]);
    expect(g().redo()).toBe(true);
    expect(g().placements[1]).toBe(solved[1]);
    expect(g().redo()).toBe(false);
    g().reset();
    expect(selectUnplaced(g())).toHaveLength(9);
    expect(g().undo()).toBe(true);
    expect(g().placements[1]).toBe(solved[1]);
    // a new action clears redo
    g().undo();
    g().place(2, solved[2]!);
    expect(g().redo()).toBe(false);
  });

  it('reset on an empty board records nothing', () => {
    store.getState().reset();
    expect(store.getState().history.past).toHaveLength(0);
  });

  it('caps history at 500', () => {
    const g = () => store.getState();
    const [a, b] = [solved[0]!, solved[1]!];
    for (let i = 0; i < HISTORY_CAP + 50; i++) g().place(0, i % 2 ? a : b);
    expect(g().history.past.length).toBe(HISTORY_CAP);
  });

  it('conflicts selector reports rule breaks without the solution', () => {
    const g = () => store.getState();
    expect(selectConflicts(g())).toEqual([]);
    g().place(0, solved[0]!);
    const row = Math.floor(solved[0]! / 9);
    let placed = false;
    for (let c = 0; c < 9 && !placed; c++) {
      const k = row * 9 + c;
      if (k !== solved[0]) placed = g().place(1, k) === 'placed';
    }
    expect(placed).toBe(true);
    expect(selectConflicts(g()).some((v) => v.kind === 'row' && v.persons.includes(1))).toBe(true);
  });

  it('allPlaced and unplaced', () => {
    const g = () => store.getState();
    expect(allPlaced(g())).toBe(false);
    solved.forEach((k, i) => g().place(i, k));
    expect(allPlaced(g())).toBe(true);
    expect(selectConflicts(g())).toEqual([]);
  });

  it('check increments its counter', async () => {
    const g = () => store.getState();
    g().place(0, solved[0]!);
    const c = await g().check();
    expect(c).toEqual({ correct: [0], wrong: [] });
    expect(g().checksUsed).toBe(1);
  });

  it('accuse needs all placed, reports a wrong suspect, then wins', async () => {
    const g = () => store.getState();
    expect(await g().accuse(0)).toBeNull();
    solved.forEach((k, i) => g().place(i, k));
    const murderer = truth.solution.murdererId;
    const wrong = await g().accuse((murderer + 1) % 9);
    expect(wrong).toMatchObject({ placementCorrect: true, accusationCorrect: false, won: false });
    expect(g().status).toBe('playing');
    const win = await g().accuse(murderer);
    expect(win?.won).toBe(true);
    expect(g().status).toBe('won');
    expect(g().running).toBe(false);
    expect(g().place(0, solved[3]!)).toBe('refused');
  });

  it('a win inside nested what-if keeps the board and closes every level', async () => {
    const g = () => store.getState();
    g().startWhatIf();
    g().startWhatIf();
    expect(g().whatIfStack).toHaveLength(2);
    solved.forEach((k, i) => g().place(i, k));
    const win = await g().accuse(truth.solution.murdererId);
    expect(win?.won).toBe(true);
    expect(g().status).toBe('won');
    expect(g().whatIfStack).toEqual([]);
    expect(Object.values(g().placements)).toEqual(solved);
    expect(g().undo()).toBe(false);
    expect(g().whatIfStack).toEqual([]);
    expect(toSavedGame(g())?.whatIfStack).toEqual([]);
  });

  it('crossClearNotes wipes notes and crosses in one undoable step', () => {
    const g = () => store.getState();
    const k = solved[0]!;
    g().applyCandidate([k], 1);
    g().applyCandidate([k], 2, true);
    g().applyMark([k], 'dot');
    expect(g().crossClearNotes([k])).toBe(true);
    expect(g().annotations.cellMarks[k]).toBe('cross');
    expect(g().annotations.candidates[k]).toBeUndefined();
    expect(g().crossClearNotes([k])).toBe(false); // nothing left to change
    expect(g().undo()).toBe(true);
    expect(g().annotations.cellMarks[k]).toBe('dot');
    expect(g().annotations.candidates[k]).toEqual({
      yes: expect.any(Number),
      no: expect.any(Number),
    });
  });

  it('timer ticks only while running; settings update', () => {
    const g = () => store.getState();
    g().tick(1000);
    expect(g().elapsedMs).toBe(1000);
    g().setRunning(false);
    g().tick(1000);
    expect(g().elapsedMs).toBe(1000);
    g().updateSettings({ autoCross: false, theme: 'dark' });
    expect(g().settings).toMatchObject({
      autoCross: false,
      theme: 'dark',
      conflictHighlight: true,
    });
  });

  it('newGame resets counters and history', async () => {
    const g = () => store.getState();
    g().place(0, solved[0]!);
    await g().check();
    await g().newGame(SEED, 'easy');
    expect(g().checksUsed).toBe(0);
    expect(g().history.past).toHaveLength(0);
    expect(selectUnplaced(g())).toHaveLength(9);
  });
});
