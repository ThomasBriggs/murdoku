import { beforeEach, describe, expect, it } from 'vitest';
import { cellKey, type CellKey } from '../../src/engine/types';
import { slotOf } from '../../src/state/annotations';
import {
  allPlaced,
  createGameStore,
  selectConflicts,
  selectUnplaced,
  undoableOf,
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
  await store.getState().newGame('cy-marks', 'easy');
  return store;
}

/** Free (occupiable) cells in row-major order. */
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

describe('toolkit store', () => {
  let store: Store;
  let free: CellKey[];
  beforeEach(async () => {
    store = await started();
    free = freeCells(store);
  });
  const s = () => store.getState();

  it('every annotation action undoes and redoes exactly', () => {
    const [a, b, c] = free as [CellKey, CellKey, CellKey];
    const person = s().puzzle!.people[0]!.id;
    const steps: [string, () => unknown][] = [
      ['applyMark', () => s().applyMark([a, b], 'cross')],
      ['applyMark dot', () => s().applyMark([c], 'dot')],
      ['applyCandidate', () => s().applyCandidate([a, c], person)],
      ['eliminate', () => s().applyCandidate([b], person, true)],
      ['applyHighlight', () => s().applyHighlight([a, b, c], 'blue')],
      ['placeTentative', () => s().placeTentative(person, c)],
      ['setRowNote', () => s().setRowNote(3, 'B/D')],
      ['setColNote', () => s().setColNote(1, 'C')],
      ['setRoomNote', () => s().setRoomNote(0, 'victim here')],
      ['toggleClueTick', () => s().toggleClueTick(s().puzzle!.clues[0]!.person, 0)],
      ['toggleClueStruck', () => s().toggleClueStruck(1)],
      ['addClueHighlight', () => s().addClueHighlight(1, 0, 5, 'red')],
      ['removeClueHighlight', () => s().removeClueHighlight(1, 0)],
      ['setPersonNote', () => s().setPersonNote(1, 'row 2 or 7')],
      ['clearCellAnnotations', () => s().clearCellAnnotations([a])],
      ['clearLayer', () => s().clearLayer('candidates')],
      ['clearLayer tentative', () => s().clearLayer('tentative')],
      ['clearAnnotations', () => s().clearAnnotations()],
      ['resetEverything', () => s().resetEverything()],
    ];
    s().place(s().puzzle!.people[1]!.id, a); // gives resetEverything something to do
    const snapshots: ReturnType<typeof undoableOf>[] = [undoableOf(s())];
    for (const [name, run] of steps) {
      expect(run(), name).not.toBe(false);
      snapshots.push(undoableOf(s()));
      expect(snapshots.at(-1), `${name} changed state`).not.toEqual(snapshots.at(-2));
    }
    const last = snapshots.length - 1;
    for (let i = last; i > 0; i--) {
      expect(s().undo()).toBe(true);
      expect(undoableOf(s()), `undo ${steps[i - 1]![0]}`).toEqual(snapshots[i - 1]);
    }
    for (let i = 1; i <= last; i++) {
      expect(s().redo()).toBe(true);
      expect(undoableOf(s()), `redo ${steps[i - 1]![0]}`).toEqual(snapshots[i]);
    }
  });

  it('no-op actions leave no history entry', () => {
    const before = s().history.past.length;
    expect(s().applyHighlight([free[0]!], null)).toBe(false);
    expect(s().clearAnnotations()).toBe(false);
    expect(s().clearCellAnnotations([free[0]!])).toBe(false);
    expect(s().setRowNote(0, '')).toBe(false);
    expect(s().history.past.length).toBe(before);
  });

  it('clearCellAnnotations wipes marks, initials, highlights and guesses in one undo step', () => {
    const [a, b] = free as [CellKey, CellKey];
    const [p0, p1, p2] = s().puzzle!.people.map((x) => x.id) as [number, number, number];
    s().applyMark([a], 'unsure');
    s().applyCandidate([a, b], p0);
    s().applyCandidate([a], p1, true);
    s().applyHighlight([a], 'green');
    s().placeTentative(p2, a);
    s().place(p1, b);
    const before = s().history.past.length;
    expect(s().clearCellAnnotations([a])).toBe(true);
    expect(s().history.past.length).toBe(before + 1);
    expect(s().annotations.cellMarks[a]).toBeUndefined();
    expect(s().annotations.candidates[a]).toBeUndefined();
    expect(s().annotations.highlights[a]).toBeUndefined();
    expect(s().tentativePlacements[p2]).toBeNull();
    // other cells and real placements are untouched
    expect(s().annotations.candidates[b]).toBeDefined();
    expect(s().placements[p1]).toBe(b);
    s().undo();
    expect(s().tentativePlacements[p2]).toBe(a);
    expect(s().annotations.cellMarks[a]).toBe('unsure');
  });

  it('the erase tool clears the cells it is applied to', () => {
    const [a, b] = free as [CellKey, CellKey];
    s().applyMark([a, b], 'cross');
    s().setTool('erase');
    expect(s().applyTool([a])).toBe(true);
    expect(s().annotations.cellMarks).toEqual({ [b]: 'cross' });
    expect(s().applyTool([a])).toBe(false); // nothing left to erase
  });

  it('layer visibility is a view setting: not undoable and not rewound by undo', () => {
    s().applyMark([free[0]!], 'cross');
    s().setLayerVisible('crosses', false);
    expect(s().history.past).toHaveLength(1);
    s().undo();
    expect(s().annotations.cellMarks).toEqual({});
    expect(s().annotations.layerVisibility.crosses).toBe(false);
    s().redo();
    expect(s().annotations.cellMarks[free[0]!]).toBe('cross');
    expect(s().annotations.layerVisibility.crosses).toBe(false);
  });

  it('applyTool uses the active tool, person and colour', () => {
    const [a, b] = free as [CellKey, CellKey];
    const p = s().puzzle!.people[2]!.id;
    s().setTool('cross');
    s().applyTool([a, b]);
    expect(s().annotations.cellMarks).toEqual({ [a]: 'cross', [b]: 'cross' });
    s().setTool('eliminate');
    expect(s().applyTool([a])).toBe(false); // nobody selected
    s().selectPerson(p);
    s().applyTool([a]);
    const slot = slotOf(s().puzzle!.people, p);
    expect(s().annotations.candidates[a]).toEqual({ yes: 0, no: 1 << slot });
    s().setTool('place');
    expect(s().applyTool([a])).toBe(false); // place notes through the UI, not applyTool
    s().setTool('highlight');
    s().setColor(s().cycleColor());
    s().applyTool([b]);
    expect(s().annotations.highlights[b]).toBe(s().color);
    expect(s().color).toBe('red');
  });

  it('selection: replace, add, toggle and clear', () => {
    s().selectCells([1, 2]);
    s().selectCells([3], 'add');
    expect(s().selection).toEqual([1, 2, 3]);
    s().selectCells([1, 2, 3], 'toggle');
    expect(s().selection).toEqual([]);
    s().selectCells([5]);
    s().clearSelection();
    expect(s().selection).toEqual([]);
    expect(s().history.past).toHaveLength(0); // selection is not undoable
  });

  describe('auto-clear candidates on placement', () => {
    it('drops the placed person’s candidates everywhere, keeping others', () => {
      const [a, b, c] = free as [CellKey, CellKey, CellKey];
      const [p0, p1] = [s().puzzle!.people[0]!.id, s().puzzle!.people[1]!.id];
      s().applyCandidate([a, b], p0);
      s().applyCandidate([b], p0, true); // flips b to eliminated
      s().applyCandidate([c], p1);
      s().place(p0, a);
      const slot1 = slotOf(s().puzzle!.people, p1);
      expect(s().annotations.candidates).toEqual({ [c]: { yes: 1 << slot1, no: 0 } });
      s().undo();
      expect(Object.keys(s().annotations.candidates)).toHaveLength(3);
    });

    it('does nothing when the setting is off', () => {
      const p0 = s().puzzle!.people[0]!.id;
      s().updateSettings({ autoClearCandidates: false });
      s().applyCandidate([free[0]!, free[5]!], p0);
      s().place(p0, free[0]!);
      expect(Object.keys(s().annotations.candidates)).toHaveLength(2);
    });
  });

  describe('tentative placements', () => {
    it('place, move, remove; refuse blocked cells and placed people', () => {
      const f = s().puzzle!.furniture;
      let blocked: CellKey | null = null;
      for (let r = 0; r < 9 && blocked === null; r++)
        for (let c = 0; c < 9; c++)
          if (f[r]![c] && !free.includes(cellKey(r, c))) {
            blocked = cellKey(r, c);
            break;
          }
      const p = s().puzzle!.people[0]!.id;
      expect(s().placeTentative(p, blocked!)).toBe('refused');
      expect(s().placeTentative(p, free[0]!)).toBe('placed');
      expect(s().placeTentative(p, free[1]!)).toBe('placed'); // moves
      expect(s().tentativePlacements[p]).toBe(free[1]);
      expect(s().placeTentative(p, free[1]!)).toBe('removed');
      expect(s().tentativePlacements[p]).toBeNull();
      expect(s().removeTentative(p)).toBe(false);
      s().place(p, free[2]!);
      expect(s().placeTentative(p, free[3]!)).toBe('refused');
    });

    it('does not count for conflicts, allPlaced or the unplaced list', () => {
      const people = s().puzzle!.people;
      // same row for everyone would be a conflict if they were real
      const row = free.filter((k) => Math.floor(k / 9) === Math.floor(free[0]! / 9));
      s().placeTentative(people[0]!.id, row[0]!);
      s().placeTentative(people[1]!.id, row[1]!);
      expect(selectConflicts(s())).toEqual([]);
      expect(selectUnplaced(s())).toHaveLength(9);
      for (const p of people.slice(2)) s().placeTentative(p.id, free[10 + p.id]!);
      expect(allPlaced(s())).toBe(false);
      expect(Object.values(s().placements).every((c) => c === null)).toBe(true);
    });

    it('promote makes it real (one undo step) and a real placement removes the tentative', () => {
      const [p0, p1] = [s().puzzle!.people[0]!.id, s().puzzle!.people[1]!.id];
      s().placeTentative(p0, free[0]!);
      const before = s().history.past.length;
      expect(s().promoteTentative(p0)).toBe(true);
      expect(s().placements[p0]).toBe(free[0]);
      expect(s().tentativePlacements[p0]).toBeNull();
      expect(s().history.past.length).toBe(before + 1);
      s().undo();
      expect(s().placements[p0]).toBeNull();
      expect(s().tentativePlacements[p0]).toBe(free[0]);
      expect(s().promoteTentative(p1)).toBe(false);
      // placing elsewhere also drops the guess
      s().place(p0, free[7]!);
      expect(s().tentativePlacements[p0]).toBeNull();
    });
  });

  describe('clearing', () => {
    it('clears a layer, all annotations (keeping placements) or everything', () => {
      const [a, b] = free as [CellKey, CellKey];
      const [p0, p1] = [s().puzzle!.people[0]!.id, s().puzzle!.people[1]!.id];
      s().place(p0, a);
      s().applyMark([b], 'cross');
      s().applyHighlight([b], 'green');
      s().placeTentative(p1, free[20]!);
      s().setRowNote(0, 'x');

      s().clearLayer('highlights');
      expect(s().annotations.highlights).toEqual({});
      expect(s().annotations.cellMarks[b]).toBe('cross');

      s().clearAnnotations();
      expect(s().annotations.cellMarks).toEqual({});
      expect(s().annotations.rowNotes[0]).toBe('');
      expect(s().tentativePlacements[p1]).toBeNull();
      expect(s().placements[p0]).toBe(a);

      s().undo();
      expect(s().annotations.cellMarks[b]).toBe('cross');
      s().redo();
      s().applyMark([b], 'dot');
      s().resetEverything();
      expect(s().placements[p0]).toBeNull();
      expect(s().annotations.cellMarks).toEqual({});
      s().undo();
      expect(s().placements[p0]).toBe(a);
    });

    it('keeps auto-crosses derived: removing a person needs no annotation change', () => {
      const p0 = s().puzzle!.people[0]!.id;
      s().place(p0, free[0]!);
      expect(s().annotations.autoCrosses).toEqual([]);
      expect(s().annotations.cellMarks).toEqual({});
    });
  });

  it('annotations and tentative placements are JSON-serialisable store state', () => {
    s().applyMark([free[0]!], 'cross');
    s().applyCandidate([free[1]!], 0);
    s().placeTentative(0, free[2]!);
    const slice = undoableOf(s());
    expect(JSON.parse(JSON.stringify(slice))).toEqual(slice);
  });

  it('a new game resets annotations and tentative placements', async () => {
    s().applyMark([free[0]!], 'cross');
    s().placeTentative(0, free[2]!);
    await s().newGame('another', 'easy');
    expect(s().annotations.cellMarks).toEqual({});
    expect(s().tentativePlacements[0]).toBeNull();
    expect(s().selection).toEqual([]);
  });

  it('refuses annotation changes outside a running game', async () => {
    const idle = createGameStore({
      client: createEngineClient({ workerFactory: createInProcessWorker }),
    });
    expect(idle.getState().applyMark([1], 'cross')).toBe(false);
    expect(idle.getState().history.past).toHaveLength(0);
  });
});
