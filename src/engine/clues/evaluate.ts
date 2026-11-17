import { GRID_SIZE } from '../constants';
import { cellLabel, setHas, type CellSet } from '../cellset';
import type { Cell, PersonId, Puzzle } from '../types';
import { atomCells, getBoard, staticCandidates, type Board } from './board';
import type { Atom } from './types';

/** Allowed cells per person from their static (cell-only) atoms, indexed by PersonId. */
export function personCandidates(puzzle: Puzzle): CellSet[] {
  const board = getBoard(puzzle);
  const out: CellSet[] = puzzle.people.map(() => board.free.slice());
  for (const clue of puzzle.clues) out[clue.person] = staticCandidates(board, clue.atoms);
  return out;
}

/** Does a cell-only atom hold at this cell? (Relational atoms: always true here.) */
export function staticAtomHolds(board: Board, atom: Atom, cell: Cell): boolean {
  const s = atomCells(board, atom);
  return s === null || setHas(s, cell.r, cell.c);
}

/** A (possibly partial) placement: cell per PersonId, null/undefined when unplaced. */
export type Placement = readonly (Cell | null | undefined)[];

export type ViolationKind = 'row' | 'column' | 'blocked' | 'clue' | 'murder';

export interface Violation {
  kind: ViolationKind;
  /** People involved (for UI highlighting). */
  persons: PersonId[];
  cells: Cell[];
  /** For kind 'clue': index into that person's clue.atoms. */
  atomIndex?: number;
  message: string;
}

/**
 * Check a placement against the rules and clues. Works on partial placements
 * and never needs the solution: a violation is reported only when it is
 * already definite from the people placed so far.
 */
export function checkPlacement(puzzle: Puzzle, placement: Placement): Violation[] {
  const board = getBoard(puzzle);
  const out: Violation[] = [];
  const name = (p: PersonId) => puzzle.people[p]?.name ?? `Person ${p}`;
  const cellOf = (p: PersonId): Cell | null => placement[p] ?? null;
  const roomOfCell = (cell: Cell) => puzzle.roomOf[cell.r]![cell.c]!;
  const placed = puzzle.people.map((x) => x.id).filter((p) => cellOf(p) !== null);

  for (let i = 0; i < GRID_SIZE; i++) {
    const inRow = placed.filter((p) => cellOf(p)!.r === i);
    if (inRow.length > 1)
      out.push({
        kind: 'row',
        persons: inRow,
        cells: inRow.map((p) => cellOf(p)!),
        message: `${inRow.map(name).join(' and ')} are both in row ${i + 1}.`,
      });
    const inCol = placed.filter((p) => cellOf(p)!.c === i);
    if (inCol.length > 1)
      out.push({
        kind: 'column',
        persons: inCol,
        cells: inCol.map((p) => cellOf(p)!),
        message: `${inCol.map(name).join(' and ')} are both in column ${'ABCDEFGHI'.charAt(i)}.`,
      });
  }

  for (const p of placed) {
    const cell = cellOf(p)!;
    if (!setHas(board.free, cell.r, cell.c))
      out.push({
        kind: 'blocked',
        persons: [p],
        cells: [cell],
        message: `${name(p)} cannot stand on furniture that blocks the cell (${cellLabel(cell)}).`,
      });
  }

  for (const clue of puzzle.clues) {
    const cell = cellOf(clue.person);
    if (!cell) continue;
    const room = roomOfCell(cell);
    clue.atoms.forEach((atom, atomIndex) => {
      let bad = false;
      const persons = [clue.person];
      if (atom.kind === 'alone') {
        for (const q of placed) {
          if (q !== clue.person && roomOfCell(cellOf(q)!) === room) {
            bad = true;
            persons.push(q);
          }
        }
      } else if (atom.kind === 'sameRoomAs') {
        const other = cellOf(atom.person);
        if (other && roomOfCell(other) !== room) {
          bad = true;
          persons.push(atom.person);
        }
      } else {
        bad = !staticAtomHolds(board, atom, cell);
      }
      if (bad)
        out.push({
          kind: 'clue',
          persons,
          cells: persons.map((p) => cellOf(p)!),
          atomIndex,
          message: `${name(clue.person)}'s clue is not satisfied at ${cellLabel(cell)}.`,
        });
    });
  }

  const victim = puzzle.people.find((p) => p.isVictim);
  const vCell = victim ? cellOf(victim.id) : null;
  if (victim && vCell) {
    const vRoom = roomOfCell(vCell);
    const suspects = puzzle.people.filter((p) => !p.isVictim);
    const inRoom = suspects.filter((s) => {
      const c = cellOf(s.id);
      return c !== null && roomOfCell(c) === vRoom;
    });
    const allPlaced = suspects.every((s) => cellOf(s.id) !== null);
    if (inRoom.length > 1 || (inRoom.length === 0 && allPlaced)) {
      const persons = [victim.id, ...inRoom.map((s) => s.id)];
      out.push({
        kind: 'murder',
        persons,
        cells: persons.map((p) => cellOf(p)!),
        message:
          inRoom.length > 1
            ? `More than one suspect is in the victim's room.`
            : `No suspect is in the victim's room.`,
      });
    }
  }
  return out;
}
