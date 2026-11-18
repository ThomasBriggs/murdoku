import { beforeEach, describe, expect, it } from 'vitest';
import { allowedCells } from '../../src/engine/clues/evaluate';
import { setHas } from '../../src/engine/cellset';
import { generatePuzzle } from '../../src/engine/generator';
import { cellKey, type CellKey } from '../../src/engine/types';
import {
  addStroke,
  cycleLogicCell,
  emptyAnnotations,
  removeStrokes,
  slotOf,
  type Stroke,
} from '../../src/state/annotations';
import {
  ERASER_RADIUS,
  simplifyRDP,
  strokeHit,
  strokePath,
  strokesTouched,
  toGridPoint,
  type Pt,
} from '../../src/state/drawing';
import { logicPossibleCells } from '../../src/state/logicGrid';
import {
  createGameStore,
  DEFAULT_SETTINGS,
  undoableOf,
  WHATIF_MAX_DEPTH,
  type GameStore,
} from '../../src/state/store';
import { createEngineClient } from '../../src/worker/client';
import { createInProcessWorker } from '../../src/worker/inprocess';
import type { StoreApi } from 'zustand/vanilla';

type Store = StoreApi<GameStore>;

async function started(): Promise<Store> {
  const store = createGameStore({
    client: createEngineClient({ workerFactory: createInProcessWorker }),
  });
  await store.getState().newGame('cy-adv', 'easy');
  return store;
}

function freeCells(store: Store): CellKey[] {
  const f = store.getState().puzzle!.furniture;
  const out: CellKey[] = [];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const t = f[r]![c];
      if (t === null || ['chair', 'armchair', 'sofa', 'bed', 'rug'].includes(t!))
        out.push(cellKey(r, c));
    }
  return out;
}

const stroke = (pts: Pt[], over: Partial<Stroke> = {}): Stroke => ({
  tool: 'pen',
  color: 'blue',
  width: 0.1,
  pts,
  ...over,
});

describe('logic grid', () => {
  it('cycles blank, cross, tick, blank', () => {
    let a = emptyAnnotations();
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      a = cycleLogicCell(a, 'rooms', 2, 3);
      seen.push(a.logicGrid.rooms[2]![3]!);
    }
    expect(seen).toEqual([1, 2, 0, 1]);
    expect(a.logicGrid.rooms[1]![3]).toBe(0);
    expect(cycleLogicCell(a, 'rows', 9, 0)).toBe(a);
    expect(cycleLogicCell(a, 'cols', 0, 9)).toBe(a);
  });

  it('link shading comes only from ticks, and respects crossed rows/columns', () => {
    const roomOf = [
      [0, 0, 1],
      [0, 1, 1],
      [2, 2, 2],
    ];
    const grid = emptyAnnotations().logicGrid;
    expect(logicPossibleCells(grid, roomOf, 0)).toBeNull();
    grid.rooms[0]![1] = 1; // a cross alone shades nothing
    expect(logicPossibleCells(grid, roomOf, 0)).toBeNull();
    grid.rooms[0]![1] = 2;
    expect([...logicPossibleCells(grid, roomOf, 0)!].sort()).toEqual(
      [cellKey(0, 2), cellKey(1, 1), cellKey(1, 2)].sort(),
    );
    grid.cols[0]![2] = 1; // column C crossed
    expect([...logicPossibleCells(grid, roomOf, 0)!]).toEqual([cellKey(1, 1)]);
    grid.rows[0]![0] = 2; // only row 1 ticked
    expect([...logicPossibleCells(grid, roomOf, 0)!]).toEqual([]);
    expect(logicPossibleCells(grid, roomOf, 1)).toBeNull();
  });

  it('is undoable through the store', async () => {
    const store = await started();
    expect(store.getState().cycleLogicCell('rows', 0, 4)).toBe(true);
    expect(store.getState().annotations.logicGrid.rows[0]![4]).toBe(1);
    store.getState().undo();
    expect(store.getState().annotations.logicGrid.rows[0]![4]).toBe(0);
  });
});

describe('drawing geometry', () => {
  it('simplifies collinear points away and keeps corners and end points', () => {
    const line: Pt[] = Array.from({ length: 20 }, (_, i) => [Math.round(i * 10) / 100, 1]);
    expect(simplifyRDP(line)).toEqual([
      [0, 1],
      [1.9, 1],
    ]);
    const bent: Pt[] = [
      [0, 0],
      [1, 0.001],
      [2, 0],
      [2, 1],
      [2, 2],
    ];
    expect(simplifyRDP(bent)).toEqual([
      [0, 0],
      [2, 0],
      [2, 2],
    ]);
    expect(simplifyRDP([[1, 1]])).toEqual([[1, 1]]);
    expect(simplifyRDP([])).toEqual([]);
  });

  it('normalises screen points to 0-9 grid units and clamps', () => {
    const rect = { left: 100, top: 50, width: 450, height: 450 };
    expect(toGridPoint(100, 50, rect)).toEqual([0, 0]);
    expect(toGridPoint(550, 500, rect)).toEqual([9, 9]);
    expect(toGridPoint(325, 275, rect)).toEqual([4.5, 4.5]);
    expect(toGridPoint(0, 9999, rect)).toEqual([0, 9]);
    // the same gesture on a half-size board gives the same grid coordinates
    expect(toGridPoint(100 + 225 / 2, 50 + 225 / 2, { ...rect, width: 225, height: 225 })).toEqual([
      4.5, 4.5,
    ]);
  });

  it('hit-tests the eraser against stroke segments, including thickness', () => {
    const s = stroke([
      [1, 1],
      [5, 1],
    ]);
    expect(strokeHit(s, [3, 1])).toBe(true);
    expect(strokeHit(s, [3, 1 + ERASER_RADIUS + 0.04])).toBe(true); // within half the width
    expect(strokeHit(s, [3, 2])).toBe(false);
    expect(strokeHit(s, [6, 1])).toBe(false);
    const strokes = [
      s,
      stroke([
        [1, 4],
        [5, 4],
      ]),
    ];
    expect(strokesTouched(strokes, [3, 0], [3, 2])).toEqual([0]); // sweeping through, no skipping
    expect(strokesTouched(strokes, [3, 0], [3, 5])).toEqual([0, 1]);
    expect(strokesTouched(strokes, [3, 0], [3, 5], ERASER_RADIUS, new Set([0]))).toEqual([1]);
  });

  it('builds a path, with a dot for a single point', () => {
    expect(
      strokePath([
        [1, 2],
        [3, 4],
      ]),
    ).toBe('M1 2 L3 4');
    expect(strokePath([[1, 2]])).toMatch(/^M1 2 L1\.001 2$/);
  });

  it('addStroke simplifies; removeStrokes drops by index', () => {
    const line: Pt[] = Array.from({ length: 30 }, (_, i) => [i * 0.1, 2]);
    let a = addStroke(emptyAnnotations(), stroke(line));
    expect(a.strokes[0]!.pts).toHaveLength(2);
    a = addStroke(a, stroke([[1, 1]]));
    expect(a.strokes).toHaveLength(2);
    expect(removeStrokes(a, [5])).toBe(a);
    expect(removeStrokes(a, [0]).strokes).toHaveLength(1);
    expect(addStroke(a, stroke([]))).toBe(a);
  });
});

describe('store: strokes and scratchpad', () => {
  let store: Store;
  beforeEach(async () => {
    store = await started();
  });
  const s = () => store.getState();

  it('add, erase and clear are single undo steps and redo exactly', () => {
    s().addStroke(
      stroke([
        [1, 1],
        [2, 2],
        [3, 1],
      ]),
    );
    s().addStroke(
      stroke(
        [
          [5, 5],
          [6, 6],
        ],
        { color: 'red' },
      ),
    );
    expect(s().annotations.strokes).toHaveLength(2);
    expect(s().history.past).toHaveLength(2);
    s().eraseStrokes([0, 1]);
    expect(s().annotations.strokes).toHaveLength(0);
    expect(s().history.past).toHaveLength(3);
    s().undo();
    expect(s().annotations.strokes).toHaveLength(2);
    s().clearLayer('drawing');
    expect(s().annotations.strokes).toHaveLength(0);
    s().undo();
    expect(s().annotations.strokes).toHaveLength(2);
    s().undo();
    expect(s().annotations.strokes).toHaveLength(1);
    s().redo();
    expect(s().annotations.strokes[1]!.color).toBe('red');
  });

  it('a scratchpad commit is one undo step; identical text is no step', () => {
    expect(s().setScratchpad('If C is in the Kitchen then B is out')).toBe(true);
    expect(s().setScratchpad('If C is in the Kitchen then B is out')).toBe(false);
    expect(s().history.past).toHaveLength(1);
    s().undo();
    expect(s().annotations.scratchpad).toBe('');
    s().redo();
    expect(s().annotations.scratchpad).toContain('Kitchen');
  });

  it('drawing visibility is a view setting that undo does not rewind', () => {
    s().addStroke(
      stroke([
        [1, 1],
        [2, 2],
      ]),
    );
    s().setLayerVisible('drawing', false);
    s().undo();
    expect(s().annotations.layerVisibility.drawing).toBe(false);
  });
});

describe('what-if branches', () => {
  let store: Store;
  let free: CellKey[];
  beforeEach(async () => {
    store = await started();
    free = freeCells(store);
  });
  const s = () => store.getState();

  it('abandon restores the snapshot exactly', () => {
    s().place(0, free[0]!);
    s().applyMark([free[5]!], 'cross');
    const before = structuredClone(undoableOf(s()));
    expect(s().startWhatIf()).toBe(true);
    expect(s().whatIfStack).toHaveLength(1);
    s().place(1, free[10]!);
    s().applyHighlight([free[3]!], 'green');
    s().placeTentative(2, free[20]!);
    s().setScratchpad('thinking');
    s().addStroke(
      stroke([
        [1, 1],
        [2, 2],
      ]),
    );
    expect(s().abandonWhatIf()).toBe(true);
    const after = undoableOf(s());
    expect({ ...after, whatIfStack: [] }).toEqual({ ...before, whatIfStack: [] });
    expect(s().whatIfStack).toHaveLength(0);
  });

  it('keep merges and pops the frame', () => {
    s().startWhatIf();
    s().place(1, free[10]!);
    expect(s().keepWhatIf()).toBe(true);
    expect(s().placements[1]).toBe(free[10]);
    expect(s().whatIfStack).toHaveLength(0);
    expect(s().keepWhatIf()).toBe(false);
    expect(s().abandonWhatIf()).toBe(false);
  });

  it('nests up to three levels and refuses a fourth', () => {
    for (let i = 0; i < WHATIF_MAX_DEPTH; i++) expect(s().startWhatIf()).toBe(true);
    expect(s().startWhatIf()).toBe(false);
    expect(s().whatIfStack).toHaveLength(3);
  });

  it('nested: inner abandon returns to the outer branch, outer keep keeps it', () => {
    s().startWhatIf();
    s().place(0, free[0]!);
    s().startWhatIf();
    s().place(1, free[10]!);
    s().abandonWhatIf();
    expect(s().placements[1]).toBeNull();
    expect(s().placements[0]).toBe(free[0]);
    expect(s().whatIfStack).toHaveLength(1);
    s().keepWhatIf();
    expect(s().placements[0]).toBe(free[0]);
    expect(s().whatIfStack).toHaveLength(0);
  });

  it('start, keep and abandon are history entries: undo and redo stay consistent', () => {
    s().startWhatIf();
    s().place(0, free[0]!);
    s().abandonWhatIf();
    expect(s().placements[0]).toBeNull();
    s().undo(); // undo the abandon: back inside the branch, with its frame
    expect(s().placements[0]).toBe(free[0]);
    expect(s().whatIfStack).toHaveLength(1);
    s().undo(); // undo the placement
    expect(s().placements[0]).toBeNull();
    expect(s().whatIfStack).toHaveLength(1);
    s().undo(); // undo the start
    expect(s().whatIfStack).toHaveLength(0);
    s().redo();
    expect(s().whatIfStack).toHaveLength(1);
    s().redo();
    s().redo(); // redo the abandon
    expect(s().whatIfStack).toHaveLength(0);
    expect(s().placements[0]).toBeNull();
  });

  it('appends a note line to the scratchpad on keep and abandon', () => {
    s().setScratchpad('start');
    s().startWhatIf();
    s().place(0, free[0]!);
    s().abandonWhatIf('C in Kitchen');
    expect(s().annotations.scratchpad).toBe('start\nWhat-if: C in Kitchen → abandoned');
    s().startWhatIf();
    s().keepWhatIf('B in Study');
    expect(s().annotations.scratchpad).toContain('What-if: B in Study → kept');
    s().startWhatIf();
    s().keepWhatIf('   ');
    expect(s().annotations.scratchpad.split('\n')).toHaveLength(3);
  });

  it('a new game clears the stack', async () => {
    s().startWhatIf();
    await s().newGame('other', 'easy');
    expect(s().whatIfStack).toEqual([]);
  });

  it('round-trips the full state through JSON, including the what-if stack', () => {
    s().place(0, free[0]!);
    s().startWhatIf();
    s().place(1, free[10]!);
    s().startWhatIf();
    s().addStroke(
      stroke([
        [1, 1],
        [2, 2],
      ]),
    );
    s().setScratchpad('hello');
    s().cycleLogicCell('rooms', 0, 1);
    const snap = {
      placements: s().placements,
      tentativePlacements: s().tentativePlacements,
      annotations: s().annotations,
      whatIfStack: s().whatIfStack,
      history: s().history,
      assistsUsed: s().assistsUsed,
      assistedPeople: s().assistedPeople,
    };
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });
});

describe('show where this clue allows', () => {
  it('always allows the solution cell and rules some cells out', () => {
    for (const seed of ['cy-adv', 'a1', 'b2', 'c3']) {
      const { puzzle, solution } = generatePuzzle(seed, 'easy');
      let ruledOut = 0;
      for (const p of puzzle.people) {
        const cell = solution.cellOf[p.id]!;
        const set = allowedCells(puzzle, p.id);
        expect(setHas(set, cell.r, cell.c)).toBe(true);
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!setHas(set, r, c)) ruledOut++;
      }
      expect(ruledOut).toBeGreaterThan(0);
    }
  });

  it('counts one assist per person per game, only while the setting is on', async () => {
    const store = await started();
    const s = () => store.getState();
    s().selectPerson(0);
    expect(s().assistsUsed).toBe(0);
    s().updateSettings({ showClueAllows: true }); // person 0 already selected
    expect(s().assistsUsed).toBe(1);
    s().selectPerson(0);
    s().selectPerson(null);
    s().selectPerson(0);
    expect(s().assistsUsed).toBe(1);
    s().selectPerson(3);
    expect(s().assistsUsed).toBe(2);
    s().updateSettings({ showClueAllows: false });
    s().selectPerson(4);
    expect(s().assistsUsed).toBe(2);
    await s().newGame('cy-adv', 'easy');
    expect(s().assistsUsed).toBe(0);
    expect(s().assistedPeople).toEqual([]);
  });

  it('keeps the defaults: helpers off, auto-cross and auto-clear on', () => {
    expect(DEFAULT_SETTINGS.showClueAllows).toBe(false);
    expect(DEFAULT_SETTINGS.linkLogicGrid).toBe(false);
    expect(DEFAULT_SETTINGS.autoCross).toBe(true);
    expect(DEFAULT_SETTINGS.autoClearCandidates).toBe(true);
    expect(slotOf([], 0)).toBe(-1);
  });
});
