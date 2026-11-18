import { generatePuzzle } from '../../src/engine/generator';
import { cellKey, type CellKey } from '../../src/engine/types';
import type { StorageLike } from '../../src/state/persistence';
import { createGameStore } from '../../src/state/store';
import { createEngineClient } from '../../src/worker/client';
import { createInProcessWorker } from '../../src/worker/inprocess';

export const SEED = 'persist-test';
export const truth = generatePuzzle(SEED, 'easy');
export const solved: CellKey[] = truth.solution.cellOf.map((c) => cellKey(c));

export function makeStore() {
  return createGameStore({
    client: createEngineClient({ workerFactory: createInProcessWorker }),
    randomSeed: () => 'random-seed',
  });
}
export type TestStore = ReturnType<typeof makeStore>;

export async function startedStore(seed = SEED, difficulty: 'easy' | 'medium' | 'hard' = 'easy') {
  const store = makeStore();
  await store.getState().newGame(seed, difficulty);
  return store;
}

export class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

export class ThrowingStorage implements StorageLike {
  getItem(): string | null {
    throw new Error('storage disabled');
  }
  setItem(): void {
    throw new Error('quota exceeded');
  }
  removeItem(): void {
    throw new Error('storage disabled');
  }
}

/** Free (non-furniture) cells that are NOT anybody's solution cell. */
export function wrongCells(store: TestStore, n: number): CellKey[] {
  const p = store.getState().puzzle!;
  const out: CellKey[] = [];
  for (let r = 0; r < 9 && out.length < n; r++)
    for (let c = 0; c < 9 && out.length < n; c++) {
      const k = cellKey(r, c);
      if (p.furniture[r]![c] === null && !solved.includes(k)) out.push(k);
    }
  return out;
}

/** A board with placements, tentative guesses, every annotation kind and a 2-deep what-if. */
export function buildComplexState(store: TestStore): void {
  const g = () => store.getState();
  const cells = wrongCells(store, 12);
  g().place(0, cells[0]!);
  g().place(1, cells[1]!);
  g().placeTentative(2, cells[2]!);
  g().applyMark([cells[3]!, cells[4]!], 'cross');
  g().applyMark([cells[5]!], 'dot');
  g().applyMark([cells[6]!], 'unsure');
  g().applyCandidate([cells[7]!], 3);
  g().applyCandidate([cells[7]!], 4, true);
  g().applyHighlight([cells[8]!], 'blue');
  g().setRowNote(1, 'row note');
  g().setColNote(2, 'col note');
  g().setRoomNote(0, 'room note');
  g().toggleClueTick(3, 0);
  g().toggleClueStruck(4);
  g().addClueHighlight(3, 0, 4, 'green');
  g().setPersonNote(3, 'suspicious');
  g().cycleLogicCell('rooms', 1, 2);
  g().cycleLogicCell('rows', 2, 3);
  g().cycleLogicCell('cols', 3, 4);
  g().addStroke({
    tool: 'pen',
    color: 'red',
    width: 3,
    pts: [
      [0, 0],
      [10, 5],
      [20, 30],
    ],
  });
  g().setScratchpad('thinking about the cook');
  g().startWhatIf();
  g().place(5, cells[9]!);
  g().startWhatIf();
  g().applyMark([cells[10]!], 'cross');
  g().setLayerVisible('drawing', false);
}
