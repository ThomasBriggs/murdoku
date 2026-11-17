import { GRID_SIZE } from '../engine/constants';
import { generatePuzzle } from '../engine/generator';
import { solutionHash } from '../engine/secure';
import { nextDeduction } from '../engine/solver/logical';
import {
  parseCellKey,
  type Cell,
  type PersonId,
  type Puzzle,
  type Solution,
} from '../engine/types';
import type { EngineRequest, EngineResponse, Placements } from './protocol';

/** The worker's private game state. `solution` never leaves this module's callers. */
export interface WorkerState {
  current: { puzzle: Puzzle; solution: Solution } | null;
}

export function createWorkerState(): WorkerState {
  return { current: null };
}

function toCells(puzzle: Puzzle, placements: Placements): (Cell | null)[] {
  return puzzle.people.map((p) => {
    const key = placements[p.id];
    if (key === null || key === undefined) return null;
    if (!Number.isInteger(key) || key < 0 || key >= GRID_SIZE * GRID_SIZE)
      throw new BadRequest(`invalid cell key ${String(key)}`);
    return parseCellKey(key);
  });
}

class BadRequest extends Error {}

function sameCell(a: Cell, b: Cell): boolean {
  return a.r === b.r && a.c === b.c;
}

/** Placed people split into correct / wrong against the solution. */
function grade(puzzle: Puzzle, solution: Solution, cells: (Cell | null)[]) {
  const correct: PersonId[] = [];
  const wrong: PersonId[] = [];
  for (const p of puzzle.people) {
    const cell = cells[p.id];
    if (!cell) continue;
    (sameCell(cell, solution.cellOf[p.id]!) ? correct : wrong).push(p.id);
  }
  return { correct, wrong };
}

/** Pure request handler (no worker APIs), so it can be unit-tested in Node. */
export async function handleRequest(
  state: WorkerState,
  req: EngineRequest,
): Promise<EngineResponse> {
  const id = req.id;
  try {
    if (req.type === 'generate') {
      if (typeof req.seed !== 'string' || !['easy', 'medium', 'hard'].includes(req.difficulty))
        throw new BadRequest('generate needs a seed and a difficulty');
      const { puzzle, solution } = generatePuzzle(req.seed, req.difficulty);
      state.current = { puzzle, solution };
      // Build the outgoing object field by field: never spread anything
      // that could carry the solution.
      const hash = await solutionHash(puzzle.seed, solution.cellOf);
      return {
        id,
        type: 'generate',
        puzzle: {
          version: puzzle.version,
          seed: puzzle.seed,
          difficulty: puzzle.difficulty,
          roomOf: puzzle.roomOf,
          rooms: puzzle.rooms,
          furniture: puzzle.furniture,
          people: puzzle.people,
          clues: puzzle.clues,
          solutionHash: hash,
        },
      };
    }

    const cur = state.current;
    if (!cur)
      return { id, type: 'error', code: 'not-generated', message: 'No puzzle has been generated.' };
    const { puzzle, solution } = cur;

    switch (req.type) {
      case 'check': {
        const { correct, wrong } = grade(puzzle, solution, toCells(puzzle, req.placements));
        return { id, type: 'check', correct, wrong };
      }
      case 'hint': {
        const cells = toCells(puzzle, req.placements);
        const { wrong } = grade(puzzle, solution, cells);
        if (wrong.length > 0) {
          return {
            id,
            type: 'hint',
            result: {
              type: 'wrong',
              count: wrong.length,
              ...(req.revealOne ? { person: wrong[0]! } : {}),
            },
          };
        }
        const deduction = nextDeduction(puzzle, { placements: cells });
        return {
          id,
          type: 'hint',
          result: deduction ? { type: 'deduction', deduction } : { type: 'none' },
        };
      }
      case 'accuse': {
        const cells = toCells(puzzle, req.placements);
        const { correct, wrong } = grade(puzzle, solution, cells);
        const placementCorrect = wrong.length === 0 && correct.length === puzzle.people.length;
        const accusationCorrect = req.suspectId === solution.murdererId;
        return {
          id,
          type: 'accuse',
          placementCorrect,
          accusationCorrect,
          won: placementCorrect && accusationCorrect,
        };
      }
    }
  } catch (e) {
    if (e instanceof BadRequest)
      return { id, type: 'error', code: 'bad-request', message: e.message };
    return {
      id,
      type: 'error',
      code: 'internal',
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
