import { GRID_SIZE, PEOPLE } from '../constants';
import { lowBit } from '../cellset';
import type { Puzzle } from '../types';
import { buildModel } from './model';

const ALL = (1 << GRID_SIZE) - 1;

/**
 * Count complete valid placements of a puzzle, stopping at `limit`.
 * Backtracks row by row: each row picks an unplaced person and a free column
 * from that person's static candidate set. Relational atoms (alone,
 * sameRoomAs) and the murder rule are enforced as soon as they are decidable.
 */
export function countSolutions(puzzle: Puzzle, limit = 2): number {
  const m = buildModel(puzzle);
  const cand = m.cand0;
  const roomAt = m.board.roomAt;
  const { alone, victim } = m;
  const sameTargets: number[][] = Array.from({ length: PEOPLE }, () => []);
  const sameBy: number[][] = Array.from({ length: PEOPLE }, () => []);
  for (const [p, q] of m.sameAs) {
    sameTargets[p]!.push(q);
    sameBy[q]!.push(p);
  }
  const roomOfPerson = new Int8Array(PEOPLE).fill(-1);

  /** Can p go into `room` given everyone placed so far? */
  const ok = (p: number, room: number): boolean => {
    for (let q = 0; q < PEOPLE; q++) {
      if (q !== p && roomOfPerson[q] === room && (alone[p] || alone[q])) return false;
    }
    for (const t of sameTargets[p]!) {
      const rt = roomOfPerson[t]!;
      if (rt >= 0 && rt !== room) return false;
    }
    for (const t of sameBy[p]!) {
      const rt = roomOfPerson[t]!;
      if (rt >= 0 && rt !== room) return false;
    }
    if (victim >= 0) {
      const vr = p === victim ? room : roomOfPerson[victim]!;
      if (vr >= 0) {
        let n = p !== victim && room === vr ? 1 : 0;
        for (let q = 0; q < PEOPLE; q++) if (q !== victim && q !== p && roomOfPerson[q] === vr) n++;
        if (n > 1) return false;
      }
    }
    return true;
  };

  const murderOk = (): boolean => {
    if (victim < 0) return true;
    const vr = roomOfPerson[victim]!;
    let n = 0;
    for (let q = 0; q < PEOPLE; q++) if (q !== victim && roomOfPerson[q] === vr) n++;
    return n === 1;
  };

  let count = 0;
  const dfs = (row: number, used: number, cols: number): void => {
    if (row === GRID_SIZE) {
      if (murderOk()) count++;
      return;
    }
    // Forward check: every unplaced person still needs a feasible cell below.
    for (let p = 0; p < PEOPLE; p++) {
      if (used & (1 << p)) continue;
      let any = false;
      for (let r = row; r < GRID_SIZE; r++) {
        if (cand[p * GRID_SIZE + r]! & ~cols & ALL) {
          any = true;
          break;
        }
      }
      if (!any) return;
    }
    for (let p = 0; p < PEOPLE; p++) {
      if (used & (1 << p)) continue;
      let mask = cand[p * GRID_SIZE + row]! & ~cols & ALL;
      while (mask) {
        const c = lowBit(mask);
        mask &= mask - 1;
        const room = roomAt[row * GRID_SIZE + c]!;
        if (!ok(p, room)) continue;
        roomOfPerson[p] = room;
        dfs(row + 1, used | (1 << p), cols | (1 << c));
        roomOfPerson[p] = -1;
        if (count >= limit) return;
      }
    }
  };
  dfs(0, 0, 0);
  return count;
}
