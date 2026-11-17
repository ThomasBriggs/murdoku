import { GRID_SIZE } from '../constants';
import { setHas } from '../cellset';
import type { Solution } from '../types';
import type { PersonId } from '../types';
import { atomCells, getBoard, isVacuous, type Board, type BoardSource } from './board';
import type { Atom } from './types';

/** Every cell-only atom that exists on this board (true or not). */
export function allStaticAtoms(board: Board): Atom[] {
  const atoms: Atom[] = [];
  for (const room of board.source.rooms) {
    atoms.push({ kind: 'inRoom', room: room.id }, { kind: 'notInRoom', room: room.id });
  }
  for (const furniture of board.present) {
    atoms.push(
      { kind: 'on', furniture },
      { kind: 'beside', furniture },
      { kind: 'notBeside', furniture },
    );
  }
  for (let i = 0; i < GRID_SIZE; i++)
    atoms.push({ kind: 'row', index: i }, { kind: 'col', index: i });
  atoms.push({ kind: 'roomCorner' }, { kind: 'roomEdge' });
  return atoms.filter((a) => !isVacuous(board, a) && atomCells(board, a)!.some((m) => m !== 0));
}

/**
 * All true atoms for every person, indexed by PersonId. Atoms that exclude no
 * free cell (vacuous) are left out. Includes the relational atoms: `alone`
 * when nobody else shares the room, and `sameRoomAs(q)` for each roommate q.
 * Fairness filtering (victim/murderer) is the generator's job.
 */
export function deriveFacts(source: BoardSource, solution: Pick<Solution, 'cellOf'>): Atom[][] {
  const board = getBoard(source);
  const statics = allStaticAtoms(board);
  const roomOfPerson = solution.cellOf.map((cell) => source.roomOf[cell.r]![cell.c]!);
  return solution.cellOf.map((cell, p) => {
    const facts = statics.filter((a) => setHas(atomCells(board, a)!, cell.r, cell.c));
    const mates: PersonId[] = [];
    roomOfPerson.forEach((room, q) => {
      if (q !== p && room === roomOfPerson[p]) mates.push(q);
    });
    if (mates.length === 0) facts.push({ kind: 'alone' });
    for (const q of mates) facts.push({ kind: 'sameRoomAs', person: q });
    return facts;
  });
}
