import { describe, expect, it } from 'vitest';
import { cellKey } from '../../src/engine/types';
import {
  addClueHighlight,
  clearAllAnnotations,
  clearCells,
  clearLayer,
  clearPersonCandidates,
  deserialiseAnnotations,
  emptyAnnotations,
  LAYER_IDS,
  maskSlots,
  panelOrder,
  removeClueHighlight,
  serialiseAnnotations,
  setColNote,
  setHighlight,
  setLayerVisible,
  setPersonNote,
  setRoomNote,
  setRowNote,
  slotOf,
  toggleCandidate,
  toggleClueStruck,
  toggleClueTick,
  toggleMark,
  crossClearingNotes,
} from '../../src/state/annotations';
import {
  colCells,
  furnitureCells,
  mergeSelection,
  roomCells,
  rowCells,
} from '../../src/state/selection';

const A = cellKey(0, 0);
const B = cellKey(0, 1);
const C = cellKey(4, 4);

describe('cell marks', () => {
  it('toggles, replaces and removes marks, returning the same ref when nothing changes', () => {
    const a0 = emptyAnnotations();
    const a1 = toggleMark(a0, [A], 'cross');
    expect(a1.cellMarks[A]).toBe('cross');
    expect(a0.cellMarks[A]).toBeUndefined(); // pure
    expect(toggleMark(a1, [A], 'dot').cellMarks[A]).toBe('dot'); // replaced
    expect(toggleMark(a1, [A], 'cross').cellMarks).toEqual({}); // toggled off
    expect(toggleMark(a0, [], 'cross')).toBe(a0);
  });

  it('applies to a whole group: set all unless all already have it', () => {
    let a = toggleMark(emptyAnnotations(), [A], 'cross');
    a = toggleMark(a, [A, B, C], 'cross');
    expect(Object.keys(a.cellMarks)).toHaveLength(3);
    a = toggleMark(a, [A, B, C], 'cross');
    expect(a.cellMarks).toEqual({});
  });
});

describe('crossClearingNotes', () => {
  it('crosses and wipes yes/no notes, never toggles off, same ref when unchanged', () => {
    let a = toggleCandidate(emptyAnnotations(), [A], 0, 'yes');
    a = toggleCandidate(a, [A], 1, 'no');
    a = toggleCandidate(a, [B], 2, 'yes');
    a = toggleMark(a, [B], 'dot');
    const r = crossClearingNotes(a, [A, B]);
    expect(r.cellMarks[A]).toBe('cross');
    expect(r.cellMarks[B]).toBe('cross');
    expect(r.candidates[A]).toBeUndefined();
    expect(r.candidates[B]).toBeUndefined();
    expect(a.candidates[A]).toBeDefined(); // pure
    expect(crossClearingNotes(r, [A, B])).toBe(r); // already crossed, no notes
    expect(crossClearingNotes(r, [])).toBe(r);
    const onlyNotes = toggleCandidate(toggleMark(emptyAnnotations(), [A], 'cross'), [A], 0, 'yes');
    const cleared = crossClearingNotes(onlyNotes, [A]);
    expect(cleared.cellMarks[A]).toBe('cross'); // stays crossed
    expect(cleared.candidates[A]).toBeUndefined();
  });
});

describe('candidates', () => {
  it('keeps yes and no masks exclusive per person and cell', () => {
    let a = toggleCandidate(emptyAnnotations(), [A], 2, 'yes');
    expect(a.candidates[A]).toEqual({ yes: 0b100, no: 0 });
    a = toggleCandidate(a, [A], 2, 'no');
    expect(a.candidates[A]).toEqual({ yes: 0, no: 0b100 });
    a = toggleCandidate(a, [A], 2, 'yes');
    expect(a.candidates[A]).toEqual({ yes: 0b100, no: 0 });
    a = toggleCandidate(a, [A], 2, 'yes');
    expect(a.candidates[A]).toBeUndefined(); // empty masks are dropped
  });

  it('keeps other people when one toggles, and works over a group', () => {
    let a = toggleCandidate(emptyAnnotations(), [A, B], 0, 'yes');
    a = toggleCandidate(a, [A], 8, 'no');
    expect(a.candidates[A]).toEqual({ yes: 1, no: 256 });
    expect(a.candidates[B]).toEqual({ yes: 1, no: 0 });
    expect(maskSlots(a.candidates[A]!.yes | a.candidates[A]!.no)).toEqual([0, 8]);
    // a group where only some cells have it: sets on all
    a = toggleCandidate(a, [A, B, C], 0, 'yes');
    expect(a.candidates[C]!.yes).toBe(1);
    a = toggleCandidate(a, [A, B, C], 0, 'yes');
    expect(a.candidates[B]).toBeUndefined();
    expect(a.candidates[C]).toBeUndefined();
  });

  it('ignores invalid slots and clears a person everywhere', () => {
    const a0 = emptyAnnotations();
    expect(toggleCandidate(a0, [A], 9, 'yes')).toBe(a0);
    let a = toggleCandidate(a0, [A, B], 3, 'yes');
    a = toggleCandidate(a, [B], 4, 'no');
    const cleared = clearPersonCandidates(a, 3);
    expect(cleared.candidates[A]).toBeUndefined();
    expect(cleared.candidates[B]).toEqual({ yes: 0, no: 16 });
    expect(clearPersonCandidates(cleared, 3)).toBe(cleared);
  });

  it('maps people to fixed slots by panel order (victim first)', () => {
    const people = [
      { id: 0, name: 'A', initial: 'A', color: '', isVictim: false },
      { id: 1, name: 'B', initial: 'B', color: '', isVictim: false },
      { id: 2, name: 'C', initial: 'C', color: '', isVictim: true },
    ];
    expect(panelOrder(people).map((p) => p.id)).toEqual([2, 0, 1]);
    expect(slotOf(people, 2)).toBe(0);
    expect(slotOf(people, 1)).toBe(2);
  });
});

describe('highlights and cell clearing', () => {
  it('sets, replaces, toggles off and clears', () => {
    let a = setHighlight(emptyAnnotations(), [A, B], 'red');
    expect(a.highlights).toEqual({ [A]: 'red', [B]: 'red' });
    a = setHighlight(a, [A], 'blue');
    expect(a.highlights[A]).toBe('blue');
    a = setHighlight(a, [A], 'blue');
    expect(a.highlights[A]).toBeUndefined();
    a = setHighlight(a, [B], null);
    expect(a.highlights).toEqual({});
  });

  it('clearCells removes marks, candidates and highlights from just those cells', () => {
    let a = toggleMark(emptyAnnotations(), [A, C], 'cross');
    a = toggleCandidate(a, [A, C], 1, 'yes');
    a = setHighlight(a, [A, C], 'green');
    const cleared = clearCells(a, [A]);
    expect(cleared.cellMarks).toEqual({ [C]: 'cross' });
    expect(Object.keys(cleared.candidates)).toEqual([String(C)]);
    expect(Object.keys(cleared.highlights)).toEqual([String(C)]);
    expect(clearCells(cleared, [A])).toBe(cleared);
  });
});

describe('quick-select sets', () => {
  const roomOf = [
    [0, 0, 1],
    [0, 2, 1],
  ];
  it('rows, columns, rooms and furniture', () => {
    expect(rowCells(2)).toEqual(Array.from({ length: 9 }, (_, c) => cellKey(2, c)));
    expect(colCells(3)).toEqual(Array.from({ length: 9 }, (_, r) => cellKey(r, 3)));
    expect(roomCells(roomOf, 0)).toEqual([cellKey(0, 0), cellKey(0, 1), cellKey(1, 0)]);
    expect(roomCells(roomOf, 9)).toEqual([]);
    const f = [
      ['bed', null],
      [null, 'bed'],
    ] as const;
    expect(furnitureCells(f, 'bed')).toEqual([cellKey(0, 0), cellKey(1, 1)]);
  });

  it('merges selections', () => {
    expect(mergeSelection([1, 2], [2, 3], 'replace')).toEqual([2, 3]);
    expect(mergeSelection([1, 2], [2, 3], 'add')).toEqual([1, 2, 3]);
    expect(mergeSelection([1, 2, 3], [2, 3], 'toggle')).toEqual([1]);
    expect(mergeSelection([1], [2, 3], 'toggle')).toEqual([1, 2, 3]);
  });
});

describe('margin notes', () => {
  it('sets, trims and clears row, column and room notes', () => {
    let a = setRowNote(emptyAnnotations(), 3, '  B/D ');
    expect(a.rowNotes[3]).toBe('B/D');
    a = setColNote(a, 0, 'C');
    expect(a.colNotes[0]).toBe('C');
    a = setRoomNote(a, 5, 'only C or F');
    expect(a.roomNotes[5]).toBe('only C or F');
    expect(setRoomNote(a, 5, 'only C or F')).toBe(a);
    a = setRoomNote(a, 5, '');
    expect(a.roomNotes).toEqual({});
    expect(setRowNote(a, 9, 'x')).toBe(a);
    expect(setRowNote(a, 0, 'x'.repeat(100)).rowNotes[0]).toHaveLength(24);
  });
});

describe('clue annotations', () => {
  it('ticks atoms independently and drops all-false entries', () => {
    let a = toggleClueTick(emptyAnnotations(), 2, 1, 3);
    expect(a.clueTicks[2]).toEqual([false, true, false]);
    a = toggleClueTick(a, 2, 0, 3);
    expect(a.clueTicks[2]).toEqual([true, true, false]);
    a = toggleClueTick(toggleClueTick(a, 2, 0, 3), 2, 1, 3);
    expect(a.clueTicks[2]).toBeUndefined();
    const a0 = emptyAnnotations();
    expect(toggleClueTick(a0, 2, 3, 3)).toBe(a0);
  });

  it('strikes and un-strikes a clue', () => {
    let a = toggleClueStruck(emptyAnnotations(), 4);
    expect(a.clueStruck).toEqual([4]);
    a = toggleClueStruck(a, 4);
    expect(a.clueStruck).toEqual([]);
  });

  it('adds highlight ranges, splitting overlaps and merging equal neighbours', () => {
    let a = addClueHighlight(emptyAnnotations(), 1, 10, 20, 'red');
    a = addClueHighlight(a, 1, 15, 25, 'blue');
    expect(a.clueHighlights[1]).toEqual([
      { start: 10, end: 15, color: 'red' },
      { start: 15, end: 25, color: 'blue' },
    ]);
    a = addClueHighlight(a, 1, 12, 14, 'green'); // splits the red range
    expect(a.clueHighlights[1]!.map((h) => [h.start, h.end, h.color])).toEqual([
      [10, 12, 'red'],
      [12, 14, 'green'],
      [14, 15, 'red'],
      [15, 25, 'blue'],
    ]);
    a = addClueHighlight(a, 1, 25, 30, 'blue');
    expect(a.clueHighlights[1]!.at(-1)).toEqual({ start: 15, end: 30, color: 'blue' });
    expect(addClueHighlight(a, 1, 5, 5, 'red')).toBe(a);
    a = removeClueHighlight(a, 1, 0);
    expect(a.clueHighlights[1]![0]!.color).toBe('green');
    expect(removeClueHighlight(a, 1, 99)).toBe(a);
  });

  it('keeps a free-text note per person', () => {
    let a = setPersonNote(emptyAnnotations(), 3, ' row 2 or 7 ');
    expect(a.personNotes[3]).toBe('row 2 or 7');
    a = setPersonNote(a, 3, '');
    expect(a.personNotes).toEqual({});
  });
});

describe('layers and clearing', () => {
  const populated = () => {
    let a = toggleMark(emptyAnnotations(), [A], 'cross');
    a = toggleCandidate(a, [B], 1, 'yes');
    a = setHighlight(a, [C], 'amber');
    a = setRowNote(a, 1, 'B');
    a = setRoomNote(a, 0, 'x');
    a = toggleClueTick(a, 0, 0, 2);
    a = setLayerVisible(a, 'crosses', false);
    return a;
  };

  it('toggles layer visibility', () => {
    const a = setLayerVisible(emptyAnnotations(), 'candidates', false);
    expect(a.layerVisibility.candidates).toBe(false);
    expect(a.layerVisibility.crosses).toBe(true);
    expect(setLayerVisible(a, 'candidates', false)).toBe(a);
    expect(Object.keys(a.layerVisibility).sort()).toEqual([...LAYER_IDS].sort());
  });

  it('clears one layer at a time', () => {
    const a = populated();
    expect(clearLayer(a, 'crosses').cellMarks).toEqual({});
    expect(clearLayer(a, 'crosses').candidates).toEqual(a.candidates);
    expect(clearLayer(a, 'candidates').candidates).toEqual({});
    expect(clearLayer(a, 'highlights').highlights).toEqual({});
    const m = clearLayer(a, 'margins');
    expect(m.rowNotes[1]).toBe('');
    expect(m.roomNotes).toEqual({});
    expect(m.cellMarks).toEqual(a.cellMarks);
    expect(clearLayer(a, 'drawing').strokes).toEqual([]);
    const e = emptyAnnotations();
    expect(clearLayer(e, 'tentative')).toBe(e);
  });

  it('clears everything but keeps layer visibility', () => {
    const cleared = clearAllAnnotations(populated());
    expect(cleared).toEqual({
      ...emptyAnnotations(),
      layerVisibility: { ...emptyAnnotations().layerVisibility, crosses: false },
    });
    expect(clearAllAnnotations(cleared)).toBe(cleared);
  });
});

describe('serialisation', () => {
  it('is plain JSON and round-trips exactly', () => {
    let a = populate();
    const json = serialiseAnnotations(a);
    expect(deserialiseAnnotations(json)).toEqual(a);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    a = emptyAnnotations();
    expect(deserialiseAnnotations(serialiseAnnotations(a))).toEqual(a);
  });

  it('fills missing fields with defaults when loading older saves', () => {
    const a = deserialiseAnnotations('{"rowNotes":["x","","","","","","","",""]}');
    expect(a.rowNotes[0]).toBe('x');
    expect(a.scratchpad).toBe('');
    expect(a.layerVisibility.crosses).toBe(true);
    expect(a.logicGrid.rooms).toHaveLength(9);
  });

  function populate() {
    let a = toggleMark(emptyAnnotations(), [A, C], 'unsure');
    a = toggleCandidate(a, [A], 8, 'no');
    a = setHighlight(a, [B], 'purple');
    a = addClueHighlight(a, 2, 3, 9, 'orange');
    a = toggleClueTick(a, 2, 1, 3);
    a = toggleClueStruck(a, 5);
    a = setPersonNote(a, 1, 'hello');
    a = setLayerVisible(a, 'margins', false);
    return a;
  }
});
