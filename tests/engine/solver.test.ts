import { describe, expect, it } from 'vitest';
import { countSolutions } from '../../src/engine/solver/bruteforce';
import { nextDeduction, solveLogically } from '../../src/engine/solver/logical';
import { generatePuzzle } from '../../src/engine/generator';
import { createRng } from '../../src/engine/rng';
import type { Clue } from '../../src/engine/clues/types';
import type { Cell, Person, Puzzle, Room } from '../../src/engine/types';

/** 9x9 board where row r belongs to room `roomOfRow[r]`, no furniture. */
function hand(roomOfRow: number[], clues: Clue[], victim = 0): Puzzle {
  const nRooms = Math.max(...roomOfRow) + 1;
  const rooms: Room[] = Array.from({ length: nRooms }, (_, id) => ({
    id,
    type: 'hallway',
    name: `Room${id}`,
    cells: [],
    color: '',
  }));
  const roomOf = roomOfRow.map((rm, r) => {
    for (let c = 0; c < 9; c++) rooms[rm]!.cells.push({ r, c });
    return Array<number>(9).fill(rm);
  });
  const people: Person[] = Array.from({ length: 9 }, (_, id) => ({
    id,
    name: 'ABCDEFGHI'.charAt(id) + 'x',
    initial: 'ABCDEFGHI'.charAt(id),
    color: '#000',
    isVictim: id === victim,
  }));
  return {
    version: 1,
    seed: 'hand',
    difficulty: 'easy',
    roomOf,
    rooms,
    furniture: Array.from({ length: 9 }, () => Array(9).fill(null)),
    people,
    clues,
  };
}

const rowClues = (rows: number[]): Clue[] =>
  rows.map((r, person) => ({ person, atoms: [{ kind: 'row', index: r }] }));
// rooms: rows {0,1}, {2,3}, {4,5}, {6,7}, {8}
const ROOMS = [0, 0, 1, 1, 2, 2, 3, 3, 4];

describe('bruteforce', () => {
  it('finds exactly one solution when rows and columns are pinned', () => {
    const clues = rowClues([0, 1, 2, 3, 4, 5, 6, 7, 8]).map((c, i) => ({
      person: i,
      atoms: [...c.atoms, { kind: 'col' as const, index: (i * 2) % 9 }],
    }));
    expect(countSolutions(hand(ROOMS, clues), 2)).toBe(1);
  });

  it('finds zero when two people are pinned to the same row', () => {
    expect(countSolutions(hand(ROOMS, rowClues([0, 0, 2, 3, 4, 5, 6, 7, 8])), 2)).toBe(0);
  });

  it('finds several (capped at the limit) with only rows pinned (columns free)', () => {
    const p = hand(ROOMS, rowClues([0, 1, 2, 3, 4, 5, 6, 7, 8]));
    expect(countSolutions(p, 2)).toBe(2);
    expect(countSolutions(p, 5)).toBe(5);
  });

  it('enforces the murder rule: victim alone in its room has no murderer', () => {
    const clues = rowClues([0, 1, 2, 3, 4, 5, 6, 7, 8]).map((c, i) => ({
      person: i,
      atoms: [...c.atoms, { kind: 'col' as const, index: i }],
    }));
    expect(countSolutions(hand(ROOMS, clues, 8), 2)).toBe(0);
    expect(countSolutions(hand(ROOMS, clues, 0), 2)).toBe(1);
    // victim sharing a room with two suspects is also invalid
    expect(countSolutions(hand([0, 0, 0, 1, 1, 1, 2, 2, 2], clues, 0), 2)).toBe(0);
  });

  it('enforces alone and sameRoomAs', () => {
    const base = rowClues([0, 1, 2, 3, 4, 5, 6, 7, 8]).map((c, i) => ({
      person: i,
      atoms: [...c.atoms, { kind: 'col' as const, index: i }],
    }));
    const withAtom = (person: number, atom: Clue['atoms'][number]) =>
      base.map((c) => (c.person === person ? { ...c, atoms: [...c.atoms, atom] } : c));
    // person 2 (row 2, room 1) shares its room with person 3 -> not alone
    expect(countSolutions(hand(ROOMS, withAtom(2, { kind: 'alone' })), 2)).toBe(0);
    // person 8 is alone in the last room
    expect(countSolutions(hand(ROOMS, withAtom(8, { kind: 'alone' })), 2)).toBe(1);
    expect(countSolutions(hand(ROOMS, withAtom(2, { kind: 'sameRoomAs', person: 3 })), 2)).toBe(1);
    expect(countSolutions(hand(ROOMS, withAtom(2, { kind: 'sameRoomAs', person: 4 })), 2)).toBe(0);
  });
});

function checkSound(
  puzzle: Puzzle,
  cellOf: Cell[],
  steps: ReturnType<typeof solveLogically>['steps'],
) {
  for (const s of steps) {
    expect(s.explanation.length).toBeGreaterThan(10);
    if (s.kind === 'place') {
      expect(s.person).toBeDefined();
      expect(s.cells).toEqual([cellOf[s.person!]]);
    } else {
      expect(s.eliminations!.length).toBeGreaterThan(0);
      for (const e of s.eliminations!) {
        const sol = cellOf[e.person]!;
        expect(e.cells.some((c) => c.r === sol.r && c.c === sol.c)).toBe(false);
      }
    }
  }
  expect(puzzle.people).toHaveLength(9);
}

describe('logical solver', () => {
  const levels = [
    ['easy', 150, 3],
    ['medium', 150, 4],
    ['hard', 40, 6],
  ] as const;
  for (const [difficulty, n, ceiling] of levels) {
    it(`solves ${difficulty} puzzles within technique ${ceiling} with sound steps`, () => {
      for (let i = 0; i < n; i++) {
        const { puzzle, solution } = generatePuzzle(`logic-${difficulty}-${i}`, difficulty);
        const res = solveLogically(puzzle, 6);
        expect(res.solved).toBe(true);
        if (difficulty !== 'hard') expect(res.maxTechniqueUsed).toBeLessThanOrEqual(ceiling);
        checkSound(puzzle, solution.cellOf, res.steps);
        res.candidates.forEach((set, p) => {
          const c = solution.cellOf[p]!;
          expect(set[c.r]).toBe(1 << c.c);
        });
      }
    }, 120000);
  }

  it('does not solve with too few techniques when more are needed', () => {
    let needed = 0;
    for (let i = 0; i < 30; i++) {
      const { puzzle } = generatePuzzle(`logic-hard-${i}`, 'hard');
      const res = solveLogically(puzzle, 6, { explain: false });
      if (res.maxTechniqueUsed >= 5) {
        needed++;
        expect(solveLogically(puzzle, 4, { explain: false }).solved).toBe(false);
      }
    }
    expect(needed).toBeGreaterThan(0);
  });

  it('nextDeduction from partial correct states is sound', () => {
    let places = 0;
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      for (let i = 0; i < 25; i++) {
        const { puzzle, solution } = generatePuzzle(`hint-${difficulty}-${i}`, difficulty);
        const rng = createRng(`hint-pick-${i}`);
        for (const k of [0, 2, 5]) {
          const placed = new Set(rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, k));
          const state = { placements: solution.cellOf.map((c, p) => (placed.has(p) ? c : null)) };
          const d = nextDeduction(puzzle, state);
          expect(d).not.toBeNull();
          checkSound(puzzle, solution.cellOf, [d!]);
          if (d!.kind === 'place') {
            places++;
            expect(placed.has(d!.person!)).toBe(false);
          }
        }
      }
    }
    expect(places).toBeGreaterThan(20);
  });

  it('repeated nextDeduction calls place everyone, correctly, on every difficulty', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      for (let i = 0; i < 8; i++) {
        const { puzzle, solution } = generatePuzzle(`hint-drive-${difficulty}-${i}`, difficulty);
        const placements: (Cell | null)[] = puzzle.people.map(() => null);
        for (let step = 0; step < 9; step++) {
          const d = nextDeduction(puzzle, { placements });
          expect(d?.kind).toBe('place');
          const cell = d!.cells[0]!;
          expect(cell).toEqual(solution.cellOf[d!.person!]);
          expect(placements[d!.person!]).toBeNull();
          placements[d!.person!] = cell;
        }
        expect(nextDeduction(puzzle, { placements })).toBeNull();
      }
    }
  });

  it('nextDeduction returns null for a full or contradictory board', () => {
    const { puzzle, solution } = generatePuzzle('hint-full', 'easy');
    expect(nextDeduction(puzzle, { placements: solution.cellOf })).toBeNull();
    const bad = solution.cellOf.map((c) => ({ ...c }));
    bad[0] = { r: bad[1]!.r, c: bad[1]!.c };
    expect(nextDeduction(puzzle, { placements: bad.map((c, i) => (i < 2 ? c : null)) })).toBeNull();
  });

  it('produces the spec-style explanation for a simple single-room deduction', () => {
    const { puzzle } = generatePuzzle('explain-1', 'easy');
    const res = solveLogically(puzzle, 6);
    expect(res.steps[0]!.technique).toBe(1);
    expect(res.steps.some((s) => s.kind === 'place')).toBe(true);
  });
});
