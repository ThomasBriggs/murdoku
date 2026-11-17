import { describe, expect, it } from 'vitest';
import { generatePuzzle, ROW_COL_CAP } from '../../src/engine/generator';
import { checkPlacement } from '../../src/engine/clues/evaluate';
import { countSolutions } from '../../src/engine/solver/bruteforce';
import { solveLogically } from '../../src/engine/solver/logical';
import { solutionHash, hashPlacement } from '../../src/engine/secure';
import { GENERATOR_VERSION } from '../../src/engine/constants';
import type { Difficulty } from '../../src/engine/types';

const runs: [Difficulty, number][] = [
  ['easy', 200],
  ['medium', 200],
  ['hard', 60],
];

describe('generatePuzzle', () => {
  it('is deterministic for (seed, difficulty)', () => {
    for (const d of ['easy', 'medium', 'hard'] as const) {
      const a = generatePuzzle('determinism', d);
      const b = generatePuzzle('determinism', d);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.puzzle.version).toBe(GENERATOR_VERSION);
      expect(a.puzzle.difficulty).toBe(d);
    }
    expect(JSON.stringify(generatePuzzle('s1', 'easy'))).not.toBe(
      JSON.stringify(generatePuzzle('s2', 'easy')),
    );
  });

  it('puzzle view contains no solution', () => {
    const { puzzle } = generatePuzzle('nosolution', 'medium');
    expect(JSON.stringify(puzzle)).not.toContain('cellOf');
    expect(Object.keys(puzzle).sort()).toEqual(
      ['clues', 'difficulty', 'furniture', 'people', 'roomOf', 'rooms', 'seed', 'version'].sort(),
    );
  });

  for (const [difficulty, n] of runs) {
    it(`${difficulty}: valid, unique, fair and graded as requested over ${n} seeds`, () => {
      let missed = 0;
      let rowCol = 0;
      for (let i = 0; i < n; i++) {
        const { puzzle, solution, graded } = generatePuzzle(`gen-${difficulty}-${i}`, difficulty);
        if (graded !== difficulty) missed++;
        expect(countSolutions(puzzle, 2)).toBe(1);
        expect(checkPlacement(puzzle, solution.cellOf)).toEqual([]);
        expect(solveLogically(puzzle, 6, { explain: false }).solved).toBe(true);

        const victim = puzzle.people.find((p) => p.isVictim)!;
        const vCell = solution.cellOf[victim.id]!;
        const vRoom = puzzle.roomOf[vCell.r]![vCell.c]!;
        const inVictimRoom = puzzle.people.filter((p) => {
          const c = solution.cellOf[p.id]!;
          return !p.isVictim && puzzle.roomOf[c.r]![c.c] === vRoom;
        });
        expect(inVictimRoom.map((p) => p.id)).toEqual([solution.murdererId]);

        expect(puzzle.clues).toHaveLength(9);
        const rc = puzzle.clues
          .flatMap((c) => c.atoms)
          .filter((a) => a.kind === 'row' || a.kind === 'col').length;
        expect(rc).toBeLessThanOrEqual(ROW_COL_CAP[difficulty]);
        rowCol += rc;
        for (const clue of puzzle.clues) {
          expect(clue.atoms.length).toBeGreaterThanOrEqual(1);
          expect(clue.atoms.length).toBeLessThanOrEqual(3);
          for (const a of clue.atoms) {
            if (a.kind === 'sameRoomAs') {
              expect(a.person).not.toBe(victim.id);
              expect(a.person).not.toBe(solution.murdererId);
            }
            if (clue.person === solution.murdererId && a.kind === 'inRoom')
              expect(a.room).not.toBe(vRoom);
          }
        }
      }
      console.log(
        `${difficulty}: ${missed}/${n} fell back to the closest grade; avg row/col atoms ${(rowCol / n).toFixed(2)}`,
      );
      expect(missed / n).toBeLessThan(0.1);
    }, 120000);
  }

  it('generation time p95 < 1500 ms per difficulty', () => {
    generatePuzzle('warmup', 'hard');
    for (const d of ['easy', 'medium', 'hard'] as const) {
      const times: number[] = [];
      for (let i = 0; i < 50; i++) {
        const t0 = performance.now();
        generatePuzzle(`perf-${d}-${i}`, d);
        times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      const p95 = times[Math.floor(times.length * 0.95)]!;
      console.log(
        `${d}: mean ${mean.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms, max ${times[49]!.toFixed(0)} ms`,
      );
      expect(p95).toBeLessThan(1500);
    }
  }, 120000);
});

describe('secure', () => {
  it('hashes seed + placement with SHA-256 and detects differences', async () => {
    const { puzzle, solution } = generatePuzzle('hash', 'easy');
    const h = await solutionHash(puzzle.seed, solution.cellOf);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashPlacement(puzzle.seed, solution.cellOf)).toBe(h);
    const swapped = solution.cellOf.map((c) => ({ ...c }));
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    expect(await hashPlacement(puzzle.seed, swapped)).not.toBe(h);
    expect(await hashPlacement('other', solution.cellOf)).not.toBe(h);
  });
});
