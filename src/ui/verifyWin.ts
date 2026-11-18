import { hashPlacement } from '../engine/secure';
import { parseCellKey, type PuzzleView } from '../engine/types';
import type { Placements } from '../state/store';

/**
 * Client-side sanity check of a win (SPEC §7.4): hash the board and compare it
 * with the puzzle's `solutionHash`. Needs no solution on the main thread.
 * Resolves false for an incomplete board.
 */
export async function placementMatchesHash(
  puzzle: PuzzleView,
  placements: Placements,
): Promise<boolean> {
  const cells = [];
  for (const p of puzzle.people) {
    const key = placements[p.id];
    if (key == null) return false;
    cells.push(parseCellKey(key));
  }
  return (await hashPlacement(puzzle.seed, cells)) === puzzle.solutionHash;
}
