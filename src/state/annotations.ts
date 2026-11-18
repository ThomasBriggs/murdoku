/**
 * Player-authored annotations (SPEC §6.5, §8): marks, candidate initials,
 * highlights, margin notes and clue annotations.
 *
 * Everything here is plain JSON (no Sets/Maps), so it can be saved as is, and
 * every helper is a pure `(Annotations, ...args) => Annotations` that returns
 * the SAME reference when nothing changed. The store uses that to skip empty
 * history entries. Nothing in this module reads the solution.
 *
 * Auto-crosses (§6.4) are deliberately NOT stored: the Board derives them from
 * the placements every render, so they can never go stale when a person is
 * removed or undo/redo runs. `autoCrosses` stays in the interface for the §8
 * save shape and is always `[]`.
 */
import { produce } from 'immer';
import { PEOPLE } from '../engine/constants';
import type { CellKey, Person, PersonId, RoomId } from '../engine/types';

export const COLOR_IDS = ['amber', 'red', 'green', 'blue', 'purple', 'orange'] as const;
export type ColorId = (typeof COLOR_IDS)[number];

export type MarkKind = 'cross' | 'dot' | 'unsure';
/** Logic-grid cell state (part 2): blank, cross, tick. */
export type Mark3 = 0 | 1 | 2;

export const LAYER_IDS = [
  'crosses',
  'candidates',
  'highlights',
  'drawing',
  'margins',
  'tentative',
] as const;
export type LayerId = (typeof LAYER_IDS)[number];

export interface Stroke {
  tool: 'pen' | 'highlighter';
  color: ColorId;
  width: number;
  pts: [number, number][];
}

export interface ClueHighlight {
  /** Character offsets into the rendered clue text; `end` is exclusive. */
  start: number;
  end: number;
  color: ColorId;
}

/** A 9-bit mask pair per cell: bit i = the person in panel slot i. */
export interface CandidateMasks {
  yes: number;
  no: number;
}

export interface Annotations {
  cellMarks: Record<CellKey, MarkKind>;
  /** Derived (see module note); always empty. */
  autoCrosses: CellKey[];
  candidates: Record<CellKey, CandidateMasks>;
  highlights: Record<CellKey, ColorId>;
  rowNotes: string[];
  colNotes: string[];
  roomNotes: Record<RoomId, string>;
  clueTicks: Record<PersonId, boolean[]>;
  clueStruck: PersonId[];
  clueHighlights: Record<PersonId, ClueHighlight[]>;
  personNotes: Record<PersonId, string>;
  /** Part 2. */
  logicGrid: { rooms: Mark3[][]; rows: Mark3[][]; cols: Mark3[][] };
  /** Part 2. */
  strokes: Stroke[];
  /** Part 2. */
  scratchpad: string;
  layerVisibility: Record<LayerId, boolean>;
}

const GRID = 9;

export function defaultLayerVisibility(): Record<LayerId, boolean> {
  return Object.fromEntries(LAYER_IDS.map((l) => [l, true])) as Record<LayerId, boolean>;
}

export function emptyAnnotations(): Annotations {
  const blank = (): Mark3[][] =>
    Array.from({ length: PEOPLE }, () => Array.from({ length: GRID }, () => 0 as Mark3));
  return {
    cellMarks: {},
    autoCrosses: [],
    candidates: {},
    highlights: {},
    rowNotes: Array.from({ length: GRID }, () => ''),
    colNotes: Array.from({ length: GRID }, () => ''),
    roomNotes: {},
    clueTicks: {},
    clueStruck: [],
    clueHighlights: {},
    personNotes: {},
    logicGrid: { rooms: blank(), rows: blank(), cols: blank() },
    strokes: [],
    scratchpad: '',
    layerVisibility: defaultLayerVisibility(),
  };
}

// ---------------------------------------------------------------- people slots

/** Panel order: the victim first, then suspects in id order. */
export function panelOrder(people: readonly Person[]): Person[] {
  return [...people].sort((a, b) => Number(b.isVictim) - Number(a.isVictim) || a.id - b.id);
}

/** A person's fixed candidate slot (0..8) = their position in the panel. */
export function slotOf(people: readonly Person[], person: PersonId): number {
  return panelOrder(people).findIndex((p) => p.id === person);
}

/** Slots set in a 9-bit mask, ascending. */
export function maskSlots(mask: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < PEOPLE; i++) if (mask & (1 << i)) out.push(i);
  return out;
}

// ---------------------------------------------------------------- cell marks

const uniq = (cells: readonly CellKey[]): CellKey[] => [...new Set(cells)];

/**
 * Toggle a mark over a group of cells: when every cell already shows `mark` it
 * is removed from all, otherwise it is set on all (replacing any other mark).
 */
export function toggleMark(a: Annotations, cells: readonly CellKey[], mark: MarkKind): Annotations {
  const cs = uniq(cells);
  if (cs.length === 0) return a;
  const all = cs.every((c) => a.cellMarks[c] === mark);
  return produce(a, (d) => {
    for (const c of cs) {
      if (all) delete d.cellMarks[c];
      else d.cellMarks[c] = mark;
    }
  });
}

// ---------------------------------------------------------------- candidates

/**
 * Toggle one person's candidate ('yes') or eliminated ('no') state over a
 * group. They are mutually exclusive per cell and person: setting one clears
 * the other. When every cell already has that state it is removed from all.
 */
export function toggleCandidate(
  a: Annotations,
  cells: readonly CellKey[],
  slot: number,
  kind: 'yes' | 'no',
): Annotations {
  const cs = uniq(cells);
  if (cs.length === 0 || slot < 0 || slot >= PEOPLE) return a;
  const bit = 1 << slot;
  const other = kind === 'yes' ? 'no' : 'yes';
  const all = cs.every((c) => ((a.candidates[c]?.[kind] ?? 0) & bit) !== 0);
  return produce(a, (d) => {
    for (const c of cs) {
      const m = d.candidates[c] ?? { yes: 0, no: 0 };
      if (all) m[kind] &= ~bit;
      else {
        m[kind] |= bit;
        m[other] &= ~bit;
      }
      if (m.yes === 0 && m.no === 0) delete d.candidates[c];
      else d.candidates[c] = m;
    }
  });
}

/** Drop a person's candidate and eliminated state everywhere (auto-clear on placement). */
export function clearPersonCandidates(a: Annotations, slot: number): Annotations {
  const bit = 1 << slot;
  const has = Object.values(a.candidates).some((m) => (m.yes | m.no) & bit);
  if (!has) return a;
  return produce(a, (d) => {
    for (const [k, m] of Object.entries(d.candidates)) {
      m.yes &= ~bit;
      m.no &= ~bit;
      if (m.yes === 0 && m.no === 0) delete d.candidates[Number(k)];
    }
  });
}

// ---------------------------------------------------------------- highlights

/** Set a highlight colour on a group; when all already have it, remove it. `null` always clears. */
export function setHighlight(
  a: Annotations,
  cells: readonly CellKey[],
  color: ColorId | null,
): Annotations {
  const cs = uniq(cells);
  if (cs.length === 0) return a;
  const remove = color === null || cs.every((c) => a.highlights[c] === color);
  return produce(a, (d) => {
    for (const c of cs) {
      if (remove) delete d.highlights[c];
      else d.highlights[c] = color;
    }
  });
}

/** Remove marks, candidates and highlights from a group of cells. */
export function clearCells(a: Annotations, cells: readonly CellKey[]): Annotations {
  const cs = uniq(cells).filter((c) => c in a.cellMarks || c in a.candidates || c in a.highlights);
  if (cs.length === 0) return a;
  return produce(a, (d) => {
    for (const c of cs) {
      delete d.cellMarks[c];
      delete d.candidates[c];
      delete d.highlights[c];
    }
  });
}

// ---------------------------------------------------------------- margin notes

export const NOTE_MAX = 24;

const cleanNote = (t: string) => t.trim().slice(0, NOTE_MAX);

export function setRowNote(a: Annotations, row: number, text: string): Annotations {
  const t = cleanNote(text);
  if (row < 0 || row >= GRID || a.rowNotes[row] === t) return a;
  return produce(a, (d) => {
    d.rowNotes[row] = t;
  });
}

export function setColNote(a: Annotations, col: number, text: string): Annotations {
  const t = cleanNote(text);
  if (col < 0 || col >= GRID || a.colNotes[col] === t) return a;
  return produce(a, (d) => {
    d.colNotes[col] = t;
  });
}

export function setRoomNote(a: Annotations, room: RoomId, text: string): Annotations {
  const t = cleanNote(text);
  if ((a.roomNotes[room] ?? '') === t) return a;
  return produce(a, (d) => {
    if (t === '') delete d.roomNotes[room];
    else d.roomNotes[room] = t;
  });
}

// ---------------------------------------------------------------- clue annotations

/** Tick or untick one atom of a person's clue. `atomCount` sizes the tick array. */
export function toggleClueTick(
  a: Annotations,
  person: PersonId,
  atom: number,
  atomCount: number,
): Annotations {
  if (atom < 0 || atom >= atomCount) return a;
  return produce(a, (d) => {
    const ticks = d.clueTicks[person] ?? Array.from({ length: atomCount }, () => false);
    while (ticks.length < atomCount) ticks.push(false);
    ticks[atom] = !ticks[atom];
    if (ticks.some(Boolean)) d.clueTicks[person] = ticks;
    else delete d.clueTicks[person];
  });
}

export function toggleClueStruck(a: Annotations, person: PersonId): Annotations {
  return produce(a, (d) => {
    const i = d.clueStruck.indexOf(person);
    if (i >= 0) d.clueStruck.splice(i, 1);
    else d.clueStruck.push(person);
  });
}

/**
 * Colour the clue text range [start, end). Overlapped parts of existing
 * ranges are replaced; adjacent ranges of one colour are merged.
 */
export function addClueHighlight(
  a: Annotations,
  person: PersonId,
  start: number,
  end: number,
  color: ColorId,
): Annotations {
  const s = Math.max(0, Math.min(start, end));
  const e = Math.max(start, end);
  if (e <= s) return a;
  return produce(a, (d) => {
    const next: ClueHighlight[] = [];
    for (const h of d.clueHighlights[person] ?? []) {
      if (h.end <= s || h.start >= e) next.push({ ...h });
      else {
        if (h.start < s) next.push({ start: h.start, end: s, color: h.color });
        if (h.end > e) next.push({ start: e, end: h.end, color: h.color });
      }
    }
    next.push({ start: s, end: e, color });
    next.sort((x, y) => x.start - y.start);
    const merged: ClueHighlight[] = [];
    for (const h of next) {
      const last = merged[merged.length - 1];
      if (last && last.end === h.start && last.color === h.color) last.end = h.end;
      else merged.push(h);
    }
    d.clueHighlights[person] = merged;
  });
}

export function removeClueHighlight(a: Annotations, person: PersonId, index: number): Annotations {
  const list = a.clueHighlights[person];
  if (!list || index < 0 || index >= list.length) return a;
  return produce(a, (d) => {
    const l = d.clueHighlights[person]!;
    l.splice(index, 1);
    if (l.length === 0) delete d.clueHighlights[person];
  });
}

export function clearClueHighlights(a: Annotations, person: PersonId): Annotations {
  if (!a.clueHighlights[person]) return a;
  return produce(a, (d) => {
    delete d.clueHighlights[person];
  });
}

export function setPersonNote(a: Annotations, person: PersonId, text: string): Annotations {
  const t = text.trim().slice(0, 200);
  if ((a.personNotes[person] ?? '') === t) return a;
  return produce(a, (d) => {
    if (t === '') delete d.personNotes[person];
    else d.personNotes[person] = t;
  });
}

// ---------------------------------------------------------------- layers and clearing

export function setLayerVisible(a: Annotations, layer: LayerId, visible: boolean): Annotations {
  if (a.layerVisibility[layer] === visible) return a;
  return produce(a, (d) => {
    d.layerVisibility[layer] = visible;
  });
}

/**
 * Clear the content of one layer. The 'tentative' layer lives in the store
 * (it is part of the undoable slice but not of `Annotations`), so it is a no-op here.
 */
export function clearLayer(a: Annotations, layer: LayerId): Annotations {
  const fresh = emptyAnnotations();
  return produce(a, (d) => {
    switch (layer) {
      case 'crosses':
        d.cellMarks = {};
        break;
      case 'candidates':
        d.candidates = {};
        break;
      case 'highlights':
        d.highlights = {};
        break;
      case 'drawing':
        d.strokes = [];
        break;
      case 'margins':
        d.rowNotes = fresh.rowNotes;
        d.colNotes = fresh.colNotes;
        d.roomNotes = {};
        break;
      case 'tentative':
        break;
    }
  });
}

/** Clear every annotation but keep which layers are visible. */
export function clearAllAnnotations(a: Annotations): Annotations {
  const fresh = emptyAnnotations();
  fresh.layerVisibility = { ...a.layerVisibility };
  return JSON.stringify(fresh) === JSON.stringify(a) ? a : fresh;
}

// ---------------------------------------------------------------- serialisation

export function serialiseAnnotations(a: Annotations): string {
  return JSON.stringify(a);
}

/** Parse saved annotations, filling any missing field with its default. */
export function deserialiseAnnotations(json: string): Annotations {
  const raw = JSON.parse(json) as Partial<Annotations>;
  const base = emptyAnnotations();
  return {
    ...base,
    ...raw,
    layerVisibility: { ...base.layerVisibility, ...raw.layerVisibility },
    logicGrid: { ...base.logicGrid, ...raw.logicGrid },
  };
}
