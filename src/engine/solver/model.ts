import { GRID_SIZE, PEOPLE } from '../constants';
import { getBoard, staticCandidates, type Board } from '../clues/board';
import type { PersonId, Puzzle } from '../types';

/** Solver-facing digest of a puzzle: static candidates plus relational constraints. */
export interface Model {
  puzzle: Puzzle;
  board: Board;
  victim: PersonId;
  /** Static candidates, flat: entry p * 9 + r is a column mask for person p in row r. */
  cand0: Uint16Array;
  alone: boolean[];
  /** Directed "same room as" pairs [person, target]. */
  sameAs: [PersonId, PersonId][];
}

export function buildModel(puzzle: Puzzle): Model {
  const board = getBoard(puzzle);
  const victim = puzzle.people.find((p) => p.isVictim)?.id ?? -1;
  const cand0 = new Uint16Array(PEOPLE * GRID_SIZE);
  const alone: boolean[] = new Array<boolean>(PEOPLE).fill(false);
  const sameAs: [PersonId, PersonId][] = [];
  const atomsOf: (typeof puzzle.clues)[number]['atoms'][] = Array.from(
    { length: PEOPLE },
    () => [],
  );
  for (const clue of puzzle.clues) {
    atomsOf[clue.person] = clue.atoms;
    for (const a of clue.atoms) {
      if (a.kind === 'alone') alone[clue.person] = true;
      else if (a.kind === 'sameRoomAs') sameAs.push([clue.person, a.person]);
    }
  }
  for (let p = 0; p < PEOPLE; p++) cand0.set(staticCandidates(board, atomsOf[p]!), p * GRID_SIZE);
  return { puzzle, board, victim, cand0, alone, sameAs };
}
